/**
 * Identity verification is the load-bearing, high-liability piece of this
 * product: confirming a real name + government ID + selfie match for both US
 * and international users. That is a specialized, adversarial problem (fraud
 * detection, document parsing for ~190 countries, liveness checks) that is
 * not worth building in-house — see README for the full rationale.
 *
 * This module defines the provider interface once, so the rest of the app
 * (routes, DB writes, status gating) never has to know whether verification
 * is happening via the local stub or a real vendor. To go to production:
 *
 *   1. Create a Stripe account and complete Identity onboarding
 *      (https://dashboard.stripe.com/identity).
 *   2. Set VERIFICATION_PROVIDER=stripe, STRIPE_SECRET_KEY, and
 *      STRIPE_WEBHOOK_SECRET in .env.
 *   3. Implement StripeVerificationProvider below using
 *      `stripe.identity.verificationSessions.create()` and verify webhook
 *      events (`identity.verification_session.verified` /
 *      `.requires_input`) with `stripe.webhooks.constructEvent`.
 *   4. Point Stripe's webhook endpoint at POST /api/verification/webhook.
 *
 * Persona (withpersona.com) and Veriff (veriff.com) are equally solid
 * alternatives with a near-identical create-session + webhook shape.
 */

import { randomUUID } from "crypto";
import type { VerificationStatus } from "@nyps-forum/shared";

export interface VerificationSessionResult {
  providerSessionId: string;
  verificationUrl: string;
  status: VerificationStatus;
}

export interface VerificationProvider {
  readonly name: string;
  createSession(input: { userId: string; email: string }): Promise<VerificationSessionResult>;
}

/**
 * Local dev/demo stand-in. Instead of a real hosted verification flow, it
 * points the user at a mock page in the web app where they can simulate an
 * approval or rejection, so the rest of the product (gating unverified users
 * out of posting, etc.) can be built and tested end-to-end without a live
 * Stripe/Persona/Veriff account.
 *
 * NEVER use this in production — it performs no actual identity check.
 */
class StubVerificationProvider implements VerificationProvider {
  readonly name = "stub";

  async createSession(): Promise<VerificationSessionResult> {
    const providerSessionId = `stub_${randomUUID()}`;
    const webUrl = process.env.WEB_APP_URL ?? "http://localhost:3000";
    return {
      providerSessionId,
      verificationUrl: `${webUrl}/verify/mock/${providerSessionId}`,
      status: "PENDING",
    };
  }
}

function loadProvider(): VerificationProvider {
  const configured = process.env.VERIFICATION_PROVIDER ?? "stub";
  if (configured === "stub") {
    return new StubVerificationProvider();
  }
  throw new Error(
    `VERIFICATION_PROVIDER="${configured}" is not implemented in this prototype. ` +
      `Implement a StripeVerificationProvider in src/lib/verification-provider.ts ` +
      `(see the file's top comment) before switching this on.`,
  );
}

export const verificationProvider = loadProvider();
