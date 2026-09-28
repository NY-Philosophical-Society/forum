import request from "../test/request";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../app";
import { prisma } from "../db";
import { signup } from "../test/helpers";

describe("production identity-verification boundary", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("does not create a mock verification session in production", async () => {
    const user = await signup("production-verification");
    vi.stubEnv("NODE_ENV", "production");
    const res = await request(app)
      .post("/api/verification/start")
      .set("Authorization", `Bearer ${user.token}`);
    expect(res.status).toBe(503);
    expect(await prisma.verificationSession.count({ where: { userId: user.id } })).toBe(0);
  });

  it("cannot complete an existing local mock session in production", async () => {
    const user = await signup("production-mock-completion");
    const start = await request(app)
      .post("/api/verification/start")
      .set("Authorization", `Bearer ${user.token}`);
    expect(start.status).toBe(201);

    vi.stubEnv("NODE_ENV", "production");
    const res = await request(app)
      .post(`/api/verification/mock-complete/${start.body.sessionId}`)
      .send({ approve: true });
    expect(res.status).toBe(403);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).verificationStatus).toBe("PENDING");
  });
});
