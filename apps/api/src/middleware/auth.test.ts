import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../app";
import { prisma } from "../db";
import { createThread, promoteToAdmin, signup, signupVerified, TestUser } from "../test/helpers";

describe("requireAuth", () => {
  it("rejects a request with no Authorization header", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("rejects a syntactically invalid token", async () => {
    const res = await request(app).get("/api/auth/me").set("Authorization", "Bearer garbage");
    expect(res.status).toBe(401);
  });

  it("rejects a valid token whose user no longer exists", async () => {
    const user = await signup("deleted");
    await prisma.user.delete({ where: { id: user.id } });
    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${user.token}`);
    expect(res.status).toBe(401);
  });

  it("rejects a banned user with 403 even though their token is valid", async () => {
    const user = await signup("banned");
    await prisma.user.update({ where: { id: user.id }, data: { bannedAt: new Date() } });
    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${user.token}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/suspended/i);
  });
});

describe("optionalAuth", () => {
  let threadId: string;
  let author: TestUser;

  beforeAll(async () => {
    author = await signupVerified("author");
    threadId = await createThread(author, { body: "A body long enough to matter." });
  });

  it("attaches the viewer when the token is valid", async () => {
    const res = await request(app)
      .get(`/api/threads/${threadId}`)
      .set("Authorization", `Bearer ${author.token}`);
    expect(res.status).toBe(200);
    expect(res.body.thread.previewOnly).toBe(false);
  });

  it("treats a banned user as logged out, not as an error", async () => {
    const banned = await signup("banned-reader");
    await prisma.user.update({ where: { id: banned.id }, data: { bannedAt: new Date() } });
    const res = await request(app)
      .get(`/api/threads/${threadId}`)
      .set("Authorization", `Bearer ${banned.token}`);
    expect(res.status).toBe(200);
    expect(res.body.thread.previewOnly).toBe(true);
    expect(res.body.thread.posts).toEqual([]);
  });

  it("treats an invalid token as logged out, not as an error", async () => {
    const res = await request(app)
      .get(`/api/threads/${threadId}`)
      .set("Authorization", "Bearer completely-bogus");
    expect(res.status).toBe(200);
    expect(res.body.thread.previewOnly).toBe(true);
  });
});

describe("requireVerified — honor system (default)", () => {
  const original = process.env.REQUIRE_ID_VERIFICATION;
  beforeAll(() => {
    delete process.env.REQUIRE_ID_VERIFICATION;
  });
  afterAll(() => {
    if (original === undefined) delete process.env.REQUIRE_ID_VERIFICATION;
    else process.env.REQUIRE_ID_VERIFICATION = original;
  });

  it("lets an UNVERIFIED account post under the name it signed up with", async () => {
    const user = await signup("honor-system-poster");
    const res = await request(app)
      .post("/api/threads")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ title: "On the good life", body: "Posted on the honor system.", tagIds: [] });
    expect(res.status).toBe(201);
  });

  it("still requires a signed-in account — anonymous posting stays blocked", async () => {
    const res = await request(app)
      .post("/api/threads")
      .send({ title: "No account at all", body: "Blocked.", tagIds: [] });
    expect(res.status).toBe(401);
  });
});

describe("requireVerified — strict ID-verification mode (REQUIRE_ID_VERIFICATION=true)", () => {
  const original = process.env.REQUIRE_ID_VERIFICATION;
  beforeAll(() => {
    process.env.REQUIRE_ID_VERIFICATION = "true";
  });
  afterAll(() => {
    if (original === undefined) delete process.env.REQUIRE_ID_VERIFICATION;
    else process.env.REQUIRE_ID_VERIFICATION = original;
  });

  it("blocks an UNVERIFIED user from posting a thread", async () => {
    const user = await signup("unverified-poster");
    const res = await request(app)
      .post("/api/threads")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ title: "Should not exist", body: "Blocked.", tagIds: [] });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/verification required/i);
  });

  it("blocks a PENDING user (verification started, not finished)", async () => {
    const user = await signup("pending-poster");
    const start = await request(app)
      .post("/api/verification/start")
      .set("Authorization", `Bearer ${user.token}`);
    expect(start.status).toBe(201);

    const res = await request(app)
      .post("/api/threads")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ title: "Still not allowed", body: "Blocked.", tagIds: [] });
    expect(res.status).toBe(403);
  });

  it("blocks a REJECTED user", async () => {
    const user = await signup("rejected-poster");
    const start = await request(app)
      .post("/api/verification/start")
      .set("Authorization", `Bearer ${user.token}`);
    await request(app)
      .post(`/api/verification/mock-complete/${start.body.sessionId}`)
      .send({ approve: false });

    const res = await request(app)
      .post("/api/threads")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ title: "Rejected user thread", body: "Blocked.", tagIds: [] });
    expect(res.status).toBe(403);
  });

  it("lets a VERIFIED user post", async () => {
    const user = await signupVerified("verified-poster");
    const res = await request(app)
      .post("/api/threads")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ title: "On the good life", body: "Allowed.", tagIds: [] });
    expect(res.status).toBe(201);
  });
});

describe("requireAdmin", () => {
  it("blocks a regular (even verified) user from admin routes", async () => {
    const user = await signupVerified("not-admin");
    const res = await request(app).get("/api/reports").set("Authorization", `Bearer ${user.token}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/admin/i);
  });

  it("blocks anonymous requests before the admin check", async () => {
    const res = await request(app).get("/api/reports");
    expect(res.status).toBe(401);
  });

  it("lets an admin through", async () => {
    const admin = await signup("admin");
    await promoteToAdmin(admin.id);
    const res = await request(app).get("/api/reports").set("Authorization", `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.reports)).toBe(true);
  });
});
