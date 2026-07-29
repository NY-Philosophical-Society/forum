import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../app";
import { signToken, verifyToken } from "../auth";
import { signup, uniqueEmail } from "../test/helpers";

describe("POST /api/auth/signup", () => {
  it("creates an UNVERIFIED account and returns a working token", async () => {
    const email = uniqueEmail("signup");
    const res = await request(app)
      .post("/api/auth/signup")
      .send({ email, password: "long-enough-password", displayName: "Simone Weil" });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user).toMatchObject({
      displayName: "Simone Weil",
      verificationStatus: "UNVERIFIED",
      role: "user",
      isSupporter: false,
    });
    // The public user shape must never leak credentials or email.
    expect(res.body.user.email).toBeUndefined();
    expect(res.body.user.passwordHash).toBeUndefined();

    const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${res.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.id).toBe(res.body.user.id);
  });

  it("rejects a duplicate email with 409", async () => {
    const user = await signup("dupe");
    const res = await request(app)
      .post("/api/auth/signup")
      .send({ email: user.email, password: "another-password-1", displayName: "Someone Else" });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
  });

  it("rejects a too-short password with 400", async () => {
    const res = await request(app)
      .post("/api/auth/signup")
      .send({ email: uniqueEmail("shortpw"), password: "short", displayName: "Blaise Pascal" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/login", () => {
  it("logs in with the right password", async () => {
    const user = await signup("login");
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: user.password });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.id).toBe(user.id);
  });

  it("rejects the wrong password with 401", async () => {
    const user = await signup("wrongpw");
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: "not-the-password" });
    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
  });

  it("rejects an unknown email with the same 401 as a wrong password", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: uniqueEmail("ghost"), password: "whatever-password" });
    expect(res.status).toBe(401);
    // Same message either way, so the endpoint can't confirm which emails exist.
    expect(res.body.error).toBe("Invalid email or password");
  });
});

describe("JWT round-trip", () => {
  it("verifyToken returns the payload signToken embedded", () => {
    const token = signToken({ userId: "some-user-id" });
    expect(verifyToken(token)?.userId).toBe("some-user-id");
  });

  it("rejects a tampered token", async () => {
    const user = await signup("tamper");
    const tampered = user.token.slice(0, -3) + (user.token.endsWith("abc") ? "xyz" : "abc");
    expect(verifyToken(tampered)).toBeNull();

    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${tampered}`);
    expect(res.status).toBe(401);
  });

  it("rejects garbage that was never a JWT", () => {
    expect(verifyToken("not-a-jwt-at-all")).toBeNull();
  });
});
