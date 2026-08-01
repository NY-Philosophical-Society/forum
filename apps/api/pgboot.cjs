/**
 * Local Postgres for development and tests — `npm run db:up` (leave running).
 *
 * Uses embedded-postgres so there's no Docker or system Postgres to install;
 * the data directory lives in /tmp and is disposable. Production is Supabase;
 * this only exists so local dev matches it (Postgres, not SQLite) without
 * anyone needing credentials.
 */
const mod = require("embedded-postgres");
const EmbeddedPostgres = mod.default || mod;

const PORT = Number(process.env.LOCAL_PG_PORT || 5455);

(async () => {
  const pg = new EmbeddedPostgres({
    databaseDir: process.env.LOCAL_PG_DIR || "/tmp/nyps-pg",
    user: "nyps",
    password: "nyps",
    port: PORT,
    persistent: true,
  });

  await pg.initialise();
  await pg.start();
  try {
    await pg.createDatabase("nyps_forum");
  } catch {
    // Already exists — fine.
  }

  console.log(`\nPostgres ready on port ${PORT}.`);
  console.log(`  DATABASE_URL="postgresql://nyps:nyps@localhost:${PORT}/nyps_forum"`);
  console.log(`  DIRECT_DATABASE_URL="postgresql://nyps:nyps@localhost:${PORT}/nyps_forum"`);
  console.log("\nLeave this running. Ctrl-C to stop.\n");

  const stop = async () => {
    await pg.stop().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  setInterval(() => {}, 1 << 30);
})().catch((e) => {
  console.error("Could not start local Postgres:", e.message);
  process.exit(1);
});
