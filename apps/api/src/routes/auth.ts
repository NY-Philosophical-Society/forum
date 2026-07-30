import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { Router } from "express";
import {
  appleAuthSchema,
  changeEmailSchema,
  changePasswordSchema,
  confirmPasswordResetSchema,
  googleAuthSchema,
  loginSchema,
  oauthDevMockSchema,
  redeemCodeSchema,
  requestPasswordResetSchema,
  signupSchema,
} from "@nyps-forum/shared";
import { signToken } from "../auth";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";
import { toPublicUser } from "../lib/serialize";
import {
  isAppleConfigured,
  isGoogleConfigured,
  oauthConfig,
  verifyAppleIdToken,
  verifyGoogleIdToken,
} from "../lib/oauth";
import { findOrCreateAppleUser, findOrCreateGoogleUser } from "../lib/oauth-user";
import { authLimiter } from "../lib/rate-limit";

export const authRouter = Router();

authRouter.post("/signup", authLimiter, async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { email, password, displayName } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: "An account with this email already exists" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, passwordHash, displayName },
  });

  const token = signToken({ userId: user.id });
  res.status(201).json({ token, user: toPublicUser(user) });
});

authRouter.post("/login", authLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.deletedAt) {
    return res.status(401).json({ error: "Invalid email or password" });
  }
  if (user.bannedAt) {
    return res.status(403).json({ error: "This account has been suspended." });
  }

  if (!user.passwordHash) {
    return res.status(401).json({
      error: "This account signs in with Google or Apple — use that button instead of a password.",
    });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const token = signToken({ userId: user.id });
  res.json({ token, user: toPublicUser(user) });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  res.json({ user: toPublicUser(req.user!) });
});

/**
 * Private account details for the settings screen — email is deliberately
 * not part of PublicUser, and hasPassword distinguishes "change password"
 * from "set a password" for accounts created via Google/Apple.
 */
authRouter.get("/account", requireAuth, async (req, res) => {
  res.json({
    email: req.user!.email,
    hasPassword: req.user!.passwordHash !== null,
    // Member-directory settings for the Settings screen (opt-in flags plus
    // the interests text) — private to the caller, like the email.
    directory: {
      directoryVisible: req.user!.directoryVisible,
      directoryBio: req.user!.directoryBio,
      openToPartners: req.user!.openToPartners,
    },
  });
});

authRouter.post("/change-password", requireAuth, authLimiter, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { currentPassword, newPassword } = parsed.data;

  // OAuth-created accounts (passwordHash === null) are setting a first
  // password; everyone else must prove they know the current one.
  if (req.user!.passwordHash) {
    if (!currentPassword) {
      return res.status(400).json({ error: "Enter your current password" });
    }
    const ok = await bcrypt.compare(currentPassword, req.user!.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: req.user!.id }, data: { passwordHash } });
  res.json({ ok: true });
});

authRouter.post("/change-email", requireAuth, authLimiter, async (req, res) => {
  const parsed = changeEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { email, password } = parsed.data;

  if (req.user!.passwordHash) {
    if (!password) {
      return res.status(400).json({ error: "Enter your password to change your email" });
    }
    const ok = await bcrypt.compare(password, req.user!.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: "Password is incorrect" });
    }
  }

  if (email === req.user!.email) {
    return res.json({ ok: true, email });
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: "An account with this email already exists" });
  }

  await prisma.user.update({ where: { id: req.user!.id }, data: { email } });
  res.json({ ok: true, email });
});

/**
 * Supporter access is meant to eventually come from a real donation/journal
 * subscription check via an API connection to that system. Until that
 * integration exists, WISDOMKEY is a standing (never-expiring, unlimited-use)
 * code anyone can redeem — a deliberate placeholder, not a real access
 * control. Swap this out for the real check before treating supporter status
 * as gating anything meaningful.
 */
authRouter.post("/redeem-code", requireAuth, async (req, res) => {
  const parsed = redeemCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  if (parsed.data.code.trim().toUpperCase() !== "WISDOMKEY") {
    return res.status(400).json({ error: "That code isn't valid." });
  }

  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: { isSupporter: true, supporterSince: req.user!.isSupporter ? undefined : new Date() },
  });

  res.json({ user: toPublicUser(user) });
});

authRouter.get("/oauth/config", (_req, res) => {
  res.json(oauthConfig());
});

authRouter.post("/oauth/google", async (req, res) => {
  if (!isGoogleConfigured()) {
    return res.status(503).json({ error: "Google sign-in is not configured on this server" });
  }
  const parsed = googleAuthSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  try {
    const identity = await verifyGoogleIdToken(parsed.data.idToken);
    const { user, linked } = await findOrCreateGoogleUser(identity.providerId, identity.email, identity.name);
    if (user.bannedAt) return res.status(403).json({ error: "This account has been suspended." });
    const token = signToken({ userId: user.id });
    res.json({ token, user: toPublicUser(user), linked });
  } catch {
    res.status(401).json({ error: "Could not verify Google sign-in" });
  }
});

authRouter.post("/oauth/apple", async (req, res) => {
  if (!isAppleConfigured()) {
    return res.status(503).json({ error: "Apple sign-in is not configured on this server" });
  }
  const parsed = appleAuthSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  try {
    const identity = await verifyAppleIdToken(parsed.data.identityToken);
    const { user, linked } = await findOrCreateAppleUser(
      identity.providerId,
      identity.email,
      parsed.data.displayName,
    );
    if (user.bannedAt) return res.status(403).json({ error: "This account has been suspended." });
    const token = signToken({ userId: user.id });
    res.json({ token, user: toPublicUser(user), linked });
  } catch {
    res.status(401).json({ error: "Could not verify Apple sign-in" });
  }
});

/**
 * Stands in for a real Google/Apple sign-in when neither is configured, so
 * the sign-up UX can be built and demoed without needing live credentials
 * from Google Cloud Console / Apple Developer. Deliberately refuses to run if
 * the real provider IS configured, so it can never be a backdoor once this
 * goes to production with real credentials in place.
 */
authRouter.post("/oauth/dev-mock", async (req, res) => {
  const parsed = oauthDevMockSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { provider, email, displayName } = parsed.data;

  if (provider === "google") {
    if (isGoogleConfigured()) {
      return res.status(403).json({ error: "Google sign-in is configured — use the real flow" });
    }
    const { user, linked } = await findOrCreateGoogleUser(`mock-google:${email}`, email, displayName);
    if (user.bannedAt) return res.status(403).json({ error: "This account has been suspended." });
    const token = signToken({ userId: user.id });
    return res.json({ token, user: toPublicUser(user), linked });
  }

  if (isAppleConfigured()) {
    return res.status(403).json({ error: "Apple sign-in is configured — use the real flow" });
  }
  const { user, linked } = await findOrCreateAppleUser(`mock-apple:${email}`, email, displayName);
  if (user.bannedAt) return res.status(403).json({ error: "This account has been suspended." });
  const token = signToken({ userId: user.id });
  res.json({ token, user: toPublicUser(user), linked });
});

/**
 * No email service is configured (see the module comment on
 * PasswordResetToken in schema.prisma) — the reset link is logged to the
 * server console always, and also returned directly in the response outside
 * production so the flow can be built and demoed end-to-end. Wire up a real
 * mailer (SES, Postmark, Resend, ...) before launch and stop returning
 * `devResetUrl`.
 */
authRouter.post("/password-reset/request", authLimiter, async (req, res) => {
  const parsed = requestPasswordResetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { email } = parsed.data;

  const genericResponse = {
    message: "If that email has a password-based account, we've sent reset instructions.",
  };

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) {
    // Same response whether the account doesn't exist or is OAuth-only, so
    // this endpoint can't be used to enumerate registered emails.
    return res.json(genericResponse);
  }

  const token = randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: { userId: user.id, token, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
  });

  const webUrl = process.env.WEB_APP_URL ?? "http://localhost:3000";
  const resetUrl = `${webUrl}/reset-password?token=${token}`;
  console.log(`[password-reset] link for ${email}: ${resetUrl}`);

  res.json({
    ...genericResponse,
    ...(process.env.NODE_ENV !== "production" ? { devResetUrl: resetUrl, devToken: token } : {}),
  });
});

authRouter.post("/password-reset/confirm", authLimiter, async (req, res) => {
  const parsed = confirmPasswordResetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { token, password } = parsed.data;

  const resetToken = await prisma.passwordResetToken.findUnique({ where: { token } });
  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    return res.status(400).json({ error: "This reset link is invalid or has expired." });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.$transaction([
    prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
  ]);

  res.json({ ok: true });
});
