import "server-only";

import type { TApiRequest, TMiddleware } from "./router";

const WINDOW_MS = 15 * 60 * 1000;

type TCounter = { count: number; resetsAt: number };
type TLimiterOptions = { limit: number; message: string };

// The test suite makes far more auth/write calls per minute than the limits
// allow, so it sets DISABLE_RATE_LIMIT=1 (see src/server/test/global-setup.ts).
// Checked per request, not at module load, so a test can unset it to assert
// the limiter itself still fires.
const disabledForTests = () => process.env.DISABLE_RATE_LIMIT === "1";

function clientAddress(request: TApiRequest): string {
  if (process.env.VERCEL) {
    return (
      request.headers["x-vercel-forwarded-for"] ??
      request.headers["x-forwarded-for"] ??
      "unknown"
    ).split(",", 1)[0].trim();
  }
  return request.headers["x-test-client-ip"] ?? "local";
}

function createLimiter({ limit, message }: TLimiterOptions): TMiddleware {
  const counters = new Map<string, TCounter>();
  return async (request, response, next) => {
    if (disabledForTests()) return next();

    const key = clientAddress(request);
    const now = Date.now();
    const current = counters.get(key);
    const counter = !current || current.resetsAt <= now
      ? { count: 0, resetsAt: now + WINDOW_MS }
      : current;
    counter.count += 1;
    counters.set(key, counter);

    response.setHeader("RateLimit-Limit", String(limit));
    response.setHeader("RateLimit-Remaining", String(Math.max(limit - counter.count, 0)));
    response.setHeader("RateLimit-Reset", String(Math.ceil(counter.resetsAt / 1000)));
    if (counter.count > limit) {
      return response.status(429).json({ error: message });
    }
    return next();
  };
}

/** Signup/login/password-reset: tight, since these are the most abuse-prone (credential stuffing, enumeration). */
export const authLimiter = createLimiter({
  limit: 10,
  message: "Too many attempts — try again in a few minutes.",
});

/** Posting, liking, replying, DMing: looser, just enough to blunt spam/abuse bots. */
export const writeLimiter = createLimiter({
  limit: 60,
  message: "You're doing that too much — slow down and try again shortly.",
});

/**
 * Admin mutations (ban, delete, pin, role changes). Generous for a human
 * working a report queue, far below what a stolen admin token would need to
 * mass-delete at machine speed. Read-only admin listing isn't limited — the
 * dashboard polls it.
 */
export const adminLimiter = createLimiter({
  limit: 120,
  message: "Too many moderation actions in a row — pause and try again shortly.",
});
