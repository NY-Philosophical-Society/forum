import request from "./test/request";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "./app";
import { signup } from "./test/helpers";

/**
 * The suite normally runs with DISABLE_RATE_LIMIT=1. This file re-enables the
 * limiter to prove the bypass hasn't quietly become permanent. It relies on
 * each test file getting a fresh fork (vitest.config.ts), so the limiter's
 * in-memory counters start at zero here.
 *
 * This used to hammer POST /api/auth/login, which Supabase Auth now owns.
 * DELETE /api/users/me is the surviving route behind authLimiter — and note
 * the middleware order there (requireAuth, then authLimiter), which is why
 * this needs a real session: an unauthenticated request is rejected before the
 * limiter ever counts it. The request body is deliberately invalid, so every
 * attempt stops at validation and no account is actually deleted.
 */
describe("auth rate limiting", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 429 once an IP exceeds 10 auth attempts in the window", async () => {
    const user = await signup("limited");
    vi.stubEnv("DISABLE_RATE_LIMIT", "");

    let lastStatus = 0;
    for (let i = 0; i < 11; i += 1) {
      const res = await request(app)
        .delete("/api/users/me")
        .set("Authorization", `Bearer ${user.token}`)
        .send({ confirm: "not-the-confirmation" });
      lastStatus = res.status;
      if (i < 10) expect(res.status).toBe(400);
    }
    expect(lastStatus).toBe(429);

    // With the test bypass back on, the same IP is no longer throttled.
    vi.stubEnv("DISABLE_RATE_LIMIT", "1");
    const bypassed = await request(app)
      .delete("/api/users/me")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ confirm: "not-the-confirmation" });
    expect(bypassed.status).toBe(400);
  });
});
