import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../app";
import { uniqueEmail } from "../test/helpers";

/**
 * The suite normally runs with DISABLE_RATE_LIMIT=1. This file re-enables the
 * limiter to prove the bypass hasn't quietly become permanent. It relies on
 * each test file getting a fresh fork (vitest.config.ts), so the limiter's
 * in-memory counters start at zero here.
 */
describe("auth rate limiting", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 429 once an IP exceeds 10 auth attempts in the window", async () => {
    vi.stubEnv("DISABLE_RATE_LIMIT", "");

    const email = uniqueEmail("limited");
    let lastStatus = 0;
    for (let i = 0; i < 11; i += 1) {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email, password: "wrong-password-anyway" });
      lastStatus = res.status;
      if (i < 10) expect(res.status).toBe(401);
    }
    expect(lastStatus).toBe(429);

    // With the test bypass back on, the same IP is no longer throttled.
    vi.stubEnv("DISABLE_RATE_LIMIT", "1");
    const bypassed = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "wrong-password-anyway" });
    expect(bypassed.status).toBe(401);
  });
});
