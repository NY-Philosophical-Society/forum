import request from "../test/request";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../app";
import { prisma } from "../db";
import { signup, TestUser } from "../test/helpers";

/**
 * Brief 05: device push-token registry. The property that matters most is
 * the upsert-by-token semantics — a shared device must never keep pushing
 * to whoever used the phone previously.
 */

const TOKEN_A = "ExponentPushToken[test-device-aaaa]";

describe("push tokens", () => {
  let alice: TestUser;
  let bob: TestUser;

  beforeAll(async () => {
    // Plain signups: registering for push requires a session, not verification.
    alice = await signup("push-alice");
    bob = await signup("push-bob");
  });

  it("requires auth on both registration and deregistration", async () => {
    const post = await request(app)
      .post("/api/push-tokens")
      .send({ token: TOKEN_A, platform: "ios" });
    expect(post.status).toBe(401);
    const del = await request(app).delete("/api/push-tokens").send({ token: TOKEN_A });
    expect(del.status).toBe(401);
  });

  it("rejects an unknown platform", async () => {
    const res = await request(app)
      .post("/api/push-tokens")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ token: TOKEN_A, platform: "blackberry" });
    expect(res.status).toBe(400);
  });

  it("registers a device token for the signed-in user", async () => {
    const res = await request(app)
      .post("/api/push-tokens")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ token: TOKEN_A, platform: "ios" });
    expect(res.status).toBe(201);

    const row = await prisma.pushToken.findUnique({ where: { token: TOKEN_A } });
    expect(row?.userId).toBe(alice.id);
    expect(row?.platform).toBe("ios");
  });

  it("moves the token when a different account logs in on the same device", async () => {
    const res = await request(app)
      .post("/api/push-tokens")
      .set("Authorization", `Bearer ${bob.token}`)
      .send({ token: TOKEN_A, platform: "ios" });
    expect(res.status).toBe(201);

    // One row, now Bob's — Alice's session must no longer reach this device.
    const rows = await prisma.pushToken.findMany({ where: { token: TOKEN_A } });
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(bob.id);
  });

  it("only deletes a token its owner presents", async () => {
    const foreign = await request(app)
      .delete("/api/push-tokens")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ token: TOKEN_A });
    expect(foreign.status).toBe(200);
    // Alice no longer owns it, so the row survives her delete.
    expect(await prisma.pushToken.findUnique({ where: { token: TOKEN_A } })).not.toBeNull();

    await request(app)
      .delete("/api/push-tokens")
      .set("Authorization", `Bearer ${bob.token}`)
      .send({ token: TOKEN_A });
    expect(await prisma.pushToken.findUnique({ where: { token: TOKEN_A } })).toBeNull();
  });
});
