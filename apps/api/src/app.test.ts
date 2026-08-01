import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "./app";
import { prisma } from "./db";

describe("test harness", () => {
  it("serves /health", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("runs against the throwaway test database, not dev.db", async () => {
    expect(process.env.DATABASE_URL).toMatch(/nyps_api_test_/);
    // setup.ts wiped it — a fresh migrated schema with no seed data.
    expect(await prisma.user.count()).toBe(0);
  });
});
