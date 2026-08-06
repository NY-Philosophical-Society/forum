import "server-only";

import { prisma } from "./db";
import type { TApiRequest, TApiResponse, TNext, TRequestUser } from "./router";
import { verifySupabaseToken, type TSupabaseClaims } from "./supabase";

type DbUser = NonNullable<Awaited<ReturnType<typeof prisma.user.findUnique>>>;

function toRequestUser(user: DbUser): TRequestUser {
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
    createdAt: user.createdAt,
  };
}

function bearerToken(req: TApiRequest): string | null {
  const header = req.headers.authorization;
  return header?.startsWith("Bearer ") ? header.slice(7) : null;
}

/**
 * Verify a Supabase token and return the local account row it belongs to,
 * creating that row the first time we see the user.
 *
 * Supabase owns identity; this table owns everything the forum knows about a
 * person (display name, verification, membership, role, ban). A Supabase user
 * therefore has no local row until their first authenticated request, and this
 * is the single place that gap is closed — which is why BOTH requireAuth and
 * optionalAuth go through it. Creating the row only in requireAuth would mean a
 * user whose first request after signing up hit an optionalAuth route (the feed,
 * any thread page) held a valid token, had no row, and got served the anonymous
 * preview wall while the UI showed them signed in. It would fix itself on the
 * next request, which is worse than failing outright — an intermittent bug
 * nobody can reproduce.
 *
 * Returns a discriminated result rather than throwing, because the two callers
 * disagree about what a failure means: requireAuth rejects, optionalAuth
 * silently continues as anonymous.
 */
type TResolveResult =
  | { ok: true; user: DbUser; claims: TSupabaseClaims }
  | { ok: false; reason: "invalid" | "gone" | "banned" };

async function resolveUser(token: string): Promise<TResolveResult> {
  const claims = await verifySupabaseToken(token);
  if (!claims) return { ok: false, reason: "invalid" };

  const existing = await prisma.user.findUnique({ where: { id: claims.sub } });

  if (existing) {
    // A deleted account's row still exists (its content is anonymized, not
    // removed), but as far as sessions are concerned the user is gone. Checked
    // before the email sync below on purpose: a deleted row's email is
    // deliberately tombstoned, and syncing the token's email over it would
    // undo that.
    if (existing.deletedAt) return { ok: false, reason: "gone" };
    if (existing.bannedAt) return { ok: false, reason: "banned" };

    // Supabase owns the email; mirror a change through on the first request
    // that shows one. Only writes when it actually differs, so the common path
    // stays a single read.
    const user =
      existing.email === claims.email
        ? existing
        : await prisma.user.update({
            where: { id: existing.id },
            data: { email: claims.email },
          });
    return { ok: true, user, claims };
  }

  const displayName = claims.displayName?.trim() || claims.email.split("@")[0];
  try {
    const user = await prisma.user.create({
      data: { id: claims.sub, email: claims.email, displayName },
    });
    return { ok: true, user, claims };
  } catch {
    // Two concurrent first requests: the loser of the race reads the winner's
    // row rather than failing on the unique constraint.
    const raced = await prisma.user.findUnique({ where: { id: claims.sub } });
    if (!raced) throw new Error("Could not create the account record");
    if (raced.deletedAt) return { ok: false, reason: "gone" };
    if (raced.bannedAt) return { ok: false, reason: "banned" };
    return { ok: true, user: raced, claims };
  }
}

export async function requireAuth(
  req: TApiRequest,
  res: TApiResponse,
  next: TNext,
) {
  const token = bearerToken(req);
  if (!token) {
    return res.status(401).json({ error: "Missing Authorization header" });
  }

  const result = await resolveUser(token);
  if (!result.ok) {
    if (result.reason === "banned") {
      return res.status(403).json({ error: "This account has been suspended." });
    }
    return res.status(401).json({
      error: result.reason === "gone" ? "User no longer exists" : "Invalid or expired token",
    });
  }

  req.user = toRequestUser(result.user);
  req.authClaims = result.claims;
  return next();
}

/**
 * Optional auth: attaches req.user if a valid, non-banned token is present,
 * but never rejects — a banned or missing/invalid token is treated the same
 * as being logged out (e.g. falls back to the anonymous read-preview), not
 * as an error.
 */
export async function optionalAuth(
  req: TApiRequest,
  _res: TApiResponse,
  next: TNext,
) {
  const token = bearerToken(req);
  if (!token) return next();

  const result = await resolveUser(token);
  if (result.ok) {
    req.user = toRequestUser(result.user);
    req.authClaims = result.claims;
  }
  return next();
}

/**
 * Real names are required to post here; a completed ID check is not, for now.
 * This is the honor system — we trust the name a member gave at signup — and
 * this constant is the single switch to end it: set REQUIRE_ID_VERIFICATION=true
 * once the club is ready to require the real verification flow (every write
 * route already gates through requireVerified, so nothing else changes).
 * Read per-request rather than cached at module load, so it's togglable in
 * tests without a restart.
 */
export function idVerificationRequired(): boolean {
  return process.env.REQUIRE_ID_VERIFICATION === "true";
}

/** Must run after requireAuth. */
export function requireVerified(req: TApiRequest, res: TApiResponse, next: TNext) {
  if (!idVerificationRequired()) {
    // Honor system: any signed-in, non-banned account posts under the name
    // they gave at signup. requireAuth already ran, so req.user is set.
    return next();
  }
  if (req.user?.verificationStatus !== "VERIFIED") {
    return res.status(403).json({
      error:
        "Identity verification required before you can post. Complete verification from your account settings.",
    });
  }
  return next();
}

/**
 * Member-only surfaces (chapters, the member directory). Admins pass without
 * isSupporter — moderating must never require donating. Must run after
 * requireAuth. This gates *member features* only; it must never be added to
 * anything a free account can do today (reading, notifications, bookmarks).
 */
export function requireMember(req: TApiRequest, res: TApiResponse, next: TNext) {
  if (!req.user?.isSupporter && req.user?.role !== "admin") {
    return res.status(403).json({
      error: "This area is for members of the Society. Redeem a membership code in Settings to join.",
    });
  }
  return next();
}

/** Moderation actions (ban, thread lock, viewing reports). Must run after requireAuth. */
export function requireAdmin(req: TApiRequest, res: TApiResponse, next: TNext) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  return next();
}
