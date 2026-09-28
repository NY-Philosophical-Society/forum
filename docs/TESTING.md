# Testing

The test suite is Vitest with a Web Request/Response route harness. Tests live next to what they test:
server tests in `apps/web/src/server/**/*.test.ts`, shared-package tests in
`packages/shared/src/**/*.test.ts`. One Playwright browser journey lives in
`apps/web/e2e/`.

## Running

For the showcase upgrade, use [CONNECTION-VERIFICATION.md](CONNECTION-VERIFICATION.md)
for the original-suite inventory, failure matrix, and sequential connection gates.

Evidence runs from the repo root: `npm run verify -- shared`,
`npm run verify -- client`, and `npm run verify -- api`. Each creates a
timestamped `.verification/` directory with source fingerprint and per-test
results, excluding credentials, payloads, and raw console output.

The browser transport, auth-state, and showcase forum contract suites run without Supabase:
`npm run test:client --workspace=apps/web`. The original server suite is
`npm run test:api --workspace=apps/web`. The web `npm test` command runs both.
Client fault-injection results do not prove browser UI or provider integration.

`.github/workflows/review.yml` runs client and shared checks, a build, and a
separate local-Supabase job for the API suite and one browser journey. CI
generates its own signing key and synthetic users; the API suite and browser
journey each migrate a disposable database and refuse non-loopback endpoints.
The browser journey exercises two account signups, a draft preserved while
opening guidelines, posting, reload persistence, and visibility to a second
account. It does not prove hosted Google login, payments, external notification
delivery, or the club-owned Vercel deployment. A green CI badge is not a
production sign-off.
`apps/web` declares Rolldown's Linux x64 binding as an optional dependency so
the lockfile includes the runner's native test binary when generated on macOS.

After building and starting the app against local services, the synthetic HTTP
journeys are `npm run verify:auth-http -- http://127.0.0.1:3000` and
`npm run verify:forum-http -- http://127.0.0.1:3000`. Both refuse non-loopback
Auth, database, or app endpoints, persist only sanitized check metadata, and
remove the exact synthetic records they create.

To run the browser journey locally, install Chromium with
`npx playwright install chromium`, load `apps/web/.env.local` into the shell,
then run `node scripts/run-browser-smoke.mjs` from the repo root. It builds and
starts the web app against a fresh `nyps_browser_test_*` database, then drops
that database even if the test fails. Direct Playwright invocation refuses any
other database. Only synthetic Auth accounts remain in
the local Supabase stack.

Web dev/build/start run through `scripts/run-web.mjs`. When
`apps/web/.env.local` exists, its project-specific values override ambient
shell variables. This prevents a developer's global hosted Supabase settings
from silently replacing the repository's local Auth and database endpoints.
The isolated browser runner explicitly bypasses that override so its temporary
database URL cannot be replaced by a developer's usual local database URL.

```bash
# Everything (from the repo root):
npm test

# Just the web/server suite:
cd apps/web && npm run test:api
cd apps/web && npm run test:watch

# Just the shared package:
cd packages/shared && npm test

# One file:
cd apps/web && npx vitest run src/server/routes/threads.access.test.ts
```

**`supabase start` must be running** — the suite needs the local stack for both
the database and the auth server. Beyond that no setup is needed: it configures
itself from `apps/web/.env.local` and uses the stub verification provider.

## How the test database is isolated

API tests never touch the development database. Three layers enforce that:

1. **`apps/web/src/server/test/global-setup.ts`** runs once per suite run, in the
   Vitest main process before any test worker spawns. It creates a throwaway
   database on the local Supabase Postgres (`nyps_api_test_<random>`), points
   `DATABASE_URL` at it, runs `prisma migrate deploy` against it, and drops it
   when the run ends. Because `DATABASE_URL` is already set when `dotenv` loads
   the loaded local environment, its development value never wins. It also refuses to start unless
   `SUPABASE_URL` is loopback — the suite signs real users up and drops
   databases, and neither belongs anywhere near a hosted project.
2. **`apps/web/src/server/test/setup.ts`** runs in every test worker and throws
   immediately unless `DATABASE_URL` contains the `nyps_api_test_` marker —
   so if env propagation ever breaks, the suite refuses to run rather than
   falling back to the dev database. It also wipes every table before each
   test file, so files start from an empty, fully migrated schema.
3. **`apps/web/vitest.config.ts`** runs files one at a time, each in a
   fresh fork (`pool: "forks"`, `fileParallelism: false`), so files can't
   race each other on the shared database and per-process state (like
   rate-limiter counters) starts clean per file.

Within a file, tests share the database — fixtures use unique emails
(`src/server/test/helpers.ts`) rather than relying on per-test cleanup.

### Auth users are the exception

GoTrue's `auth` schema lives in the local stack's main database, not in the
throwaway one, so test accounts are created against the shared local auth
server and outlive the run. That is deliberate and harmless: there is no
foreign key between `public.User` and `auth.users` (see `schema.prisma`), and
every test email is unique. `supabase stop --no-backup` clears them if you care.

`config.toml` raises GoTrue's `sign_in_sign_ups` rate limit far above its
default of 30-per-5-minutes for the same reason — the suite mints hundreds of
accounts per run from one IP, and the resulting 429 surfaces as a confusing
"signup failed" inside an unrelated test.

## Conventions

- **Test through the routes.** Behaviour is exercised against the same
  `ApiApplication` Web Request/Response dispatcher used by Next, so guards —
  where the authorization bugs live — are always in the loop. Direct Prisma access in
  tests is reserved for fixtures with no API path (promoting an admin,
  banning a user) and for asserting persistence (e.g. the `hotScore` column).
- **Accounts are minted through real Supabase Auth.** `signup()` in
  `src/server/test/helpers.ts` is the suite's single point of contact with GoTrue;
  everything else goes through the API. It returns a real access token, and the
  forum row is created by the API on first use, exactly as in production.
- **Verified users are minted through the real flow** — signup →
  `/api/verification/start` → the stub provider's mock-complete route —
  not by writing `verificationStatus` directly.
- **Rate limits are bypassed, not removed.** Global setup sets
  `DISABLE_RATE_LIMIT=1`; the limiters check it per request
  (`src/server/rate-limit.ts`), and `src/server/rate-limit.test.ts` unsets it to
  prove the 429 path still fires.
- `src/server/api-app.ts` owns route registration; the Next catch-all route and
  tests both invoke it. `/health` and local `/uploads/*` have dedicated Next
  route handlers. The browser journey calls `/health` over HTTP rather than
  invoking its handler directly.
