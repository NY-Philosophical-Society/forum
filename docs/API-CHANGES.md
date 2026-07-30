# API changes — handoff log

Every API change made during frontend/product runs is logged here, dated, so
the backend engineer can rebuild it properly without reading diffs. Shapes are
the source of truth in `packages/shared/src/types.ts` (responses) and
`schemas.ts` (request validation); this file is the map.

## 2026-07-30 — Posting moves to the honor system (ID verification made optional)

**Owner decision:** posting no longer requires a completed ID-verification
check. Any signed-up account posts under the name it gave at signup. ID
verification still exists and is still available to members, but it is no
longer a gate — it's a stronger, visible confirmation of identity a member
can opt into.

### The single toggle

`apps/api/src/middleware/auth.ts` — `requireVerified` now calls a new
`idVerificationRequired()` (exported), which reads
`process.env.REQUIRE_ID_VERIFICATION === "true"` **per request**, not cached at
module load. When false (the default), `requireVerified` becomes a pass-through
that only requires `requireAuth` to have run. When true, behavior is unchanged
from before — `verificationStatus !== "VERIFIED"` gets a 403. This is the only
code path that changed; every route that already called `requireVerified`
(threads, posts, messages, reports, uploads) needed zero changes.

### New field: `PublicUser.canWrite`

`packages/shared/src/types.ts` — `PublicUser` gained `canWrite: boolean`,
computed server-side in `apps/api/src/lib/serialize.ts`'s `toPublicUser()` as
`idVerificationRequired() ? verificationStatus === "VERIFIED" : true`. **Every
client-side write gate now checks `user.canWrite`, never `verificationStatus`
directly** — the two are deliberately decoupled so the client never has to
know about the server's toggle. `DELETED_AUTHOR` sets `canWrite: false`
(irrelevant in practice — deleted authors aren't gated on anything).

Two exceptions, unchanged and deliberately still tied to real
`verificationStatus === "VERIFIED"`:
- **Display-name lock** (`settings/profile`, mobile `EditProfileScreen`) — a
  name is only locked once it's been through the real ID check, honor-system
  posting doesn't lock anything.
- **The `/verify` page's own "you're ID-verified" display** — showing the
  actual state is the entire point of that page.

Edit/delete of your own thread/post was **also changed** — it now checks
ownership (or admin) only, with no verification requirement at all, matching
what the API already enforced (edit/delete routes were never gated by
`requireVerified`, only by ownership — the client UI had been stricter than
the server, which became a real bug once honor-system authors existed).

### UI: the UNVERIFIED badge is now hidden

`UNVERIFIED` is red on both platforms and is now the **permanent default state
for most members** (nobody is forced through the real check). `StatusBadge`
(web) and `VerificationBadge` (mobile) both return `null` for `UNVERIFIED` —
badges only render for `PENDING`, `VERIFIED`, or `REJECTED`, states that
actually say something.

### Signup form

First/last name are now two fields (joined into `displayName` on submit — no
API shape change). Copy on signup and `/verify` rewritten to state the
honor-system policy plainly instead of implying verification is mandatory.

### To restore mandatory ID verification later

Set `REQUIRE_ID_VERIFICATION=true` in the API's environment and restart.
Nothing else needs to change — the same middleware, the same `canWrite` field,
the same client gates. `docs/PROJECT.md` "Access tiers" section documents this.

## 2026-07-30 — Membership parts 2–4: member directory, partner matching, event threads

### Member directory + reading-partner matching

New `User` fields: `directoryVisible Boolean @default(false)` (strictly
opt-in), `directoryBio String?` (short plain-text interests, max 280 — distinct
from the public markdown `bio`), `openToPartners Boolean @default(false)`
("open to a reading partner / study group" — a directory filter, deliberately
no matching algorithm; members connect by DM).

- `GET /api/directory` — **member-only** (`requireMember`, server-enforced).
  `?q=` matches displayName OR directoryBio (contains), `?partners=1` narrows
  to `openToPartners`, `limit` (≤100, default 30) / `offset`. Returns
  `{ entries: DirectoryEntry[], total, limit, offset, hasMore }`; each entry is
  `{ user: PublicUser, directoryBio, openToPartners, chapters: ChapterRef[] }`
  (active chapter memberships only). **An entry appears only while
  `directoryVisible && isSupporter && !deletedAt && !bannedAt`** — lapsed
  members drop out automatically, their settings survive.
- `PATCH /api/users/me` accepts the three new fields (any account may save
  them; the directory query is the gate). Account deletion resets all three.
- `GET /api/auth/account` now also returns
  `directory: { directoryVisible, directoryBio, openToPartners }` for the
  Settings screen.

### Event threads (the event's afterlife)

New `Thread` fields: `kind String @default("discussion")` (`"discussion" |
"event"`), `eventDate DateTime?`, `eventCode String?` (per-event attendance
code, stored uppercase; the WISDOMKEY pattern). New model **`EventAttendee`**
— `(threadId, userId)` unique, `source` (`"admin" | "code"`), `createdAt`.

Rules (all server-enforced):

- **Creation**: `POST /api/threads` with `kind: "event"` is admin-only;
  `eventDate` required; `eventCode` optional (normalized
  `trim().toUpperCase()`). Event fields on a discussion → 400. Event threads
  can sit in a chapter (`chapterId`), in which case **chapter visibility wins**
  everywhere and chapter members may post.
- **Reading**: normal rules — free accounts read main-feed event threads in
  full; anonymous get the usual teaser.
- **Posting**: member-only (`isSupporter` or admin) for main-feed events —
  enforced in `POST /api/posts`, 403 with a membership pitch message. Likes
  stay verification-gated as before (posting, not liking, is the member perk).
- **Feed**: `GET /api/threads?kind=discussion|event|all` — default is
  `discussion`, so events don't double-list; the Events grouping fetches
  `?kind=event`, ordered `eventDate desc` (clients split upcoming/past).
- **Serialization**: `ThreadSummary.kind` + `.eventDate` everywhere (feed,
  chapter feed, bookmarks, profiles). Thread detail adds `attendeeCount`,
  `myAttended`, `canPost`, and `eventCode` **for admins only**; each post in an
  event thread carries `wasThere` (author has an `EventAttendee` row).
- **Attendance**: `POST /api/threads/:id/attend` `{ code }` — any signed-in
  user who can see the thread may redeem (a free account can have been in the
  room); case/whitespace-insensitive; 400 on wrong code or non-event. Admin
  routes: `GET/POST /api/threads/:id/attendees` (`{ userId }`) and
  `DELETE /api/threads/:id/attendees/:userId` — logged as
  `event_attendee_added` / `event_attendee_removed` in the moderation log.

Tests: `apps/api/src/routes/directory-events.test.ts` (9 tests across the
tier matrix).

## 2026-07-30 — Membership part 1: chapters (member-only sub-forums)

Skeleton-quality per the handoff agreement: SQLite models + plain Express
routes, but the **access rules are real and enforced server-side** — rebuild
them exactly, they are the point of the feature. `docs/MEMBERSHIP.md` records
the owner decisions; supporter-gated *reading* was rejected and must not come
back. Nothing any existing tier could do yesterday was reduced.

### New Prisma models

- **`Chapter`** — `slug` (unique), `name`, `description`, `location?`,
  `createdAt`. Admin-created only.
- **`ChapterMembership`** — `(chapterId, userId)` unique, `state`
  (`"pending" | "active"`), `createdAt`, `approvedAt?`. Two paths in: a member
  requests (→ pending, admin approves) or an admin adds directly (→ active).
  **Only `active` grants visibility** — every gate checks state, never row
  existence. Indexed `(userId, state)`.
- **`Thread.chapterId String?`** — a thread belongs to the main feed (null) or
  exactly one chapter, never both.

### The access rule (single module: `apps/api/src/lib/chapter-access.ts`)

Chapter content is readable/writable only by that chapter's **active** members
and **admins** (admins bypass member gating — moderating must not require
donating; the demo admin is deliberately not a supporter). Probing routes
return **404, not 403**, so an id can't be confirmed to exist. Enforced at:

- `GET/PATCH/DELETE /api/threads/:id`, `POST /api/threads/:id/like`
- `POST /api/posts` (reply), `PATCH/DELETE /api/posts/:id`, `POST /api/posts/:id/like`
- `POST /api/bookmarks` (404) and `GET /api/bookmarks` (read-time filter —
  a saved chapter thread disappears from the list while access is lost, the
  bookmark row is kept so it returns on re-add)
- Search (`lib/search.ts`): chapter threads/posts are excluded **for
  everyone**, members included — search covers the shared forum only
- Notifications: emission-time gate in `lib/notifications.ts`
  `canRecipientSee()` (a mention of a non-member inside a chapter creates no
  row), read-time filter on `GET /api/notifications` for defense in depth,
  and a purge of the leaver's chapter notifications on membership removal so
  `GET /api/notifications/unread-count` can stay a bare indexed COUNT
- Public profiles (`GET /api/users/:id/profile`): list **main-feed activity
  only** (counts included) — a profile is a public record
- `GET /api/tags`: counts now `deletedAt: null, chapterId: null` (also fixes
  pre-existing inflation by deleted threads)
- Main feed `GET /api/threads`: `chapterId: null` always

### New middleware

`requireMember` (`middleware/auth.ts`): `isSupporter || role === "admin"`,
else 403. Gates member *features* only — never reading, notifications, or
bookmarks.

### New endpoints (all under `/api/chapters`, all `requireAuth`)

| Endpoint | Method | Auth beyond login | Notes |
| --- | --- | --- | --- |
| `/api/chapters` | GET | member | All chapters with `myMembership: "none"\|"pending"\|"active"`, active `memberCount`; admins also get `pendingCount` per chapter. |
| `/api/chapters` | POST | admin | `createChapterSchema` `{ name, slug?, description, location? }`; slug generated from name when absent; 409 on slug collision. Logs `chapter_created`. |
| `/api/chapters/:slug` | GET | member | One `ChapterSummary`. |
| `/api/chapters/:slug/threads` | GET | **active** chapter member or admin | Same query params/response shape as `GET /api/threads` (`sort`, `limit`, `offset`) so clients reuse feed components; each item carries `chapter: {id, slug, name}`. 403 for members who aren't in this chapter. |
| `/api/chapters/:slug/join` | POST | member | Creates a `pending` membership; idempotent (existing state returned). |
| `/api/chapters/:slug/members` | GET | active member or admin | Active members; admins also get `pending` (oldest first). |
| `/api/chapters/:slug/members` | POST | admin | `{ userId }` → upsert to `active`. Logs `chapter_member_added`. |
| `/api/chapters/:slug/members/:userId/approve` | POST | admin | pending → active. Logs `chapter_member_approved`. |
| `/api/chapters/:slug/members/:userId` | DELETE | admin, or self | Remove membership / reject request / leave. Purges the user's notifications about this chapter's threads. Admin removal of someone else logs `chapter_member_removed`. |

`POST /api/threads` accepts optional `chapterId` (active membership or admin
required — 404 otherwise). Threads cannot be *moved* between the feed and a
chapter after creation (no `chapterId` on the update schema).

New `ModerationAction` values: `chapter_created`, `chapter_member_added`,
`chapter_member_approved`, `chapter_member_removed`; `ModerationLog.targetType`
gains `"chapter"`.

Deliberate skeleton gaps for the real backend: no notification to admins on a
join request (the admin UI polls pending counts instead), pin cap remains
global rather than per-chapter, and revoking `isSupporter` does **not** cascade
into chapter memberships — admins remove members explicitly.

Tier-gate test matrix: `apps/api/src/routes/chapters.test.ts` (13 tests —
anonymous/free/verified/pending/active/admin against every surface above).

## 2026-07-30 — Brief 05 backfill: notifications, push tokens, search, bookmarks

> These endpoints and models landed 2026-07-29 (commits `18a308e` and
> `7690370`), before this log existed. Backfilled during the run that finished
> brief 05's mobile layer. No endpoint below changed on 2026-07-30 — only tests
> were added.

### New Prisma models (SQLite; all fields in `apps/api/prisma/schema.prisma`)

- **`Notification`** — `recipientId`, `actorId` (most recent actor), `type`
  (a `NotificationType` string: `reply_thread` · `reply_post` · `like_thread` ·
  `like_post` · `mention` · `message` · `warning`), optional `threadId`/`postId`
  deep-link target, `count` + `actorIds` (JSON array, capped at 50) for collapse
  bookkeeping, `snippet` (plain-text excerpt captured at event time), `readAt`,
  `createdAt` (bumped when a collapsed row absorbs a new event). Indexed on
  `(recipientId, readAt)` — the unread-count poll — and `(recipientId,
  createdAt)`. This table grows fastest of anything in the app; plan retention.
- **`NotificationPreference`** — `(userId, key)` unique, `enabled` boolean.
  Keys: `master`, `replies`, `likes`, `mentions`, `messages`. **Absent row =
  enabled** — defaults are never materialized.
- **`PushToken`** — `token` (unique, the Expo push token), `userId`, `platform`
  (`ios`/`android`). Upserted **by token**, not by user: a device that logs into
  a different account moves with it.
- **`Bookmark`** — `(userId, threadId)` unique, `createdAt` for sort.

### Emission — one `notify()` helper (`apps/api/src/lib/notifications.ts`)

Every create path (reply, like, DM, mention; moderation warning from brief 06)
calls `notify()` rather than creating rows inline. The rules live there and
only there — rebuild them in one place too:

- Never notify someone about their own action.
- Never across a block in either direction; never to banned/deleted recipients.
- Per-type preference + master toggle checked at emission time (not display
  time), so a disabled type creates no row at all.
- Likes collapse onto an existing **unread** row per target with a distinct-actor
  guard (like → unlike → like can't inflate `count`); DMs collapse per sender.
- `warning` (moderation) bypasses preferences, blocks, and ban state — the
  recipient must be able to read why.
- `canRecipientSee()` is a constant `true` today; it exists as the single
  landing spot for brief 04's chapter-visibility rules.
- Push fan-out happens inside `notify()` after the row write; stale tokens
  (`DeviceNotRegistered` receipts) are pruned from `PushToken`.

### Endpoints

All require `Authorization: Bearer <jwt>` (plain `requireAuth` — verification
is **not** required for any of these; they are read/aid features).

| Endpoint | Method | Notes |
| --- | --- | --- |
| `/api/notifications` | GET | `?limit=` (≤100, default 20) `&offset=`. Returns `{ notifications: NotificationItem[], total, limit, offset, hasMore, unreadCount }`. `threadTitle` is `"[deleted]"` for tombstoned threads. |
| `/api/notifications/unread-count` | GET | `{ unreadCount }`. Polled every 15s by both clients alongside the DM poll — must stay a single indexed COUNT. |
| `/api/notifications/read` | POST | `{ ids: string[] }`. Only rows owned by the caller are touched. |
| `/api/notifications/read-all` | POST | No body. |
| `/api/notifications/preferences` | GET | `{ preferences: { master, replies, likes, mentions, messages } }`, absent rows reported as `true`. |
| `/api/notifications/preferences` | PUT | Partial body of the same keys; upserts only the provided ones; returns the full merged object. |
| `/api/push-tokens` | POST | `{ token, platform: "ios"\|"android" }` → 201. Upsert by token (see model note). |
| `/api/push-tokens` | DELETE | `{ token }` in the body. Deletes only if the caller owns the row (logout flow). |
| `/api/search` | GET | `?q=` (min 2 chars, else 400) `&type=all\|threads\|posts\|users` `&limit=` (≤50, default 10) `&offset=`. Returns `{ q, threads, posts, users, limit, offset }`, each section `{ items, total, hasMore }`. **Deliberately 401 for anonymous** — snippets would leak past the read-preview wall. |
| `/api/bookmarks` | GET | `?limit=` (≤100, default 20) `&offset=`. `{ threads: ThreadSummary[], total, limit, offset, hasMore }`, newest-saved first. Deleted threads filtered at read time (bookmark row kept). This `where` is where chapter-visibility filtering must land so a saved-then-lost thread can't leak back. |
| `/api/bookmarks` | POST | `{ threadId }` → 201, idempotent upsert. 404 for missing/deleted threads. |
| `/api/bookmarks/:threadId` | DELETE | Scoped to the caller's own bookmark. |

Existing responses gained fields: `ThreadSummary.myBookmarked?` (feed, thread
detail, bookmark list) and notification snippets reuse `stripMarkdown` from
`packages/shared`.

### Search implementation note

`apps/api/src/lib/search.ts` isolates the query logic behind three functions
(`searchThreads/searchPosts/searchUsers`) precisely so the SQLite
`LIKE '%term%'` implementation can be swapped for Postgres full-text
(`tsvector`/`websearch_to_tsquery`) without touching the route or clients. The
documented upgrade path is in that file's top comment.

### Push provider

`apps/api/src/lib/push-provider.ts` follows the house provider pattern:
`PUSH_PROVIDER=stub` (default) logs pushes to the console with zero
credentials; the Expo path activates when `EXPO_ACCESS_TOKEN` is set, and the
stub **refuses to run** once it is. Real delivery needs an Apple Developer
APNs key (+ FCM for Android) uploaded to the Expo project — credentials only
the owner can create; nothing end-to-end was verifiable locally beyond token
registration and the stub's console output.
