import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../app";
import { createPost, createThread, signup, signupVerified, uniqueEmail } from "../test/helpers";

/** An account created via the dev-mock OAuth flow — passwordHash === null. */
async function signupOAuth() {
  const email = uniqueEmail("oauth");
  const res = await request(app)
    .post("/api/auth/oauth/dev-mock")
    .send({ provider: "google", email, displayName: "OAuth Tester" });
  if (res.status !== 200) throw new Error(`dev-mock signup failed: ${res.status}`);
  return { token: res.body.token as string, id: res.body.user.id as string, email };
}

describe("GET /api/auth/account", () => {
  it("reports email and whether a password exists", async () => {
    const user = await signup("account");
    const res = await request(app)
      .get("/api/auth/account")
      .set("Authorization", `Bearer ${user.token}`);
    const defaultDirectory = {
      directoryVisible: false,
      directoryBio: null,
      openToPartners: false,
    };
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ email: user.email, hasPassword: true, directory: defaultDirectory });

    const oauth = await signupOAuth();
    const res2 = await request(app)
      .get("/api/auth/account")
      .set("Authorization", `Bearer ${oauth.token}`);
    expect(res2.body).toEqual({ email: oauth.email, hasPassword: false, directory: defaultDirectory });
  });
});

describe("POST /api/auth/change-password", () => {
  it("changes the password when the current one is correct", async () => {
    const user = await signup("chpass");
    const res = await request(app)
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ currentPassword: user.password, newPassword: "a-brand-new-password" });
    expect(res.status).toBe(200);

    const oldLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: user.password });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: "a-brand-new-password" });
    expect(newLogin.status).toBe(200);
  });

  it("rejects a wrong current password", async () => {
    const user = await signup("wrongpass");
    const res = await request(app)
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ currentPassword: "not-my-password", newPassword: "whatever-else-here" });
    expect(res.status).toBe(401);
  });

  it("lets an OAuth-only account set a first password without a current one", async () => {
    const oauth = await signupOAuth();
    const res = await request(app)
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${oauth.token}`)
      .send({ newPassword: "my-first-password" });
    expect(res.status).toBe(200);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: oauth.email, password: "my-first-password" });
    expect(login.status).toBe(200);
  });
});

describe("POST /api/auth/change-email", () => {
  it("changes email with the correct password and enforces uniqueness", async () => {
    const user = await signup("chemail");
    const other = await signup("taken");

    const conflict = await request(app)
      .post("/api/auth/change-email")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ email: other.email, password: user.password });
    expect(conflict.status).toBe(409);

    const fresh = uniqueEmail("fresh");
    const ok = await request(app)
      .post("/api/auth/change-email")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ email: fresh, password: user.password });
    expect(ok.status).toBe(200);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: fresh, password: user.password });
    expect(login.status).toBe(200);
  });

  it("rejects a wrong password", async () => {
    const user = await signup("chemail-wrong");
    const res = await request(app)
      .post("/api/auth/change-email")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ email: uniqueEmail("nope"), password: "wrong" });
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/users/me", () => {
  it("requires the typed confirmation and the password", async () => {
    const user = await signup("del-guard");
    const noConfirm = await request(app)
      .delete("/api/users/me")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ password: user.password });
    expect(noConfirm.status).toBe(400);

    const wrongPass = await request(app)
      .delete("/api/users/me")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ password: "not-it", confirm: "DELETE" });
    expect(wrongPass.status).toBe(401);
  });

  it("anonymizes the account but leaves other people's threads readable", async () => {
    const author = await signupVerified("del-author");
    const reader = await signupVerified("del-reader");
    const threadId = await createThread(author, { title: "Surviving thread" });
    await createPost(reader, threadId, "A reply from someone else");
    await createPost(author, threadId, "The author's own reply");

    const del = await request(app)
      .delete("/api/users/me")
      .set("Authorization", `Bearer ${author.token}`)
      .send({ password: author.password, confirm: "DELETE" });
    expect(del.status).toBe(200);

    // Their session is dead and their email no longer logs in.
    const me = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${author.token}`);
    expect(me.status).toBe(401);
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: author.email, password: author.password });
    expect(login.status).toBe(401);

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

  it("frees the email for a future signup", async () => {
    const user = await signup("del-email");
    await request(app)
      .delete("/api/users/me")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ password: user.password, confirm: "DELETE" });

    const again = await request(app)
      .post("/api/auth/signup")
      .send({ email: user.email, password: "another-password-1", displayName: "New Person" });
    expect(again.status).toBe(201);
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
