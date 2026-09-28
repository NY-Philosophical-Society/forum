# Showcase release-readiness audit — 2026-09-22

Decision: **not ready to replace the public Vercel alias**. This is a local
branch audit, not a hosted end-to-end test or a claim about club records.

## Scope and safety

- Checkout: isolated `codex/production-foundation` worktree. The club's main
  branch, hosted Supabase data, and public alias were not changed. No push or
  deployment was performed.
- Existing Vercel project: `omiiaiagency/nypc-showcase`; root directory `.`;
  framework Next.js. Its configured variable *names* include Supabase Auth
  URL/publishable/secret keys and Storage provider/bucket across Preview and
  Production. They do **not** include `DATABASE_URL` or
  `DIRECT_DATABASE_URL`. Values were not read or saved.
- The current public `/showcase` still serves the older deployment. The local
  optimized build is a different artifact and is not available at that link.
- The unrestricted original `WISDOMKEY` now returns 503 in production and
  never changes supporter status. Settings/membership pages no longer invite
  production users to redeem it. Local development/test behavior remains.
- The stub identity-verification start returns 503 in production; mock
  completion returns 403 even for an existing local session, and the mock UI
  offers no production approval controls. A Stripe Identity adapter now creates
  hosted sessions and accepts only signature-verified webhooks through the same
  idempotent event processor used by the local simulation. It is not active or
  a claim of real verification until the club completes Stripe onboarding and
  configures server-side test credentials. The honor-system posting policy
  remains the original product default.
- Google and Apple controls now require explicit public enablement flags;
  neither hosted provider nor redirect journey was verified. Email login is
  still presented. The showcase sign-in note accurately distinguishes saved
  connected activity from labeled preview screens.

## Local evidence

The new production membership guard is asserted against the API with a real
local Supabase Auth account and an isolated throwaway Postgres database. The
mock verification guard is asserted both before session creation and with an
already-created local session. The local stack was accessed only over loopback.

- Client: 72/72,
  `.verification/2026-09-22T15-40-28-035Z-client-4543b0db/`.
- Shared: 16/16,
  `.verification/2026-09-22T15-40-28-035Z-shared-ab9ec0cf/`.
- API: 180/180,
  `.verification/2026-09-22T15-38-55-561Z-api-29d00d45/`.
- All three passing runs share executable-source SHA-256
  `c55a665e4a7be885212610083d9edc4384449bdfe651ba9d536ed918761d8d8b`.
- An initial API verification attempt was blocked by sandbox access to the
  local stack; no tests executed in that attempt. It was followed by the
  successful isolated run above.
- The optimized Next build and typecheck passed after all of the above edits;
  `git diff --check` passed.
- A local production browser view confirmed email-only login when Google is
  not enabled, with no demo-member entry and corrected save/preview copy.
  Desktop and 390px responsive sign-in layout were inspected. Authenticated
  two-account browser journeys have not passed this audit.

Subsequent branch work preserves anonymous browsing through the original
public forum, adds a visible public-browse path from the showcase login, and
closes direct-link chapter access when supporter status is revoked. These
changes require a fresh shared-source test run before the report is used as
release evidence; the counts above describe the earlier source snapshot.

The local branch now also separates forum supporter access from formal Society
membership. Staff decisions are audited, and an internal donation event path
handles duplicates and reversals. A fresh, same-source verification passed:
API 186/186, client 72/72, shared 16/16; source fingerprint
`734f50d8949562b163b7e898b9db77400f66ad41bc5ede8665f282127519f7e7`.
Sanitized per-test evidence is in
`.verification/2026-09-22T16-54-02-130Z-api-e9b47b1d/`,
`.verification/2026-09-22T16-53-52-540Z-client-e7d3b7a1/`, and
`.verification/2026-09-22T16-53-52-550Z-shared-4dfd63b0/`.
The optimized web build, web/mobile/shared typechecks, migration validation,
and desktop/mobile layout inspection also passed. No payment provider is
connected, no live donation is verified, and this is **not** hosted release
evidence. Existing supporter flags are preserved as unverified legacy grants
pending club review.
The ordinary local development database still shows the new migration as
pending; it was deliberately not altered. API verification used fresh,
throwaway local databases, while browser inspection was anonymous and visual
only. Authenticated preview journeys need an approved migrated sandbox.

The identity endpoint hardening pass subsequently completed with API 193/193,
client 72/72, and shared 16/16 passing. The optimized production build and
`git diff --check` also passed. Focused coverage verifies valid Stripe event
normalization, missing and forged signature rejection, fail-closed unconfigured
behavior, duplicate delivery idempotency, and protection against an older
session overwriting a newer verification attempt. No Stripe API call or live
identity check was made.

A production dependency audit then found a critical advisory set against the
current Next.js 14 line. npm's available automated remedy is a breaking upgrade
to Next.js 16, so it was not force-applied inside this endpoint change. The
available non-breaking Sharp security patch was applied and the build remained
green. Remaining mobile/toolchain advisories require a separate dependency
upgrade pass. Treat the Next.js migration as a public-launch blocker; do not
paper over it with `npm audit fix --force`.

## Required before a shareable connected release

1. Obtain an approved hosted *pooled* and *direct* Postgres connection to the
   same Supabase project. Configure them as Vercel environment variables,
   server-only, without putting values in Git or this report. An older project
   note reports an unmanaged hosted `db push` schema; verify its current
   migration state with the owner. Do not reset or migrate that database as a
   side effect of deployment. Then run a read-only authenticated API journey
   in a staging/preview
   deployment against an approved sandbox; never run the local destructive API
   suite against the hosted project.
2. One-time donation access to supporter-only forum spaces is a proposal, not
   an approved formal Society membership rule. Confirm that distinction with
   the club, then choose the authoritative donation source, minimum gift, cumulative-gift
   rule, higher-tier perks, and refund/reversal policy. The internal
   provider-neutral access processor is local only: a provider-specific,
   signature-verifying adapter, trusted account matching, and sandbox
   end-to-end tests are still required before automatic grants. Keep the
   placeholder guard disabled in production. Existing supporter rows must be
   audited deliberately, not silently treated as verified donations. For a
   limited staff-operated pilot, the audited admin grant/block control can be
   used after the club independently confirms eligibility; it is not payment
   verification or a substitute for hosted deployment checks.
3. Decide whether ID verification is in launch scope. The Stripe adapter and
   signed, replay-safe webhook are implemented; if it is in scope, complete
   Stripe Identity onboarding, configure test credentials only in the hosted
   preview environment, register the two documented webhook events, and pass
   the hosted test journey. Otherwise leave the provider unconfigured and the
   production mock routes disabled, and describe the honor-system policy
   accurately.
4. Configure and test hosted Google OAuth/redirect allow-lists before enabling
   the control. Verify SMTP, Storage bucket, a shared production rate-limit
   store (the current in-process limiter is per instance), migrations, and
   production logging without exposing member data.
5. Complete two-account/mobile review of the connected paths, verify the
   preview URL and rollback, then explicitly promote to the stable alias.

The reviewable output today is the isolated local branch and its test evidence,
not a new public deployment.
