import type { NextFunction, Request, Response } from "express";
import { verifyToken } from "../auth";
import { prisma } from "../db";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        displayName: string;
        avatarUrl: string | null;
        bio: string | null;
        verificationStatus: string;
        role: string;
        isSupporter: boolean;
        directoryVisible: boolean;
        directoryBio: string | null;
        openToPartners: boolean;
        passwordHash: string | null;
        createdAt: Date;
      };
    }
  }
}

type DbUser = NonNullable<Awaited<ReturnType<typeof prisma.user.findUnique>>>;

function toRequestUser(user: DbUser): NonNullable<Request["user"]> {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    verificationStatus: user.verificationStatus,
    role: user.role,
    isSupporter: user.isSupporter,
    directoryVisible: user.directoryVisible,
    directoryBio: user.directoryBio,
    openToPartners: user.openToPartners,
    passwordHash: user.passwordHash,
    createdAt: user.createdAt,
  };
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Missing Authorization header" });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  // A deleted account's row still exists (its content is anonymized, not
  // removed), but as far as sessions are concerned the user is gone.
  if (!user || user.deletedAt) {
    return res.status(401).json({ error: "User no longer exists" });
  }
  if (user.bannedAt) {
    return res.status(403).json({ error: "This account has been suspended." });
  }

  req.user = toRequestUser(user);
  next();
}

/**
 * Optional auth: attaches req.user if a valid, non-banned token is present,
 * but never rejects — a banned or missing/invalid token is treated the same
 * as being logged out (e.g. falls back to the anonymous read-preview), not
 * as an error.
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next();

  const payload = verifyToken(token);
  if (!payload) return next();

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (user && !user.bannedAt && !user.deletedAt) {
    req.user = toRequestUser(user);
  }
  next();
}

/**
 * Real-name + ID-verification is a core requirement of this forum: only
 * verified users may create content. Must run after requireAuth.
 */
export function requireVerified(req: Request, res: Response, next: NextFunction) {
  if (req.user?.verificationStatus !== "VERIFIED") {
    return res.status(403).json({
      error:
        "Identity verification required before you can post. Complete verification from your account settings.",
    });
  }
  next();
}

/**
 * Member-only surfaces (chapters, the member directory). Admins pass without
 * isSupporter — moderating must never require donating. Must run after
 * requireAuth. This gates *member features* only; it must never be added to
 * anything a free account can do today (reading, notifications, bookmarks).
 */
export function requireMember(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.isSupporter && req.user?.role !== "admin") {
    return res.status(403).json({
      error: "This area is for members of the Society. Redeem a membership code in Settings to join.",
    });
  }
  next();
}

/** Moderation actions (ban, thread lock, viewing reports). Must run after requireAuth. */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}
