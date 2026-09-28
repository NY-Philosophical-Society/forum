import request from "../test/request";
import { describe, expect, it } from "vitest";
import { app } from "../app";
import { prisma } from "../db";
import { signup } from "../test/helpers";

describe("identity verification event path", () => {
  it("fails closed when no hosted provider is selected", async () => {
    const res = await request(app)
      .post("/api/verification/webhook")
      .set("stripe-signature", "forged")
      .send({ type: "identity.verification_session.verified" });
    expect(res.status).toBe(503);
    expect(await prisma.identityVerificationEvent.count()).toBe(0);
  });

  it("runs local simulation through the durable idempotent event processor", async () => {
    const user = await signup("verification-event-path");
    const start = await request(app)
      .post("/api/verification/start")
      .set("Authorization", `Bearer ${user.token}`);
    expect(start.status).toBe(201);

    const path = `/api/verification/mock-complete/${start.body.sessionId}`;
    expect((await request(app).post(path).send({ approve: true })).status).toBe(200);
    expect((await request(app).post(path).send({ approve: true })).status).toBe(200);

    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).verificationStatus).toBe("VERIFIED");
    expect(await prisma.identityVerificationEvent.count({ where: { userId: user.id } })).toBe(1);
  });

  it("does not let an older session overwrite the current verification state", async () => {
    const user = await signup("verification-latest-session");
    const first = await request(app)
      .post("/api/verification/start")
      .set("Authorization", `Bearer ${user.token}`);
    const second = await request(app)
      .post("/api/verification/start")
      .set("Authorization", `Bearer ${user.token}`);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const oldResult = await request(app)
      .post(`/api/verification/mock-complete/${first.body.sessionId}`)
      .send({ approve: true });
    expect(oldResult.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).verificationStatus).toBe("PENDING");
  });
});
