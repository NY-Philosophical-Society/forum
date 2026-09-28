import { describe, expect, it } from "vitest";
import { prisma } from "./db";

describe("test harness", () => {
  it("runs against the throwaway test database", async () => {
    expect(process.env.DATABASE_URL).toMatch(/nyps_api_test_/);
    expect(await prisma.user.count()).toBe(0);
  });
});
