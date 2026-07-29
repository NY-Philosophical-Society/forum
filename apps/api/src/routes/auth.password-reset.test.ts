import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../app";
import { prisma } from "../db";
import { signup, uniqueEmail } from "../test/helpers";

async function requestReset(email: string) {
  return request(app).post("/api/auth/password-reset/request").send({ email });
}

async function confirmReset(token: string, password: string) {
  return request(app).post("/api/auth/password-reset/confirm").send({ token, password });
}

describe("password reset", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("issues a token and the full flow swaps the password", async () => {
    const user = await signup("resetter");
    const res = await requestReset(user.email);
    expect(res.status).toBe(200);
    expect(res.body.devToken).toBeTruthy();
    expect(res.body.devResetUrl).toContain(res.body.devToken);

    const confirmed = await confirmReset(res.body.devToken, "brand-new-password");
    expect(confirmed.status).toBe(200);

    const oldLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: user.password });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: "brand-new-password" });
    expect(newLogin.status).toBe(200);
  });

  it("gives the same generic response for an unknown email, with no token", async () => {
    const known = await signup("enumerable");
    const knownRes = await requestReset(known.email);
    const unknownRes = await requestReset(uniqueEmail("nobody"));

    expect(unknownRes.status).toBe(200);
    expect(unknownRes.body.message).toBe(knownRes.body.message);
    expect(unknownRes.body.devToken).toBeUndefined();
    expect(unknownRes.body.devResetUrl).toBeUndefined();
  });

  it("a token is consumed on use and cannot be replayed", async () => {
    const user = await signup("replayer");
    const res = await requestReset(user.email);
    const token = res.body.devToken;

    expect((await confirmReset(token, "first-new-password")).status).toBe(200);

    const replay = await confirmReset(token, "attacker-password");
    expect(replay.status).toBe(400);

    // The replay changed nothing: the first new password still works.
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: "first-new-password" });
    expect(login.status).toBe(200);
  });

  it("rejects an expired token", async () => {
    const user = await signup("late-resetter");
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token: "expired-token-fixture",
        expiresAt: new Date(Date.now() - 60 * 1000),
      },
    });
    const res = await confirmReset("expired-token-fixture", "wont-be-set-anyway");
    expect(res.status).toBe(400);
  });

  it("rejects a token that was never issued", async () => {
    const res = await confirmReset("completely-invented-token", "wont-be-set-anyway");
    expect(res.status).toBe(400);
  });

  it("never returns devResetUrl or devToken in production", async () => {
    const user = await signup("prod-resetter");
    vi.stubEnv("NODE_ENV", "production");

    const res = await requestReset(user.email);
    expect(res.status).toBe(200);
    // The token was still created server-side — only the response must not
    // leak it. If someone removes the NODE_ENV guard in routes/auth.ts,
    // these two assertions are what fails.
    expect(res.body).not.toHaveProperty("devToken");
    expect(res.body).not.toHaveProperty("devResetUrl");
    expect(
      await prisma.passwordResetToken.count({ where: { userId: user.id } }),
    ).toBe(1);
  });
});
