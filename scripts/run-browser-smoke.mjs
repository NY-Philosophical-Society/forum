import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const web = path.join(root, "apps/web");
const direct = process.env.DIRECT_DATABASE_URL;
const supabaseUrl = process.env.SUPABASE_URL;

if (!direct || !supabaseUrl || !process.env.SUPABASE_PUBLISHABLE_KEY) {
  throw new Error("Browser smoke test needs local Supabase URL, publishable key, and direct database URL.");
}

const dbUrl = new URL(direct);
const authUrl = new URL(supabaseUrl);
if (!["127.0.0.1", "localhost"].includes(dbUrl.hostname) || dbUrl.port !== "54422" || dbUrl.pathname !== "/postgres" ||
    !["127.0.0.1", "localhost"].includes(authUrl.hostname) || authUrl.port !== "54421") {
  throw new Error("Browser smoke test refuses non-local Supabase or a database other than the local postgres database.");
}

const name = `nyps_browser_test_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
const testUrl = new URL(direct);
testUrl.pathname = `/${name}`;
const env = {
  ...process.env,
  DATABASE_URL: testUrl.toString(),
  DIRECT_DATABASE_URL: testUrl.toString(),
  NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_SHOWCASE_REVIEW_MODE: "false",
  NYPS_IGNORE_LOCAL_ENV: "1",
  STORAGE_PROVIDER: "local",
  DISABLE_RATE_LIMIT: "1",
};

const admin = new PrismaClient({ datasources: { db: { url: direct } } });
let created = false;
try {
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  created = true;
  execFileSync("npx", ["prisma", "migrate", "deploy"], { cwd: web, env, stdio: "inherit" });
  execFileSync("npm", ["run", "build", "--workspace=apps/web"], { cwd: root, env, stdio: "inherit" });
  execFileSync("npm", ["run", "test:browser", "--workspace=apps/web"], { cwd: root, env, stdio: "inherit" });
} finally {
  try {
    if (created) await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  } finally {
    await admin.$disconnect();
  }
}
