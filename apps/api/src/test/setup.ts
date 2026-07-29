import { afterAll, beforeAll } from "vitest";

// Refuse to run against anything but the throwaway DB created by
// global-setup.ts. If env propagation ever breaks, dotenv would fall back to
// .env's file:./dev.db and the suite would trash seeded dev data — fail
// loudly instead.
if (!process.env.DATABASE_URL?.includes("nyps-api-test-")) {
  throw new Error(
    `Tests must run against the temp database from src/test/global-setup.ts, ` +
      `got DATABASE_URL=${process.env.DATABASE_URL ?? "(unset)"}. Run tests via vitest, not directly.`,
  );
}

import { prisma } from "../db";

// Each test file starts from an empty database. Deletion order respects
// foreign keys (children before parents).
beforeAll(async () => {
  await prisma.mention.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.block.deleteMany();
  await prisma.report.deleteMany();
  await prisma.message.deleteMany();
  await prisma.postLike.deleteMany();
  await prisma.threadLike.deleteMany();
  await prisma.post.deleteMany();
  await prisma.thread.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.verificationSession.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});
