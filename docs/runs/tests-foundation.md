# Run report — `tests-foundation`

Overnight run, 2026-07-29. Built the repo's first test suite: Vitest +
supertest, 76 tests (69 API + 7 shared), all passing, on an isolated
throwaway database.

## What was built, by commit

1. `84a940b` **Test infra** — extracted the Express app into
   `apps/api/src/app.ts` (`index.ts` now only calls `listen()`) so supertest
   can drive it; Vitest global setup that migrates a fresh temp SQLite file
   per run and deletes it after; a per-worker guard that refuses to run
   unless `DATABASE_URL` carries the temp-dir marker; per-file table wipe;
   `DISABLE_RATE_LIMIT=1` bypass checked per-request in
   `src/lib/rate-limit.ts`; `test` scripts at root, `apps/api`,
   `packages/shared`; harness smoke test.
2. `020bf44` **`flattenPostTree` tests** (`packages/shared`) — depth-first
   ordering, depth = ancestor count, sibling order preserved, no orphans on
   interleaved input, fields preserved.
3. `f842aa4` **Auth tests** — signup/login/duplicate email (409)/wrong
   password (401, same message as unknown email), JWT round-trip + tampered
   tokens, `requireAuth` rejecting banned (403) and deleted (401) users,
   `optionalAuth` treating banned/invalid sessions as anonymous,
   `requireVerified` across all four verification states (PENDING and
   REJECTED both blocked), `requireAdmin`, and the 429 path with the rate
   limiter re-enabled.
4. `6dafd29` **Access-tier tests** (tested hardest, per the brief) —
   anonymous gets exactly `body.slice(0, 220) + "…"`, `previewOnly: true`,
   zero posts, and no reply content anywhere in the JSON payload; the
   anonymous feed carries no bodies; any account (even unverified) reads in
   full; unverified accounts get 403 on thread/reply/like/DM with nothing
   persisted; verified accounts can reply and toggle likes with correct
   counts.
5. `4fb06a2` **Ranking tests** — pure `hotScore` properties (engagement
   beats equal age, recency beats equal engagement, replies weigh half a
   like, 45000s-per-decade tradeoff, finite at zero engagement) and
   persistence: likes/replies through the routes update `Thread.hotScore`
   to the exact expected value, flip the hot feed but not the new feed, and
   recompute back down on unlike.
6. `80a169f` **Pagination tests** — reply pages cut by top-level reply
   always include the full descendant tree (asserted structurally: every
   returned reply's parent is in the same page), pages are disjoint with a
   complete union, past-the-end offsets return empty pages; feed
   limit/offset/total/hasMore consistency.
7. `bf298f7` **WISDOMKEY + password reset tests** — correct code grants and
   persists supporter status, `"  wisdomkey \n"` accepted, four wrong-code
   variants rejected with nothing granted, repeat redemption keeps the
   original `supporterSince`; reset flow end-to-end (old password dies, new
   works), tokens single-use and expiring, unknown email gets the identical
   generic response, `devResetUrl`/`devToken` absent under
   `NODE_ENV=production`.
8. `36aacc6` **Moderation tests** — report filing + admin-only listing,
   blocking kills DMs both directions until unblock, banning kills login
   and live tokens until unban, locked threads reject replies (author
   included; only admins lock) until toggled off.
9. `c6509ec` **`docs/TESTING.md`** — how to run, how isolation works,
   suite conventions.

## Production-code changes (deliberately minimal)

- `apps/api/src/index.ts` split into `app.ts` + `index.ts`. No behavior
  change; required for supertest.
- `apps/api/src/lib/rate-limit.ts` gained a `skip` predicate honoring
  `DISABLE_RATE_LIMIT=1`. Checked per request so tests can re-enable the
  limiter; nothing sets that variable outside the test global setup, so
  dev/production behavior is unchanged.

## Database isolation — verified, not assumed

`shasum apps/api/prisma/dev.db` before and after a full suite run:
`1d46e44077f17811681caaddffcc34c22de894be` both times — the seeded dev
database is untouched. The suite runs against
`$TMPDIR/nyps-api-test-*/test.db`, migrated fresh per run via
`prisma migrate deploy` and deleted afterward. If the env plumbing ever
breaks, `src/test/setup.ts` throws before any query runs rather than
falling back to `.env`'s `dev.db`.

## Assumptions made at ambiguities

- **"Tests live in `apps/api/src/**/*.test.ts`"** — `flattenPostTree` lives
  in `packages/shared`, so its test sits alongside it at
  `packages/shared/src/thread-tree.test.ts` with its own minimal vitest
  setup (no DB). Root `npm test` runs both workspaces via
  `--workspaces --if-present`.
- **Rate limiting vs. test volume**: the auth limiter (10/15min/IP) would
  throttle any realistic suite. I chose an env-var bypass evaluated
  per-request over raising limits or faking IPs, and added a test that
  re-enables the limiter and observes the 429. Nothing outside the test
  setup sets `DISABLE_RATE_LIMIT`.
- **Admin fixture**: there is no API path to admin (README says promote via
  direct DB access), so `promoteToAdmin()` writes `role: "admin"` with
  Prisma — mirroring the documented process. Everything else a test does
  goes through routes; Prisma appears only for no-API-path fixtures
  (expired reset token, deleted user, direct ban-flag setup in middleware
  tests) and persistence assertions (`hotScore` column, `supporterSince`).
- **Verified-user fixture** goes through the real flow (signup →
  `/api/verification/start` → stub `mock-complete`), not a DB write, so the
  verification pipeline itself is exercised by every test that needs a
  verified user.
- **SQLite + parallelism**: one shared temp DB, files run sequentially in
  fresh forks (`fileParallelism: false`). Simpler and safer than per-file
  DBs; the whole API suite takes ~8s, so parallelism isn't worth the race
  risk.
- **createdAt tie-breaking**: reply/feed ordering is by `createdAt`
  (millisecond precision) with no secondary sort key. Fixture creation
  sleeps 3–10ms between writes so ordering is unambiguous. If a later run
  adds bulk creation, a secondary `orderBy: { id: "asc" }` in
  `threads.ts`/`seed` would make ordering fully deterministic — noted, not
  changed.

## Deliberately narrowed / skipped

- **`writeLimiter` 429 path untested** — it's the same mechanism as the
  tested `authLimiter` but needs 61 requests from a verified user; low
  marginal value for the runtime. The bypass test covers both limiters'
  `skip` wiring implicitly (posting-heavy suites would 429 otherwise).
- **OAuth (Google/Apple) routes untested** — verifying real provider
  tokens needs credentials that don't exist here, and the dev-mock route's
  "refuses when configured" guard depends on `isGoogleConfigured()` reading
  env at module load, so it can't be toggled per-test without refactoring
  `lib/oauth.ts`. I chose not to touch production code for it in this run.
  Worth a follow-up if a later run touches OAuth.
- **DM conversation/read-receipt endpoints** only tested where moderation
  intersects them (block → 403). Message pagination mirrors the tested
  feed/reply pattern.
- **Tags routes untested** — trivial reads, low regression risk.
- **Mobile/web have no tests** — the brief scoped the suite to the API and
  `packages/shared`.

## Tests that can't easily be broken on purpose (honesty notes)

Per the brief's standard, tests were written to fail on regression; two
spots are weaker than they look:

- The **NODE_ENV=production reset-leak test** was mutation-verified: I
  temporarily removed the guard in `routes/auth.ts` and confirmed exactly
  that one test fails, then reverted.
- The **"repeat WISDOMKEY keeps supporterSince"** test asserts current
  behavior that relies on `req.user.isSupporter` being read before the
  update; a rewrite that re-reads the row inside a transaction would also
  pass — the test pins the outcome, not the mechanism (that's fine).
- The **rate-limit re-enable test** depends on each file getting a fresh
  fork (clean limiter counters). If someone flips `fileParallelism` or
  reuses forks, it could interfere with other files' auth calls — the
  config comment says so.

## Things a human should check

- **Vitest 4 / supertest 7 pins** (`vitest@4.1.10`, `supertest@7.2.2`,
  latest at install time) — fine locally on Node 24; CI should use Node
  20+ per the README.
- The temp-DB marker check matches on the substring `nyps-api-test-` in
  `DATABASE_URL`. If someone renames the mkdtemp prefix in
  `global-setup.ts` without updating `setup.ts`, the suite fails closed
  (refuses to run) — annoying but safe.
- `npm test` at the root runs API then shared. `apps/web` and `apps/mobile`
  have no `test` script, so `--if-present` skips them; adding one later
  slots in automatically.

## Verification output (actual, final run)

```
$ cd apps/api && npx tsc --noEmit         # PASS (no output)
$ cd apps/web && npx tsc --noEmit         # PASS (no output)
$ cd apps/web && npx next build           # PASS — "✓ Generating static pages",
                                          #   routes /, /verify static; /t/[id] etc. dynamic
$ cd apps/mobile && npx tsc --noEmit      # PASS (no output)
$ cd packages/shared && npx tsc --noEmit  # PASS (no output)

$ npm test   (repo root)
  @nyps-forum/api:    Test Files  10 passed (10)   Tests  69 passed (69)   Duration 8.13s
  @nyps-forum/shared: Test Files   1 passed (1)    Tests   7 passed (7)    Duration 0.11s

$ shasum apps/api/prisma/dev.db   # identical before/after suite run:
  1d46e44077f17811681caaddffcc34c22de894be
```
