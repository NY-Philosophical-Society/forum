import { execSync } from "child_process";
import { mkdtempSync, rmSync } from "fs";
import os from "os";
import path from "path";

/**
 * Runs once in the Vitest main process, before any worker spawns. Points
 * DATABASE_URL at a throwaway SQLite file in a fresh temp directory and
 * migrates it, so tests can never touch prisma/dev.db and every run starts
 * from an empty, fully-migrated schema. Workers inherit this env because
 * they fork after this completes; src/test/setup.ts hard-fails if that ever
 * stops being true.
 */
export default function globalSetup() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "nyps-api-test-"));
  const dbPath = path.join(dir, "test.db");

  process.env.DATABASE_URL = `file:${dbPath}`;
  process.env.JWT_SECRET = "test-only-secret";
  process.env.DISABLE_RATE_LIMIT = "1";
  delete process.env.VERIFICATION_PROVIDER; // default to the stub
  // Point the local storage stub's writes at the same throwaway directory.
  process.env.UPLOADS_DIR = path.join(dir, "uploads");

  execSync("npx prisma migrate deploy", {
    cwd: path.join(__dirname, "..", ".."),
    env: process.env,
    stdio: "pipe",
  });

  return () => {
    rmSync(dir, { recursive: true, force: true });
  };
}
