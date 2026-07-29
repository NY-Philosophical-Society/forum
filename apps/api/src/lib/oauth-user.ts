import { prisma } from "../db";
import type { User } from "@prisma/client";

export interface FindOrCreateResult {
  user: User;
  /** True only when this sign-in attached a new provider to an existing (password or other-provider) account. */
  linked: boolean;
}

/**
 * Shared find-or-create logic for both Google and Apple sign-in: match an
 * existing account by provider id first, then by email (so someone who
 * originally signed up with a password can add Google/Apple sign-in to the
 * same account), then finally create a new one.
 */
export async function findOrCreateGoogleUser(
  googleId: string,
  email: string,
  name: string | null,
): Promise<FindOrCreateResult> {
  const existing = await prisma.user.findUnique({ where: { googleId } });
  if (existing) return { user: existing, linked: false };

  const byEmail = await prisma.user.findUnique({ where: { email } });
  if (byEmail) {
    const user = await prisma.user.update({ where: { id: byEmail.id }, data: { googleId } });
    return { user, linked: true };
  }

  const user = await prisma.user.create({
    data: { email, googleId, displayName: name ?? email.split("@")[0] },
  });
  return { user, linked: false };
}

export async function findOrCreateAppleUser(
  appleId: string,
  email: string,
  displayName?: string,
): Promise<FindOrCreateResult> {
  const existing = await prisma.user.findUnique({ where: { appleId } });
  if (existing) return { user: existing, linked: false };

  const byEmail = await prisma.user.findUnique({ where: { email } });
  if (byEmail) {
    const user = await prisma.user.update({ where: { id: byEmail.id }, data: { appleId } });
    return { user, linked: true };
  }

  // Apple only ever sends the user's real name on their very first
  // authorization (as a client-side field, not in the identity token) — if
  // the client didn't capture and forward it, fall back to the email prefix
  // rather than failing signup outright.
  const user = await prisma.user.create({
    data: { email, appleId, displayName: displayName ?? email.split("@")[0] },
  });
  return { user, linked: false };
}
