import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "../app";
import {
  createPost,
  createThread,
  reauthenticate,
  signup,
  signupVerified,
} from "../test/helpers";

/**
 * Password change, email change and OAuth account shapes used to be tested
 * here. Supabase Auth owns all three now — there is no endpoint of ours left
 * to assert against, and testing Supabase's own password rules would be
 * testing someone else's code. What survives is what stayed ours: the private
 * account read, account deletion, and the data export.
 */

describe("GET /api/auth/account", () => {
  it("returns the caller's email and directory settings", async () => {
    const user = await signup("account");
    const res = await request(app)
      .get("/api/auth/account")
      .set("Authorization", `Bearer ${user.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      email: user.email,
      directory: { directoryVisible: false, directoryBio: null, openToPartners: false },
    });
  });
});

describe("DELETE /api/users/me", () => {
  it("requires the typed confirmation", async () => {
    const user = await signup("del-guard");
    const noConfirm = await request(app)
      .delete("/api/users/me")
      .set("Authorization", `Bearer ${user.token}`)
      .send({});
    expect(noConfirm.status).toBe(400);
  });

  /**
   * The credential check that used to guard this is Supabase's now, so the bar
   * is a freshly-minted token instead. A token that is merely valid must not be
   * enough — that is the whole point of the check.
   */
  it("rejects a session that has not re-authenticated recently", async () => {
    const user = await signup("del-stale");

    // The token is seconds-fresh by definition here, so age it rather than
    // waiting: what's under test is that mere validity isn't sufficient.
    // Only Date is faked — faking setTimeout too would hang supertest's HTTP.
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 30 * 60 * 1000 });
    try {
      const stale = await request(app)
        .delete("/api/users/me")
        .set("Authorization", `Bearer ${user.token}`)
        .send({ confirm: "DELETE" });
      expect(stale.status).toBe(401);
      expect(stale.body.reauthRequired).toBe(true);
    } finally {
      vi.useRealTimers();
    }

    // Signing in again mints a fresh token, and the same request now passes.
    const fresh = await reauthenticate(user);
    const ok = await request(app)
      .delete("/api/users/me")
      .set("Authorization", `Bearer ${fresh}`)
      .send({ confirm: "DELETE" });
    expect(ok.status).toBe(200);
  });

  it("anonymizes the account but leaves other people's threads readable", async () => {
    const author = await signupVerified("del-author");
    const reader = await signupVerified("del-reader");
    const threadId = await createThread(author, { title: "Surviving thread" });
    await createPost(reader, threadId, "A reply from someone else");
    await createPost(author, threadId, "The author's own reply");

    const del = await request(app)
      .delete("/api/users/me")
      .set("Authorization", `Bearer ${await reauthenticate(author)}`)
      .send({ confirm: "DELETE" });
    expect(del.status).toBe(200);

    // Their session is dead — the row is tombstoned, so even a token that has
    // not expired yet stops working.
    const me = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${author.token}`);
    expect(me.status).toBe(401);

    // The thread and both replies still render, authored by "[deleted]".
    const thread = await request(app)
      .get(`/api/threads/${threadId}`)
      .set("Authorization", `Bearer ${reader.token}`);
    expect(thread.status).toBe(200);
    expect(thread.body.thread.author.displayName).toBe("[deleted]");
    expect(thread.body.thread.author.avatarUrl).toBeNull();
    expect(thread.body.thread.posts).toHaveLength(2);

    // Their profile is gone, they can't be messaged, and they don't appear in search.
    const profile = await request(app)
      .get(`/api/users/${author.id}/profile`)
      .set("Authorization", `Bearer ${reader.token}`);
    expect(profile.status).toBe(404);
    const dm = await request(app)
      .post("/api/messages")
      .set("Authorization", `Bearer ${reader.token}`)
      .send({ recipientId: author.id, body: "hello?" });
    expect(dm.status).toBe(404);
  });
});

describe("GET /api/users/me/export", () => {
  it("returns the caller's account, content, and messages", async () => {
    const user = await signupVerified("export");
    const friend = await signupVerified("export-friend");
    const threadId = await createThread(user, { title: "Exported thread" });
    await createPost(user, threadId, "Exported reply");
    await request(app)
      .post("/api/messages")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ recipientId: friend.id, body: "sent by me" });
    await request(app)
      .post("/api/messages")
      .set("Authorization", `Bearer ${friend.token}`)
      .send({ recipientId: user.id, body: "sent to me" });

    const res = await request(app)
      .get("/api/users/me/export")
      .set("Authorization", `Bearer ${user.token}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toMatch(/attachment/);
    expect(res.body.account.email).toBe(user.email);
    expect(res.body.threads.map((t: { title: string }) => t.title)).toContain("Exported thread");
    expect(res.body.posts.map((p: { body: string }) => p.body)).toContain("Exported reply");
    expect(res.body.messagesSent.map((m: { body: string }) => m.body)).toContain("sent by me");
    expect(res.body.messagesReceived.map((m: { body: string }) => m.body)).toContain("sent to me");
  });
});
