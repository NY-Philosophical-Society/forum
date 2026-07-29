import rateLimit from "express-rate-limit";

const json = (message: string) => (_req: unknown, res: import("express").Response) =>
  res.status(429).json({ error: message });

/** Signup/login/password-reset: tight, since these are the most abuse-prone (credential stuffing, enumeration). */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: json("Too many attempts — try again in a few minutes."),
});

/** Posting, liking, replying, DMing: looser, just enough to blunt spam/abuse bots. */
export const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: json("You're doing that too much — slow down and try again shortly."),
});
