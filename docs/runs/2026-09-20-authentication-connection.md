# Verification report — authentication connection

Date: 2026-09-20. Scope: C1 from Supabase email authentication through the
shared session provider, `/api/auth/me`, and the showcase account boundary.
This report does not claim a real Google OAuth provider pass.

## Gate decision

**C1 local email/session/account path: passed.**

**C1 real Google provider path: blocked by missing provider credentials and an
unverified hosted redirect allow-list.** The code path and exact local redirects
are covered, but a simulated or disabled provider is not an end-to-end pass.

## Executed results

| Check | Outcome |
| --- | --- |
| Client transport, auth-state, and forum contract suites | 63 passed; 0 failed/skipped/todo in the final combined client run |
| Built-server authentication journey | 6 passed; exact synthetic cleanup completed |
| Production web build | Passed compilation, type validation, and static generation |

The built-server journey used a local Supabase service and synthetic accounts.
It verified health, first email signup, lazy forum-account creation, returning
password login with a stable account ID, isolation of a second account, invalid
token rejection, published-key verification, and exact cleanup. It did not save
tokens, passwords, email addresses, account IDs, response payloads, or raw errors.

## Failure found and hardened

The first real journey exposed a configuration-precedence defect: an ambient
hosted `SUPABASE_URL` could override `apps/web/.env.local`. The browser then
received a valid local token while the API tried to verify it against the hosted
project, producing a 401 key mismatch.

The web launcher now explicitly overlays the repository's local environment
file during local development/build/start and falls back to ambient production
configuration when that file is absent. A safe development diagnostic records
only the JWT failure category, never a token or claims. The final journey passed
against the built application after this change.

## Focused behavior covered

- Session rejection is distinct from account-service unavailability.
- Superseded account requests are aborted and late results cannot replace the
  current account after logout or account switching.
- Showcase state uses the stable Supabase user ID and migrates older email-keyed
  browser state without treating local state as forum authorization.
- Confirmation-required email signup is represented without claiming the user
  is signed in.
- OAuth return URLs remain same-origin and the exact local preview/development
  URLs are allow-listed and tested.
- Logout errors surface instead of silently leaving an active session.
- Synthetic users and forum rows are removed by exact IDs after the journey.

## Evidence

Final reviewed local evidence (ignored by Git):

- `.verification/2026-09-20T20-46-35-618Z-client-f4abb285/`
- `.verification/2026-09-20T20-47-48-586Z-auth-http-fca411ad/`

Both runs refer to source fingerprint
`e4989eb33e36bcb6cb89b011056946101ee8801c0b6969383b2d14a5bb4edf0d`.

## Remaining provider checks

Before calling C1 fully production-verified, exercise a genuine Google first
login, returning login, user cancellation, provider denial, expired session,
and hosted redirect behavior in an authorized staging project. Confirm that no
prior account or browser-local state appears after switching identities.

Next gate: connect the forum feed/detail/create/reply/like vertical slice to the
existing API, while preserving every server authorization and pagination test.
