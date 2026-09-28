# Connection-by-connection verification

Updated 2026-09-22. This is the gate for the showcase upgrade.
The original main comparison is local `origin/main` at
`b6f8d7843a309f1b2fa0f21fa838508a379a21d2`; the remote was refreshed before
this commit. Existing server and shared tests match that reference.
A build, mocked test, and real integration test prove different things.

Recorded runs:

- [Baseline and C0 transport](runs/2026-09-20-connection-baseline.md)
- [C1 authentication connection](runs/2026-09-20-authentication-connection.md)
- [C2 forum connection](runs/2026-09-20-forum-connection.md)
- [C3 directory connection](runs/2026-09-21-directory-connection.md)
- [Prototype storage cleanup](runs/2026-09-21-showcase-storage-cleanup.md)
- [Connected home and events](runs/2026-09-21-home-events-connection.md)
- [Release-readiness audit](runs/2026-09-22-release-readiness.md)

## Working rule

Work on one connection at a time. For each connection:

1. Inventory its real route, response type, authorization, and side effects.
2. Reuse the existing regression tests and fixtures unchanged where applicable.
3. Add focused tests for the upgrade's missing behavior and failure paths.
4. Exercise the browser through the actual local API and disposable test data.
5. Read back writes independently; reload or use a second session to verify persistence.
6. Save evidence; mark the gate passed, failed, blocked, or not run.
7. Move to the next connection only after required cases pass. A blocked external
   provider can be documented, but the connection stays blocked.

No arbitrary coverage percentage is a release gate. Important behaviors,
especially failure and privacy boundaries, must have explicit assertions.
Do not call a locally simulated provider an end-to-end provider pass.

## Existing tests to retain

The original baseline contained **176 server tests in 20 files**, plus **16
shared tests in two files**. The current branch executes **193 API, 72 client,
and 16 shared tests**. Actual counts come from the runner. The old
tests-foundation report describes Express/SQLite;
current code uses the Next request dispatcher, real Supabase Auth, and Postgres.

| Existing files (under apps/web/src/server unless stated) | Cases | Existing protection |
| --- | ---: | --- |
| guards.test.ts | 20 | Missing/invalid/forged sessions; banned/deleted users; first account creation; honor-system and strict verification; admin access |
| routes/auth.account.test.ts; routes/auth.redeem.test.ts | 10 | Account settings, fresh-session deletion, anonymization, export, supporter redemption |
| routes/threads.access.test.ts; routes/threads.pagination.test.ts; ranking.test.ts; routes/content.test.ts | 42 | Preview privacy, write gates, likes, nested pagination, ranking persistence, edits/deletes, mentions |
| routes/chapters.test.ts | 13 | Pending/active membership, approval/removal, visibility across feed/search/bookmarks/profiles/notifications |
| routes/directory-events.test.ts | 9 | Directory opt-in/tier gates, settings round-trip, event permissions and attendance |
| routes/users.profile.test.ts; routes/users.avatar.test.ts; routes/uploads.test.ts; storage-provider.test.ts | 26 | Profile validation, visibility, uploads, image normalization and local storage |
| routes/notifications.test.ts; routes/push-tokens.test.ts; routes/search-bookmarks.test.ts | 26 | Notification emission/read ownership/preferences, push-token ownership, search and bookmarks |
| routes/moderation.test.ts; routes/admin.test.ts | 27 | Reports, blocks, bans, locking, admin actions and audit records |
| app.test.ts; rate-limit.test.ts | 3 | Harness/health and one rate-limit path |
| packages/shared/src/thread-tree.test.ts; strip-markdown.test.ts | 16 | Reply-tree rendering helpers and plain-text extraction |

Reuse the route harness and real token fixtures. The API tests create a
throwaway Postgres database and drop it afterward; local Auth test users remain
in the shared local Auth service. Do not clear that service to clean test users.

## Connection gates, in execution order

| Gate | Connection and reused tests | Upgrade-specific checks still required |
| --- | --- | --- |
| C0 | Browser API client → same-origin API. New api.test.ts; original suite remains baseline. | Deadline through body read; cancellation; bounded safe retries; Retry-After; typed errors; malformed JSON; no replay of writes. Add per-screen handling as each view migrates. |
| C1 | Google/email → Supabase session → /api/auth/me → showcase. Reuse guards and auth.account. **Local email/session/account path passed; real Google provider remains blocked.** | Google first/returning user, deny/cancel, and hosted redirect allow-list still require provider credentials. Confirmation-required signup, backend outage vs rejected login, pending-request cancellation, account isolation, and local redirect construction now have focused coverage. |
| C2 | Forum feed/detail → threads/posts/likes. Reuse access, pagination, ranking, content, chapters. **Authenticated main-feed adapter and local HTTP journey passed; chapter adapter is implemented but its HTTP/browser journey remains pending.** | API IDs and runtime response schemas, filter/reply pagination, stale-request cancellation, loading/empty/error states, durable create/reply/like, account isolation, draft retention, and uncertain-like reconciliation are implemented. Chapter privacy and an interactive browser run remain to verify. |
| C3 | Profile/directory/chapters/settings → existing APIs. Reuse profile, directory-events, chapters, auth.account. **Directory and chapter adapters added; 71 client checks, 176 original API tests, and 11/11 local directory HTTP checks pass. Browser journey remains open.** | Persist edits and privacy; pending join is not active membership; revoked membership removes cached content; two-account isolation; uploaded avatar round-trip and failure recovery. Preserve server gates. |
| C4 | Direct messages → messages/conversations. Reuse moderation, notifications and write-tier tests. | Dedicated conversation pagination/order/read-state tests; unrelated-user access; unverified sender, blocked/banned recipient; no duplicate send after timeout; unsent text retained; stop polling on logout/navigation. Group chat stays outside this gate. |
| C5 | Notifications/search/bookmarks → existing endpoints. Reuse notifications, search-bookmarks, push-tokens, chapters. | Out-of-order search responses; debounce and cancellation; pagination; failed bookmark rollback; stale deep links; unread convergence; polling cleanup and rate limits; private data absent after membership loss. |
| C6 | API → external Storage/verification/push providers. Reuse local provider/upload and moderation tests. | Bound downstream calls; provider failure/slow body; persistence when push fails; Stripe webhook signature/replay is covered locally; hosted delivery remains separately unverified. |
| C7 | Existing event-thread feed/detail is now connected to authenticated Home and Events. The local route tests, API suite, and one synthetic-account browser pass verified upcoming/past/empty/detail states. Luma registration remains an external calendar link, not a sync. | Agree a first-class event/session and Luma contract before showing venues, capacity, live registration, or RSVP. Add upstream timeout/429, duplicate/out-of-order webhook, deduplication, timezone, cancellation, and resync tests then. Attendance is not RSVP. |
| C8 | One synthetic-account desktop browser pass now covers signed-in Home, Events empty/past states, event detail, and local account cleanup; forum and directory HTTP journeys also pass. | Two-account end-to-end UI journey, reload persistence, mobile keyboard flow, accessible error/retry controls, no fixture fallback, staging OAuth/config checks, regression evidence. |

## Failure matrix used at every applicable gate

- **Contract:** method/path/query/body, bearer header, success shape, empty results,
  missing/extra fields, invalid JSON, binary/204 responses. Runtime response
  schemas belong in each data adapter; TypeScript alone does not validate JSON.
- **Authorization:** anonymous, expired/invalid token, forbidden role, other user's
  resource, removed chapter access, blocked/banned/deleted account. Distinguish
  401, 403, and deliberately hidden 404. No client-only permission checks.
- **Deadline:** no headers, stalled body, slow downstream, cancellation, and
  total time including retries. Clear loading state and preserve user's draft.
- **Retry:** only safe reads for transient network/408/429/502/503/504 failures;
  at most two retries, exponential delay with jitter, and Retry-After respected
  within the total deadline. Do not retry 400/401/403/404/409/422 automatically.
  Do not blindly retry generic 500 errors.
- **Write ambiguity:** a timeout does not prove a write failed. No automatic
  replay of create/send/toggle/upload/delete. Reconcile with server state; add
  durable idempotency keys only where write retry is explicitly designed.
- **Concurrency:** double-clicks, stale responses, overlapping pagination,
  logout while loading, account switches, and overlapping optimistic updates.
- **Persistence:** read-after-write, reload, second account/session, rollback,
  partial failure, and event ordering. Test with synthetic records.
- **Operational failures:** unavailable database/Auth/provider, validation errors,
  rate-limit limits and recovery, response-size limits, migration failure.
- **Observability:** test ID, method, route template (not a sensitive URL/query),
  status/error category, attempt count, duration, expected/actual outcome,
  environment, and source fingerprint. Never tokens, passwords, cookies, message
  bodies, real emails, or member records. If request correlation is added,
  generate safe IDs; do not repurpose identity tokens.
- **UX:** loading, empty, rejected, offline, timed-out and retry states;
  focus/keyboard access; drafts survive failure. Failed writes never show success.

## Confirmed gaps from code review

1. C0 previously had no deadline/cancellation options, retry policy, or exposed
   HTTP status, and swallowed malformed success JSON. Addressed in the first
   transport slice; see evidence for executed tests.
2. The C1 implementation now distinguishes rejected sessions from backend
   outages, cancels superseded account loads, and keys staged activity by stable
   auth ID with legacy migration. The real Google consent/cancel/error round
   trip remains unverified because local provider credentials are unset.
3. Exact local showcase return URLs are configured and unit-tested. Hosted
   redirect allow-lists still require an authorized staging/project check;
   configuration in this repository alone is not proof of hosted behavior.
4. The server Supabase fetch helper retries timeouts regardless of HTTP method
   and replaces any caller signal; it needs separate safety/cancellation tests.
   The browser policy does not fix this server helper.
5. Authenticated forum feed/detail/create/reply/like/chapter actions now use
   the real API; demo mode remains deliberately local. The showcase no longer
   persists its mock activity to browser storage and removes only its four
   known legacy keys on the next load. Other views still use fixtures and
   session-memory simulations, so backend tests do not establish UI delivery.
6. The current server suite globally disables rate limits except one test.
   Add targeted write/admin 429 and recovery tests; do not rely on the bypass.
7. No browser/component test harness exists in the baseline. Add browser tests
   against local synthetic data before claiming screen-level integration.
8. The baseline test-host guard matches the database URL with a substring.
   The evidence runner checks parsed hostnames exactly; harden the original
   setup too before making it a shared CI entry point. Cleanup after setup
   failure also needs a test; do not silently call it fully isolated.

## Evidence and reproducibility

Run from the repository root:

```sh
npm run verify -- shared
npm run verify -- client
npm run verify -- api
```

Each invocation creates a unique ignored `.verification/<run>/` directory with
`summary.md` and `results.json`. Evidence contains commit, original-main
reference, branch, dirty flag, executable-source fingerprint (including
untracked source under apps/packages/scripts/supabase and root package config),
Node version/platform, timestamps, command, suite duration, and per-test
source file, case number, hashed ID, status, and duration. A dirty-tree result applies to the fingerprint, not just
the commit. Commit or preserve the reviewed source snapshot before external
review so the exact code can be reproduced.

The runner records **passed**, **failed**, **incomplete**, or **blocked**.
A dependency/setup failure is never a test pass; skipped/todo cases make a run
incomplete. It does not save console logs, payloads, environment values,
assertion values, or stack traces. Reproduce individual failures locally;
include only reviewed, sanitized diagnostics in a PR.

Share the dated report under `docs/runs/` plus selected reviewed result files.
Local evidence is intentionally ignored by Git; it is not automatically attached
to a PR. Keep screenshots/traces synthetic and review them before attaching.
Wall-clock suite timings are reproducibility data, not production latency
benchmarks. Browser/provider evidence must state whether the dependency was real
or simulated and which user journey was exercised.
