import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { prisma } from "~/server/db";
import { stripeClient } from "~/server/verification-provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe Identity webhook.
 *
 * This is a dedicated route rather than another entry in the shared
 * ApiApplication for two reasons, both load-bearing:
 *
 *   1. Signature verification needs the EXACT bytes Stripe sent. The shared
 *      router parses JSON into an object, and re-serialising it will not
 *      reproduce those bytes (key order, whitespace, unicode escapes), so the
 *      signature would never match. `request.text()` here reads the body raw.
 *   2. It has no session. Stripe's servers call it, not a signed-in member,
 *      so `requireAuth` would reject every legitimate call. The signature IS
 *      the authentication — which is why an unverifiable body is rejected
 *      before anything is read out of it.
 *
 * A static route segment outranks the `/api/[...path]` catch-all in Next's
 * router, so this handler wins for exactly this URL and nothing else changes.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("Stripe webhook received but STRIPE_WEBHOOK_SECRET is not set.");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = stripeClient().webhooks.constructEvent(payload, signature, secret);
  } catch (error) {
    // Either someone is forging events or the signing secret is wrong. Both
    // are worth a log line; neither is worth telling the caller which.
    console.error("Stripe webhook signature verification failed", error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Anything else Stripe decides to send us is acknowledged and ignored —
  // returning a non-2xx makes Stripe retry an event we were never going to
  // act on.
  const outcome = statusFor(event.type);
  if (!outcome) return NextResponse.json({ received: true });

  const session = event.data.object as Stripe.Identity.VerificationSession;

  try {
    await applyOutcome(session, outcome);
  } catch (error) {
    // A 500 asks Stripe to retry, which is what we want for a transient
    // database problem — the member's status would otherwise be stuck.
    console.error("Failed to apply Stripe verification outcome", error);
    return NextResponse.json({ error: "Could not record verification result" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

function statusFor(eventType: string): "VERIFIED" | "REJECTED" | null {
  if (eventType === "identity.verification_session.verified") return "VERIFIED";
  // `requires_input` is Stripe's "we could not verify this" — the document was
  // unreadable, the selfie did not match, or the member abandoned it.
  if (eventType === "identity.verification_session.requires_input") return "REJECTED";
  return null;
}

async function applyOutcome(
  session: Stripe.Identity.VerificationSession,
  status: "VERIFIED" | "REJECTED",
): Promise<void> {
  const stored = await prisma.verificationSession.findFirst({
    where: { providerSessionId: session.id },
  });

  // Fall back to the metadata we set at creation time. Without one of these we
  // have no idea whose verification this is, and guessing is not an option.
  const userId = stored?.userId ?? session.metadata?.userId;
  if (!userId) {
    console.error(`Stripe session ${session.id} has no matching user; ignoring.`);
    return;
  }

  await prisma.$transaction(async (tx) => {
    if (stored) {
      await tx.verificationSession.update({ where: { id: stored.id }, data: { status } });
    }
    await tx.user.update({ where: { id: userId }, data: { verificationStatus: status } });
  });
}
