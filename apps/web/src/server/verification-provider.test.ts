import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StripeVerificationProvider, VerificationWebhookError } from "./verification-provider";

describe("Stripe identity webhook adapter", () => {
  const secret = "whsec_test_identity_endpoint";

  beforeEach(() => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_identity_endpoint");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", secret);
  });

  afterEach(() => vi.unstubAllEnvs());

  function signedEvent(type: string, sessionId = "vs_test_123") {
    const payload = JSON.stringify({
      id: "evt_test_123",
      object: "event",
      type,
      data: { object: { id: sessionId, object: "identity.verification_session" } },
    });
    const client = new Stripe("sk_test_signing_helper");
    const signature = client.webhooks.generateTestHeaderString({ payload, secret });
    return { payload: Buffer.from(payload), headers: { "stripe-signature": signature } };
  }

  it("authenticates and normalizes a verified event", async () => {
    const provider = new StripeVerificationProvider();
    const event = signedEvent("identity.verification_session.verified");
    await expect(provider.parseWebhook(event.payload, event.headers)).resolves.toEqual({
      provider: "stripe",
      eventId: "evt_test_123",
      providerSessionId: "vs_test_123",
      result: "verified",
    });
  });

  it("rejects a missing or forged signature", async () => {
    const provider = new StripeVerificationProvider();
    await expect(provider.parseWebhook(Buffer.from("{}"), {})).rejects.toMatchObject({
      kind: "authentication",
    });

    const event = signedEvent("identity.verification_session.verified");
    await expect(
      provider.parseWebhook(Buffer.from(`${event.payload.toString()} `), event.headers),
    ).rejects.toBeInstanceOf(VerificationWebhookError);
  });

  it("fails closed when the server-side Stripe configuration is incomplete", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    const provider = new StripeVerificationProvider();
    const event = signedEvent("identity.verification_session.verified");
    await expect(provider.parseWebhook(event.payload, event.headers)).rejects.toMatchObject({
      kind: "configuration",
    });
  });

  it("acknowledges unrelated Stripe events without creating an outcome", async () => {
    const provider = new StripeVerificationProvider();
    const event = signedEvent("customer.created");
    await expect(provider.parseWebhook(event.payload, event.headers)).resolves.toBeNull();
  });
});
