# Testing

The test suite is Vitest + supertest. Tests live next to what they test:
API tests in `apps/api/src/**/*.test.ts`, shared-package tests in
`packages/shared/src/**/*.test.ts`.

## Running

```bash
# Everything (from the repo root):
npm test

# Just the API suite:
cd apps/api && npm test        # or: npx vitest run
cd apps/api && npm run test:watch

# Just the shared package:
cd packages/shared && npm test

# One file:
cd apps/api && npx vitest run src/routes/threads.access.test.ts
```

**`supabase start` must be running** — the suite needs the local stack for both
the database and the auth server. Beyond that no setup is needed: it configures
itself from `apps/api/.env` and uses the stub verification provider.

## How the test database is isolated

API tests never touch the development database. Three layers enforce that:

1. **`apps/api/src/test/global-setup.ts`** runs once per suite run, in the
   Vitest main process before any test worker spawns. It creates a throwaway
   database on the local Supabase Postgres (`nyps_api_test_<random>`), points
   `DATABASE_URL` at it, runs `prisma migrate deploy` against it, and drops it
   when the run ends. Because `DATABASE_URL` is already set when `dotenv` loads
   `.env`, the `.env` value never wins. It also refuses to start unless
   `SUPABASE_URL` is loopback — the suite signs real users up and drops
   databases, and neither belongs anywhere near a hosted project.
2. **`apps/api/src/test/setup.ts`** runs in every test worker and throws
   immediately unless `DATABASE_URL` contains the `nyps_api_test_` marker —
   so if env propagation ever breaks, the suite refuses to run rather than
   falling back to the dev database. It also wipes every table before each
   test file, so files start from an empty, fully migrated schema.
3. **`apps/api/vitest.config.ts`** runs files one at a time, each in a
   fresh fork (`pool: "forks"`, `fileParallelism: false`), so files can't
   race each other on the shared database and per-process state (like
   rate-limiter counters) starts clean per file.

Within a file, tests share the database — fixtures use unique emails
(`src/test/helpers.ts`) rather than relying on per-test cleanup.

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

## Known flake: an occasional hung test

Roughly **one full run in five** fails with a single arbitrary test reporting
`Test timed out`. It is a different test each time, and re-running passes.

It is not this codebase. supertest starts an ephemeral server per request and
applies no timeout, and about one request in a thousand never completes — which
reproduces on a bare Express app with none of the forum loaded:

```js
const app = express();
app.get("/health", (_req, res) => res.json({ ok: true }));
for (let i = 0; i < 20000; i++) await request(app).get("/health");
// hangs around request ~1000, indefinitely
```

Because the request hangs forever rather than being slow, **no `testTimeout`
value fixes it** — a 120s timeout just waits 120s. Raising it only changes how
long a bad run takes to fail. The migration to Supabase did not introduce this;
it made runs longer and so made the odds of hitting it per run higher.

Worth fixing properly (a per-request deadline via `.timeout()`, or reusing one
listening server per file instead of one per request), but it is a test-harness
change and nothing to do with the behaviour under test.

## Conventions

- **Test through the routes.** Behaviour is exercised with supertest
  against the real Express app (`src/app.ts`) so middleware — where the
  authorization bugs live — is always in the loop. Direct Prisma access in
  tests is reserved for fixtures with no API path (promoting an admin,
  banning a user) and for asserting persistence (e.g. the `hotScore` column).
- **Accounts are minted through real Supabase Auth.** `signup()` in
  `src/test/helpers.ts` is the suite's single point of contact with GoTrue;
  everything else goes through the API. It returns a real access token, and the
  forum row is created by the API on first use, exactly as in production.
- **Verified users are minted through the real flow** — signup →
  `/api/verification/start` → the stub provider's mock-complete route —
  not by writing `verificationStatus` directly.
- **Rate limits are bypassed, not removed.** Global setup sets
  `DISABLE_RATE_LIMIT=1`; the limiters check it per request
  (`src/lib/rate-limit.ts`), and `src/lib/rate-limit.test.ts` unsets it to
  prove the 429 path still fires.
- `src/app.ts` builds the Express app; `src/index.ts` only calls
  `listen()`. Add routes in `app.ts` or tests won't see them.
