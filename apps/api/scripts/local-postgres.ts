/**
 * Local Postgres for development and tests, with nothing for a human to
 * install. `embedded-postgres` is a devDependency that ships the real
 * PostgreSQL binaries for the current platform (17.10 — the same major every
 * managed host offers), so `npm run db:up` gets a genuine Postgres server on
 * port 5433: same engine as production, no Docker daemon, no Homebrew.
 *
 * Docker Compose is the equally-supported alternative — see docker-compose.yml
 * at the repo root. Both listen on 5433 with the same credentials and database
 * name, so DATABASE_URL is byte-identical either way. Don't run both at once.
 *
 *   npm run db:up        start it (initialises the cluster on first run)
 *   npm run db:down      stop it, keeping the data
 *   npm run db:status    is it listening?
 *   npm run db:nuke      stop it and delete the data directory
 *
 * We drive initdb/pg_ctl directly rather than through the embedded-postgres
 * JS API because pg_ctl daemonises properly — the cluster outlives this
 * process, which is what `db:up` has to mean. The npm package is here for the
 * binaries.
 *
 * Data lives in apps/api/.postgres/ (gitignored) and is disposable: there is
 * no production data anywhere in this repo.
 */

import { execFileSync } from "child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import net from "net";
import os from "os";
import path from "path";
import { Client } from "pg";

export const LOCAL_PG_PORT = Number(process.env.LOCAL_PG_PORT ?? 5433);
const USER = "nyps";
const PASSWORD = "nyps";
const DATABASE = "nyps_forum";
const DATA_DIR = path.join(__dirname, "..", ".postgres");

/** Connection string for the local cluster — matches apps/api/.env.example. */
export function localDatabaseUrl(database = DATABASE): string {
  return `postgresql://${USER}:${PASSWORD}@localhost:${LOCAL_PG_PORT}/${database}?schema=public`;
}

/** The platform-specific binary package that `embedded-postgres` pulls in as
 * an optional dependency. Resolved rather than path-joined so it works whether
 * npm hoists it to the repo root or keeps it under apps/api. */
function binDir(): string {
  const pkg = `@embedded-postgres/${process.platform}-${process.arch}`;
  let entry: string;
  try {
    entry = require.resolve(pkg);
  } catch {
    throw new Error(
      `No bundled Postgres binaries for ${process.platform}-${process.arch} (${pkg} is not installed). ` +
        `Use the Docker Compose path instead: docker compose up -d db (see docker-compose.yml).`,
    );
  }
  // <pkg>/dist/index.js -> <pkg>/native/bin
  return path.join(path.dirname(entry), "..", "native", "bin");
}

function bin(name: string): string {
  return path.join(binDir(), name);
}

/** Anything listening on the port counts as usable Postgres. Deliberately a
 * TCP probe and not a protocol handshake, so it stays cheap and also sees a
 * cluster started by Docker Compose. */
export function isListening(port = LOCAL_PG_PORT, timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    const done = (result: boolean) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

function initCluster() {
  // initdb refuses to read a password from argv, so it goes via a temp file.
  const tmp = mkdtempSync(path.join(os.tmpdir(), "nyps-pg-init-"));
  const pwFile = path.join(tmp, "pw");
  writeFileSync(pwFile, PASSWORD, { mode: 0o600 });
  try {
    execFileSync(
      bin("initdb"),
      ["-D", DATA_DIR, "-U", USER, `--pwfile=${pwFile}`, "-E", "UTF8", "--auth-host=scram-sha-256"],
      { stdio: "pipe" },
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function ensureDatabase() {
  // Connect to the always-present `postgres` database to create ours.
  const client = new Client({ connectionString: localDatabaseUrl("postgres") });
  await client.connect();
  try {
    const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [DATABASE]);
    // CREATE DATABASE can't be parameterised or run in a transaction; the
    // name is a constant here, not user input.
    if (!rowCount) await client.query(`CREATE DATABASE "${DATABASE}"`);
  } finally {
    await client.end();
  }
}

/** Idempotent: initialises the cluster if needed, starts it if it isn't up,
 * and makes sure the nyps_forum database exists. Safe to call from tests. */
export async function startLocalPostgres(): Promise<{ alreadyRunning: boolean }> {
  if (await isListening()) return { alreadyRunning: true };
  if (!existsSync(path.join(DATA_DIR, "PG_VERSION"))) initCluster();
  execFileSync(
    bin("pg_ctl"),
    ["-D", DATA_DIR, "-l", path.join(DATA_DIR, "postgres.log"), "-o", `-p ${LOCAL_PG_PORT}`, "-w", "start"],
    { stdio: "pipe" },
  );
  await ensureDatabase();
  return { alreadyRunning: false };
}

export async function stopLocalPostgres(): Promise<void> {
  if (!(await isListening())) return;
  execFileSync(bin("pg_ctl"), ["-D", DATA_DIR, "-m", "fast", "-w", "stop"], { stdio: "pipe" });
}

async function main() {
  const command = process.argv[2] ?? "start";
  switch (command) {
    case "start": {
      const { alreadyRunning } = await startLocalPostgres();
      console.log(
        alreadyRunning
          ? `Postgres already listening on ${LOCAL_PG_PORT}.`
          : `Postgres started on ${LOCAL_PG_PORT}.\nDATABASE_URL="${localDatabaseUrl()}"`,
      );
      break;
    }
    case "stop":
      await stopLocalPostgres();
      console.log(`Postgres on ${LOCAL_PG_PORT} stopped.`);
      break;
    case "status":
      console.log(
        (await isListening())
          ? `Postgres is listening on ${LOCAL_PG_PORT}.`
          : `Nothing listening on ${LOCAL_PG_PORT}.`,
      );
      break;
    case "nuke":
      await stopLocalPostgres();
      rmSync(DATA_DIR, { recursive: true, force: true });
      console.log(`Stopped and deleted ${DATA_DIR}.`);
      break;
    default:
      console.error(`Unknown command "${command}" — use start | stop | status | nuke.`);
      process.exit(1);
  }
}

// Only act when run as a script; the test harness imports the helpers above.
if (require.main === module) {
  main().then(
    () => process.exit(0),
    (err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    },
  );
}
