import { Router } from "../router";
import { prisma } from "../db";
import { requireAuth } from "../guards";
import { verificationProvider } from "../verification-provider";

export const verificationRouter = Router();

/** Start (or restart) an identity verification session for the current user. */
verificationRouter.post("/start", requireAuth, async (req, res) => {
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
 * Stands in for a real provider's webhook (e.g. Stripe's
 * `identity.verification_session.verified` event). In production this route
 * would instead verify the provider's signature and be called by the
 * provider's servers, not by the client. Exposed here so the local stub flow
 * can actually resolve without a live vendor account.
 */
verificationRouter.post("/mock-complete/:sessionId", async (req, res) => {
  if (verificationProvider.name !== "stub") {
    return res.status(403).json({ error: "Mock completion is only available with the stub provider" });
  }

  const { sessionId } = req.params;
  const { approve } = req.body as { approve?: boolean };

  const session = await prisma.verificationSession.findFirst({
    where: { providerSessionId: sessionId },
  });
  if (!session) {
    return res.status(404).json({ error: "Verification session not found" });
  }

  const newStatus = approve ? "VERIFIED" : "REJECTED";

  await prisma.verificationSession.update({
    where: { id: session.id },
    data: { status: newStatus },
  });
  await prisma.user.update({
    where: { id: session.userId },
    data: { verificationStatus: newStatus },
  });

  res.json({ status: newStatus });
});
