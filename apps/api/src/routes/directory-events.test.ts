import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../db";
import {
  addChapterMember,
  createChapter,
  createThread,
  signup,
  signupAdmin,
  signupMember,
  signupVerified,
  type TestUser,
} from "../test/helpers";

async function optIn(user: TestUser, bio = "Kant, Stoicism, phil. of mind") {
  const res = await request(app)
    .patch("/api/users/me")
    .set("Authorization", `Bearer ${user.token}`)
    .send({ directoryVisible: true, directoryBio: bio });
  expect(res.status).toBe(200);
}

async function createEventThread(
  admin: TestUser,
  overrides: { title?: string; eventDate?: string; eventCode?: string; chapterId?: string } = {},
): Promise<string> {
  const res = await request(app)
    .post("/api/threads")
    .set("Authorization", `Bearer ${admin.token}`)
    .send({
      title: overrides.title ?? "Symposium: The Examined Life",
      body: "Questions before, recording and transcript after.",
      tagIds: [],
      kind: "event",
      eventDate: overrides.eventDate ?? new Date().toISOString(),
      ...(overrides.eventCode ? { eventCode: overrides.eventCode } : {}),
      ...(overrides.chapterId ? { chapterId: overrides.chapterId } : {}),
    });
  if (res.status !== 201) {
    throw new Error(`createEventThread failed (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return res.body.thread.id;
}

describe("member directory", () => {
  it("is member-only: anonymous 401, free/verified non-members 403, members and admins read it", async () => {
    const anon = await request(app).get("/api/directory");
    expect(anon.status).toBe(401);

    const free = await signup("free");
    const verified = await signupVerified();
    for (const user of [free, verified]) {
      const res = await request(app).get("/api/directory").set("Authorization", `Bearer ${user.token}`);
      expect(res.status).toBe(403);
    }

    const member = await signupMember();
    const admin = await signupAdmin();
    for (const user of [member, admin]) {
      const res = await request(app).get("/api/directory").set("Authorization", `Bearer ${user.token}`);
      expect(res.status).toBe(200);
    }
  });

  it("lists only opted-in members; opting out removes the entry; non-member opt-ins never show", async () => {
    const viewer = await signupMember("viewer");
    const optedIn = await signupMember("optedin");
    const optedOut = await signupMember("optedout");
    const verifiedOptIn = await signupVerified();
    await optIn(optedIn);
    // A verified non-member saving the flag is fine — but they must not appear.
    await optIn(verifiedOptIn);

    const list = await request(app).get("/api/directory").set("Authorization", `Bearer ${viewer.token}`);
    const ids = list.body.entries.map((e: { user: { id: string } }) => e.user.id);
    expect(ids).toContain(optedIn.id);
    expect(ids).not.toContain(optedOut.id);
    expect(ids).not.toContain(verifiedOptIn.id);
    expect(ids).not.toContain(viewer.id);

    await request(app)
      .patch("/api/users/me")
      .set("Authorization", `Bearer ${optedIn.token}`)
      .send({ directoryVisible: false });
    const after = await request(app).get("/api/directory").set("Authorization", `Bearer ${viewer.token}`);
    expect(after.body.entries.map((e: { user: { id: string } }) => e.user.id)).not.toContain(optedIn.id);
  });

  it("searches by name and interest, filters by partners, and lists chapters", async () => {
    const viewer = await signupMember("viewer");
    const admin = await signupAdmin();
    const stoic = await signupMember("stoic");
    const kantian = await signupMember("kantian");
    await optIn(stoic, "Stoicism reading circle");
    await optIn(kantian, "Kant and the first Critique");
    await request(app)
      .patch("/api/users/me")
      .set("Authorization", `Bearer ${kantian.token}`)
      .send({ openToPartners: true });
    const chapter = await createChapter(admin, { name: "NYC Chapter Test" });
    await addChapterMember(admin, chapter.slug, stoic.id);

    const byInterest = await request(app)
      .get("/api/directory?q=Stoicism")
      .set("Authorization", `Bearer ${viewer.token}`);
    expect(byInterest.body.entries.map((e: { user: { id: string } }) => e.user.id)).toEqual([stoic.id]);
    expect(byInterest.body.entries[0].chapters.map((c: { slug: string }) => c.slug)).toContain(
      chapter.slug,
    );

    const byName = await request(app)
      .get(`/api/directory?q=${encodeURIComponent(stoic.displayName.slice(0, 12))}`)
      .set("Authorization", `Bearer ${viewer.token}`);
    expect(byName.body.entries.map((e: { user: { id: string } }) => e.user.id)).toContain(stoic.id);

    const partners = await request(app)
      .get("/api/directory?partners=1")
      .set("Authorization", `Bearer ${viewer.token}`);
    const partnerIds = partners.body.entries.map((e: { user: { id: string } }) => e.user.id);
    expect(partnerIds).toContain(kantian.id);
    expect(partnerIds).not.toContain(stoic.id);
  });

  it("directory settings round-trip through /api/auth/account", async () => {
    const member = await signupMember();
    await request(app)
      .patch("/api/users/me")
      .set("Authorization", `Bearer ${member.token}`)
      .send({ directoryVisible: true, directoryBio: "Aristotle", openToPartners: true });
    const account = await request(app)
      .get("/api/auth/account")
      .set("Authorization", `Bearer ${member.token}`);
    expect(account.body.directory).toEqual({
      directoryVisible: true,
      directoryBio: "Aristotle",
      openToPartners: true,
    });
  });
});

describe("event threads", () => {
  it("only admins create them, and a date is required", async () => {
    const member = await signupMember();
    const asMember = await request(app)
      .post("/api/threads")
      .set("Authorization", `Bearer ${member.token}`)
      .send({
        title: "Fake event",
        body: "x",
        tagIds: [],
        kind: "event",
        eventDate: new Date().toISOString(),
      });
    expect(asMember.status).toBe(403);

    const admin = await signupAdmin();
    const noDate = await request(app)
      .post("/api/threads")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ title: "No date event", body: "x", tagIds: [], kind: "event" });
    expect(noDate.status).toBe(400);

    const eventFieldOnDiscussion = await request(app)
      .post("/api/threads")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ title: "Sneaky", body: "x", tagIds: [], eventCode: "SNEAKY1" });
    expect(eventFieldOnDiscussion.status).toBe(400);

    const ok = await createEventThread(admin);
    expect(ok).toBeTruthy();
  });

  it("free accounts read events; posting is member-only; likes stay verification-gated", async () => {
    const admin = await signupAdmin();
    const threadId = await createEventThread(admin);

    const free = await signup("free");
    const read = await request(app)
      .get(`/api/threads/${threadId}`)
      .set("Authorization", `Bearer ${free.token}`);
    expect(read.status).toBe(200);
    expect(read.body.thread.kind).toBe("event");
    expect(read.body.thread.canPost).toBe(false);
    // The attendance code is admin-only detail.
    expect(read.body.thread.eventCode).toBeUndefined();

    const verified = await signupVerified();
    const post = await request(app)
      .post("/api/posts")
      .set("Authorization", `Bearer ${verified.token}`)
      .send({ threadId, body: "I am verified but not a member" });
    expect(post.status).toBe(403);

    const member = await signupMember();
    const memberPost = await request(app)
      .post("/api/posts")
      .set("Authorization", `Bearer ${member.token}`)
      .send({ threadId, body: "A member's question before the event" });
    expect(memberPost.status).toBe(201);

    // Admin posts without isSupporter (moderation/curation must not require donating).
    const adminPost = await request(app)
      .post("/api/posts")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ threadId, body: "Topics, recording, transcript." });
    expect(adminPost.status).toBe(201);
  });

  it("event threads appear under ?kind=event, not in the default feed listing", async () => {
    const admin = await signupAdmin();
    const eventId = await createEventThread(admin);
    const discussionId = await createThread(admin);

    const feed = await request(app).get("/api/threads?limit=100");
    const feedIds = feed.body.threads.map((t: { id: string }) => t.id);
    expect(feedIds).toContain(discussionId);
    expect(feedIds).not.toContain(eventId);

    const events = await request(app).get("/api/threads?kind=event&limit=100");
    const eventIds = events.body.threads.map((t: { id: string }) => t.id);
    expect(eventIds).toContain(eventId);
    expect(eventIds).not.toContain(discussionId);
  });

  it("code redemption sets the was-there marker; admin marking and removal work and are logged", async () => {
    const admin = await signupAdmin();
    const threadId = await createEventThread(admin, { eventCode: "agora-2026" });
    const member = await signupMember();
    const free = await signup("free");

    const bad = await request(app)
      .post(`/api/threads/${threadId}/attend`)
      .set("Authorization", `Bearer ${member.token}`)
      .send({ code: "WRONG" });
    expect(bad.status).toBe(400);

    // Codes are case/whitespace-insensitive, like WISDOMKEY.
    const good = await request(app)
      .post(`/api/threads/${threadId}/attend`)
      .set("Authorization", `Bearer ${member.token}`)
      .send({ code: "  Agora-2026 " });
    expect(good.status).toBe(200);

    // A free account that was in the room can redeem too.
    const freeRedeem = await request(app)
      .post(`/api/threads/${threadId}/attend`)
      .set("Authorization", `Bearer ${free.token}`)
      .send({ code: "AGORA-2026" });
    expect(freeRedeem.status).toBe(200);

    await request(app)
      .post("/api/posts")
      .set("Authorization", `Bearer ${member.token}`)
      .send({ threadId, body: "Glad I was there" });

    const detail = await request(app)
      .get(`/api/threads/${threadId}`)
      .set("Authorization", `Bearer ${member.token}`);
    expect(detail.body.thread.myAttended).toBe(true);
    expect(detail.body.thread.attendeeCount).toBe(2);
    expect(detail.body.thread.posts[0].wasThere).toBe(true);

    // Admin sees the code, marks and unmarks attendees, and the log records it.
    const adminDetail = await request(app)
      .get(`/api/threads/${threadId}`)
      .set("Authorization", `Bearer ${admin.token}`);
    expect(adminDetail.body.thread.eventCode).toBe("AGORA-2026");

    const other = await signupVerified();
    const mark = await request(app)
      .post(`/api/threads/${threadId}/attendees`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ userId: other.id });
    expect(mark.status).toBe(201);
    const unmark = await request(app)
      .delete(`/api/threads/${threadId}/attendees/${other.id}`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send();
    expect(unmark.status).toBe(200);
    const logs = await prisma.moderationLog.findMany({
      where: { actorId: admin.id, action: { in: ["event_attendee_added", "event_attendee_removed"] } },
    });
    expect(logs.length).toBe(2);

    // Non-admins can't touch the attendee routes.
    const memberMark = await request(app)
      .post(`/api/threads/${threadId}/attendees`)
      .set("Authorization", `Bearer ${member.token}`)
      .send({ userId: other.id });
    expect(memberMark.status).toBe(403);
  });

  it("an event inside a chapter follows chapter visibility, and chapter readers can post", async () => {
    const admin = await signupAdmin();
    const insider = await signupMember("insider");
    const chapter = await createChapter(admin);
    await addChapterMember(admin, chapter.slug, insider.id);
    const threadId = await createEventThread(admin, { chapterId: chapter.id });

    // A member of the Society who isn't in the chapter can't even see it.
    const outsider = await signupMember("outsider");
    const read = await request(app)
      .get(`/api/threads/${threadId}`)
      .set("Authorization", `Bearer ${outsider.token}`);
    expect(read.status).toBe(404);

    const post = await request(app)
      .post("/api/posts")
      .set("Authorization", `Bearer ${insider.token}`)
      .send({ threadId, body: "Chapter event question" });
    expect(post.status).toBe(201);

    // Chapter events don't surface in the public events listing.
    const events = await request(app).get("/api/threads?kind=event&limit=100");
    expect(events.body.threads.map((t: { id: string }) => t.id)).not.toContain(threadId);
  });
});
