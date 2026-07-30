# API changes — handoff log

Every API change made during frontend/product runs is logged here, dated, so
the backend engineer can rebuild it properly without reading diffs. Shapes are
the source of truth in `packages/shared/src/types.ts` (responses) and
`schemas.ts` (request validation); this file is the map.

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
