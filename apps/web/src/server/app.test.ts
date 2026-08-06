import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { GET as health } from "../app/health/route";
import { prisma } from "./db";

describe("test harness", () => {
  it("serves /health", async () => {
    const response = health();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("runs against the throwaway test database", async () => {
    expect(process.env.DATABASE_URL).toMatch(/nyps_api_test_/);
    expect(await prisma.user.count()).toBe(0);
  });
});
