import rateLimit from "express-rate-limit";

const json = (message: string) => (_req: unknown, res: import("express").Response) =>
  res.status(429).json({ error: message });

// The test suite makes far more auth/write calls per minute than the limits
// allow, so it sets DISABLE_RATE_LIMIT=1 (see src/test/global-setup.ts).
// Checked per request, not at module load, so a test can unset it to assert
// the limiter itself still fires.
const disabledForTests = () => process.env.DISABLE_RATE_LIMIT === "1";

/** Signup/login/password-reset: tight, since these are the most abuse-prone (credential stuffing, enumeration). */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: disabledForTests,
  handler: json("Too many attempts — try again in a few minutes."),
});

/** Posting, liking, replying, DMing: looser, just enough to blunt spam/abuse bots. */
export const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: disabledForTests,
  handler: json("You're doing that too much — slow down and try again shortly."),
});
