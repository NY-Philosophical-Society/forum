import { Router } from "../router";
import { prisma } from "../db";
import { requireAuth } from "../guards";
import { applyTrustedIdentityVerificationEvent } from "../identity-verification-events";
import { verificationProvider, VerificationWebhookError } from "../verification-provider";

export const verificationRouter = Router();

/** Start (or restart) an identity verification session for the current user. */
verificationRouter.post("/start", requireAuth, async (req, res) => {
  if (process.env.NODE_ENV === "production" && verificationProvider.name === "stub") {
    return res.status(503).json({ error: "Identity verification is not available yet. Contact the club for help." });
  }

  const user = req.user!;
  if (user.verificationStatus === "VERIFIED") {
    return res.status(400).json({ error: "Already verified" });
  }

  const session = await verificationProvider.createSession({
    userId: user.id,
    email: user.email,
  });

  await prisma.verificationSession.create({
    data: {
      userId: user.id,
      provider: verificationProvider.name,
      providerSessionId: session.providerSessionId,
      status: session.status,
    },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { verificationStatus: "PENDING" },
  });

  res.status(201).json({
    sessionId: session.providerSessionId,
    status: session.status,
    verificationUrl: session.verificationUrl,
  });
});

verificationRouter.get("/status", requireAuth, async (req, res) => {
  res.json({ status: req.user!.verificationStatus });
});

/**
 * Provider-authenticated identity result. The selected adapter owns signature
 * validation; only its normalized result reaches the database transition.
 */
verificationRouter.post("/webhook", async (req, res) => {
  if (!verificationProvider.parseWebhook) {
    return res.status(503).json({ error: "Identity verification webhook is not configured" });
  }

  try {
    const event = await verificationProvider.parseWebhook(req.rawBody, req.headers);
    if (!event) return res.json({ received: true });
    const outcome = await applyTrustedIdentityVerificationEvent(event);
    return res.json({ received: true, outcome });
  } catch (error) {
    if (error instanceof VerificationWebhookError) {
      const status = error.kind === "configuration" ? 503 : 400;
      return res.status(status).json({ error: status === 503 ? "Webhook not configured" : "Invalid webhook" });
    }
    // A 5xx asks the provider to retry transient database failures. Do not log
    // the raw body: it may contain identity-provider metadata.
    console.error("Failed to apply identity verification webhook", error);
    return res.status(500).json({ error: "Could not record verification result" });
  }
});

/**
 * Stands in for a real provider's webhook (e.g. Stripe's
 * `identity.verification_session.verified` event). In production this route
 * would instead verify the provider's signature and be called by the
 * provider's servers, not by the client. Exposed here so the local stub flow
 * can actually resolve without a live vendor account.
 */
verificationRouter.post("/mock-complete/:sessionId", async (req, res) => {
  if (process.env.NODE_ENV === "production" || verificationProvider.name !== "stub") {
    return res.status(403).json({ error: "Mock completion is available only in local development" });
  }

  const { sessionId } = req.params;
  const { approve } = req.body as { approve?: boolean };

  const session = await prisma.verificationSession.findFirst({
    where: { providerSessionId: sessionId },
  });
  if (!session) {
    return res.status(404).json({ error: "Verification session not found" });
  }

  const result = approve ? "verified" : "rejected";
  await applyTrustedIdentityVerificationEvent({
    provider: "stub",
    eventId: `mock-${session.id}-${result}`,
    providerSessionId: session.providerSessionId,
    result,
  });

  res.json({ status: approve ? "VERIFIED" : "REJECTED" });
});
