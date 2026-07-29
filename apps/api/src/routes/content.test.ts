import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../app";
import { prisma } from "../db";
import {
  createPost,
  createThread,
  promoteToAdmin,
  signupVerified,
  TestUser,
} from "../test/helpers";

/**
 * Brief 03: edit/delete with soft-delete tombstones, and structural
 * @mentions. The ownership checks are tested against the API directly —
 * a hidden button is not enforcement.
 */

function get(threadId: string, user: TestUser) {
  return request(app)
    .get(`/api/threads/${threadId}`)
    .set("Authorization", `Bearer ${user.token}`);
}

describe("editing", () => {
  let author: TestUser;
  let other: TestUser;
  let threadId: string;
  let postId: string;

  beforeAll(async () => {
    author = await signupVerified("edit-author");
    other = await signupVerified("edit-other");
    threadId = await createThread(author, { title: "Original title", body: "Original body" });
    postId = await createPost(author, threadId, "Original reply");
  });

  it("lets the author edit their thread and stamps editedAt", async () => {
    const res = await request(app)
      .patch(`/api/threads/${threadId}`)
      .set("Authorization", `Bearer ${author.token}`)
      .send({ title: "Edited title", body: "Edited body" });
    expect(res.status).toBe(200);

    const detail = await get(threadId, author);
    expect(detail.body.thread.title).toBe("Edited title");
    expect(detail.body.thread.body).toBe("Edited body");
    expect(detail.body.thread.editedAt).toBeTruthy();
  });

  it("lets the author edit their reply and stamps editedAt", async () => {
    const res = await request(app)
      .patch(`/api/posts/${postId}`)
      .set("Authorization", `Bearer ${author.token}`)
      .send({ body: "Edited reply" });
    expect(res.status).toBe(200);

    const detail = await get(threadId, author);
    const post = detail.body.thread.posts.find((p: { id: string }) => p.id === postId);
    expect(post.body).toBe("Edited reply");
    expect(post.editedAt).toBeTruthy();
  });

  it("gives a non-author 403 on PATCH for both thread and post", async () => {
    const t = await request(app)
      .patch(`/api/threads/${threadId}`)
      .set("Authorization", `Bearer ${other.token}`)
      .send({ body: "hijack" });
    expect(t.status).toBe(403);

    const p = await request(app)
      .patch(`/api/posts/${postId}`)
      .set("Authorization", `Bearer ${other.token}`)
      .send({ body: "hijack" });
    expect(p.status).toBe(403);
  });

  it("rejects edits on a locked thread, replies included", async () => {
    const admin = await signupVerified("edit-admin");
    await promoteToAdmin(admin.id);
    const locked = await createThread(author, { body: "lock me" });
    const lockedPost = await createPost(author, locked, "reply before lock");
    await request(app)
      .post(`/api/threads/${locked}/lock`)
      .set("Authorization", `Bearer ${admin.token}`);

    const t = await request(app)
      .patch(`/api/threads/${locked}`)
      .set("Authorization", `Bearer ${author.token}`)
      .send({ body: "sneaky edit" });
    expect(t.status).toBe(403);

    const p = await request(app)
      .patch(`/api/posts/${lockedPost}`)
      .set("Authorization", `Bearer ${author.token}`)
      .send({ body: "sneaky edit" });
    expect(p.status).toBe(403);
  });

  it("lets an admin edit anything", async () => {
    const admin = await signupVerified("edit-admin2");
    await promoteToAdmin(admin.id);
    const res = await request(app)
      .patch(`/api/posts/${postId}`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ body: "Moderated reply" });
    expect(res.status).toBe(200);
  });
});

describe("soft delete", () => {
  let author: TestUser;
  let other: TestUser;

  beforeAll(async () => {
    author = await signupVerified("del-author");
    other = await signupVerified("del-other");
  });

  it("gives a non-author 403 on DELETE", async () => {
    const threadId = await createThread(author);
    const res = await request(app)
      .delete(`/api/threads/${threadId}`)
      .set("Authorization", `Bearer ${other.token}`);
    expect(res.status).toBe(403);
  });

  it("tombstones a deleted reply that has children instead of orphaning them", async () => {
    const threadId = await createThread(author);
    const parent = await createPost(author, threadId, "I will be deleted");
    const child = await createPost(other, threadId, "The surviving child", parent);

    await request(app)
      .delete(`/api/posts/${parent}`)
      .set("Authorization", `Bearer ${author.token}`)
      .expect(200);

    const detail = await get(threadId, other);
    const posts = detail.body.thread.posts;
    const tomb = posts.find((p: { id: string }) => p.id === parent);
    expect(tomb.deleted).toBe(true);
    expect(tomb.body).toBe("");
    expect(tomb.author.displayName).toBe("[deleted]");
    expect(tomb.author.id).toBe("");
    // The original text must not appear anywhere in the payload.
    expect(JSON.stringify(detail.body)).not.toContain("I will be deleted");
    // The child survives, still parented under the tombstone.
    const kid = posts.find((p: { id: string }) => p.id === child);
    expect(kid.parentId).toBe(parent);
    expect(kid.body).toBe("The surviving child");
  });

  it("drops a deleted reply entirely when nothing survives below it", async () => {
    const threadId = await createThread(author);
    const lone = await createPost(author, threadId, "Leaf reply");
    await request(app)
      .delete(`/api/posts/${lone}`)
      .set("Authorization", `Bearer ${author.token}`)
      .expect(200);

    const detail = await get(threadId, author);
    expect(detail.body.thread.posts).toEqual([]);
    expect(detail.body.thread.postCount).toBe(0);
  });

  it("tombstones a deleted thread but keeps its replies readable, and hides it from the feed", async () => {
    const threadId = await createThread(author, { title: "Regrettable take", body: "Hot take" });
    await createPost(other, threadId, "A thoughtful rebuttal");

    await request(app)
      .delete(`/api/threads/${threadId}`)
      .set("Authorization", `Bearer ${author.token}`)
      .expect(200);

    const detail = await get(threadId, other);
    expect(detail.status).toBe(200);
    expect(detail.body.thread.deleted).toBe(true);
    expect(detail.body.thread.title).toBe("[deleted]");
    expect(detail.body.thread.body).toBe("");
    expect(detail.body.thread.author.displayName).toBe("[deleted]");
    expect(
      detail.body.thread.posts.map((p: { body: string }) => p.body),
    ).toContain("A thoughtful rebuttal");

    const feed = await request(app).get("/api/threads?sort=new&limit=100");
    expect(feed.body.threads.map((t: { id: string }) => t.id)).not.toContain(threadId);

    // Frozen: no new replies, no likes, no edits.
    const reply = await request(app)
      .post("/api/posts")
      .set("Authorization", `Bearer ${other.token}`)
      .send({ threadId, body: "too late" });
    expect(reply.status).toBe(404);
    const like = await request(app)
      .post(`/api/threads/${threadId}/like`)
      .set("Authorization", `Bearer ${other.token}`);
    expect(like.status).toBe(404);
  });

  it("removes deleted content from the author's profile counts and lists", async () => {
    const loner = await signupVerified("del-profile");
    const keep = await createThread(loner, { title: "Kept thread" });
    const drop = await createThread(loner, { title: "Dropped thread" });
    await request(app)
      .delete(`/api/threads/${drop}`)
      .set("Authorization", `Bearer ${loner.token}`)
      .expect(200);

    const profile = await request(app)
      .get(`/api/users/${loner.id}/profile`)
      .set("Authorization", `Bearer ${loner.token}`);
    expect(profile.body.threadCount).toBe(1);
    expect(profile.body.threads.map((t: { id: string }) => t.id)).toEqual([keep]);
  });
});

describe("mentions", () => {
  let author: TestUser;
  let mentioned: TestUser;

  beforeAll(async () => {
    author = await signupVerified("men-author");
    mentioned = await signupVerified("men-target");
  });

  const mention = (u: TestUser) => `Ask [@${u.displayName}](/u/${u.id}) about this.`;

  it("stores a Mention row when a reply links a profile, and clears it on edit", async () => {
    const threadId = await createThread(author);
    const postId = await createPost(author, threadId, mention(mentioned));

    const rows = await prisma.mention.findMany({ where: { postId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(mentioned.id);
    expect(rows[0].authorId).toBe(author.id);

    await request(app)
      .patch(`/api/posts/${postId}`)
      .set("Authorization", `Bearer ${author.token}`)
      .send({ body: "No more mention." })
      .expect(200);
    expect(await prisma.mention.count({ where: { postId } })).toBe(0);
  });

  it("stores a Mention row for the opening post of a thread", async () => {
    const threadId = await createThread(author, { body: mention(mentioned) });
    const rows = await prisma.mention.findMany({ where: { threadId, postId: null } });
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(mentioned.id);
  });

  it("never creates a mention across a block, in either direction", async () => {
    const blocker = await signupVerified("men-blocker");
    await request(app)
      .post(`/api/users/${author.id}/block`)
      .set("Authorization", `Bearer ${blocker.token}`)
      .expect(201);

    // blocker has blocked author: author mentioning blocker -> no row.
    const t1 = await createThread(author, { body: mention(blocker) });
    expect(await prisma.mention.count({ where: { threadId: t1 } })).toBe(0);

    // ...and blocker mentioning author -> no row either.
    const t2 = await createThread(blocker, { body: mention(author) });
    expect(await prisma.mention.count({ where: { threadId: t2 } })).toBe(0);

    // The search endpoint doesn't offer the blocked pair to each other.
    const search = await request(app)
      .get(`/api/users?search=${encodeURIComponent(author.displayName)}`)
      .set("Authorization", `Bearer ${blocker.token}`);
    expect(search.body.users.map((u: { id: string }) => u.id)).not.toContain(author.id);
  });

  it("ignores self-mentions and links to nonexistent users", async () => {
    const threadId = await createThread(author, {
      body: `${mention(author)} and [@ghost](/u/nosuchuser123)`,
    });
    expect(await prisma.mention.count({ where: { threadId } })).toBe(0);
  });

  it("clears a deleted post's mentions", async () => {
    const threadId = await createThread(author);
    const postId = await createPost(author, threadId, mention(mentioned));
    await request(app)
      .delete(`/api/posts/${postId}`)
      .set("Authorization", `Bearer ${author.token}`)
      .expect(200);
    expect(await prisma.mention.count({ where: { postId } })).toBe(0);
  });
});
