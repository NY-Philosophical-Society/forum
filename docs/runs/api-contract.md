# Run report — API contract for the backend handoff

Date: 2026-07-30 · Branch: `main` (per the standing instructions; the brief's
legacy branch name was ignored) · Model: claude-opus-5

**Scope:** write down what `apps/api` actually does, so the incoming backend
engineer never has to reverse-engineer it. Documentation only — **no code was
changed in this run.**

---

## What was built

Four commits, each pushed to `main` as it landed:

| Commit | What |
| --- | --- |
| `31222aa` | `docs/api/` — endpoint reference in six files: `auth.md`, `content.md`, `chapters.md`, `users.md`, `messaging.md`, `moderation.md` |
| `0fa80c5` | `docs/API.md` — index + the cross-cutting sections |
| `9223d8f` | `README.md` — points the engineer at `docs/API.md`, plus a `docs/` map in the Layout section |
| *(this file)* | run report |

**2,854 lines across seven files.** The brief said to split into `docs/api/`
with `API.md` as the index if the single file would run past ~1,000 lines; it
would have been roughly three times that, so it is split.

### Coverage

Every route registered in `apps/api/src/app.ts` is documented — **83 endpoints**
across 16 routers, plus `GET /health` and the conditional `/uploads/*` static
mount. For each: method, path, auth tier, the zod schema spelled out field by
field with its constraints and its actual error copy, a real request and
response example, every error status and message that is implemented, which
rate limiter applies, and the side effects that don't show up in the response
(`hotScore` recomputation, notification creation and collapse, moderation-log
entries, mention parsing, storage writes, notification purges).

`docs/API.md` carries the cross-cutting material the brief listed:

- **Auth** — JWT shape (`{ userId }` only, HS256, 30 days, no refresh/revocation
  and why the ban-on-every-request design compensates), bcrypt cost 10, the five
  middleware tiers with their exact failure responses, the OAuth
  provider-id-then-email linking behaviour and its security caveat,
  password-reset token semantics, and the `NODE_ENV !== "production"` guard on
  `devResetUrl`/`devToken`.
- **The access-tier model** — the four tiers, the 220-char teaser with the exact
  `previewOnly` response shape, and the statement that only two endpoints
  truncate (`GET /api/threads/:id`, `GET /api/users/:id/profile`) while
  everything else is all-or-nothing.
- **The four providers** — interface contract, what each stub does, which env
  vars gate the real path, and the refusal rule for each one specifically.
- **Data model** — all 20 Prisma models in a line or two each, then the
  non-obvious invariants (thread XOR chapter, `hotScore` as a stored column
  ordered by the DB and not a function of "now", `pinnedAt` kept out of
  `hotScore` deliberately, soft-delete tombstones and the keep-if-a-descendant-
  survives rule, anonymize-don't-cascade account deletion, absent preference row
  = enabled, `state` not row existence, and the four-condition directory gate).
- **Known skeleton shortcuts** — a table of 13, pointing at
  `docs/BACKEND-OPTIONS.md` for hosting and `docs/API-CHANGES.md` for anything
  added after this document.
- **Test suite** — how to run it, a per-file table of what it covers, and the
  statement that it is the compatibility bar.

Everything was read, not inferred: all 16 route files, both middleware files,
all 14 `lib/` modules, `schema.prisma`, `packages/shared/src/schemas.ts` and
`types.ts`, `app.ts`, `auth.ts`, the vitest config, and the test setup.

---

## What was deliberately narrowed

- **No code changes.** The brief is a documentation deliverable, and the run
  turned up several genuine gaps (listed below). Fixing them would have changed
  behaviour the document is supposed to describe, and some of them are product
  calls. They are written up as findings instead.
- **`docs/API-CHANGES.md` was not appended to.** It logs API *changes*; nothing
  changed. `docs/API.md` links to it as the place to look for anything added
  after this snapshot, and vice versa.
- **Response examples are hand-built, not captured from a live server.** No dev
  server was started (standing instruction). Shapes were transcribed field by
  field from the serializers, and the ids/timestamps in examples are
  illustrative. Field names, types, nullability, and presence/absence
  conditions are exact.
- **The web and mobile clients are documented only where they constrain the
  API** (the 15-second unread poll, mobile having no anonymous mode, clients
  reusing feed components across `/api/threads` and `/api/chapters/:slug/threads`).
  Client architecture is out of scope.
- **`ReportTargetPreview` and the other shared response types** are described
  where they appear rather than duplicated into a type appendix —
  `packages/shared/src/types.ts` is the source of truth and is cited as such.

---

## Assumptions made at ambiguities

1. **Split point.** "Roughly a thousand lines" was going to be exceeded either
   way, so the split was made by area rather than by router (16 routers would
   have meant 16 thin files). Six files, grouped by what an engineer would be
   working on at once.
2. **Grouping of the admin-on-member mutations.** `POST /api/users/:id/ban`
   and friends live in `routes/users.ts`, so they are documented in
   `api/users.md` (path-based grouping, so a path always resolves to one file)
   with `api/moderation.md` cross-referencing them.
3. **Report filename.** The brief says `docs/runs/<branch-name>.md`, but the
   branch is `main` and `docs/runs/main.md` would collide with every future
   run. Followed the existing convention in that directory (`brief-04-membership.md`,
   `tests-foundation.md`) and named it `api-contract.md`.
4. **Findings are flagged in place, not hidden in this report.** Where reading
   the code turned up something the engineer should not faithfully reproduce
   (the unauthenticated `mock-complete` route, the unlimited redeem-code route),
   it is called out in the reference itself with a blockquote, because that is
   where someone rebuilding will actually be looking.
5. **"Which routes return truncated content to which tiers"** was answered
   exhaustively rather than by example — including the negative cases (the feed
   returns no bodies at all, so there is nothing to truncate; search is
   `requireAuth` for the same reason; chapter content 404s rather than
   truncating).

---

## Findings a human should check

These are things the code does that a rebuild probably should **not** copy.
None of them were changed.

1. **`POST /api/verification/mock-complete/:sessionId` is unauthenticated.**
   Anyone holding a session id can flip that user to `VERIFIED`. It is guarded
   only by `verificationProvider.name === "stub"` — correct today, and the
   guard is the right shape, but the real `POST /api/verification/webhook` does
   not exist yet. Nothing should be deployed publicly until it does.
2. **`POST /api/auth/redeem-code` has no rate limiter.** Codes can be guessed at
   request speed. Harmless while `WISDOMKEY` is a public placeholder; not
   harmless once redemption means money.
3. **The three OAuth routes have no rate limiter either.**
4. **`app.set("trust proxy", …)` is never called.** Behind any load balancer or
   CDN, every user shares one rate-limit bucket, because `req.ip` is the
   proxy's address. This is the kind of thing that looks like it works until it
   silently doesn't.
5. **`POST /api/auth/login` returns 403 for a banned account before checking the
   password.** It is an oracle for "this email exists and is banned". Probably
   an acceptable trade for the clearer error message — worth a decision rather
   than an accident.
6. **OAuth email matching takes over an existing account.** Safe because Google
   and Apple verify addresses; it would not be safe for a provider that
   doesn't. Documented as a constraint on adding providers.
7. **A password change or reset does not invalidate outstanding JWTs.** There is
   no `tokenVersion`. A stolen 30-day token survives the user's response to the
   theft.
8. **`POST /api/reports/:id/resolve` is not transactional.** The moderation
   action, the report close, and the two log rows are separate writes; a failure
   midway leaves the action applied with the report still open.
9. **Express 4 with no global error handler.** An async throw inside a route
   handler is an unhandled rejection and the request hangs. There is no 404
   handler either.
10. **A negative `?limit=` is not guarded** (offsets are). It reaches Prisma's
    `take`, which reads backwards.
11. **`GET /api/messages/conversations` loads every message the caller has ever
    sent or received** and folds them in JS. It is the worst-scaling query in
    the API; `GET /api/threads/:id` (all posts + all likes) and `GET /api/reports`
    (N+1 target loads) are next.
12. **`GET /api/admin/users` is the only endpoint that exposes other members'
    email addresses**, and its `threadCount`/`replyCount` include chapter
    content (unlike the public profile, which deliberately doesn't).
13. **`GET /api/users/me/export` omits** notifications, bookmarks, likes,
    reports, and chapter memberships, and includes soft-deleted content. Check
    it against whatever the compliance review concludes.
14. **Banned users are not excluded from `GET /api/search` user results or
    `GET /api/users?search=`.** May be intentional; it isn't stated anywhere.

Two smaller ones, noted in place: `POST /api/verification/start` creates a new
session on every call without invalidating the previous one, and issuing a new
password-reset token does not invalidate outstanding ones (used and expired
rows are never pruned, either).

---

## Verification

All commands run from the repo root, actual output:

```
$ cd apps/api && npx tsc --noEmit
apps/api tsc: clean

$ cd packages/shared && npx tsc --noEmit
packages/shared tsc: clean

$ cd apps/mobile && npx tsc --noEmit
apps/mobile tsc: clean

$ cd apps/web && npx tsc --noEmit
apps/web tsc: clean
```

`npx next build` — succeeded, 30 routes, no prerender errors:

```
Route (app)                              Size     First Load JS
┌ ○ /                                    4.2 kB          117 kB
├ ○ /_not-found                          873 B          88.1 kB
├ ○ /admin                               432 B          87.7 kB
├ ○ /admin/chapters                      3.93 kB        99.9 kB
├ ○ /admin/content                       3.55 kB         116 kB
├ ○ /admin/log                           3.09 kB         116 kB
├ ○ /admin/reports                       4.21 kB         117 kB
├ ○ /admin/users                         3.96 kB         116 kB
├ ƒ /c/[slug]                            4.7 kB          117 kB
├ ○ /chapters                            3.92 kB        99.9 kB
├ ○ /directory                           4.32 kB         100 kB
├ ○ /forgot-password                     1.29 kB        97.3 kB
├ ○ /formatting                          3.89 kB         159 kB
├ ○ /login                               2.81 kB        98.8 kB
├ ○ /membership                          2.11 kB        98.1 kB
├ ○ /messages                            3.07 kB          99 kB
├ ƒ /messages/[userId]                   3.03 kB         115 kB
├ ○ /new-thread                          4.12 kB         160 kB
├ ○ /notifications                       2.95 kB         115 kB
├ ƒ /oauth/mock/[provider]               1.88 kB        89.1 kB
├ ○ /reset-password                      1.41 kB        97.4 kB
├ ○ /saved                               2.61 kB         115 kB
├ ○ /search                              3.49 kB         116 kB
├ ○ /settings                            4.19 kB         117 kB
├ ○ /settings/profile                    3.04 kB         115 kB
├ ○ /signup                              2.95 kB        98.9 kB
├ ƒ /t/[id]                              8.83 kB         164 kB
├ ƒ /u/[userId]                          5.94 kB         162 kB
├ ○ /verify                              3.03 kB        90.3 kB
└ ƒ /verify/mock/[sessionId]             1.75 kB          89 kB
+ First Load JS shared by all            87.2 kB
```

API test suite, run to confirm the numbers quoted in `docs/API.md`:

```
$ cd apps/api && npx vitest run

 Test Files  21 passed (21)
      Tests  179 passed (179)
   Duration  24.31s
```

No dev server was started at any point.
