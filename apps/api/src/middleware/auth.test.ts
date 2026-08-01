import { SignJWT } from "jose";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../app";
import { prisma } from "../db";
import {
  createThread,
  promoteToAdmin,
  signup,
  signupUnseen,
  signupVerified,
  TestUser,
} from "../test/helpers";

describe("requireAuth", () => {
  it("rejects a request with no Authorization header", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("rejects a syntactically invalid token", async () => {
    const res = await request(app).get("/api/auth/me").set("Authorization", "Bearer garbage");
    expect(res.status).toBe(401);
  });

  /**
   * The whole point of verifying against Supabase's JWKS: a well-formed token
   * with every claim in the right place is still worthless unless Supabase
   * signed it. This one is signed with an attacker's own HMAC secret.
   */
  it("rejects a well-formed token that Supabase did not sign", async () => {
    const forged = await new SignJWT({ email: "impostor@test.nyphilosophy.org" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("00000000-0000-0000-0000-000000000001")
      .setIssuer(`${process.env.SUPABASE_URL}/auth/v1`)
      .setAudience("authenticated")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("an-attacker-supplied-secret-at-least-32-bytes"));

    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${forged}`);
    expect(res.status).toBe(401);
    // And it must not have been quietly created as an account.
    expect(
      await prisma.user.findUnique({ where: { id: "00000000-0000-0000-0000-000000000001" } }),
    ).toBeNull();
  });

  it("rejects a deleted account, whose row survives anonymized", async () => {
    const user = await signup("deleted");
    await prisma.user.update({ where: { id: user.id }, data: { deletedAt: new Date() } });
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

/**
 * Supabase owns identity; this table owns everything else about a person. The
 * gap between "signed up" and "has a row here" is closed on first contact.
 */
describe("lazy account creation", () => {
  it("creates the local row on the first authenticated request, then reuses it", async () => {
    const { token, email, displayName } = await signupUnseen("first-contact");
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();

    const first = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    expect(first.status).toBe(200);
    expect(first.body.user.displayName).toBe(displayName);

    // Second request must reuse the same account, not make another one.
    const second = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    expect(second.body.user.id).toBe(first.body.user.id);
    expect(await prisma.user.count({ where: { email } })).toBe(1);
  });

  /**
   * The row is derived state, not the account. Losing it must not lock a
   * legitimate Supabase user out of the forum.
   */
  it("recreates a row that was removed out from under a live session", async () => {
    const user = await signup("row-dropped");
    await prisma.user.delete({ where: { id: user.id } });
    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${user.token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);
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

  /**
   * optionalAuth shares requireAuth's account resolver for exactly this case.
   * If it didn't, a brand-new member whose first click was a thread link would
   * be shown the anonymous preview wall while signed in — and it would fix
   * itself on the next request, making it unreproducible.
   */
  it("creates the account on first contact rather than showing the preview wall", async () => {
    const { token } = await signupUnseen("first-click-is-a-thread");
    const res = await request(app)
      .get(`/api/threads/${threadId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.thread.previewOnly).toBe(false);
    expect(res.body.thread.body).toContain("A body long enough to matter.");
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
