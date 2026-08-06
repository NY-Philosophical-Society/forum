# Testing

The test suite is Vitest with a Web Request/Response route harness. Tests live next to what they test:
server tests in `apps/web/src/server/**/*.test.ts`, shared-package tests in
`packages/shared/src/**/*.test.ts`.

## Running

```bash
# Everything (from the repo root):
npm test

# Just the web/server suite:
cd apps/web && npm test        # or: npx vitest run
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
  route handlers and focused boundary tests.
