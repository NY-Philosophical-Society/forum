import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../app";
import { prisma } from "../db";
import { signup, TestUser } from "../test/helpers";

async function redeem(user: TestUser, code: string) {
  return request(app)
    .post("/api/auth/redeem-code")
    .set("Authorization", `Bearer ${user.token}`)
    .send({ code });
}

describe("POST /api/auth/redeem-code (WISDOMKEY)", () => {
  it("grants supporter status for the correct code and persists it", async () => {
    const user = await signup("supporter");
    const res = await redeem(user, "WISDOMKEY");
    expect(res.status).toBe(200);
    expect(res.body.user.isSupporter).toBe(true);

    const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${user.token}`);
    expect(me.body.user.isSupporter).toBe(true);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.supporterSince).not.toBeNull();
  });

  it("tolerates lowercase and surrounding whitespace", async () => {
    const user = await signup("casual-supporter");
    const res = await redeem(user, "  wisdomkey \n");
    expect(res.status).toBe(200);
    expect(res.body.user.isSupporter).toBe(true);
  });

  it("rejects a wrong code and grants nothing", async () => {
    const user = await signup("hopeful");
    for (const code of ["WISDOMKEYS", "WISDOM KEY", "wisdom-key", "PHILOSOPHERSTONE"]) {
      const res = await redeem(user, code);
      expect(res.status, `code "${code}" should be rejected`).toBe(400);
    }
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.isSupporter).toBe(false);
    expect(row.supporterSince).toBeNull();
  });

  it("requires being signed in", async () => {
    const res = await request(app).post("/api/auth/redeem-code").send({ code: "WISDOMKEY" });
    expect(res.status).toBe(401);
  });

  it("keeps the original supporterSince on a repeat redemption", async () => {
    const user = await signup("repeat-supporter");
    await redeem(user, "WISDOMKEY");
    const first = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });

    await new Promise((r) => setTimeout(r, 5));
    await redeem(user, "WISDOMKEY");
    const second = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(second.supporterSince?.getTime()).toBe(first.supporterSince?.getTime());
  });
});
