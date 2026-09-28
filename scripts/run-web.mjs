import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webDir = path.join(root, "apps/web");
const command = process.argv[2];
if (!["dev", "build", "start"].includes(command)) {
  console.error("Usage: node scripts/run-web.mjs dev|build|start [Next.js arguments]");
  process.exit(2);
}

const localFile = path.join(webDir, ".env.local");
// The isolated browser test supplies its own temporary database URL. Do not
// let a developer's .env.local replace it in that one explicit mode.
const local = process.env.NYPS_IGNORE_LOCAL_ENV === "1"
  ? {}
  : existsSync(localFile) ? parse(readFileSync(localFile)) : {};
const result = spawnSync(
  process.execPath,
  [path.join(root, "node_modules/next/dist/bin/next"), command, ...process.argv.slice(3)],
  {
    cwd: webDir,
    env: { ...process.env, ...local },
    stdio: "inherit",
  },
);
if (result.error) {
  console.error("Could not start Next.js.");
  process.exit(1);
}
process.exit(result.status ?? 1);
