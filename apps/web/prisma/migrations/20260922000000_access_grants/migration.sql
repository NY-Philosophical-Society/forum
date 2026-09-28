ALTER TABLE "User" ADD COLUMN "isSocietyMember" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "VerificationSession_provider_providerSessionId_key" ON "VerificationSession"("provider", "providerSessionId");
CREATE INDEX "VerificationSession_userId_createdAt_idx" ON "VerificationSession"("userId", "createdAt");

CREATE TABLE "IdentityVerificationEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "providerSessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IdentityVerificationEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "IdentityVerificationEvent_result_check" CHECK ("result" IN ('verified', 'rejected'))
);

CREATE UNIQUE INDEX "IdentityVerificationEvent_provider_eventId_key" ON "IdentityVerificationEvent"("provider", "eventId");
CREATE INDEX "IdentityVerificationEvent_provider_providerSessionId_idx" ON "IdentityVerificationEvent"("provider", "providerSessionId");
ALTER TABLE "IdentityVerificationEvent" ADD CONSTRAINT "IdentityVerificationEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AccessGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reason" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AccessGrant_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AccessGrant_kind_check" CHECK ("kind" IN ('forum_supporter', 'society_member')),
    CONSTRAINT "AccessGrant_decision_check" CHECK ("decision" IN ('allow', 'deny'))
);

CREATE UNIQUE INDEX "AccessGrant_kind_source_sourceRef_key" ON "AccessGrant"("kind", "source", "sourceRef");
CREATE INDEX "AccessGrant_userId_kind_decision_idx" ON "AccessGrant"("userId", "kind", "decision");
ALTER TABLE "AccessGrant" ADD CONSTRAINT "AccessGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "DonationEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "donationId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DonationEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DonationEvent_type_check" CHECK ("eventType" IN ('settled', 'reversed')),
    CONSTRAINT "DonationEvent_amount_check" CHECK ("amountMinor" >= 0)
);

CREATE UNIQUE INDEX "DonationEvent_provider_eventId_key" ON "DonationEvent"("provider", "eventId");
CREATE INDEX "DonationEvent_provider_donationId_idx" ON "DonationEvent"("provider", "donationId");

-- Preserve existing supporter access without claiming historical donation proof.
-- Club staff must audit these legacy grants before hosted activation.
INSERT INTO "AccessGrant" ("id", "userId", "kind", "source", "sourceRef", "decision", "reason", "createdAt", "updatedAt")
SELECT 'legacy-' || "id", "id", 'forum_supporter', 'legacy', "id", 'allow',
       'Existing supporter status; donation not verified by this migration', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "User" WHERE "isSupporter" = true;
