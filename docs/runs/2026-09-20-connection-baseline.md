# Verification report — baseline and API transport

Date: 2026-09-20. Scope: retain the original forum regression suite, establish
repeatable evidence, and verify C0 (browser API transport). This report does not
claim the showcase's remaining screens or real Google OAuth are connected.

## Actual results

| Check | Outcome | Runner duration |
| --- | --- | ---: |
| Original server/API suite | 176 passed; 0 failed/skipped/todo | 31.690 s |
| Original shared suite | 16 passed; 0 failed/skipped/todo | 0.459 s |
| New browser API transport suite | 42 passed; 0 failed/skipped/todo | 0.465 s |
| Production web build | Passed: compilation, type validation, static generation | Not recorded |
| Final web typecheck after message change | Passed | Not recorded |
| Working diff whitespace check | Passed | Not recorded |

Total distinct test cases across these suites: **234 tests passed**.
Counts are executed test cases, not a code-coverage percentage or a count of
verified end-to-end journeys.

Commands: `node scripts/verify.mjs api`, `node scripts/verify.mjs shared`,
`node scripts/verify.mjs client`, `npm run build --workspace=apps/web`,
`./node_modules/.bin/tsc --noEmit -p apps/web/tsconfig.json`, and `git diff --check`.

## What was tested

The original 20 server test files and two shared test files match local
`origin/main` at `b6f8d7843a309f1b2fa0f21fa838508a379a21d2`.
The server tests used real local Supabase Auth and the existing throwaway
Postgres database lifecycle. Storage/verification/push test paths remain the
local implementations/stubs used by the original suite.

The added client suite injects network failures at `fetch`. It verifies:

- Bearer headers and anonymous requests.
- Preserved HTTP errors and no automatic retries for invalid, unauthorized,
  forbidden, missing, conflicting, unprocessable, or generic-server failures.
- At most two retries for eligible read failures; exponential delay with jitter.
- Retry-After seconds/date handling and a bounded total wait.
- Deadlines for headers and body reading, including retry time.
- Cancellation before a request, during a request, and during backoff.
- Recovery from a connection drop while reading a successful response body.
- Invalid success JSON rejected; non-JSON errors retain status; 204 accepted.
- No automatic replay of writes/uploads after a dropped response.
- An ambiguous write timeout asks the member to check whether it saved before retrying.
- A 30-second default for writes and 60-second default for binary uploads.
- JSON bodies and binary upload content types retained.

The client deadline is ten seconds across attempts; this is a current default,
not a measured production performance target. Endpoint-specific response shape
validation and per-screen cancellation/rollback behavior are later gates.

## Evidence locations

The final three test runs refer to HEAD
`4f7fdaa9933d96d8d713e68cdc5736cdfc4315d6` with uncommitted changes,
Node v26.4.0 on macOS, and the same source fingerprint:
`3a3ac466625b519a4bbf1a77fbb6acd3d3d88b6bab40888171f99e8938edd51f`.
The production build passed before the final transport review fixes; the final
typecheck and all final suites passed after those fixes.

Local evidence folders (ignored by Git, attach reviewed files separately):

- `.verification/2026-09-20T20-13-09-707Z-api-dba0cc08/`
- `.verification/2026-09-20T20-12-58-241Z-shared-5087d336/`
- `.verification/2026-09-20T20-12-58-241Z-client-35777719/`

Each has a human-readable summary and JSON source files, case numbers, hashed
test IDs, statuses, and durations. Earlier evidence runs predate that privacy
hardening and must not be shared; these final reruns supersede them.
No raw console logs, credential values, HTTP payloads, or assertion bodies are
persisted by the evidence runner. These results are local; no CI run or remote
PR result is claimed.

## Gate decision and limitations

**C0 transport gate: passed at unit/fault-injection level.**
**Original regression baseline: passed against local services.**
**C1 authentication integration: pending; real Google provider check blocked
by missing local provider credentials and unverified redirect configuration.**

Do not mark the entire upgrade production-ready. Existing blind spots include
stale auth responses, distinguishing auth rejection from backend outage,
email-keyed prototype state, server-side retry safety, full browser journeys,
and all remaining fixture/localStorage connections. See
[CONNECTION-VERIFICATION.md](../CONNECTION-VERIFICATION.md) for gate-by-gate cases.

Next experiment: use two synthetic local accounts to exercise session restore,
sign-out during a pending account request, account switch, and backend
unavailability; verify that no prior account reappears and no unsaved action
claims success. Then verify the genuine Google provider round trip once its
credentials and redirect allow-list are configured.
