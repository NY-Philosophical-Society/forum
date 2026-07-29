import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../app";
import { createThread, promoteToAdmin, signup, signupVerified, TestUser } from "../test/helpers";

let admin: TestUser;

beforeAll(async () => {
  admin = await signup("moderator");
  await promoteToAdmin(admin.id);
});

describe("reports", () => {
  it("a verified user can file a categorized report and an admin sees it inline", async () => {
    const reporter = await signupVerified("reporter");
    const author = await signupVerified("reported-author");
    const threadId = await createThread(author, { title: "Reportable thread" });

    const res = await request(app)
      .post("/api/reports")
      .set("Authorization", `Bearer ${reporter.token}`)
      .send({
        targetType: "thread",
        targetId: threadId,
        category: "harassment",
        note: "Uncivil conduct in the replies",
      });
    expect(res.status).toBe(201);

    const list = await request(app).get("/api/reports").set("Authorization", `Bearer ${admin.token}`);
    expect(list.status).toBe(200);
    const report = list.body.reports.find((r: { targetId: string }) => r.targetId === threadId);
    expect(report).toMatchObject({
      targetType: "thread",
      category: "harassment",
      note: "Uncivil conduct in the replies",
      status: "open",
    });
    expect(report.reporter.id).toBe(reporter.id);
    // The reported content rides along so an admin can judge it in place.
    expect(report.target).toMatchObject({ kind: "thread", title: "Reportable thread" });
    expect(report.target.author.id).toBe(author.id);
  });

  it("an unverified user cannot file a report", async () => {
    const unverified = await signup("unverified-reporter");
    const res = await request(app)
      .post("/api/reports")
      .set("Authorization", `Bearer ${unverified.token}`)
      .send({ targetType: "user", targetId: admin.id, category: "other" });
    expect(res.status).toBe(403);
  });

  it("rejects an invalid target type", async () => {
    const reporter = await signupVerified("picky-reporter");
    const res = await request(app)
      .post("/api/reports")
      .set("Authorization", `Bearer ${reporter.token}`)
      .send({ targetType: "galaxy", targetId: "m31", category: "other" });
    expect(res.status).toBe(400);
  });

  it("requires a category", async () => {
    const reporter = await signupVerified("uncategorized-reporter");
    const author = await signupVerified("uncategorized-author");
    const threadId = await createThread(author);
    const res = await request(app)
      .post("/api/reports")
      .set("Authorization", `Bearer ${reporter.token}`)
      .send({ targetType: "thread", targetId: threadId, note: "Just a note" });
    expect(res.status).toBe(400);
  });
});

describe("blocking", () => {
  it("blocks DMs in both directions until unblocked", async () => {
    const alice = await signupVerified("blocker");
    const bob = await signupVerified("blocked");

    // Sanity: DMs work before the block.
    const before = await request(app)
      .post("/api/messages")
      .set("Authorization", `Bearer ${bob.token}`)
      .send({ recipientId: alice.id, body: "Hello before the block" });
    expect(before.status).toBe(201);

    const block = await request(app)
      .post(`/api/users/${bob.id}/block`)
      .set("Authorization", `Bearer ${alice.token}`);
    expect(block.status).toBe(201);

    const fromBlocked = await request(app)
      .post("/api/messages")
      .set("Authorization", `Bearer ${bob.token}`)
      .send({ recipientId: alice.id, body: "Should not arrive" });
    expect(fromBlocked.status).toBe(403);

    const fromBlocker = await request(app)
      .post("/api/messages")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ recipientId: bob.id, body: "Also should not send" });
    expect(fromBlocker.status).toBe(403);

    const status = await request(app)
      .get(`/api/users/${bob.id}/block`)
      .set("Authorization", `Bearer ${alice.token}`);
    expect(status.body.blocked).toBe(true);

    const unblock = await request(app)
      .delete(`/api/users/${bob.id}/block`)
      .set("Authorization", `Bearer ${alice.token}`);
    expect(unblock.status).toBe(200);

    const after = await request(app)
      .post("/api/messages")
      .set("Authorization", `Bearer ${bob.token}`)
      .send({ recipientId: alice.id, body: "Hello again" });
    expect(after.status).toBe(201);
  });

  it("cannot block yourself", async () => {
    const user = await signupVerified("self-blocker");
    const res = await request(app)
      .post(`/api/users/${user.id}/block`)
      .set("Authorization", `Bearer ${user.token}`);
    expect(res.status).toBe(400);
  });
});

describe("banning", () => {
  it("a banned user loses login and API access until unbanned", async () => {
    const target = await signupVerified("bannable");

    const ban = await request(app)
      .post(`/api/users/${target.id}/ban`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ reason: "Repeated harassment after a warning" });
    expect(ban.status).toBe(200);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: target.email, password: target.password });
    expect(login.status).toBe(403);

    const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${target.token}`);
    expect(me.status).toBe(403);

    const unban = await request(app)
      .post(`/api/users/${target.id}/unban`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ reason: "Appealed and reinstated" });
    expect(unban.status).toBe(200);

    const meAgain = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${target.token}`);
    expect(meAgain.status).toBe(200);
  });

  it("only admins can ban", async () => {
    const wannabe = await signupVerified("wannabe-mod");
    const target = await signup("innocent");
    const res = await request(app)
      .post(`/api/users/${target.id}/ban`)
      .set("Authorization", `Bearer ${wannabe.token}`)
      .send({ reason: "I simply do not care for them" });
    expect(res.status).toBe(403);
  });

  it("refuses a ban with no reason — the log must say why", async () => {
    const target = await signup("reasonless-ban-target");
    const res = await request(app)
      .post(`/api/users/${target.id}/ban`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("an admin cannot ban themselves", async () => {
    const res = await request(app)
      .post(`/api/users/${admin.id}/ban`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ reason: "A moment of self-doubt" });
    expect(res.status).toBe(400);
  });
});

describe("thread locking", () => {
  it("a locked thread rejects replies until unlocked", async () => {
    const author = await signupVerified("lock-author");
    const replier = await signupVerified("lock-replier");
    const threadId = await createThread(author, { title: "Soon to be locked" });

    const lock = await request(app)
      .post(`/api/threads/${threadId}/lock`)
      .set("Authorization", `Bearer ${admin.token}`);
    expect(lock.status).toBe(200);
    expect(lock.body.locked).toBe(true);

    const reply = await request(app)
      .post("/api/posts")
      .set("Authorization", `Bearer ${replier.token}`)
      .send({ threadId, body: "Too late to reply" });
    expect(reply.status).toBe(403);
    expect(reply.body.error).toMatch(/locked/i);

    const detail = await request(app)
      .get(`/api/threads/${threadId}`)
      .set("Authorization", `Bearer ${replier.token}`);
    expect(detail.body.thread.locked).toBe(true);
    expect(detail.body.thread.posts).toEqual([]);

    // The lock route is a toggle: calling it again unlocks.
    const unlock = await request(app)
      .post(`/api/threads/${threadId}/lock`)
      .set("Authorization", `Bearer ${admin.token}`);
    expect(unlock.body.locked).toBe(false);

    const replyAfter = await request(app)
      .post("/api/posts")
      .set("Authorization", `Bearer ${replier.token}`)
      .send({ threadId, body: "Open again" });
    expect(replyAfter.status).toBe(201);
  });

  it("non-admins cannot lock, even the thread's own author", async () => {
    const author = await signupVerified("lock-wannabe");
    const threadId = await createThread(author);
    const res = await request(app)
      .post(`/api/threads/${threadId}/lock`)
      .set("Authorization", `Bearer ${author.token}`);
    expect(res.status).toBe(403);
  });
});
