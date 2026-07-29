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

No env setup is needed — the suite configures itself and works with zero
credentials (stub verification provider, no OAuth).

## How the test database is isolated

API tests never touch `apps/api/prisma/dev.db`. Three layers enforce that:

1. **`apps/api/src/test/global-setup.ts`** runs once per suite run, in the
   Vitest main process before any test worker spawns. It creates a fresh
   temp directory (`$TMPDIR/nyps-api-test-*`), points `DATABASE_URL` at a
   `test.db` inside it, runs `prisma migrate deploy` against that file, and
   deletes the directory when the run ends. Because `DATABASE_URL` is
   already set when `dotenv` loads `.env`, the `.env` value never wins.
2. **`apps/api/src/test/setup.ts`** runs in every test worker and throws
   immediately unless `DATABASE_URL` contains the `nyps-api-test-` marker —
   so if env propagation ever breaks, the suite refuses to run rather than
   falling back to `dev.db`. It also wipes every table before each test
   file, so files start from an empty, fully migrated schema.
3. **`apps/api/vitest.config.ts`** runs files one at a time, each in a
   fresh fork (`pool: "forks"`, `fileParallelism: false`), so files can't
   race each other on the shared SQLite file and per-process state (like
   rate-limiter counters) starts clean per file.

Within a file, tests share the database — fixtures use unique emails
(`src/test/helpers.ts`) rather than relying on per-test cleanup.

## Conventions

- **Test through the routes.** Behaviour is exercised with supertest
  against the real Express app (`src/app.ts`) so middleware — where the
  authorization bugs live — is always in the loop. Direct Prisma access in
  tests is reserved for fixtures with no API path (promoting an admin,
  forging an expired reset token) and for asserting persistence (e.g. the
  `hotScore` column).
- **Verified users are minted through the real flow** — signup →
  `/api/verification/start` → the stub provider's mock-complete route —
  not by writing `verificationStatus` directly.
- **Rate limits are bypassed, not removed.** Global setup sets
  `DISABLE_RATE_LIMIT=1`; the limiters check it per request
  (`src/lib/rate-limit.ts`), and `src/lib/rate-limit.test.ts` unsets it to
  prove the 429 path still fires.
- `src/app.ts` builds the Express app; `src/index.ts` only calls
  `listen()`. Add routes in `app.ts` or tests won't see them.
