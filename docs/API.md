# NYPS Forum API — reference

**The running Express + Prisma + SQLite implementation in `apps/api` is the
specification.** This document is that implementation written down, walked out
of the code route by route, so it doesn't have to be reverse-engineered. Where
this file and the code disagree, the code is right and this file is a bug.

Two clients depend on every shape here: `apps/web` (Next.js) and `apps/mobile`
(Expo). Request validation lives in `packages/shared/src/schemas.ts` (zod) and
response types in `packages/shared/src/types.ts` — both are imported by the API
*and* both clients, so changing one changes all three.

- **Endpoint detail:** the six files under [`api/`](api/), indexed below.
- **Anything added after this document:** `docs/API-CHANGES.md` (dated log).
- **Hosting decision:** `docs/BACKEND-OPTIONS.md`.
- **Running the tests:** `docs/TESTING.md`.
- **Membership product decisions:** `docs/MEMBERSHIP.md`.

---

## Contents

| | |
| --- | --- |
| [Conventions](#conventions) | base URL, content types, error shape, pagination |
| [Endpoint index](#endpoint-index) | every route, its auth tier, its limiter |
| [Auth](#auth) | JWT, hashing, middleware, OAuth linking, password reset |
| [The access-tier model](#the-access-tier-model) | anonymous teaser, `previewOnly`, who sees what |
| [Rate limits](#rate-limits) | three limiters, which routes have none |
| [Providers](#providers) | storage · verification · push · oauth |
| [Data model](#data-model) | 20 Prisma models and their non-obvious invariants |
| [Known skeleton shortcuts](#known-skeleton-shortcuts) | what must be replaced |
| [Test suite](#test-suite) | how to run it; it is the compatibility bar |

### Endpoint reference

| Area | File |
| --- | --- |
| Sign-up, sign-in, OAuth, password reset, ID verification | [`api/auth.md`](api/auth.md) |
| Tags, threads, replies, likes, events, image uploads | [`api/content.md`](api/content.md) |
| Chapters (member-only sub-forums), member directory | [`api/chapters.md`](api/chapters.md) |
| Profiles, account settings, avatars, export, blocking, member admin | [`api/users.md`](api/users.md) |
| DMs, notifications, push tokens, search, bookmarks | [`api/messaging.md`](api/messaging.md) |
| Reports, admin dashboard reads, moderation log | [`api/moderation.md`](api/moderation.md) |

---

## Conventions

**Base URL.** `http://localhost:4000` in dev (`PORT`, default 4000). Everything
is under `/api`, except `GET /health` → `{ "ok": true }` and the static
`/uploads/*` mount.

**`/uploads/*`** is served by the API itself (`express.static`, `maxAge: 365d`,
`immutable`, `fallthrough: false`) **only when `storageProvider.name === "local"`**.
With a real bucket the provider returns its own URLs and this mount doesn't
exist. `app.ts` is where that branch lives.

**Content type.** `application/json` in and out, via a global
`express.json()` (default 100 kB body limit). Two routes are the exception and
take **raw image bytes** with `express.raw`: `POST /api/users/me/avatar` and
`POST /api/uploads/image`.

**Auth header.** `Authorization: Bearer <jwt>`. Nothing uses cookies. The
clients keep the token in `localStorage` (web) / `AsyncStorage` (mobile).

**CORS.** `app.use(cors())` — wide open (`Access-Control-Allow-Origin: *`,
credentials off). Fine while the token travels in a header and there are no
cookies; lock it to the real web origins before launch anyway.

**Error shape.** Always `{ "error": "<human-readable sentence>" }` with the
status code. Validation failures return **only the first zod issue**
(`parsed.error.issues[0].message`) — there is no field-keyed error object, and
both clients surface the string verbatim. Messages are user-facing copy; the
tests assert several of them.

**Pagination.** Consistently `?limit=&offset=`, returned back as
`{ total, limit, offset, hasMore }`. `limit` is `Math.min(Number(limit) || <default>, <cap>)`
and `offset` is `Math.max(Number(offset) || 0, 0)`. Caps and defaults differ per
route and are listed with each endpoint. **A negative `limit` is not guarded**
and reaches Prisma's `take` (which reads backwards) — worth fixing.

**Dates** are ISO 8601 strings (`Date.toISOString()`) everywhere. Formatting is
a client concern: `formatDate` / `formatDateTime` in `packages/shared`, honouring
the user's MM/DD/YYYY vs DD/MM/YYYY setting, never showing seconds.

**IDs** are Prisma `cuid()`s.

**No global error handler and no 404 handler.** An unhandled rejection inside an
async route handler is not caught by Express 4 — the request hangs. Add both
when you rebuild.

**Route ordering matters** in one place: `GET /api/messages/conversations` is
registered before `GET /api/messages/:userId`.

---

## Endpoint index

Auth tiers, from the middleware in `apps/api/src/middleware/auth.ts`:

| Tier | Meaning |
| --- | --- |
| — | no auth at all |
| `optionalAuth` | viewer attached if a valid, non-banned, non-deleted token is present; never rejects |
| `requireAuth` | valid token, user exists, not deleted, **not banned** |
| `requireVerified` | `requireAuth` + `verificationStatus === "VERIFIED"` |
| `requireMember` | `requireAuth` + (`isSupporter` **or** `role === "admin"`) |
| `requireAdmin` | `requireAuth` + `role === "admin"` |

Banned users are filtered in exactly two places: `requireAuth` returns **403**
on `bannedAt` (so a ban bites an existing session on the next request), and
`optionalAuth` treats a banned token as logged out. `POST /api/auth/login` and
the three OAuth routes check `bannedAt` themselves. Banned users are **not**
excluded from `GET /api/search` user results or `GET /api/users?search=`.

### `/api/auth` · [detail](api/auth.md)

| Method | Path | Tier | Limiter |
| --- | --- | --- | --- |
| POST | `/api/auth/signup` | — | `authLimiter` |
| POST | `/api/auth/login` | — | `authLimiter` |
| GET | `/api/auth/me` | `requireAuth` | — |
| GET | `/api/auth/account` | `requireAuth` | — |
| POST | `/api/auth/change-password` | `requireAuth` | `authLimiter` |
| POST | `/api/auth/change-email` | `requireAuth` | `authLimiter` |
| POST | `/api/auth/redeem-code` | `requireAuth` | **none** |
| GET | `/api/auth/oauth/config` | — | — |
| POST | `/api/auth/oauth/google` | — | **none** |
| POST | `/api/auth/oauth/apple` | — | **none** |
| POST | `/api/auth/oauth/dev-mock` | — | **none** · dev only |
| POST | `/api/auth/password-reset/request` | — | `authLimiter` |
| POST | `/api/auth/password-reset/confirm` | — | `authLimiter` |

### `/api/verification` · [detail](api/auth.md#post-apiverificationstart)

| Method | Path | Tier | Limiter |
| --- | --- | --- | --- |
| POST | `/api/verification/start` | `requireAuth` | — |
| GET | `/api/verification/status` | `requireAuth` | — |
| POST | `/api/verification/mock-complete/:sessionId` | **—** | — · dev only |

### `/api/tags`, `/api/threads`, `/api/posts`, `/api/uploads` · [detail](api/content.md)

| Method | Path | Tier | Limiter |
| --- | --- | --- | --- |
| GET | `/api/tags` | — | — |
| GET | `/api/threads` | `optionalAuth` | — |
| GET | `/api/threads/:id` | `optionalAuth` | — |
| POST | `/api/threads` | `requireVerified` | `writeLimiter` |
| PATCH | `/api/threads/:id` | `requireAuth` (verified author, or admin) | `writeLimiter` |
| DELETE | `/api/threads/:id` | `requireAuth` (author or admin) | `writeLimiter` |
| POST | `/api/threads/:id/like` | `requireVerified` | `writeLimiter` |
| POST | `/api/threads/:id/lock` | `requireAdmin` | `adminLimiter` |
| POST | `/api/threads/:id/pin` | `requireAdmin` | `adminLimiter` |
| DELETE | `/api/threads/:id/pin` | `requireAdmin` | `adminLimiter` |
| POST | `/api/threads/:id/attend` | `requireAuth` | `writeLimiter` |
| GET | `/api/threads/:id/attendees` | `requireAdmin` | — |
| POST | `/api/threads/:id/attendees` | `requireAdmin` | `adminLimiter` |
| DELETE | `/api/threads/:id/attendees/:userId` | `requireAdmin` | `adminLimiter` |
| POST | `/api/posts` | `requireVerified` | `writeLimiter` |
| PATCH | `/api/posts/:id` | `requireAuth` (verified author, or admin) | `writeLimiter` |
| DELETE | `/api/posts/:id` | `requireAuth` (author or admin) | `writeLimiter` |
| POST | `/api/posts/:id/like` | `requireVerified` | `writeLimiter` |
| POST | `/api/uploads/image` | `requireVerified` | `writeLimiter` |

### `/api/chapters`, `/api/directory` · [detail](api/chapters.md)

| Method | Path | Tier | Limiter |
| --- | --- | --- | --- |
| GET | `/api/chapters` | `requireMember` | — |
| POST | `/api/chapters` | `requireAdmin` | `adminLimiter` |
| GET | `/api/chapters/:slug` | `requireMember` | — |
| GET | `/api/chapters/:slug/threads` | `requireMember` + **active** membership | — |
| POST | `/api/chapters/:slug/join` | `requireMember` | `writeLimiter` |
| GET | `/api/chapters/:slug/members` | `requireMember` + **active** membership | — |
| POST | `/api/chapters/:slug/members` | `requireAdmin` | `adminLimiter` |
| POST | `/api/chapters/:slug/members/:userId/approve` | `requireAdmin` | `adminLimiter` |
| DELETE | `/api/chapters/:slug/members/:userId` | `requireAuth` (admin, or self) | `writeLimiter` |
| GET | `/api/directory` | `requireMember` | — |

### `/api/users` · [detail](api/users.md)

| Method | Path | Tier | Limiter |
| --- | --- | --- | --- |
| GET | `/api/users/:id/profile` | `optionalAuth` | — |
| GET | `/api/users?search=` | `requireAuth` | — |
| PATCH | `/api/users/me` | `requireAuth` | `writeLimiter` |
| POST | `/api/users/me/avatar` | `requireAuth` | `writeLimiter` |
| DELETE | `/api/users/me/avatar` | `requireAuth` | `writeLimiter` |
| DELETE | `/api/users/me` | `requireAuth` | `authLimiter` |
| GET | `/api/users/me/export` | `requireAuth` | — |
| GET/POST/DELETE | `/api/users/:id/block` | `requireAuth` | **none** |
| POST | `/api/users/:id/ban` | `requireAdmin` | `adminLimiter` |
| POST | `/api/users/:id/unban` | `requireAdmin` | `adminLimiter` |
| POST | `/api/users/:id/warn` | `requireAdmin` | `adminLimiter` |
| POST | `/api/users/:id/role` | `requireAdmin` | `adminLimiter` |
| POST | `/api/users/:id/supporter` | `requireAdmin` | `adminLimiter` |

### `/api/messages`, `/api/notifications`, `/api/push-tokens`, `/api/search`, `/api/bookmarks` · [detail](api/messaging.md)

| Method | Path | Tier | Limiter |
| --- | --- | --- | --- |
| GET | `/api/messages/conversations` | `requireAuth` | — |
| GET | `/api/messages/:userId` | `requireAuth` | — |
| POST | `/api/messages` | `requireVerified` | `writeLimiter` |
| GET | `/api/notifications` | `requireAuth` | — |
| GET | `/api/notifications/unread-count` | `requireAuth` | — |
| POST | `/api/notifications/read` | `requireAuth` | — |
| POST | `/api/notifications/read-all` | `requireAuth` | — |
| GET | `/api/notifications/preferences` | `requireAuth` | — |
| PUT | `/api/notifications/preferences` | `requireAuth` | — |
| POST | `/api/push-tokens` | `requireAuth` | — |
| DELETE | `/api/push-tokens` | `requireAuth` | — |
| GET | `/api/search` | `requireAuth` | — |
| GET | `/api/bookmarks` | `requireAuth` | — |
| POST | `/api/bookmarks` | `requireAuth` | — |
| DELETE | `/api/bookmarks/:threadId` | `requireAuth` | — |

### `/api/reports`, `/api/admin` · [detail](api/moderation.md)

| Method | Path | Tier | Limiter |
| --- | --- | --- | --- |
| POST | `/api/reports` | `requireVerified` | `writeLimiter` |
| GET | `/api/reports` | `requireAdmin` | — |
| POST | `/api/reports/:id/resolve` | `requireAdmin` | `adminLimiter` |
| POST | `/api/reports/:id/dismiss` | `requireAdmin` | `adminLimiter` |
| GET | `/api/admin/users` | `requireAdmin` | — |
| GET | `/api/admin/threads` | `requireAdmin` | — |
| GET | `/api/admin/log` | `requireAdmin` | — |

---

## Auth

### JWT

`apps/api/src/auth.ts` — 19 lines, the whole session mechanism:

```ts
signToken({ userId })  // jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" })
verifyToken(token)     // jwt.verify(...) -> { userId } | null (never throws)
```

- **Payload is `{ userId }` and nothing else.** Role, verification status,
  supporter status, and ban state are **never** in the token — every request
  re-reads the user row. That is what makes a ban, a promotion, or a
  verification bite an existing session immediately, with no revocation list.
- Algorithm is `jsonwebtoken`'s default **HS256**. Secret is `JWT_SECRET`,
  falling back to the literal `"dev-only-secret-change-me"` — **set it in
  production or every token is forgeable.**
- **Lifetime 30 days.** No refresh tokens, no rotation, no revocation, no
  logout endpoint (clients just drop the token). A password change or reset
  does **not** invalidate outstanding tokens. If you want real session
  invalidation, add a `tokenVersion` column and put it in the payload.
- Every authenticated route pays one `prisma.user.findUnique` in middleware.

### Password hashing

`bcryptjs`, cost factor **10**, on signup, change-password, and reset-confirm.
Compared with `bcrypt.compare` on login, change-password, change-email, and
account deletion. `passwordHash` is `null` for accounts created via Google or
Apple — every code path that touches it branches on that (an OAuth account
*setting* a first password supplies no current password).

### Middleware

`apps/api/src/middleware/auth.ts`. `requireAuth` attaches a `req.user` carrying
`{ id, email, displayName, avatarUrl, bio, verificationStatus, role,
isSupporter, directoryVisible, directoryBio, openToPartners, passwordHash,
createdAt }` — note `passwordHash` and `email` are on the request object, so be
careful never to spread `req.user` into a response. `toPublicUser()` in
`lib/serialize.ts` is the only sanctioned serializer.

Failure modes:

| Middleware | Condition | Response |
| --- | --- | --- |
| `requireAuth` | no/malformed `Authorization` | `401 Missing Authorization header` |
| `requireAuth` | bad or expired token | `401 Invalid or expired token` |
| `requireAuth` | user row gone or `deletedAt` set | `401 User no longer exists` |
| `requireAuth` | `bannedAt` set | `403 This account has been suspended.` |
| `requireVerified` | status ≠ `VERIFIED` | `403 Identity verification required before you can post. Complete verification from your account settings.` |
| `requireMember` | not `isSupporter` and not admin | `403 This area is for members of the Society. Redeem a membership code in Settings to join.` |
| `requireAdmin` | `role !== "admin"` | `403 Admin access required` |

`requireMember` gates **member features only** — it must never be added to
reading, notifications, or bookmarks. Supporter-gated *reading* was proposed
and rejected (`docs/MEMBERSHIP.md`); don't reintroduce it.

### OAuth provider linking

`lib/oauth.ts` verifies the provider-signed identity token server-side (we
never see a Google/Apple password); `lib/oauth-user.ts` resolves it to a user:
match `googleId`/`appleId` → else match `email` and **attach the provider id to
that existing account** (`linked: true`) → else create. Full detail and the
security caveat on the email-match step:
[`api/auth.md`](api/auth.md#provider-linking).

Both providers are inert without credentials (`isGoogleConfigured()` /
`isAppleConfigured()` read the env vars), and `POST /api/auth/oauth/dev-mock`
covers local development — refusing to run once real credentials exist.

### Password reset

`randomBytes(32)` hex token, 1-hour expiry, single-use (`usedAt`), issued only
for accounts that have a password. The request endpoint always returns the same
generic message so it can't enumerate emails.

**The production guard on `devResetUrl` / `devToken`:** because no mailer is
configured, the request response includes the reset URL and raw token — but
**only when `process.env.NODE_ENV !== "production"`**. That single condition is
all that stands between dev convenience and an account-takeover endpoint. The
link is `console.log`ged unconditionally. `auth.password-reset.test.ts` asserts
both fields are absent under `NODE_ENV=production`; keep that test, and delete
both fields once a real mailer exists.

---

## The access-tier model

Reading and having an account are separate gates from identity verification.
Four tiers, enforced server-side:

| Tier | Reads | Writes |
| --- | --- | --- |
| **Anonymous** (web only) | feed summaries; **220-char thread teaser**, no replies; profile header only; no search | nothing (401) |
| **Any account** (even `UNVERIFIED`) | everything in the main feed, in full; search; bookmarks; notifications | nothing (403 from `requireVerified`) |
| **Verified** | same | post, reply, like, DM, report, upload images |
| **Member** (`isSupporter`, or admin) | + chapters they're an active member of, + the member directory | + posting in main-feed event threads |

Admins bypass `requireMember` and chapter membership entirely — moderating must
never require donating.

Mobile has **no anonymous mode at all**: `App.tsx` renders an `AuthStack` or the
full `AppStack` depending on session state, so the feed is simply unreachable
without an account. That is a client decision; the API tier above it is the
web-only case.

### The anonymous teaser and `previewOnly`

Exactly two endpoints truncate, and both key off "is there a viewer at all",
never off verification or supporter status:

**`GET /api/threads/:id`** — when `req.user` is absent:

```jsonc
{
  "thread": {
    "body": "<first 220 characters of the body>…",  // only if body.length > 220
    "previewOnly": true,
    "posts": [],                                    // regardless of repliesLimit
    "repliesTotal": 5,                              // still the true count
    "myLiked": false,
    "myBookmarked": false
    // …every other field is the same as for a signed-in viewer
  }
}
```

`PREVIEW_LENGTH = 220`, `thread.body.slice(0, 220) + "…"`. A body of 220
characters or fewer is returned whole (and still gets `previewOnly: true` with
no replies). The cut is by character count only — it can land mid-word. The web
app renders a "sign up to keep reading" wall card in place of the reply list.

**`GET /api/users/:id/profile`** — when `req.user` is absent, `previewOnly: true`,
`threads: []`, `replies: []`, `hasMoreThreads`/`hasMoreReplies` forced false.
The header and both **counts** are still returned.

Everything else is all-or-nothing:

- `GET /api/threads` returns no bodies to anyone, so there is nothing to
  truncate — that is *why* anonymous browsing of the feed is free.
- `GET /api/search` is `requireAuth`, deliberately: snippets would leak exactly
  the content the wall withholds.
- Chapter content isn't truncated for outsiders, it 404s.

---

## Rate limits

`apps/api/src/lib/rate-limit.ts`, `express-rate-limit` v8, **in-memory store**,
keyed by IP, `standardHeaders: true` / `legacyHeaders: false`.

| Limiter | Window | Max | Applied to |
| --- | --- | --- | --- |
| `authLimiter` | 15 min | 10 | signup, login, change-password, change-email, both password-reset routes, `DELETE /api/users/me` |
| `writeLimiter` | 15 min | 60 | thread/post create·edit·delete·like, attend, DMs, reports, avatar up/delete, `PATCH /api/users/me`, image upload, chapter join, chapter member removal |
| `adminLimiter` | 15 min | 120 | every admin mutation (ban/unban/warn/role/supporter, lock/pin/unpin, attendee add/remove, chapter create/add/approve, report resolve/dismiss) |

Response on trip: `429 { "error": "…" }` with a per-limiter message
("Too many attempts — try again in a few minutes.", "You're doing that too much
— slow down and try again shortly.", "Too many moderation actions in a row —
pause and try again shortly.").

Not limited at all: every `GET`, plus `POST /api/auth/redeem-code`, all three
OAuth routes, `POST /api/verification/start`, block/unblock, bookmarks,
push-token registration, and notification reads. Read-only admin listing is
deliberately unlimited because the dashboard polls it. **The unlimited OAuth
and redeem-code routes are gaps worth closing.**

Two things to fix when you rebuild:

1. **In-memory means single-instance.** Two app instances halve the effective
   limit per attacker and lose all counters on restart. Move to a shared store
   (Redis) or the platform's edge rate limiting.
2. **`app.set("trust proxy", …)` is never called.** Behind a load balancer or
   CDN, `req.ip` is the proxy's address and every user shares one bucket.

`DISABLE_RATE_LIMIT=1` makes every limiter `skip`, checked **per request** (not
at module load) so a test can unset it and prove the 429 path still fires. The
test suite sets it globally; `src/lib/rate-limit.test.ts` is the one that
doesn't.

---

## Providers

Four third-party integrations follow one pattern, and it is not negotiable
house style — it is what lets the whole product build and test with zero
credentials:

1. An interface, defined once.
2. A local stub that works with no credentials.
3. The real path gated behind env vars.
4. **The stub refuses to run once real credentials are configured**, so it can
   never silently shadow production.

### `storage-provider.ts` — user-uploaded images

```ts
interface StorageProvider {
  readonly name: string;
  put(input: { key: string; body: Buffer; contentType: string }): Promise<{ url: string }>;
  remove(key: string): Promise<void>;          // idempotent; missing is not an error
  keyForUrl(url: string): string | null;       // reverse of put(); null if not ours
}
```

Consumers: avatars (`routes/users.ts`) and post image embeds
(`routes/uploads.ts`). Callers only ever store the returned public URL.

**Stub (`name: "local"`, default):** writes under `LOCAL_UPLOADS_DIR`
(`UPLOADS_DIR` env override, else `apps/api/uploads/`), returns
`${API_PUBLIC_URL ?? "http://localhost:<PORT>"}/uploads/<key>`, and `app.ts`
serves that directory. It normalizes and path-checks every key before writing,
even though keys are server-generated.

**Real path:** `STORAGE_PROVIDER=s3` plus `STORAGE_S3_BUCKET`,
`STORAGE_S3_REGION`, `STORAGE_S3_ENDPOINT` (R2), `STORAGE_S3_ACCESS_KEY_ID`,
`STORAGE_S3_SECRET_ACCESS_KEY`, `STORAGE_S3_PUBLIC_URL`. `S3StorageProvider`
is **not implemented** — the loader throws a message telling you so. The file's
top comment has the exact bucket/IAM steps.

**Refusal:** if `STORAGE_S3_BUCKET` or `STORAGE_S3_ACCESS_KEY_ID` is set while
`STORAGE_PROVIDER` is still `local`, the module **throws at import** rather than
quietly writing to disk.

### `verification-provider.ts` — identity verification

```ts
interface VerificationProvider {
  readonly name: string;
  createSession(input: { userId: string; email: string }): Promise<{
    providerSessionId: string; verificationUrl: string; status: VerificationStatus;
  }>;
}
```

The rest of the app only ever asks "is this user UNVERIFIED / PENDING /
VERIFIED / REJECTED?" and never touches documents. That enum mirrors what a
real vendor reports, so swapping providers changes nothing downstream.

**Stub (`name: "stub"`, default):** mints `stub_<uuid>` and points at
`${WEB_APP_URL}/verify/mock/<id>`, a page in the web app that simulates
approval or rejection. **It performs no identity check whatsoever.**

**Real path:** `VERIFICATION_PROVIDER=stripe` + `STRIPE_SECRET_KEY` +
`STRIPE_WEBHOOK_SECRET`; implement `StripeVerificationProvider` using
`stripe.identity.verificationSessions.create()` and verify
`identity.verification_session.verified` / `.requires_input` webhooks with
`stripe.webhooks.constructEvent`. Persona and Veriff have a near-identical
create-session + webhook shape. Any value other than `stub` currently throws
at import.

**Refusal:** `POST /api/verification/mock-complete/:sessionId` 403s whenever
`verificationProvider.name !== "stub"`. **`POST /api/verification/webhook`
does not exist yet** — it is the route the vendor should call, with signature
verification, and it must land before the mock route is exposed anywhere real.

### `push-provider.ts` — push notifications

```ts
interface PushProvider {
  readonly name: string;
  send(messages: PushMessage[]): Promise<{ staleTokens: string[] }>;
}
```

`staleTokens` are returned so `notify()` can prune dead `PushToken` rows.

**Stub (`name: "stub"`, default):** `console.log`s one line per message. No
device ever buzzes, so nothing push-related has been verified end to end.

**Real path:** `PUSH_PROVIDER=expo` + `EXPO_ACCESS_TOKEN`. `ExpoPushProvider`
**is implemented** (batches of 100 to `https://exp.host/--/api/v2/push/send`,
harvesting `DeviceNotRegistered` receipts). What's missing is credentials: an
Apple Developer APNs key and an FCM key uploaded to the Expo project, plus a
real EAS build.

**Refusal:** `StubPushProvider`'s constructor **throws if `EXPO_ACCESS_TOKEN`
is set** — silently logging instead of sending would mask a misconfiguration.

### `oauth.ts` — Google / Apple sign-in

Not an interface but the same shape. `isGoogleConfigured()` is
`GOOGLE_WEB_CLIENT_ID || GOOGLE_IOS_CLIENT_ID`; `isAppleConfigured()` is
`APPLE_SERVICES_ID || APPLE_BUNDLE_ID`. When configured, `verifyGoogleIdToken`
/ `verifyAppleIdToken` validate the provider-signed token against those
audiences. When not, the real routes 503 and the clients fall back to the
dev-mock screen.

**Refusal:** `POST /api/auth/oauth/dev-mock` 403s per provider once that
provider is configured. Unlike verification and storage, there is no vendor
"test mode" that can substitute — only Google and Apple can mint a real
identity token — which is exactly why the mock skips verification entirely and
why its refusal guard matters most.

---

## Data model

`apps/api/prisma/schema.prisma`, 20 models, SQLite. Migrations are in
`apps/api/prisma/migrations/` (11 of them, ending `20260730145811_event_threads`).

| Model | What it is |
| --- | --- |
| **User** | One account. Real name in `displayName`, `verificationStatus` (UNVERIFIED/PENDING/VERIFIED/REJECTED), `role` (`user`/`admin`), `isSupporter` + `supporterSince`, three opt-in directory fields, `bannedAt`, `deletedAt`. `email` unique; `googleId`/`appleId` unique and null unless that provider was used; `passwordHash` null for OAuth-created accounts. |
| **Chapter** | A member-only sub-forum for one local group. `slug` unique. Admin-created; no update or delete route. |
| **ChapterMembership** | `(chapterId, userId)` unique. `state` is `pending` or `active`; `approvedAt` set on approval. Indexed `(userId, state)`. |
| **VerificationSession** | One identity-verification attempt: `provider`, `providerSessionId`, `status`. Never pruned; a user can accumulate many. |
| **Tag** | An optional label (Ethics, Metaphysics, …). `slug` unique. 12 seeded; not boards. |
| **Thread** | A top-level post: `title`, `body` (markdown), stored `hotScore`, `locked`, `pinnedAt`, `editedAt`, `deletedAt`, `chapterId?`, `kind` (`discussion`/`event`), `eventDate?`, `eventCode?`. |
| **EventAttendee** | `(threadId, userId)` unique. Who was in the room for an event thread; `source` is `admin` or `code`. |
| **ThreadLike** / **PostLike** | `(threadId\|postId, userId)` unique. Likes only — there are no downvotes anywhere in this product. |
| **Post** | A reply. `parentId` gives the tree; `body` markdown; `editedAt`, `deletedAt`. |
| **Message** | A 1:1 DM: `senderId`, `recipientId`, `body`, `readAt`. **No `Conversation` table** — a conversation is just the messages between two ids. |
| **Report** | A user reporting a thread/post/message/user: `targetType` + `targetId` (a **bare id, not an FK**), `category`, `reason` (the API calls it `note`), `status`, and the resolution fields. Indexed `(status, createdAt)`. |
| **ModerationLog** | One row per admin mutation: `actorId`, `action`, `targetType`, `targetId`, `targetLabel` (captured at action time), `reason`, `detail` (JSON string). Indexed `(createdAt)` and `(targetType, targetId)`. |
| **Block** | `(blockerId, blockedId)` unique. Prevents new DMs in either direction; does not hide existing history or forum content. |
| **Mention** | A structural record of an `@mention`, re-derived from the body on every create/edit/delete. `userId` (mentioned), `authorId`, and exactly one of `threadId`/`postId`. |
| **Notification** | One in-app row per event, except collapsed likes and DMs. `type`, `actorId` (most recent), `count`, `actorIds` (JSON), `snippet`, `readAt`. Indexed `(recipientId, readAt)` and `(recipientId, createdAt)`. |
| **NotificationPreference** | `(userId, key)` unique, `enabled`. Keys: `master`, `replies`, `likes`, `mentions`, `messages`. |
| **PushToken** | One Expo push token per device: `token` unique, `platform`. Indexed `(userId)`. |
| **Bookmark** | `(userId, threadId)` unique, `createdAt` for sort. Indexed `(userId, createdAt)`. |
| **PasswordResetToken** | `token` unique, `expiresAt`, `usedAt`. Never pruned. |

### Non-obvious invariants

- **`Thread.chapterId` is thread XOR chapter.** A thread belongs to the main
  feed (`null`) or to exactly one chapter, never both, and cannot be moved after
  creation — `updateThreadSchema` has no `chapterId`. Nothing in the schema
  enforces this beyond the single nullable column; the rules live in
  `lib/chapter-access.ts`.
- **`Thread.hotScore` is a stored column ordered by the database.** It is *not*
  a function of the current time: `log10(max(likes + 0.5·replies, 1)) +
  (createdAt_seconds − 1134028003) / 45000`, so it only changes when engagement
  changes. Written by `hotScore(0,0,createdAt)` at thread creation and by
  `recomputeThreadHotScore()` after a thread like/unlike, a reply, or a reply's
  soft-delete. **Post likes never touch it.** The feed is a plain
  `ORDER BY hotScore DESC` — never sort in JS.
- **`Thread.pinnedAt` is deliberately not folded into `hotScore`.** The feed
  sorts on it first, so pinning lifts a thread without distorting ranking and
  unpinning restores the true order with nothing to recompute. Capped at
  `MAX_PINNED_THREADS = 3`, globally, server-side.
- **Soft-delete tombstones.** `Thread.deletedAt` / `Post.deletedAt` keep the row
  so the discussion above and below stays whole. Serializers replace the title
  with `"[deleted]"`, the body with `""`, and the author with `DELETED_AUTHOR`
  (`id: ""` — clients read an empty id as "don't link"). A deleted post is
  dropped from the response entirely **unless** a visible descendant survives,
  in which case it stays as a tombstone so the tree doesn't orphan. The row
  keeps its original `body` as an audit trail; it is never sent to a client.
- **Account deletion anonymizes, it does not cascade.** `User.deletedAt` plus
  scrubbed fields and a tombstoned `deleted-<id>@deleted.invalid` email (which
  frees the real address for reuse). The row can never log in again.
- **`Mention` rows are always live.** They are re-synced on every edit (added
  and removed) and cleared on delete, so a row here always corresponds to a
  mention that currently exists in a currently-visible body. `@mentions` travel
  in the body as ordinary markdown links — `[@Ada Lovelace](/u/<id>)` — so every
  renderer shows them for free; `packages/shared/src/mentions.ts` is the single
  definition of that convention.
- **Absent `NotificationPreference` row = enabled.** Defaults are never
  materialized; a fresh account has zero rows and reads as all-true.
- **`PushToken` is upserted by token, not by user** — a device that switches
  accounts moves with it rather than duplicating.
- **`ModerationLog` is append-only by construction** — no update or delete path
  exists anywhere in the API, and `logModeration()` is its only writer.
- **`Report.targetId` has no referential integrity.** Every reader must handle
  a missing target (`ReportTargetPreview.missing`).
- **`ChapterMembership.state`, not row existence, is the gate.** A `pending`
  row grants nothing.
- **`User.directoryVisible` alone is not enough** — a directory entry requires
  `directoryVisible && isSupporter && !deletedAt && !bannedAt`, so a lapsed
  membership hides the entry without erasing the setting.

---

## Known skeleton shortcuts

These are deliberate prototype choices, not oversights. Each one needs a real
decision before launch.

| Shortcut | Where | What it needs |
| --- | --- | --- |
| **SQLite** | `schema.prisma` datasource | Postgres. A single file can't be shared between instances or survive a container restart. Change the provider, re-generate migrations, re-check every `contains` filter (SQLite `LIKE` is case-insensitive for ASCII; Postgres `LIKE` is not — use `mode: "insensitive"`). |
| **In-memory rate limiting** | `lib/rate-limit.ts` | Correct on **one** instance only; also no `trust proxy`. Shared store or platform limiting. |
| **Local-disk uploads** | `lib/storage-provider.ts` | S3 or R2. Container filesystems are ephemeral — uploads vanish on redeploy. `S3StorageProvider` is unimplemented. |
| **Stub identity verification** | `lib/verification-provider.ts` | A real vendor **and** a signature-verifying `POST /api/verification/webhook`. The current `mock-complete` route is unauthenticated. **No identity in this prototype has ever been checked.** |
| **Dev-mode OAuth mock** | `POST /api/auth/oauth/dev-mock` | Real Google/Apple credentials. The route refuses to run once they exist — keep that guard or delete the route. |
| **`WISDOMKEY`** | `POST /api/auth/redeem-code` | The payment placeholder. A standing, unlimited-use, unrate-limited code that grants `isSupporter` — swap it for a real donation/subscription API check before membership means anything. |
| **Log-only push** | `lib/push-provider.ts` | APNs + FCM credentials in an Expo project. The Expo path is written; nothing has been delivered to a device. |
| **`devResetUrl` / `devToken`** | `POST /api/auth/password-reset/request` | A real mailer. Gated only on `NODE_ENV !== "production"`. |
| **No email at all** | everywhere | Nothing is ever sent: no signup confirmation, no email-change verification, no reset mail. |
| **No admin bootstrap** | — | The first admin is promoted by editing the database. After that admins promote each other. |
| **No image content moderation** | uploads | Files are validated and EXIF-stripped; nothing reviews what the picture *shows*. |
| **N+1 and unpaginated queries** | `GET /api/messages/conversations`, `GET /api/reports`, `GET /api/threads/:id` | Listed per endpoint in the area files. All are prototype-scale acceptable and production-scale not. |
| **No transactions around multi-step moderation** | `POST /api/reports/:id/resolve` | Action + report close + two log rows are separate writes. |
| **No global error handler / 404 handler** | `app.ts` | An async throw hangs the request. |

Hosting trade-offs and a recommendation: `docs/BACKEND-OPTIONS.md`.
Anything added to the API after this document: `docs/API-CHANGES.md`.

---

## Test suite

Vitest + supertest, driving the real Express app. **21 files, 179 tests,
currently all passing.**

```bash
npm test                      # everything, from the repo root
cd apps/api && npm test       # the API suite (npx vitest run)
cd apps/api && npx vitest run src/routes/threads.access.test.ts   # one file
cd packages/shared && npm test
```

No env setup and no credentials are needed — the suite configures itself
(stub providers, no OAuth). `docs/TESTING.md` has the full detail; the short
version:

- `src/test/global-setup.ts` points `DATABASE_URL` at a throwaway
  `$TMPDIR/nyps-api-test-*/test.db`, runs `prisma migrate deploy` against it,
  and deletes it afterwards. `src/test/setup.ts` **refuses to run** unless
  `DATABASE_URL` carries the `nyps-api-test-` marker, so a broken env can never
  fall back to `dev.db`. Files run one at a time in fresh forks.
- Behaviour is exercised **through the routes**, so middleware — where the
  authorization bugs live — is always in the loop. Direct Prisma access is
  reserved for fixtures with no API path and for asserting persistence.
- Verified users are minted through the real flow (signup →
  `/api/verification/start` → stub mock-complete), never by writing
  `verificationStatus` directly.

### It is the compatibility bar

**A rebuilt backend that passes this suite unmodified is presumptively
correct.** The tests encode the decisions, not the implementation — they talk
HTTP, not Prisma. Treat a test you need to change as a spec change that needs
sign-off, not as a test that's in the way.

What it covers, by file:

| File | Covers |
| --- | --- |
| `app.test.ts` | `/health`; that the suite is on the throwaway DB |
| `middleware/auth.test.ts` | all four tiers: missing/invalid/deleted/banned tokens, `optionalAuth` degrading to logged-out, UNVERIFIED/PENDING/REJECTED blocked from posting, admin gate |
| `routes/auth.test.ts` | signup, duplicate email, weak password, login success/failure, JWT round-trip and tampering |
| `routes/auth.account.test.ts` | `/account`, change password (incl. OAuth first-password), change email, account deletion + anonymization + email reuse, data export |
| `routes/auth.password-reset.test.ts` | full reset flow, generic response for unknown emails, single-use, expiry, **`devResetUrl` absent in production** |
| `routes/auth.redeem.test.ts` | WISDOMKEY: grant, case/whitespace tolerance, wrong code, auth required, `supporterSince` preserved |
| `routes/threads.access.test.ts` | **the 220-char teaser**, short bodies, any account reading in full, feed carrying no bodies, all writes 401 anonymous / 403 unverified |
| `routes/threads.pagination.test.ts` | reply paging with whole subtrees, disjoint pages, offset past the end; feed paging |
| `routes/content.test.ts` | edit + `editedAt`, non-author 403, locked threads, admin override, soft-delete tombstones vs. dropping, mention sync incl. blocks and self-mentions |
| `routes/chapters.test.ts` | the full tier matrix, and that chapter content never leaks through the feed, search, bookmarks, notifications, profiles, or tag counts |
| `routes/directory-events.test.ts` | directory opt-in/visibility/search, event creation rules, member-only event posting, attendance codes and admin marking |
| `routes/notifications.test.ts` | emission rules, collapse and the toggle guard, block suppression, preferences, read state, DM collapse clearing |
| `routes/search-bookmarks.test.ts` | anonymous 401, all three sections, deleted-thread exclusion, paging, min length; bookmark save/list/unsave |
| `routes/push-tokens.test.ts` | auth, platform validation, upsert-by-token across accounts, owner-scoped delete |
| `routes/moderation.test.ts` | reports, blocking both directions, banning biting a live session, thread locking |
| `routes/admin.test.ts` | report triage → action → log, warnings that can't be switched off, user administration, last-admin guard, pin cap, **log is read-only** |
| `routes/users.profile.test.ts` | profile shape, anonymous `previewOnly`, paging, bio rules, display-name lock for verified users |
| `routes/users.avatar.test.ts` | upload, **EXIF stripping**, replacement, bad bytes, mislabeled content types, minimum dimensions |
| `routes/uploads.test.ts` | post images: dimensions in the URL, downscaling, verification required, non-image rejection |
| `lib/ranking.test.ts` | the `hotScore` formula and that the **column** is recomputed on like/unlike/reply |
| `lib/rate-limit.test.ts` | the 429 path, with the test bypass explicitly unset |
