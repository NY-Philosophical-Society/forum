# The Forum — state of play

**The single source of truth for where this project is and what's undecided.**
Architecture snapshot updated 2026-08-05; showcase-branch decisions updated
2026-09-22. Current verification status is in
[the release-readiness report](runs/2026-09-22-release-readiness.md).

Everything else in `docs/` is either a reference (`API.md`, `DESIGN_SYSTEM.md`,
`TESTING.md`) or a record of a completed run (`runs/`). If a decision matters,
it is written down here.

---

## 1. What this is

A member forum for the **New York Philosophy Club** (501(c)(3)) — web now,
iOS and Android planned. Real-name discussion: anyone may read, and posting
currently runs on the honor system rather than a completed ID check (see
"Access tiers" below). Members (donors) get chapters, a directory, and event
spaces.

Separate from the marketing site (`nyphilosophy.org`); this is its own repo,
`NY-Philosophical-Society/forum`.

**Stack:** npm-workspaces monorepo — one Next.js 14 App Router application with
same-origin REST handlers and Prisma, Expo React Native mobile, and a shared
types package. Supabase Postgres and Supabase Auth run locally through the
Supabase CLI.

---

## 2. Current state — what actually works

Everything below is built, tested, and running locally. **193 API tests pass.**
(Down from 184: the ~20 tests covering password hashing, our own JWTs, and the
OAuth mock went with the code they tested, and five new ones cover lazy account
creation, forged-token rejection, re-authentication before deletion, and
case-insensitive search on Postgres.)

### Reading and writing
Single feed with hot/new ranking (a stored `hotScore` column, ordered by the
database). Twelve tags, filterable, collapsed behind "show more". Nested
replies. Likes only — no downvotes. Markdown throughout, with a composer
toolbar on web, a syntax hint on mobile, and a formatting guide on both. Edit
and delete your own posts, with tombstones so replies never orphan. @mentions.
Image uploads with server-side validation and EXIF stripping.

### Accounts
Email signup, Google and Apple sign-in, and password reset — all Supabase Auth
since 2026-07-31; the API stores no password and signs no token. ID
verification stays ours behind a provider interface: local development uses a
stub, while the Stripe Identity adapter and signed, idempotent webhook path are
built but remain inactive until the club supplies an onboarded Stripe account
and server-side keys. Profile pages with photos, bios, avatars. Account
management: password, email, data export, and deletion that anonymises rather
than orphans.

### Membership
Chapters — member-only sub-forums with join requests and admin approval,
server-enforced so a non-member gets nothing even by direct URL. Opt-in member
directory with interests and reading-partner matching. Event threads that
collect questions beforehand and receive topics afterwards, with "was there"
markers for attendees.

### Discovery and moderation
Search (401 for anonymous, deliberately — snippets would leak past the preview
wall). Bookmarks. In-app notifications with collapse rules and per-type
preferences. Push notifications behind a provider stub. Admin dashboard:
report queue with structured reasons, member administration, content
management, moderation log, thread pinning and locking.

### Access tiers, as implemented
| Tier | Can |
| --- | --- |
| Anonymous | Feed and a 220-character teaser |
| Free account | Read everything, **post, reply, like, DM, start threads** — see below |
| Member (donor) | Chapters, directory, matching, event posting |

Admins bypass member gating. `WISDOMKEY` is the member unlock until a donation
API exists.

**Posting runs on the honor system, not ID verification, as of 2026-07-30.**
Any signed-up account posts under the name it gave at signup — no completed ID
check is required. This was a deliberate change from the original
"ID-verified only" design, made because ID verification is real friction and
the club would rather grow the community first. The old requirement is not
gone, just switched off: `REQUIRE_ID_VERIFICATION=true` on the API restores it
exactly (every write route already gates through the same `requireVerified`
middleware, so nothing else changes). Signup now also collects first and last
name as two fields instead of one, and the real-name rationale is stated
directly on the signup screen. `docs/API.md` documents the toggle.

### Surface area
27 web routes · 25 mobile screens · 16 API routers · 20 Prisma models.

---

## 3. Decisions already made

| Decision | Detail |
| --- | --- |
| **Backend host** | **Supabase** provides database and auth; Next.js route handlers are the only application API/database client. No PostgREST and no duplicate RLS authorization. |
| **Membership model** | Reading stays free. Membership buys member spaces, never a lock on the main feed. Supporter-gated reading was proposed and **rejected** — it inverts the funnel. |
| **Single feed** | One feed with optional tags. Not boards. Chapters are separate access-controlled spaces, not a boards system by another name. |
| **Likes only** | No downvotes, ever. |
| **Verification** | Not required to read or post — the honor system, since 2026-07-30. A completed ID check (third-party vendor behind a provider interface) is optional and available to any member; it becomes mandatory again with one env var (`REQUIRE_ID_VERIFICATION=true`) whenever the club wants that back. |
| **Design** | Palette and type extracted from the club's real identity. `docs/DESIGN_SYSTEM.md` is binding — no hardcoded hex, no drop shadows, cards default to no fill. |
| **Division of labour** | A human engineer owns the production backend. Claude owns frontend and product, plus skeleton backend to keep features testable locally. |

---

## 4. Open questions — backend

**Full plan in `docs/SUPABASE-MIGRATION.md`; executed 2026-07-31.**

1. **`User` ↔ `auth.users` linkage — decided and built.** No linking column at
   all: `User.id` *is* the Supabase auth uuid, and the row is created lazily on
   the first authenticated request by a resolver shared by `requireAuth` and
   `optionalAuth`. No database trigger.
2. **Migration done.** API, web and mobile all moved in one pass. Local dev now
   requires Docker and `supabase start` — the cost that was being deferred. The
   local stack runs on the 544xx port block so it can coexist with another
   Supabase project on the same machine.
3. **Storage — decided and built.** Production uses a public `forum-images`
   Supabase Storage bucket through the existing `storage-provider` interface.
   The server sanitizes every upload and performs writes and deletes with the
   server-only Supabase secret; clients receive stable public URLs.
4. **Rate limiting is per-instance only.** The Next server uses an in-memory
   store keyed by Vercel's client-IP header; serverless instances do not share
   counters. It needs a shared store before scaling.
5. **Region is fixed at project creation** — `us-east-1` for New York.
6. **Hosted preview sandbox — action item for the club.** The live GitHub
   branches document the local Supabase stack and one hosted Supabase project,
   but that hosted project is labeled **live**, not preview or staging. Do not
   apply migrations, reset data, or seed test accounts there. Ask the club to
   either provision a separate empty Supabase project for the shareable preview,
   or explicitly identify an existing project as non-production and authorize
   its use. We need developer access, permission to apply migrations and seed
   synthetic data, and its project URL, publishable key, server secret, pooled
   runtime database URL, and direct migration URL. Secrets must be delivered
   through the approved secret manager and configured only in Vercel's Preview
   environment—not committed to Git or pasted into chat.
7. **Framework security upgrade — release blocker, not an endpoint blocker.**
   The 2026-09-22 production dependency audit found the current Next.js 14
   line affected by a critical advisory set. npm offers no non-breaking fix;
   its automated remediation moves to Next.js 16. The safe Sharp patch was
   applied, but the framework upgrade needs its own migration and regression
   pass before a public production launch. Expo/mobile transitive advisories
   also need a separate dependency review; do not use `npm audit fix --force`
   across the monorepo because its proposed changes include breaking versions.

**Not open:** whether to use RLS for application authorization. Next's server
route layer is the only database client, so policies would duplicate guards.

---

## 5. Open questions — product and strategy

### Membership perks — decided
Chapters · member directory (opt-in) · reading-partner matching · event
afterlife threads. All built.

### Membership perks — undecided
Ranked by my read of incentive versus effort:

| Perk | Pulls donations | Cost |
| --- | --- | --- |
| **Event recording archive** | High | Low — needs somewhere to host media |
| **Monthly members' symposium** | High | Human time; fixes the geographic unfairness for non-NYC members |
| **Draft workshopping** before journal submission | Very high | Human time — needs someone to guarantee critique lands |
| **Async office hours** — a fellow takes questions for a week | High | Human time, but schedulable and cancellable |
| **Speaker/topic nomination and voting** | Medium | Low |
| **7-day member-first window on new threads** | High | Low build, mild growth cost — parked |
| **Annual print anthology** | Medium | Editorial effort |
| **Digest newsletter** | Medium | Low |
| **Mentorship pairing** | Medium | Reuses matching machinery |

**The open question:** which of these to commit to, given that the ones with the
highest pull all cost human time every cycle. An unmet guarantee is worse than
no guarantee.

### Other strategy questions
1. **Donation-based forum access — proposal raised 2026-09-22.** One completed
   donation could grant supporter-only forum access without a recurring renewal
   requirement. This is not an approved rule for formal Society membership.
   The agreed architecture has three distinct states: free forum account,
   forum supporter access, and staff-confirmed formal Society membership.
   The latter is never inferred from a donation. Staff can grant or block
   supporter access and confirm or revoke formal membership with a required
   audit reason. The local branch now records these decisions separately and
   has an internal, provider-neutral donation event processor with duplicate
   and reversal handling. No public payment endpoint or provider adapter is
   enabled, so automatic access cannot yet be claimed or used live.
   The free account retains full main-forum reading and general posting;
   supporter access adds private spaces, not a paywall on the main feed. The
   current `isSupporter` flag remains the existing access-gate mirror, not
   proof of formal membership. The original shared code is a local-only test
   shortcut on the showcase branch, not donation proof.
   Donation thresholds, whether gifts accumulate toward a tier, higher-tier
   benefits, refund/reversal rules, and the authoritative donation platform
   remain **undecided**. No donation provider is connected. Do not activate a
   new tier or claim payment verification until provider signature checks,
   account matching, and the server-side access path pass end-to-end tests.
   **Interim pilot path:** the admin screen can grant or block supporter access
   and records a required reason in the moderation log.
   A club administrator must first confirm the donation in the club's own
   records; the forum does not verify it. Reuse this path for a small,
   staff-operated pilot. It does not implement automatic donor signup or
   higher tiers. Existing supporter flags are preserved by the new migration
   as *unverified legacy access*; staff must review them before hosted rollout.
   **Questions for the club meeting:** Would a donation grant only forum
   supporter access or formal Society membership too? Which system records
   donations, and can its administrator provide a supported API or webhook
   plus a staging path?
2. **Verification timing.** Verify at signup, or at first post? At first post
   means paying the vendor (~$1–2/check) only for people who actually
   contribute. Not yet implemented either way.
3. **Two trust levels?** Email-verified members can reply, ID-verified get a
   visible mark and can start threads — keeps real-name culture where it matters
   without an ID wall in front of every newcomer. Undecided.
4. **Should thread-starting be member-only?** Currently open to any verified
   account. Defensible either way; left open deliberately.
5. **Journal and events are already bundled** into membership. The forum's job
   is to make those worth more, not to be a fourth item. Reflected in the perks
   above but not fully worked through.

---

## 6. Open questions — frontend and product surface

1. **Nothing mobile has ever been seen running.** Every mobile screen is
   typechecked but never opened in a simulator. Blocked on
   `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`, which
   needs the owner's password.
2. **Admin tooling is web-only** beyond the report queue. You can ban from
   mobile via a report but not unban.
3. **Notifications are polled**, every 15 seconds. With web plus two mobile
   platforms this gets expensive. Supabase Realtime is the natural fix and is
   now available to us — worth revisiting once the backend lands.
4. **Chapter join requests raise no notification** — admins see a pending count
   instead.
5. **Search excludes chapter content entirely**, even for that chapter's own
   members. Deliberate and safe, but arguably wrong.
6. **No visual QA has happened on the admin dashboard.** It was built without a
   dev server running; `docs/runs/brief-06-admin.md` names the two CSS rules
   most likely to be wrong.

---

## 7. Where things live

| Path | What |
| --- | --- |
| `docs/PROJECT.md` | This file — state and open questions |
| `docs/API.md` + `docs/api/` | Endpoint reference for the backend engineer |
| `docs/API-CHANGES.md` | Running log of API changes since that reference |
| `docs/SUPABASE-MIGRATION.md` | The migration delta |
| `docs/DESIGN_SYSTEM.md` | Binding design rules |
| `docs/TESTING.md` | How to run the suite, how the test DB is isolated |
| `docs/runs/` | What each automated run did, and what it skipped |
| `docs/prompts/` | Original sequenced briefs — largely historical now |

**Superseded and safe to ignore:** `docs/prompts/04-access-chapters.md` Part 1
(supporter-gated reading — rejected), `docs/BACKEND-OPTIONS.md` (the host
question is settled; kept for the reasoning), `docs/MEMBERSHIP.md` (folded into
§3 and §5 here).

### Running it locally
```
npm install
cp apps/web/.env.local.example apps/web/.env.local
npm run db:migrate
npm run db:seed
npm run dev:web
```
Demo accounts, all `demo-password-123`:
`admin@demo.nyphilosophy.org` (admin) · `marguerite@` (member, NYC chapter,
directory) · `owen@` (member, pending chapter request) · `hannah@` (verified
non-member) · `wenli@` (member, LA chapter).

---

## 8. The next real decisions

In the order they block things:

1. **Point the hosted project at the new migration.** Local is done and green;
   `izvomynkpvguisjdintq` still holds an unmanaged `prisma db push` schema with
   no `_prisma_migrations` table. It is empty, so the fix is to drop the public
   schema and run `prisma migrate deploy` — an owner decision, not Claude's.
2. **Owner picks which undecided perks to commit to** (§5) — this determines
   the next build queue.
3. **Owner runs `xcode-select`** so mobile can finally be seen.
4. **Donation platform, minimum gift, and tier benefits** — one-time forum
   access is proposed; club policy and exact entitlement rules remain open.
   Identity verification remains a separate optional policy decision.
