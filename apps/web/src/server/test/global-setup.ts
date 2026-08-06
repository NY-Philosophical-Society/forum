import { execSync } from "child_process";
import { randomUUID } from "crypto";
import { mkdtempSync, rmSync } from "fs";
import os from "os";
import path from "path";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

/**
 * Runs once in the Vitest main process, before any worker spawns. Creates a
 * throwaway *database* on the local Supabase stack, migrates it, and points
 * DATABASE_URL at it — so tests can never touch the development database, and
 * every run starts from an empty, fully-migrated schema. Workers inherit this
 * env because they fork after this completes; src/server/test/setup.ts hard-fails if
 * that ever stops being true.
 *
 * Auth is different: GoTrue's `auth` schema lives in the stack's main database,
 * not in the throwaway one, so test users are created against the shared local
 * auth server. That split is deliberate and harmless — there is no foreign key
 * between `public.User` and `auth.users` (see schema.prisma), and every test
 * email is unique, so runs cannot collide. `supabase stop --no-backup` clears
 * the accumulated auth users if you ever care.
 */

const TEST_DB_PREFIX = "nyps_api_test_";

function adminUrl(): string {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set — copy .env.example to .env and run `supabase start`.");
  }
  return url;
}

export default async function globalSetup() {
  const supabaseUrl = process.env.SUPABASE_URL ?? "";
  // The suite signs real users up and deletes databases. Both are fine against
  // a local stack and catastrophic against a hosted project, so refuse
  // anything that isn't loopback rather than trusting the caller's env.
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(supabaseUrl)) {
    throw new Error(
      `Tests must run against a local Supabase stack, got SUPABASE_URL=${supabaseUrl || "(unset)"}. ` +
        `Run \`supabase start\` and check apps/web/.env.local.`,
    );
  }
  if (!process.env.SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("SUPABASE_PUBLISHABLE_KEY is not set — tests sign users up through real Supabase Auth.");
  }

  const base = adminUrl();
  if (!/(127\.0\.0\.1|localhost)/.test(base)) {
    throw new Error(`Refusing to create a test database on a non-local host: ${base}`);
  }

  const dbName = `${TEST_DB_PREFIX}${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const admin = new PrismaClient({ datasources: { db: { url: base } } });
  await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  await admin.$disconnect();

  const testUrl = new URL(base);
  testUrl.pathname = `/${dbName}`;
  process.env.DATABASE_URL = testUrl.toString();
  process.env.DIRECT_URL = testUrl.toString();
  process.env.DISABLE_RATE_LIMIT = "1";
  delete process.env.VERIFICATION_PROVIDER; // default to the stub

  // Local uploads still go to a throwaway directory on disk.
  const dir = mkdtempSync(path.join(os.tmpdir(), "nyps-api-test-"));
  process.env.UPLOADS_DIR = path.join(dir, "uploads");

  execSync("npx prisma migrate deploy", {
    cwd: path.join(__dirname, "..", "..", ".."),
    env: process.env,
    stdio: "pipe",
  });

  return async () => {
    rmSync(dir, { recursive: true, force: true });
    const cleanup = new PrismaClient({ datasources: { db: { url: base } } });
    // FORCE: vitest workers may not have released their connections yet.
    await cleanup.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await cleanup.$disconnect();
  };
}
