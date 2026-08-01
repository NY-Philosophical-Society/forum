import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../app";
import { createPost, createThread, signup, signupVerified, TestUser } from "../test/helpers";

/**
 * The access-tier contract, tested hardest because later work is most likely
 * to break it silently:
 *   anonymous  -> 220-char teaser, zero replies, previewOnly flag
 *   any account -> full body and replies
 *   unverified  -> can write by default (honor system); blocked only when
 *                  REQUIRE_ID_VERIFICATION=true is set
 *   verified    -> can always write
 */

const LONG_BODY =
  "Suppose that the unexamined life is indeed not worth living. It would follow that examination " +
  "itself must be worth something independent of its results, or the whole enterprise collapses " +
  "into a regress of justifications. Socrates never quite says which it is, and the Apology gives " +
  "us drama in place of argument precisely at the moment we need the argument most.";

const REPLY_BODY = "A reply that must never be visible to anonymous readers.";

describe("read access tiers", () => {
  let author: TestUser;
  let threadId: string;

  beforeAll(async () => {
    author = await signupVerified("tier-author");
    threadId = await createThread(author, { title: "The unexamined life", body: LONG_BODY });
    await createPost(author, threadId, REPLY_BODY);
  });

  it("gives an anonymous request exactly the 220-char teaser and no replies", async () => {
    const res = await request(app).get(`/api/threads/${threadId}`);
    expect(res.status).toBe(200);
    expect(res.body.thread.previewOnly).toBe(true);
    expect(res.body.thread.body).toBe(`${LONG_BODY.slice(0, 220)}…`);
    expect(res.body.thread.body.length).toBe(221); // 220 chars + ellipsis
    expect(res.body.thread.posts).toEqual([]);
    // Not merely an empty list — no reply content anywhere in the payload.
    expect(JSON.stringify(res.body)).not.toContain(REPLY_BODY);
    expect(JSON.stringify(res.body)).not.toContain(LONG_BODY.slice(-40));
  });

  it("does not truncate a short body but still withholds replies from anonymous", async () => {
    const short = await createThread(author, { title: "Short one", body: "Brief thought." });
    await createPost(author, short, REPLY_BODY);
    const res = await request(app).get(`/api/threads/${short}`);
    expect(res.status).toBe(200);
    expect(res.body.thread.body).toBe("Brief thought.");
    expect(res.body.thread.previewOnly).toBe(true);
    expect(res.body.thread.posts).toEqual([]);
  });

  it("gives any signed-in account — even unverified — the full body and replies", async () => {
    const reader = await signup("tier-reader");
    const res = await request(app)
      .get(`/api/threads/${threadId}`)
      .set("Authorization", `Bearer ${reader.token}`);
    expect(res.status).toBe(200);
    expect(res.body.thread.previewOnly).toBe(false);
    expect(res.body.thread.body).toBe(LONG_BODY);
    expect(res.body.thread.posts.map((p: { body: string }) => p.body)).toContain(REPLY_BODY);
  });

  it("keeps the anonymous feed to summaries — no thread bodies at all", async () => {
    const res = await request(app).get("/api/threads");
    expect(res.status).toBe(200);
    expect(res.body.threads.length).toBeGreaterThan(0);
    for (const t of res.body.threads) {
      expect(t.body).toBeUndefined();
    }
    expect(JSON.stringify(res.body)).not.toContain(LONG_BODY.slice(0, 40));
  });
});

describe("write access tiers", () => {
  let author: TestUser;
  let threadId: string;
  let postId: string;

  beforeAll(async () => {
    author = await signupVerified("tier-writer");
    threadId = await createThread(author, { body: LONG_BODY });
    postId = await createPost(author, threadId, "Top-level reply to like.");
  });

  it("rejects all writes from anonymous requests with 401", async () => {
    const attempts = [
      request(app).post("/api/threads").send({ title: "Anon thread", body: "x", tagIds: [] }),
      request(app).post("/api/posts").send({ threadId, body: "anon reply" }),
      request(app).post(`/api/threads/${threadId}/like`),
      request(app).post(`/api/posts/${postId}/like`),
      request(app).post("/api/messages").send({ recipientId: author.id, body: "hi" }),
      request(app).post("/api/reports").send({ targetType: "thread", targetId: threadId, category: "spam" }),
    ];
    for (const attempt of await Promise.all(attempts)) {
      expect(attempt.status).toBe(401);
    }
  });

  it("lets an unverified account write by default — the honor system", async () => {
    const unverified = await signup("tier-unverified-honor");
    const auth = (r: request.Test) => r.set("Authorization", `Bearer ${unverified.token}`);

    const thread = await auth(request(app).post("/api/threads")).send({
      title: "Unverified thread, honor system",
      body: "Allowed by default.",
      tagIds: [],
    });
    expect(thread.status).toBe(201);

    const reply = await auth(request(app).post("/api/posts")).send({ threadId, body: "Honor-system reply" });
    expect(reply.status).toBe(201);
  });

  // DMs are the deliberate exception to the honor system — but the gate is on
  // *first contact*, not on messaging generally. Replying is consented-to.
  it("blocks an unverified account from cold-opening a conversation", async () => {
    const unverified = await signup("tier-unverified-dm");
    const res = await request(app)
      .post("/api/messages")
      .set("Authorization", `Bearer ${unverified.token}`)
      .send({ recipientId: author.id, body: "unsolicited" });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/verified identity/i);

    // Nothing delivered, and the UI is told it can't reply here.
    const convo = await request(app)
      .get(`/api/messages/${author.id}`)
      .set("Authorization", `Bearer ${unverified.token}`);
    expect(convo.body.messages).toEqual([]);
    expect(convo.body.canReply).toBe(false);
  });

  it("lets an unverified account REPLY once a verified member opens the conversation", async () => {
    const unverified = await signup("tier-unverified-replier");

    // The verified side opens it.
    const opened = await request(app)
      .post("/api/messages")
      .set("Authorization", `Bearer ${author.token}`)
      .send({ recipientId: unverified.id, body: "I liked your point about necessity." });
    expect(opened.status).toBe(201);

    // Now the unverified recipient may answer.
    const convo = await request(app)
      .get(`/api/messages/${author.id}`)
      .set("Authorization", `Bearer ${unverified.token}`);
    expect(convo.body.canReply).toBe(true);

    const reply = await request(app)
      .post("/api/messages")
      .set("Authorization", `Bearer ${unverified.token}`)
      .send({ recipientId: author.id, body: "Thanks — here's what I meant." });
    expect(reply.status).toBe(201);
  });

  it("lets a verified account open a conversation", async () => {
    const verified = await signupVerified("tier-verified-dm");
    const res = await request(app)
      .post("/api/messages")
      .set("Authorization", `Bearer ${verified.token}`)
      .send({ recipientId: author.id, body: "a real question" });
    expect(res.status).toBe(201);
  });

  describe("with REQUIRE_ID_VERIFICATION=true", () => {
    const original = process.env.REQUIRE_ID_VERIFICATION;
    beforeAll(() => {
      process.env.REQUIRE_ID_VERIFICATION = "true";
    });
    afterAll(() => {
      if (original === undefined) delete process.env.REQUIRE_ID_VERIFICATION;
      else process.env.REQUIRE_ID_VERIFICATION = original;
    });

    it("rejects every write from an unverified account with 403", async () => {
      const unverified = await signup("tier-unverified");
      const auth = (r: request.Test) => r.set("Authorization", `Bearer ${unverified.token}`);

      const thread = await auth(request(app).post("/api/threads")).send({
        title: "Unverified thread",
        body: "Should be blocked.",
        tagIds: [],
      });
      expect(thread.status).toBe(403);

      const reply = await auth(request(app).post("/api/posts")).send({ threadId, body: "Blocked reply" });
      expect(reply.status).toBe(403);

      const threadLike = await auth(request(app).post(`/api/threads/${threadId}/like`));
      expect(threadLike.status).toBe(403);

      const postLike = await auth(request(app).post(`/api/posts/${postId}/like`));
      expect(postLike.status).toBe(403);

      const dm = await auth(request(app).post("/api/messages")).send({ recipientId: author.id, body: "hi" });
      expect(dm.status).toBe(403);

      // And nothing was actually created/changed.
      const detail = await auth(request(app).get(`/api/threads/${threadId}`));
      expect(detail.body.thread.likeCount).toBe(0);
      expect(detail.body.thread.posts.map((p: { body: string }) => p.body)).not.toContain("Blocked reply");
    });
  });

  it("lets a verified account reply, like, and unlike", async () => {
    const verified = await signupVerified("tier-verified");
    const auth = (r: request.Test) => r.set("Authorization", `Bearer ${verified.token}`);

    const reply = await auth(request(app).post("/api/posts")).send({
      threadId,
      body: "A verified reply.",
    });
    expect(reply.status).toBe(201);

    const like = await auth(request(app).post(`/api/threads/${threadId}/like`));
    expect(like.status).toBe(200);
    expect(like.body.liked).toBe(true);

    const postLike = await auth(request(app).post(`/api/posts/${postId}/like`));
    expect(postLike.status).toBe(200);
    expect(postLike.body.liked).toBe(true);

    const detail = await auth(request(app).get(`/api/threads/${threadId}`));
    expect(detail.body.thread.likeCount).toBe(1);
    expect(detail.body.thread.myLiked).toBe(true);
    const likedPost = detail.body.thread.posts.find((p: { id: string }) => p.id === postId);
    expect(likedPost.likeCount).toBe(1);
    expect(likedPost.myLiked).toBe(true);

    // Likes are a toggle: the second call unlikes.
    const unlike = await auth(request(app).post(`/api/threads/${threadId}/like`));
    expect(unlike.body.liked).toBe(false);
    const after = await auth(request(app).get(`/api/threads/${threadId}`));
    expect(after.body.thread.likeCount).toBe(0);
    expect(after.body.thread.myLiked).toBe(false);
  });
});
