import type { Prisma } from "@prisma/client";
import { prisma } from "./db";

type Transaction = Prisma.TransactionClient;

export type TrustedIdentityVerificationEvent = {
  provider: string;
  eventId: string;
  providerSessionId: string;
  result: "verified" | "rejected";
};

async function lockSession(tx: Transaction, provider: string, providerSessionId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "VerificationSession"
    WHERE "provider" = ${provider} AND "providerSessionId" = ${providerSessionId}
    FOR UPDATE
  `;
  if (rows.length !== 1) throw new Error("Verification session not found");
}

/**
 * Applies a result only after a provider adapter authenticates it. This is the
 * shared state transition used by local simulation and future real webhooks.
 * It stores no document, selfie, extracted identity data, or raw payload.
 */
export async function applyTrustedIdentityVerificationEvent(
  event: TrustedIdentityVerificationEvent,
): Promise<"applied" | "duplicate" | "superseded"> {
  if (!/^[a-z][a-z0-9_-]{1,39}$/.test(event.provider)) throw new Error("Invalid verification provider");
  if (!event.eventId || !event.providerSessionId || event.eventId.length > 200 || event.providerSessionId.length > 200) {
    throw new Error("Invalid verification event reference");
  }
  if (!["verified", "rejected"].includes(event.result)) throw new Error("Invalid verification result");

  return prisma.$transaction(async (tx) => {
    // Serialise all outcomes for a provider session before checking the event
    // id. This also makes simultaneous delivery of the same event idempotent.
    await lockSession(tx, event.provider, event.providerSessionId);
    const duplicate = await tx.identityVerificationEvent.findUnique({
      where: { provider_eventId: { provider: event.provider, eventId: event.eventId } },
    });
    if (duplicate) {
      if (duplicate.providerSessionId !== event.providerSessionId || duplicate.result !== event.result) {
        throw new Error("Verification event reference was reused with different data");
      }
      return "duplicate";
    }

    const session = await tx.verificationSession.findUniqueOrThrow({
      where: {
        provider_providerSessionId: {
          provider: event.provider,
          providerSessionId: event.providerSessionId,
        },
      },
    });
    const latest = await tx.verificationSession.findFirst({
      where: { userId: session.userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true },
    });

    await tx.identityVerificationEvent.create({
      data: {
        provider: event.provider,
        eventId: event.eventId,
        providerSessionId: event.providerSessionId,
        userId: session.userId,
        result: event.result,
      },
    });

    const status = event.result === "verified" ? "VERIFIED" : "REJECTED";
    await tx.verificationSession.update({ where: { id: session.id }, data: { status } });
    if (latest?.id !== session.id) return "superseded";

    await tx.user.update({ where: { id: session.userId }, data: { verificationStatus: status } });
    return "applied";
  });
}
