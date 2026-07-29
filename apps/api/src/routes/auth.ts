import bcrypt from "bcryptjs";
import { Router } from "express";
import {
  appleAuthSchema,
  googleAuthSchema,
  loginSchema,
  oauthDevMockSchema,
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

export const authRouter = Router();

authRouter.post("/signup", async (req, res) => {
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

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.status(401).json({ error: "Invalid email or password" });
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
    const user = await findOrCreateGoogleUser(identity.providerId, identity.email, identity.name);
    const token = signToken({ userId: user.id });
    res.json({ token, user: toPublicUser(user) });
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
    const user = await findOrCreateAppleUser(
      identity.providerId,
      identity.email,
      parsed.data.displayName,
    );
    const token = signToken({ userId: user.id });
    res.json({ token, user: toPublicUser(user) });
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
    const user = await findOrCreateGoogleUser(`mock-google:${email}`, email, displayName);
    const token = signToken({ userId: user.id });
    return res.json({ token, user: toPublicUser(user) });
  }

  if (isAppleConfigured()) {
    return res.status(403).json({ error: "Apple sign-in is configured — use the real flow" });
  }
  const user = await findOrCreateAppleUser(`mock-apple:${email}`, email, displayName);
  const token = signToken({ userId: user.id });
  res.json({ token, user: toPublicUser(user) });
});
