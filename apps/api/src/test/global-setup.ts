import { execSync } from "child_process";
import { randomBytes } from "crypto";
import { mkdtempSync, rmSync } from "fs";
import os from "os";
import path from "path";
import { Client } from "pg";
import { isListening, localDatabaseUrl, startLocalPostgres, stopLocalPostgres } from "../../scripts/local-postgres";

/**
 * Runs once in the Vitest main process, before any worker spawns. Tests run
 * against real Postgres — the same engine as production, so nothing can pass
 * here on SQLite semantics and then fail on a host.
 *
 * Isolation is a throwaway *schema* rather than a throwaway database: it needs
 * no createdb privilege, `prisma migrate deploy` creates it, and one
 * DROP SCHEMA CASCADE removes every trace. The name carries a
 * `nyps_api_test_` marker that src/test/setup.ts asserts on, so a broken env
 * hand-off can never point the suite at the seeded dev database.
 *
 * With no TEST_DATABASE_URL set we use — and if necessary start — the local
 * cluster from scripts/local-postgres.ts, so `npm test` works on a clean
 * checkout with nothing installed. Set TEST_DATABASE_URL to point at your own
 * Postgres (CI service container, Docker Compose on a non-default port); we
 * never auto-start anything in that case, since it isn't ours to manage.
 */
export default async function globalSetup() {
  const explicitUrl = process.env.TEST_DATABASE_URL;
  const baseUrl = explicitUrl ?? localDatabaseUrl();
  let clusterIsOurs = false;

  if (!explicitUrl) {
    const { alreadyRunning } = await startLocalPostgres();
    clusterIsOurs = !alreadyRunning;
  } else if (!(await isListening(Number(new URL(explicitUrl).port || 5432)))) {
    throw new Error(`TEST_DATABASE_URL is set but nothing is listening at ${explicitUrl}.`);
  }

  const schema = `nyps_api_test_${randomBytes(4).toString("hex")}`;
  const url = new URL(baseUrl);
  url.searchParams.set("schema", schema);

  const dir = mkdtempSync(path.join(os.tmpdir(), "nyps-api-test-"));
  process.env.DATABASE_URL = url.toString();
  process.env.JWT_SECRET = "test-only-secret";
  process.env.DISABLE_RATE_LIMIT = "1";
  delete process.env.VERIFICATION_PROVIDER; // default to the stub
  // Point the local storage stub's writes at a throwaway directory.
  process.env.UPLOADS_DIR = path.join(dir, "uploads");

  execSync("npx prisma migrate deploy", {
    cwd: path.join(__dirname, "..", ".."),
    env: process.env,
    stdio: "pipe",
  });

  return async () => {
    rmSync(dir, { recursive: true, force: true });
    const client = new Client({ connectionString: baseUrl });
    await client.connect();
    try {
      // Schema name is generated above, never user input.
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } finally {
      await client.end();
    }
    if (clusterIsOurs) await stopLocalPostgres();
  };
}
