import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { MAX_PINNED_THREADS } from "@nyps-forum/shared";
import { app } from "../app";
import { prisma } from "../db";
import {
  createPost,
  createThread,
  promoteToAdmin,
  signupVerified,
  TestUser,
} from "../test/helpers";

let admin: TestUser;
/** A second admin, so last-admin-guard tests can demote without tripping it. */
let coAdmin: TestUser;

const auth = (r: request.Test, user: TestUser) =>
  r.set("Authorization", `Bearer ${user.token}`);

beforeAll(async () => {
  admin = await signupVerified("dash-admin");
  await promoteToAdmin(admin.id);
  coAdmin = await signupVerified("dash-coadmin");
  await promoteToAdmin(coAdmin.id);
});

/** File a report and return its id. */
async function fileReport(
  reporter: TestUser,
  body: { targetType: string; targetId: string; category?: string; note?: string },
): Promise<string> {
  const res = await auth(request(app).post("/api/reports"), reporter).send({
    category: "harassment",
    ...body,
  });
  if (res.status !== 201) throw new Error(`report failed: ${JSON.stringify(res.body)}`);
  return res.body.report.id;
}

async function logFor(targetId: string) {
  const res = await auth(
    request(app).get(`/api/admin/log?targetId=${targetId}`),
    admin,
  );
  return res.body.entries as { action: string; reason: string | null; actor: { id: string } }[];
}

describe("admin route access", () => {
  it("a valid non-admin token gets 403 from every admin route and moderation mutation", async () => {
    const member = await signupVerified("not-an-admin");
    const author = await signupVerified("victim-author");
    const threadId = await createThread(author);
    const postId = await createPost(author, threadId, "A reply that stays put.");
    const reportId = await fileReport(member, { targetType: "thread", targetId: threadId });

    const attempts = [
      request(app).get("/api/admin/users"),
      request(app).get("/api/admin/threads"),
      request(app).get("/api/admin/log"),
      request(app).get("/api/reports"),
      request(app).post(`/api/reports/${reportId}/resolve`).send({ action: "no_action", reason: "nope" }),
      request(app).post(`/api/reports/${reportId}/dismiss`).send({}),
      request(app).post(`/api/users/${author.id}/ban`).send({ reason: "no reason at all" }),
      request(app).post(`/api/users/${author.id}/unban`).send({}),
      request(app).post(`/api/users/${author.id}/warn`).send({ reason: "behave yourself" }),
      request(app).post(`/api/users/${author.id}/role`).send({ role: "admin", reason: "friends" }),
      request(app).post(`/api/users/${author.id}/supporter`).send({ isSupporter: true, reason: "friends" }),
      request(app).post(`/api/threads/${threadId}/pin`).send({}),
      request(app).delete(`/api/threads/${threadId}/pin`),
      request(app).post(`/api/threads/${threadId}/lock`).send({}),
    ];
    for (const attempt of attempts) {
      const res = await auth(attempt, member);
      expect(res.status, `${attempt.url}`).toBe(403);
    }

    // And the content is untouched.
    const detail = await auth(request(app).get(`/api/threads/${threadId}`), member);
    expect(detail.body.thread.deleted).toBe(false);
    expect(detail.body.thread.posts.find((p: { id: string }) => p.id === postId)).toBeTruthy();
  });

  it("an anonymous request gets 401, not 403", async () => {
    const res = await request(app).get("/api/admin/users");
    expect(res.status).toBe(401);
  });
});

describe("report triage end to end", () => {
  it("triage → delete the content → resolve, with the action in the moderation log", async () => {
    const reporter = await signupVerified("triage-reporter");
    const author = await signupVerified("triage-author");
    const threadId = await createThread(author, { title: "Thread to be removed" });
    const reportId = await fileReport(reporter, {
      targetType: "thread",
      targetId: threadId,
      category: "spam",
      note: "Selling watches",
    });

    const queue = await auth(request(app).get("/api/reports?status=open&category=spam"), admin);
    expect(queue.status).toBe(200);
    expect(queue.body.reports.some((r: { id: string }) => r.id === reportId)).toBe(true);

    const resolve = await auth(request(app).post(`/api/reports/${reportId}/resolve`), admin).send({
      action: "delete_content",
      reason: "Advertising, third offence",
    });
    expect(resolve.status).toBe(200);

    // The thread is tombstoned by the same soft delete an author's own delete uses.
    const detail = await auth(request(app).get(`/api/threads/${threadId}`), admin);
    expect(detail.body.thread.deleted).toBe(true);
    expect(detail.body.thread.title).toBe("[deleted]");

    // Resolution is recorded on the report...
    const resolved = await auth(request(app).get("/api/reports?status=resolved"), admin);
    const row = resolved.body.reports.find((r: { id: string }) => r.id === reportId);
    expect(row).toMatchObject({
      status: "resolved",
      resolutionAction: "delete_content",
      resolutionNote: "Advertising, third offence",
    });
    expect(row.resolvedBy.id).toBe(admin.id);
    expect(row.resolvedAt).toBeTruthy();

    // ...and in the append-only log, twice: the deletion and the resolution.
    const threadLog = await logFor(threadId);
    expect(threadLog[0]).toMatchObject({
      action: "content_deleted",
      reason: "Advertising, third offence",
    });
    expect(threadLog[0].actor.id).toBe(admin.id);
    const reportLog = await logFor(reportId);
    expect(reportLog[0].action).toBe("report_resolved");
  });

  it("warning an author lands as a notification they cannot switch off", async () => {
    const reporter = await signupVerified("warn-reporter");
    const author = await signupVerified("warn-author");
    const threadId = await createThread(author);
    const postId = await createPost(author, threadId, "Something impolite.");
    const reportId = await fileReport(reporter, { targetType: "post", targetId: postId });

    // Every switch off, including the master kill switch.
    await auth(request(app).put("/api/notifications/preferences"), author).send({
      master: false,
      replies: false,
      likes: false,
      mentions: false,
      messages: false,
    });

    const resolve = await auth(request(app).post(`/api/reports/${reportId}/resolve`), admin).send({
      action: "warn_author",
      reason: "Keep it civil — next time it's a ban.",
    });
    expect(resolve.status).toBe(200);

    const notifications = await auth(request(app).get("/api/notifications"), author);
    const warning = notifications.body.notifications.find(
      (n: { type: string }) => n.type === "warning",
    );
    expect(warning).toBeTruthy();
    expect(warning.snippet).toBe("Keep it civil — next time it's a ban.");
    // The reply itself is untouched — a warning is not a deletion.
    const detail = await auth(request(app).get(`/api/threads/${threadId}`), author);
    expect(detail.body.thread.posts.find((p: { id: string }) => p.id === postId).deleted).toBe(
      false,
    );
  });

  it("banning through a report bites the author's existing session immediately", async () => {
    const reporter = await signupVerified("ban-reporter");
    const author = await signupVerified("ban-author");
    const threadId = await createThread(author);
    const reportId = await fileReport(reporter, { targetType: "thread", targetId: threadId });

    const before = await auth(request(app).get("/api/auth/me"), author);
    expect(before.status).toBe(200);

    await auth(request(app).post(`/api/reports/${reportId}/resolve`), admin).send({
      action: "ban_author",
      reason: "Coordinated harassment",
    });

    // Same token, no re-login: requireAuth re-reads bannedAt on every request.
    const after = await auth(request(app).get("/api/auth/me"), author);
    expect(after.status).toBe(403);

    const unban = await auth(request(app).post(`/api/users/${author.id}/unban`), admin).send({
      reason: "Mistaken identity",
    });
    expect(unban.status).toBe(200);
    const restored = await auth(request(app).get("/api/auth/me"), author);
    expect(restored.status).toBe(200);

    const log = await logFor(author.id);
    expect(log.map((e) => e.action)).toEqual(
      expect.arrayContaining(["user_banned", "user_unbanned"]),
    );
  });

  it("dismissing closes the report without touching the content", async () => {
    const reporter = await signupVerified("dismiss-reporter");
    const author = await signupVerified("dismiss-author");
    const threadId = await createThread(author, { title: "Perfectly fine thread" });
    const reportId = await fileReport(reporter, { targetType: "thread", targetId: threadId });

    const res = await auth(request(app).post(`/api/reports/${reportId}/dismiss`), admin).send({
      reason: "Disagreement, not abuse",
    });
    expect(res.status).toBe(200);

    const detail = await auth(request(app).get(`/api/threads/${threadId}`), admin);
    expect(detail.body.thread.deleted).toBe(false);

    // A closed report can't be closed twice.
    const again = await auth(request(app).post(`/api/reports/${reportId}/dismiss`), admin).send({});
    expect(again.status).toBe(409);
  });

  it("resolving requires a reason", async () => {
    const reporter = await signupVerified("reasonless-reporter");
    const author = await signupVerified("reasonless-author");
    const threadId = await createThread(author);
    const reportId = await fileReport(reporter, { targetType: "thread", targetId: threadId });

    const res = await auth(request(app).post(`/api/reports/${reportId}/resolve`), admin).send({
      action: "no_action",
    });
    expect(res.status).toBe(400);
  });
});

describe("users administration", () => {
  it("searches members and reports their verification, supporter, role and content counts", async () => {
    const member = await signupVerified("searchable-member");
    const threadId = await createThread(member, { title: "Counted thread" });
    await createPost(member, threadId, "Counted reply.");

    const res = await auth(
      request(app).get(`/api/admin/users?search=${encodeURIComponent(member.displayName)}`),
      admin,
    );
    expect(res.status).toBe(200);
    const row = res.body.users.find((u: { id: string }) => u.id === member.id);
    expect(row).toMatchObject({
      email: member.email,
      verificationStatus: "VERIFIED",
      role: "user",
      isSupporter: false,
      threadCount: 1,
      replyCount: 1,
      bannedAt: null,
    });
    expect(res.body.adminCount).toBeGreaterThanOrEqual(2);
  });

  it("grants and revokes supporter status by hand, logging both", async () => {
    const member = await signupVerified("manual-supporter");

    const grant = await auth(request(app).post(`/api/users/${member.id}/supporter`), admin).send({
      isSupporter: true,
      reason: "Donated by cheque at the November meeting",
    });
    expect(grant.status).toBe(200);
    expect(grant.body.user.isSupporter).toBe(true);
    expect(
      (await prisma.user.findUnique({ where: { id: member.id } }))?.supporterSince,
    ).toBeTruthy();

    const revoke = await auth(request(app).post(`/api/users/${member.id}/supporter`), admin).send({
      isSupporter: false,
      reason: "Cheque bounced",
    });
    expect(revoke.body.user.isSupporter).toBe(false);
    expect(
      (await prisma.user.findUnique({ where: { id: member.id } }))?.supporterSince,
    ).toBeNull();

    const log = await logFor(member.id);
    expect(log.map((e) => e.action)).toEqual(
      expect.arrayContaining(["supporter_granted", "supporter_revoked"]),
    );
  });

  it("promotes and demotes admins, but refuses to remove the last one", async () => {
    const member = await signupVerified("future-admin");

    const promote = await auth(request(app).post(`/api/users/${member.id}/role`), admin).send({
      role: "admin",
      reason: "Elected to the moderation committee",
    });
    expect(promote.status).toBe(200);
    expect(promote.body.user.role).toBe("admin");

    const demote = await auth(request(app).post(`/api/users/${member.id}/role`), admin).send({
      role: "user",
      reason: "Term ended",
    });
    expect(demote.status).toBe(200);
    expect(demote.body.user.role).toBe("user");

    // Reduce the forum to exactly one admin, then try to have them step down.
    const admins = await prisma.user.findMany({ where: { role: "admin", deletedAt: null } });
    const survivor = admins.find((u) => u.id === admin.id)!;
    await prisma.user.updateMany({
      where: { role: "admin", id: { not: survivor.id } },
      data: { role: "user" },
    });

    const selfDemote = await auth(request(app).post(`/api/users/${survivor.id}/role`), admin).send({
      role: "user",
      reason: "I quit",
    });
    expect(selfDemote.status).toBe(400);
    expect(selfDemote.body.error).toMatch(/last admin/i);
    expect((await prisma.user.findUnique({ where: { id: survivor.id } }))?.role).toBe("admin");

    // Restore the co-admin the rest of the suite assumes.
    await promoteToAdmin(coAdmin.id);
  });
});

describe("pinning", () => {
  it("pinned threads sort first in both hot and new, and the cap is enforced", async () => {
    const author = await signupVerified("pin-author");
    // A thread with engagement, so it would top "hot" on its own merits.
    const popular = await createThread(author, { title: "Popular unpinned thread" });
    const liker = await signupVerified("pin-liker");
    await auth(request(app).post(`/api/threads/${popular}/like`), liker);
    await createPost(liker, popular, "Adding engagement.");

    // Clear any pins other tests left behind, then pin to the cap.
    await prisma.thread.updateMany({ where: { pinnedAt: { not: null } }, data: { pinnedAt: null } });
    const pinnable: string[] = [];
    for (let i = 0; i < MAX_PINNED_THREADS; i++) {
      pinnable.push(await createThread(author, { title: `Pinned notice ${i}` }));
    }
    for (const id of pinnable) {
      const res = await auth(request(app).post(`/api/threads/${id}/pin`), admin).send({
        reason: "Society announcement",
      });
      expect(res.status).toBe(200);
    }

    const oneTooMany = await createThread(author, { title: "One pin too many" });
    const capped = await auth(request(app).post(`/api/threads/${oneTooMany}/pin`), admin).send({});
    expect(capped.status).toBe(409);
    expect(capped.body.error).toMatch(new RegExp(String(MAX_PINNED_THREADS)));

    for (const sort of ["hot", "new"] as const) {
      const feed = await auth(request(app).get(`/api/threads?sort=${sort}&limit=50`), admin);
      const top = feed.body.threads.slice(0, MAX_PINNED_THREADS);
      expect(top.every((t: { pinnedAt: string | null }) => t.pinnedAt !== null)).toBe(true);
      const firstUnpinned = feed.body.threads.findIndex(
        (t: { pinnedAt: string | null }) => t.pinnedAt === null,
      );
      expect(firstUnpinned).toBe(MAX_PINNED_THREADS);
    }

    // Unpinning frees a slot and restores the true order — nothing to recompute.
    const unpin = await auth(request(app).delete(`/api/threads/${pinnable[0]}/pin`), admin);
    expect(unpin.status).toBe(200);
    expect(unpin.body.pinnedAt).toBeNull();
    const nowFits = await auth(request(app).post(`/api/threads/${oneTooMany}/pin`), admin).send({});
    expect(nowFits.status).toBe(200);

    const log = await logFor(pinnable[0]);
    expect(log.map((e) => e.action)).toEqual(
      expect.arrayContaining(["thread_pinned", "thread_unpinned"]),
    );

    // Pinning must never touch hotScore.
    const stored = await prisma.thread.findUnique({ where: { id: pinnable[1] } });
    const expected = await prisma.thread.findUnique({ where: { id: pinnable[2] } });
    expect(stored!.hotScore).toBeCloseTo(expected!.hotScore, 1);
  });
});

describe("moderation log", () => {
  it("is read-only — no route writes, edits, or deletes an entry", async () => {
    const attempts = [
      request(app).post("/api/admin/log").send({ action: "user_banned" }),
      request(app).patch("/api/admin/log").send({}),
      request(app).delete("/api/admin/log"),
    ];
    for (const attempt of attempts) {
      const res = await auth(attempt, admin);
      // 404 from Express: these methods simply don't exist on the resource.
      expect(res.status).toBe(404);
    }
  });

  it("records the admin, target, and reason for a direct content deletion", async () => {
    const author = await signupVerified("direct-delete-author");
    const threadId = await createThread(author, { title: "Removed without a report" });
    const postId = await createPost(author, threadId, "A reply removed by hand.");

    const noReason = await auth(request(app).delete(`/api/posts/${postId}`), admin).send({});
    expect(noReason.status).toBe(400);

    const deleted = await auth(request(app).delete(`/api/posts/${postId}`), admin).send({
      reason: "Doxxing another member",
    });
    expect(deleted.status).toBe(200);

    const log = await logFor(postId);
    expect(log[0]).toMatchObject({ action: "content_deleted", reason: "Doxxing another member" });
    expect(log[0].actor.id).toBe(admin.id);
  });

  it("an author deleting their own content is not a moderation action", async () => {
    const author = await signupVerified("self-delete-author");
    const threadId = await createThread(author);
    const postId = await createPost(author, threadId, "My own reply, my own choice.");

    // No reason required, and nothing written to the log.
    const res = await auth(request(app).delete(`/api/posts/${postId}`), author);
    expect(res.status).toBe(200);
    expect(await logFor(postId)).toEqual([]);
  });
});
