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
 *   3. Register POST /api/verification/webhook for the verified and
 *      requires-input Identity events. The adapter below checks Stripe's
 *      signature against the exact request bytes before normalizing a result.
 *
 * Persona (withpersona.com) and Veriff (veriff.com) are equally solid
 * alternatives with a near-identical create-session + webhook shape.
 */

import { randomUUID } from "crypto";
import type { VerificationStatus } from "@nyps-forum/shared";
import Stripe from "stripe";

export type TrustedVerificationWebhookEvent = {
  provider: string;
  eventId: string;
  providerSessionId: string;
  result: "verified" | "rejected";
};

export class VerificationWebhookError extends Error {
  constructor(
    readonly kind: "configuration" | "authentication" | "payload",
    message: string,
  ) {
    super(message);
  }
}

export interface VerificationSessionResult {
  providerSessionId: string;
  verificationUrl: string;
  status: VerificationStatus;
}

export interface VerificationProvider {
  readonly name: string;
  createSession(input: { userId: string; email: string }): Promise<VerificationSessionResult>;
  /** Authenticate the provider request before returning a normalized event. */
  parseWebhook?(
    rawBody: Buffer,
    headers: Record<string, string | undefined>,
  ): Promise<TrustedVerificationWebhookEvent | null>;
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

/**
 * Stripe Identity adapter. Identity documents and selfies stay in Stripe's
 * hosted flow; the forum stores only a session reference and the outcome.
 */
export class StripeVerificationProvider implements VerificationProvider {
  readonly name = "stripe";

  async createSession(input: { userId: string; email: string }): Promise<VerificationSessionResult> {
    const webUrl = process.env.WEB_APP_URL ?? "http://localhost:3000";
    const session = await stripeClient().identity.verificationSessions.create({
      type: "document",
      options: { document: { require_matching_selfie: true } },
      metadata: { userId: input.userId },
      return_url: `${webUrl}/verify`,
    });
    if (!session.url) throw new Error("Stripe did not return a hosted verification URL.");
    return {
      providerSessionId: session.id,
      verificationUrl: session.url,
      status: "PENDING",
    };
  }

  async parseWebhook(
    rawBody: Buffer,
    headers: Record<string, string | undefined>,
  ): Promise<TrustedVerificationWebhookEvent | null> {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      throw new VerificationWebhookError("configuration", "Stripe webhook is not configured");
    }
    const signature = headers["stripe-signature"];
    if (!signature) {
      throw new VerificationWebhookError("authentication", "Missing Stripe signature");
    }

    // Resolve configuration before the authentication catch so a missing
    // server key is reported as unavailable, not misclassified as a forgery.
    const client = stripeClient();
    let event: Stripe.Event;
    try {
      event = client.webhooks.constructEvent(rawBody, signature, secret);
    } catch {
      throw new VerificationWebhookError("authentication", "Invalid Stripe signature");
    }

    let result: TrustedVerificationWebhookEvent["result"] | null = null;
    if (event.type === "identity.verification_session.verified") result = "verified";
    if (event.type === "identity.verification_session.requires_input") result = "rejected";
    if (!result) return null;

    const session = event.data.object as Stripe.Identity.VerificationSession;
    if (!session.id || !event.id) {
      throw new VerificationWebhookError("payload", "Stripe webhook is missing its event reference");
    }
    return {
      provider: this.name,
      eventId: event.id,
      providerSessionId: session.id,
      result,
    };
  }
}

let cachedStripe: { key: string; client: Stripe } | null = null;
export function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new VerificationWebhookError(
      "configuration",
      'VERIFICATION_PROVIDER is "stripe" but STRIPE_SECRET_KEY is not set',
    );
  }
  if (cachedStripe?.key === key) return cachedStripe.client;
  const client = new Stripe(key);
  cachedStripe = { key, client };
  return client;
}

function loadProvider(): VerificationProvider {
  const configured = process.env.VERIFICATION_PROVIDER ?? "stub";
  if (configured === "stub") {
    return new StubVerificationProvider();
  }
  if (configured === "stripe") return new StripeVerificationProvider();
  throw new Error(
    `VERIFICATION_PROVIDER="${configured}" is not implemented. Supported values are "stub" and "stripe".`,
  );
}

export const verificationProvider = loadProvider();
