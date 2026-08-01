import { execSync } from "child_process";
import { mkdtempSync, rmSync } from "fs";
import os from "os";
import path from "path";

/**
 * Runs once in the Vitest main process, before any worker spawns.
 *
 * Postgres has no equivalent of "point at a throwaway file", so isolation
 * works by creating a uniquely-named **schema** inside the configured database
 * and setting it in the connection string's `?schema=`. Every table Prisma
 * creates lands there, so a run can never see or touch the app's own tables
 * even when both live in the same database.
 *
 * The schema name always contains "nyps-api-test-", which src/test/setup.ts
 * hard-checks — if env propagation ever breaks and DATABASE_URL falls back to
 * a real database, the suite refuses to run rather than deleting live data.
 *
 * Needs a reachable Postgres: `npm run db:up` locally, a service container in
 * CI, or TEST_DATABASE_URL pointing anywhere disposable.
 */
export default function globalSetup() {
  const base =
    process.env.TEST_DATABASE_URL ??
    process.env.DATABASE_URL ??
    "postgresql://nyps:nyps@localhost:5455/nyps_forum";

  if (!base.startsWith("postgres")) {
    throw new Error(
      `Tests need a Postgres connection string, got "${base}". ` +
        `Start the local database (npm run db:up) or set TEST_DATABASE_URL.`,
    );
  }

  const schema = `nyps-api-test-${Date.now()}-${process.pid}`;
  const url = new URL(base);
  url.searchParams.set("schema", schema);

  const dir = mkdtempSync(path.join(os.tmpdir(), "nyps-api-test-"));
  const apiRoot = path.join(__dirname, "..", "..");

  process.env.DATABASE_URL = url.toString();
  // Migrations need a direct (session-mode) connection. Locally that's the
  // same host; against Supabase they differ — pooled 6543 vs direct 5432.
  process.env.DIRECT_DATABASE_URL = process.env.TEST_DIRECT_DATABASE_URL ?? url.toString();
  process.env.JWT_SECRET = "test-only-secret";
  process.env.DISABLE_RATE_LIMIT = "1";
  delete process.env.VERIFICATION_PROVIDER; // default to the stub
  process.env.UPLOADS_DIR = path.join(dir, "uploads");

  execSync("npx prisma migrate deploy", {
    cwd: apiRoot,
    env: process.env,
    stdio: "pipe",
  });

  return () => {
    // Dropping the schema is cheaper and more certain than table-by-table
    // cleanup, and leaves nothing behind if a test crashed mid-run.
    try {
      execSync(`npx prisma db execute --url "${base}" --stdin`, {
        cwd: apiRoot,
        env: process.env,
        input: `DROP SCHEMA IF EXISTS "${schema}" CASCADE;`,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch {
      // A leaked test schema is untidy but harmless — never fail a run on it.
    }
    rmSync(dir, { recursive: true, force: true });
  };
}
