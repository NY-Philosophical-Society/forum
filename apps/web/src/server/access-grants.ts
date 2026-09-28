import type { Prisma } from "@prisma/client";
import { prisma } from "./db";

export type AccessKind = "forum_supporter" | "society_member";
type Transaction = Prisma.TransactionClient;

async function lockUser(tx: Transaction, userId: string): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "User"
    WHERE "id" = ${userId} AND "deletedAt" IS NULL
    FOR UPDATE
  `;
  if (rows.length !== 1) throw new Error("Account not found or deleted");
}

async function syncAccess(tx: Transaction, userId: string) {
  const grants = await tx.accessGrant.findMany({ where: { userId } });
  const manualSupporter = grants.find(
    (grant) => grant.kind === "forum_supporter" && grant.source === "manual",
  );
  const isSupporter = manualSupporter
    ? manualSupporter.decision === "allow"
    : grants.some(
        (grant) => grant.kind === "forum_supporter" && grant.decision === "allow",
      );
  const isSocietyMember = grants.some(
    (grant) => grant.kind === "society_member" && grant.source === "manual" && grant.decision === "allow",
  );
  const current = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  return tx.user.update({
    where: { id: userId },
    data: {
      isSupporter,
      supporterSince: isSupporter ? current.supporterSince ?? new Date() : null,
      isSocietyMember,
    },
  });
}

/** Staff decisions are audited and take precedence over provider grants. */
export async function setManualAccess(input: {
  userId: string;
  kind: AccessKind;
  allow: boolean;
  actorId: string;
  reason: string;
}) {
  const reason = input.reason.trim();
  if (!reason) throw new Error("An audit reason is required");
  return prisma.$transaction(async (tx) => {
    await lockUser(tx, input.userId);
    await tx.accessGrant.upsert({
      where: {
        kind_source_sourceRef: {
          kind: input.kind,
          source: "manual",
          sourceRef: input.userId,
        },
      },
      create: {
        userId: input.userId,
        kind: input.kind,
        source: "manual",
        sourceRef: input.userId,
        decision: input.allow ? "allow" : "deny",
        actorId: input.actorId,
        reason,
      },
      update: {
        decision: input.allow ? "allow" : "deny",
        actorId: input.actorId,
        reason,
      },
    });
    const user = await syncAccess(tx, input.userId);
    await tx.moderationLog.create({
      data: {
        actorId: input.actorId,
        action: input.kind === "forum_supporter"
          ? input.allow ? "supporter_granted" : "supporter_revoked"
          : input.allow ? "society_member_granted" : "society_member_revoked",
        targetType: "user",
        targetId: user.id,
        targetLabel: user.displayName,
        reason,
        detail: JSON.stringify({ kind: input.kind, source: "manual" }),
      },
    });
    return user;
  });
}

export type VerifiedDonationEvent = {
  provider: string;
  eventId: string;
  donationId: string;
  userId: string;
  type: "settled" | "reversed";
  amountMinor: number;
  currency: string;
};

export type DonationPolicy = {
  minAmountMinor: number;
  currency: string;
};

/**
 * Internal adapter boundary, not an HTTP endpoint. The provider-specific
 * adapter must verify the notification signature and account/donation binding
 * before calling this function. No adapter is enabled until the club chooses
 * a donation provider and policy.
 */
export async function applyVerifiedDonationEvent(
  event: VerifiedDonationEvent,
  policy: DonationPolicy,
): Promise<"applied" | "duplicate" | "ineligible"> {
  if (!/^[a-z][a-z0-9_-]{1,39}$/.test(event.provider) || ["manual", "legacy", "fixture"].includes(event.provider)) {
    throw new Error("Invalid donation provider");
  }
  if (!event.eventId || !event.donationId || event.eventId.length > 200 || event.donationId.length > 200) {
    throw new Error("Invalid donation reference");
  }
  if (!["settled", "reversed"].includes(event.type)) throw new Error("Invalid donation event type");
  if (!Number.isSafeInteger(event.amountMinor) || event.amountMinor < 0 || event.amountMinor > 2_147_483_647 ||
      !Number.isSafeInteger(policy.minAmountMinor) || policy.minAmountMinor < 1 || policy.minAmountMinor > 2_147_483_647) {
    throw new Error("Invalid donation amount or policy");
  }
  if (!/^[A-Z]{3}$/.test(event.currency) || !/^[A-Z]{3}$/.test(policy.currency)) {
    throw new Error("Invalid currency");
  }
  if (!event.userId) throw new Error("Donation has no linked forum account");

  return prisma.$transaction(async (tx) => {
    await lockUser(tx, event.userId);
    const previousEvent = await tx.donationEvent.findUnique({
      where: { provider_eventId: { provider: event.provider, eventId: event.eventId } },
    });
    if (previousEvent) {
      if (previousEvent.donationId !== event.donationId || previousEvent.userId !== event.userId ||
          previousEvent.eventType !== event.type || previousEvent.amountMinor !== event.amountMinor ||
          previousEvent.currency !== event.currency) {
        throw new Error("Donation event reference was reused with different data");
      }
      return "duplicate";
    }
    const key = {
      kind: "forum_supporter",
      source: event.provider,
      sourceRef: event.donationId,
    };
    const existing = await tx.accessGrant.findUnique({ where: { kind_source_sourceRef: key } });
    if (existing && existing.userId !== event.userId) {
      throw new Error("Donation is already linked to another account");
    }
    await tx.donationEvent.create({
      data: {
        provider: event.provider,
        eventId: event.eventId,
        donationId: event.donationId,
        eventType: event.type,
        userId: event.userId,
        amountMinor: event.amountMinor,
        currency: event.currency,
      },
    });
    const eligible = event.amountMinor >= policy.minAmountMinor && event.currency === policy.currency;
    if (event.type === "settled" && !eligible) return "ineligible";
    const decision = event.type === "reversed" ? "deny" : "allow";
    // A reversal is terminal for this donation ID. A late settled event must
    // never restore access after a refund or chargeback.
    if (existing?.decision !== "deny" || decision === "deny") {
      await tx.accessGrant.upsert({
        where: { kind_source_sourceRef: key },
        create: { ...key, userId: event.userId, decision },
        update: { decision },
      });
    }
    await syncAccess(tx, event.userId);
    return "applied";
  });
}
