import { describe, expect, it } from "vitest";
import request from "../test/request";
import { app } from "../app";
import { prisma } from "../db";
import {
  addChapterMember,
  createChapter,
  createPost,
  createThread,
  signup,
  signupAdmin,
  signupMember,
  signupVerified,
  type TestUser,
} from "../test/helpers";

/**
 * Chapter visibility is the riskiest change in the membership brief, so every
 * tier is exercised against every surface that could leak chapter content:
 * the chapter routes themselves, thread detail by direct id, replies, likes,
 * search, notifications, bookmarks, profiles, tag counts, and the main feed.
 */

async function setupChapter(): Promise<{
  admin: TestUser;
  insider: TestUser;
  threadId: string;
  slug: string;
  chapterId: string;
}> {
  const admin = await signupAdmin();
  const insider = await signupMember("insider");
  const chapter = await createChapter(admin);
  await addChapterMember(admin, chapter.slug, insider.id);
  const threadId = await createThread(insider, {
    title: "Chapter-only symposium planning",
    body: "SECRET-CHAPTER-BODY where shall we meet this month?",
    chapterId: chapter.id,
  });
  return { admin, insider, threadId, slug: chapter.slug, chapterId: chapter.id };
}

describe("chapter routes — tier gates", () => {
  it("anonymous gets 401 from every chapter route", async () => {
    const { slug } = await setupChapter();
    for (const path of ["/api/chapters", `/api/chapters/${slug}`, `/api/chapters/${slug}/threads`]) {
      const res = await request(app).get(path);
      expect(res.status).toBe(401);
    }
  });

  it("free and verified non-members get 403 from chapter routes (member pitch, not data)", async () => {
    const { slug } = await setupChapter();
    const free = await signup("free");
    const verified = await signupVerified();
    for (const user of [free, verified]) {
      for (const path of [
        "/api/chapters",
        `/api/chapters/${slug}`,
        `/api/chapters/${slug}/threads`,
        `/api/chapters/${slug}/members`,
      ]) {
        const res = await request(app).get(path).set("Authorization", `Bearer ${user.token}`);
        expect(res.status).toBe(403);
      }
      const join = await request(app)
        .post(`/api/chapters/${slug}/join`)
        .set("Authorization", `Bearer ${user.token}`);
      expect(join.status).toBe(403);
    }
  });

  it("a member sees the directory and requests to join; pending grants nothing", async () => {
    const { slug, threadId } = await setupChapter();
    const member = await signupMember();

    const list = await request(app).get("/api/chapters").set("Authorization", `Bearer ${member.token}`);
    expect(list.status).toBe(200);
    const mine = list.body.chapters.find((c: { slug: string }) => c.slug === slug);
    expect(mine.myMembership).toBe("none");
    // Pending counts are admin-only detail.
    expect(mine.pendingCount).toBeUndefined();

    const join = await request(app)
      .post(`/api/chapters/${slug}/join`)
      .set("Authorization", `Bearer ${member.token}`);
    expect(join.status).toBe(201);
    expect(join.body.state).toBe("pending");

    // Pending: the door, not the contents.
    const feed = await request(app)
      .get(`/api/chapters/${slug}/threads`)
      .set("Authorization", `Bearer ${member.token}`);
    expect(feed.status).toBe(403);
    const detail = await request(app)
      .get(`/api/threads/${threadId}`)
      .set("Authorization", `Bearer ${member.token}`);
    expect(detail.status).toBe(404);
  });

  it("approval opens the chapter; admin approve + directory states round-trip", async () => {
    const { admin, slug, threadId } = await setupChapter();
    const member = await signupMember();
    await request(app).post(`/api/chapters/${slug}/join`).set("Authorization", `Bearer ${member.token}`);

    const approve = await request(app)
      .post(`/api/chapters/${slug}/members/${member.id}/approve`)
      .set("Authorization", `Bearer ${admin.token}`);
    expect(approve.status).toBe(200);

    const feed = await request(app)
      .get(`/api/chapters/${slug}/threads`)
      .set("Authorization", `Bearer ${member.token}`);
    expect(feed.status).toBe(200);
    expect(feed.body.threads.map((t: { id: string }) => t.id)).toContain(threadId);

    const detail = await request(app)
      .get(`/api/threads/${threadId}`)
      .set("Authorization", `Bearer ${member.token}`);
    expect(detail.status).toBe(200);
    expect(detail.body.thread.chapter.slug).toBe(slug);
  });

  it("admins moderate chapters without isSupporter", async () => {
    const { admin, slug, threadId } = await setupChapter();
    const me = await prisma.user.findUnique({ where: { id: admin.id } });
    expect(me!.isSupporter).toBe(false);

    for (const path of ["/api/chapters", `/api/chapters/${slug}/threads`, `/api/threads/${threadId}`]) {
      const res = await request(app).get(path).set("Authorization", `Bearer ${admin.token}`);
      expect(res.status).toBe(200);
    }
    // Admin actions write the moderation log.
    const log = await prisma.moderationLog.findFirst({
      where: { actorId: admin.id, action: "chapter_created" },
    });
    expect(log).not.toBeNull();
  });

  it("removal closes the chapter again and a member can leave on their own", async () => {
    const { admin, insider, slug, threadId } = await setupChapter();

    const removed = await request(app)
      .delete(`/api/chapters/${slug}/members/${insider.id}`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send();
    expect(removed.status).toBe(200);

    const detail = await request(app)
      .get(`/api/threads/${threadId}`)
      .set("Authorization", `Bearer ${insider.token}`);
    expect(detail.status).toBe(404);

    // Self-leave: re-add, then the member removes themself.
    await addChapterMember(admin, slug, insider.id);
    const leave = await request(app)
      .delete(`/api/chapters/${slug}/members/${insider.id}`)
      .set("Authorization", `Bearer ${insider.token}`)
      .send();
    expect(leave.status).toBe(200);
    // But never someone else.
    const other = await signupMember("other");
    await addChapterMember(admin, slug, other.id);
    const forbidden = await request(app)
      .delete(`/api/chapters/${slug}/members/${other.id}`)
      .set("Authorization", `Bearer ${insider.token}`)
      .send();
    expect(forbidden.status).toBe(403);
  });
});

describe("chapter content never leaks through other surfaces", () => {
  it("direct thread URL: 404 for anonymous, free, verified, and pending — visible to insider and admin", async () => {
    const { admin, insider, threadId, slug } = await setupChapter();
    const anon = await request(app).get(`/api/threads/${threadId}`);
    expect(anon.status).toBe(404);

    const free = await signup("free");
    const verified = await signupVerified();
    const pendingMember = await signupMember("pending");
    await request(app)
      .post(`/api/chapters/${slug}/join`)
      .set("Authorization", `Bearer ${pendingMember.token}`);

    for (const user of [free, verified, pendingMember]) {
      const res = await request(app)
        .get(`/api/threads/${threadId}`)
        .set("Authorization", `Bearer ${user.token}`);
      expect(res.status).toBe(404);
    }
    for (const user of [insider, admin]) {
      const res = await request(app)
        .get(`/api/threads/${threadId}`)
        .set("Authorization", `Bearer ${user.token}`);
      expect(res.status).toBe(200);
    }
  });

  it("replying, liking, editing, deleting a chapter thread: 404 for outsiders", async () => {
    const { insider, threadId } = await setupChapter();
    const outsider = await signupMember("outsider");
    const postId = await createPost(insider, threadId, "An insider reply");

    const reply = await request(app)
      .post("/api/posts")
      .set("Authorization", `Bearer ${outsider.token}`)
      .send({ threadId, body: "I should not be able to say this" });
    expect(reply.status).toBe(404);

    const like = await request(app)
      .post(`/api/threads/${threadId}/like`)
      .set("Authorization", `Bearer ${outsider.token}`);
    expect(like.status).toBe(404);

    const likePost = await request(app)
      .post(`/api/posts/${postId}/like`)
      .set("Authorization", `Bearer ${outsider.token}`);
    expect(likePost.status).toBe(404);

    const edit = await request(app)
      .patch(`/api/threads/${threadId}`)
      .set("Authorization", `Bearer ${outsider.token}`)
      .send({ title: "Defaced title" });
    expect(edit.status).toBe(404);

    const del = await request(app)
      .delete(`/api/threads/${threadId}`)
      .set("Authorization", `Bearer ${outsider.token}`)
      .send();
    expect(del.status).toBe(404);
  });

  it("the main feed and search exclude chapter threads for everyone", async () => {
    const { insider, threadId } = await setupChapter();

    const feed = await request(app)
      .get("/api/threads?limit=100")
      .set("Authorization", `Bearer ${insider.token}`);
    expect(feed.body.threads.map((t: { id: string }) => t.id)).not.toContain(threadId);

    // Even the insider doesn't get chapter content back from search.
    const search = await request(app)
      .get("/api/search?q=SECRET-CHAPTER-BODY")
      .set("Authorization", `Bearer ${insider.token}`);
    expect(search.status).toBe(200);
    expect(search.body.threads.total).toBe(0);
    expect(search.body.posts.total).toBe(0);
  });

  it("bookmarks: outsiders can't save a chapter thread; a saved one vanishes on removal and returns on re-add", async () => {
    const { admin, insider, threadId, slug } = await setupChapter();
    const outsider = await signupMember("outsider");

    const save = await request(app)
      .post("/api/bookmarks")
      .set("Authorization", `Bearer ${outsider.token}`)
      .send({ threadId });
    expect(save.status).toBe(404);

    const insiderSave = await request(app)
      .post("/api/bookmarks")
      .set("Authorization", `Bearer ${insider.token}`)
      .send({ threadId });
    expect(insiderSave.status).toBe(201);

    await request(app)
      .delete(`/api/chapters/${slug}/members/${insider.id}`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send();
    const listAfter = await request(app)
      .get("/api/bookmarks")
      .set("Authorization", `Bearer ${insider.token}`);
    expect(listAfter.body.threads.map((t: { id: string }) => t.id)).not.toContain(threadId);

    await addChapterMember(admin, slug, insider.id);
    const listBack = await request(app)
      .get("/api/bookmarks")
      .set("Authorization", `Bearer ${insider.token}`);
    expect(listBack.body.threads.map((t: { id: string }) => t.id)).toContain(threadId);
  });

  it("notifications about chapter content are emitted only to people who can open it, and purge on removal", async () => {
    const { admin, insider, threadId, slug } = await setupChapter();
    const outsider = await signupMember("outsider");
    const second = await signupMember("second");
    await addChapterMember(admin, slug, second.id);

    // A reply by the second member notifies the thread author (insider)...
    await createPost(second, threadId, `Replying, and mentioning @${outsider.displayName}`);
    const insiderRows = await prisma.notification.findMany({
      where: { recipientId: insider.id, threadId },
    });
    expect(insiderRows.length).toBe(1);

    // ...but the mentioned outsider gets no row at all — the mention points
    // at content they can't open.
    const outsiderRows = await prisma.notification.findMany({
      where: { recipientId: outsider.id },
    });
    expect(outsiderRows.length).toBe(0);

    // Removing the insider purges their chapter notifications.
    await request(app)
      .delete(`/api/chapters/${slug}/members/${insider.id}`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send();
    const afterRemoval = await prisma.notification.findMany({
      where: { recipientId: insider.id, threadId },
    });
    expect(afterRemoval.length).toBe(0);
  });

  it("profiles and tag counts show main-feed activity only", async () => {
    const { insider, chapterId } = await setupChapter();
    const tag = await prisma.tag.findFirst();
    const mainThreadId = await createThread(insider, {
      title: "A public question",
      tagIds: tag ? [tag.id] : [],
    });
    await createThread(insider, { title: "Another chapter thread", chapterId, tagIds: tag ? [tag.id] : [] });

    const viewer = await signup("viewer");
    const profile = await request(app)
      .get(`/api/users/${insider.id}/profile`)
      .set("Authorization", `Bearer ${viewer.token}`);
    const ids = profile.body.threads.map((t: { id: string }) => t.id);
    expect(ids).toContain(mainThreadId);
    expect(ids.length).toBe(1);
    expect(profile.body.threadCount).toBe(1);

    if (tag) {
      const tags = await request(app).get("/api/tags");
      const counted = tags.body.tags.find((t: { id: string }) => t.id === tag.id);
      // The chapter thread carrying this tag must not register in the count.
      const mainCount = await prisma.thread.count({
        where: { deletedAt: null, chapterId: null, tags: { some: { id: tag.id } } },
      });
      expect(counted.threadCount).toBe(mainCount);
    }
  });

  it("anonymous and free accounts are unchanged on the main feed (no regression)", async () => {
    const author = await signupVerified();
    const mainThreadId = await createThread(author, {
      body: "A long enough body that the anonymous preview will truncate it. ".repeat(10),
    });

    const anonFeed = await request(app).get("/api/threads");
    expect(anonFeed.status).toBe(200);
    const anonDetail = await request(app).get(`/api/threads/${mainThreadId}`);
    expect(anonDetail.status).toBe(200);
    expect(anonDetail.body.thread.previewOnly).toBe(true);

    const free = await signup("free");
    const freeDetail = await request(app)
      .get(`/api/threads/${mainThreadId}`)
      .set("Authorization", `Bearer ${free.token}`);
    expect(freeDetail.status).toBe(200);
    expect(freeDetail.body.thread.previewOnly).toBe(false);
  });
});
