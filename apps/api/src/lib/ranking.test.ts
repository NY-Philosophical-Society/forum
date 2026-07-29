import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../app";
import { prisma } from "../db";
import { createThread, signupVerified } from "../test/helpers";
import { hotScore, recomputeThreadHotScore } from "./ranking";

const t0 = new Date("2026-06-01T12:00:00.000Z");
const later = (seconds: number) => new Date(t0.getTime() + seconds * 1000);

describe("hotScore", () => {
  it("ranks more engagement higher at equal age", () => {
    expect(hotScore(10, 0, t0)).toBeGreaterThan(hotScore(2, 0, t0));
    expect(hotScore(2, 5, t0)).toBeGreaterThan(hotScore(2, 1, t0));
  });

  it("ranks newer higher at equal engagement", () => {
    expect(hotScore(5, 3, later(60))).toBeGreaterThan(hotScore(5, 3, t0));
  });

  it("weighs a reply as half a like", () => {
    expect(hotScore(0, 4, t0)).toBe(hotScore(2, 0, t0));
  });

  it("is finite at zero engagement (no log of 0)", () => {
    expect(Number.isFinite(hotScore(0, 0, t0))).toBe(true);
    // Below one unit of engagement the log term clamps to 0, so score is age-only.
    expect(hotScore(0, 0, t0)).toBe(hotScore(1, 0, t0));
  });

  it("trades 10x engagement against 45000 seconds of age, like Reddit", () => {
    // One decade of engagement (log10 term +1) exactly offsets 45000s of age.
    expect(hotScore(100, 0, t0)).toBeCloseTo(hotScore(10, 0, later(45000)), 10);
    expect(hotScore(0, 0, later(45000)) - hotScore(0, 0, t0)).toBeCloseTo(1, 10);
  });
});

describe("recomputeThreadHotScore", () => {
  it("persists to the hotScore column when likes arrive through the API", async () => {
    const author = await signupVerified("rank-author");
    const olderId = await createThread(author, { title: "Older thread" });
    await new Promise((r) => setTimeout(r, 10)); // distinct createdAt
    const newerId = await createThread(author, { title: "Newer thread" });

    // With no engagement anywhere, newer outranks older in the hot feed.
    let feed = await request(app).get("/api/threads?sort=hot");
    let ids = feed.body.threads.map((t: { id: string }) => t.id);
    expect(ids.indexOf(newerId)).toBeLessThan(ids.indexOf(olderId));

    // Two likes on the older thread (log10(2) ≈ 0.3 ≈ 3.75 hours of age
    // bonus) must flip the hot order — but not the new order.
    const fan1 = await signupVerified("rank-fan1");
    const fan2 = await signupVerified("rank-fan2");
    for (const fan of [fan1, fan2]) {
      const res = await request(app)
        .post(`/api/threads/${olderId}/like`)
        .set("Authorization", `Bearer ${fan.token}`);
      expect(res.status).toBe(200);
    }

    const older = await prisma.thread.findUniqueOrThrow({ where: { id: olderId } });
    expect(older.hotScore).toBeCloseTo(hotScore(2, 0, older.createdAt), 10);

    feed = await request(app).get("/api/threads?sort=hot");
    ids = feed.body.threads.map((t: { id: string }) => t.id);
    expect(ids.indexOf(olderId)).toBeLessThan(ids.indexOf(newerId));

    const newFeed = await request(app).get("/api/threads?sort=new");
    ids = newFeed.body.threads.map((t: { id: string }) => t.id);
    expect(ids.indexOf(newerId)).toBeLessThan(ids.indexOf(olderId));
  });

  it("counts replies into the persisted score", async () => {
    const author = await signupVerified("rank-replier");
    const threadId = await createThread(author, { title: "Reply-scored thread" });

    for (let i = 0; i < 3; i += 1) {
      const res = await request(app)
        .post("/api/posts")
        .set("Authorization", `Bearer ${author.token}`)
        .send({ threadId, body: `Reply ${i}` });
      expect(res.status).toBe(201);
    }

    const thread = await prisma.thread.findUniqueOrThrow({ where: { id: threadId } });
    expect(thread.hotScore).toBeCloseTo(hotScore(0, 3, thread.createdAt), 10);
  });

  it("recomputes back down after an unlike", async () => {
    const author = await signupVerified("rank-unlike");
    const fan = await signupVerified("rank-unlike-fan");
    const threadId = await createThread(author, { title: "Unlike thread" });
    const before = await prisma.thread.findUniqueOrThrow({ where: { id: threadId } });

    await request(app).post(`/api/threads/${threadId}/like`).set("Authorization", `Bearer ${fan.token}`);
    await request(app).post(`/api/threads/${threadId}/like`).set("Authorization", `Bearer ${fan.token}`);

    const after = await prisma.thread.findUniqueOrThrow({ where: { id: threadId } });
    expect(after.hotScore).toBeCloseTo(before.hotScore, 10);
  });

  it("is a no-op for a thread that does not exist", async () => {
    await expect(recomputeThreadHotScore("no-such-thread")).resolves.toBeUndefined();
  });
});
