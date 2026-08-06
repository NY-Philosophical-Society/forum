import { Router } from "../router";
import { redeemCodeSchema } from "@nyps-forum/shared";
import { prisma } from "../db";
import { requireAuth } from "../guards";
import { toPublicUser } from "../serialize";

/**
 * What is left of this router after Supabase Auth took over identity.
 *
 * Signup, login, password change, password reset and Google/Apple sign-in are
 * all Supabase's now, and the clients call it directly — there is no endpoint
 * here that mints or checks a credential. What remains is the forum's own
 * account state: who you are to us (`/me`), your private settings
 * (`/account`), and membership (`/redeem-code`).
 */
export const authRouter = Router();

authRouter.get("/me", requireAuth, async (req, res) => {
  res.json({ user: toPublicUser(req.user!) });
});

/**
 * Private account details for the settings screen — email is deliberately not
 * part of PublicUser. Whether the account has a password, and which providers
 * it signs in with, is Supabase's business: clients read that off their own
 * session (`user.identities`) rather than asking us.
 */
authRouter.get("/account", requireAuth, async (req, res) => {
  res.json({
    email: req.user!.email,
    // Member-directory settings for the Settings screen (opt-in flags plus
    // the interests text) — private to the caller, like the email.
    directory: {
      directoryVisible: req.user!.directoryVisible,
      directoryBio: req.user!.directoryBio,
      openToPartners: req.user!.openToPartners,
    },
  });
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
