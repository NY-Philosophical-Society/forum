# Messages, notifications, push, search & bookmarks

`apps/api/src/routes/messages.ts` · `notifications.ts` · `push-tokens.ts` ·
`search.ts` · `bookmarks.ts` · `apps/api/src/lib/notifications.ts` · `lib/search.ts`
Cross-cutting rules: [`../API.md`](../API.md).

---

# Direct messages

1:1 only. There is deliberately no `Conversation` table — a conversation is
just the messages between two user ids.

## GET /api/messages/conversations

**Auth:** `requireAuth` · no limiter

**200**

```json
{
  "conversations": [
    {
      "otherUser": PublicUser,
      "lastMessage": { "id": "clxm…", "senderId": "clx8k…", "recipientId": "clx7j…",
                       "body": "Are you coming Thursday?", "createdAt": "…", "readAt": null },
      "unreadCount": 2
    }
  ]
}
```

**Unpaginated, and it loads every message the caller has ever sent or received**
to fold them into one row per counterpart in JS. Newest conversation first.
That is the single worst-scaling query in the API — fix it with a grouped query
or a real conversation table when you rebuild.

`unreadCount` counts incoming messages with `readAt: null`.

## GET /api/messages/:userId

**Auth:** `requireAuth` · no limiter

Query: `limit` (≤100, default 30), `offset`. Paginates **backwards**:
`offset=0` is the most recent `limit` messages; the response array is then
reversed so it renders oldest-first.

**200**

```json
{ "otherUser": PublicUser, "messages": [DirectMessage], "total": 84,
  "limit": 30, "offset": 0, "hasMore": true }
```

Errors: `404 { "error": "User not found" }`.

Side effects — opening a conversation marks it read:

- every `Message` from that sender to the caller with `readAt: null` is stamped;
- every unread `Notification` of type `message` from that actor is stamped read,
  so the bell's collapsed "3 new messages" row clears with them.

There is **no block check on reading** — existing history stays readable after
a block, by design.

## POST /api/messages

**Auth:** `requireAuth` + `requireVerified` · **Limiter:** `writeLimiter`

Request — `sendMessageSchema`: `{ recipientId: string, body: string(1..5000) }`.

**201** `{ "message": DirectMessage }`

Errors: `400 { "error": "You can't message yourself" }` ·
`404 { "error": "Recipient not found" }` (missing or deleted) ·
`403 { "error": "You can't message this user" }` — a `Block` in **either**
direction.

Side effect: `notify({ type: "message" })`, collapsed per sender.

Messages are stored and returned as plain text; the clients do not render DM
markdown.

---

# Notifications

## Emission — `notify()` is the only writer

`apps/api/src/lib/notifications.ts`. Every create path (reply, like, DM,
mention, moderation warning) calls it rather than inserting rows inline.
Rebuild it as one function too — these rules only work if there is one place
they live.

Rules, in evaluation order:

1. **Never notify someone about their own action** (`recipientId === actorId` → drop).
2. Recipient missing or `deletedAt` → drop.
3. For everything except `warning`:
   - recipient `bannedAt` → drop;
   - a `Block` in **either** direction between recipient and actor → drop;
   - the per-type preference or the `master` switch is off → drop
     (checked at **emission**, so a disabled type creates no row at all);
   - `canRecipientSee()` — the thread is in a chapter the recipient isn't an
     active member of (admins excepted) → drop.
4. `warning` bypasses items 3 entirely: preferences, blocks, and ban state.
   A moderation warning must land — the member has to be able to read why once
   they're back.

**Collapse rules:**

| Type | Collapses onto | Bookkeeping |
| --- | --- | --- |
| `like_thread` | the recipient's existing **unread** row for that `threadId` | `count += 1`, `actorId` = newest, `actorIds` JSON array appended (capped at 50 tracked ids), `createdAt` bumped so the row resurfaces |
| `like_post` | same, keyed on `postId` | same |
| `message` | the recipient's existing **unread** row for that `actorId` | `count += 1`, snippet replaced, `createdAt` bumped |
| everything else | never collapses | one row per event |

The `actorIds` array is a distinct-actor guard: a like → unlike → like toggle
by the same person returns early and cannot inflate `count` or resurface the
row.

`notify()` **never throws** — it catches and `console.error`s, because a
notification failure must not fail the write that caused it. (`logModeration()`
deliberately does the opposite; see [`moderation.md`](moderation.md).)

Snippets are `stripMarkdown(body)`, whitespace-collapsed, truncated to 140
chars + `…`.

Push fan-out happens inside `notify()` after the row write — see
[Push tokens](#push-tokens).

## GET /api/notifications

**Auth:** `requireAuth` · no limiter

Query: `limit` (≤100, default 20), `offset`.

**200**

```json
{
  "notifications": [
    {
      "id": "clxn…",
      "type": "like_post",
      "actor": PublicUser,
      "count": 3,
      "threadId": "clx9a…",
      "postId": "clxb1…",
      "threadTitle": "Is moral luck a coherent notion?",
      "snippet": "The asymmetry only bites if…",
      "createdAt": "2026-07-30T12:41:00.000Z",
      "readAt": null
    }
  ],
  "total": 57, "limit": 20, "offset": 0, "hasMore": true, "unreadCount": 4
}
```

`type` ∈ `reply_thread · reply_post · like_thread · like_post · mention ·
message · warning`. `threadTitle` is `"[deleted]"` for a tombstoned thread and
`null` when the notification has no thread (DMs, warnings).

Chapter filter: for non-admins the `where` adds
`{ OR: [{ threadId: null }, { thread: visibleThreadWhere(viewer) }] }` — defense
in depth on top of the emission gate and the removal-time purge. All three
counts in the response use the same filter.

## GET /api/notifications/unread-count

**Auth:** `requireAuth` · no limiter

**200** `{ "unreadCount": 4 }`

Both clients poll this every 15 s alongside the DM unread poll. It is
deliberately a single `COUNT` on the `(recipientId, readAt)` index with **no
chapter join** — that is sound only because rows about invisible chapter
content are never created and are purged when a membership is removed. If you
change either of those, this query has to change too.

## POST /api/notifications/read

**Auth:** `requireAuth` · no limiter

Request — `markNotificationsReadSchema`: `{ ids: string[] }`, 1..100 entries.

**200** `{ "ok": true }`. The `updateMany` is scoped to
`recipientId = caller, readAt: null`, so ids belonging to someone else are
silently no-ops rather than an error.

## POST /api/notifications/read-all

**Auth:** `requireAuth` · no body · **200** `{ "ok": true }`.

## GET /api/notifications/preferences

**Auth:** `requireAuth`

**200** `{ "preferences": { "master": true, "replies": true, "likes": true, "mentions": true, "messages": true } }`

**An absent row means enabled** — defaults are never materialized, so a fresh
account has zero `NotificationPreference` rows and still reads as all-true.

## PUT /api/notifications/preferences

**Auth:** `requireAuth`

Request — `updateNotificationPrefsSchema`: any subset of
`{ master, replies, likes, mentions, messages }`, all boolean.

**200** the full merged object. Only the provided keys are upserted, in one
`$transaction`. One toggle covers in-app and push together — there is no
separate push preference.

`warning` has no preference key (`prefKeyForNotificationType` returns `null`)
and cannot be switched off.

---

# Push tokens

`apps/api/src/lib/push-provider.ts` — stub by default, Expo when configured.

## POST /api/push-tokens

**Auth:** `requireAuth` · no limiter

Request — `registerPushTokenSchema`: `{ token: string(1..400), platform: "ios" | "android" }`.

**201** `{ "ok": true }`

**Upserted by `token`, not by user**: a device that logs into a different
account moves with it, so pushes never go to whoever used the phone
previously.

## DELETE /api/push-tokens

**Auth:** `requireAuth` · no limiter

Request — `deregisterPushTokenSchema`: `{ token: string(1..400) }` in the body.

**200** `{ "ok": true }`. Scoped to `userId = caller`, so a token can only be
removed by the account that owns it. Called on logout, before the session is
dropped client-side.

## Delivery

Inside `notify()`, after the row write: all of the recipient's tokens are
loaded, and one `PushMessage` per device is handed to `pushProvider.send()`:

```json
{ "to": "ExponentPushToken[…]",
  "title": "Ada Lovelace replied to your thread",
  "body": "<snippet>",
  "data": { "type": "reply_thread", "threadId": "clx9a…", "postId": "clxb1…", "actorId": "clx8k…" },
  "badge": 4 }
```

`badge` is the recipient's total unread notification count. Titles are fixed
per type (`pushTitle()`). Tokens the provider reports as `DeviceNotRegistered`
come back in `staleTokens` and are deleted from `PushToken`.

---

# Search

## GET /api/search

**Auth:** `requireAuth` · no limiter

Query: `q` (min 2 chars, `SEARCH_MIN_QUERY_LENGTH`), `type` ∈
`all | threads | posts | users` (default `all`, unknown → `all`),
`limit` (≤50, default 10), `offset`. The same `limit`/`offset` applies to each
section independently.

**200**

```json
{
  "q": "moral luck",
  "threads": { "items": [{ "id": "…", "title": "…", "snippet": "…", "author": PublicUser,
                           "createdAt": "…", "likeCount": 7, "postCount": 12 }],
               "total": 3, "hasMore": false },
  "posts":   { "items": [{ "id": "…", "threadId": "…", "threadTitle": "…", "snippet": "…",
                           "author": PublicUser, "createdAt": "…" }],
               "total": 8, "hasMore": false },
  "users":   { "items": [PublicUser], "total": 1, "hasMore": false },
  "limit": 10, "offset": 0
}
```

Unrequested sections come back as `{ items: [], total: 0, hasMore: false }`.

Errors: `400 { "error": "Search needs at least 2 characters" }` ·
`401` for anonymous.

**`requireAuth` is deliberate**: full bodies and replies are readable only with
an account, and search snippets would leak exactly that content past the
preview wall.

Access rules in `lib/search.ts`:

- threads: `deletedAt: null, chapterId: null`, `title OR body contains q`
- posts: `deletedAt: null, thread.chapterId: null`, `body contains q`
- users: `deletedAt: null, displayName contains q` — **banned users are not
  excluded**

Chapter content is excluded **for everyone**, members of that chapter included.

Engine: Prisma `contains` → SQL `LIKE '%q%'`. SQLite's `LIKE` is
case-insensitive for ASCII only, does not rank by relevance, and table-scans.
The three functions exist precisely so their bodies can be swapped for
Postgres full-text (`tsvector` column + GIN index, `websearch_to_tsquery`)
without touching the route or either client. Ordering is `createdAt desc`
(threads, posts) / `createdAt asc` (users) — not relevance.

Snippets: `buildSnippet()` — plain-text window of ±70 chars around the first
match, ellipsized on both sides.

---

# Bookmarks

## GET /api/bookmarks

**Auth:** `requireAuth` · no limiter

Query: `limit` (≤100, default 20), `offset`.

**200** `{ threads: ThreadSummary[], total, limit, offset, hasMore }` —
most-recently-saved first, each item with `myBookmarked: true`.

Filtered at **read time**, not by unsaving: `{ thread: { deletedAt: null, ...visibleThreadWhere(viewer) } }`.
A saved chapter thread disappears from the list while access is lost and
returns if the user rejoins, because the `Bookmark` row is kept. Same for a
thread that gets deleted.

## POST /api/bookmarks

**Auth:** `requireAuth` · no limiter

Request — `createBookmarkSchema`: `{ threadId: string }`. Idempotent upsert.

**201** `{ "bookmarked": true }` · Errors: `404 Thread not found` — missing,
soft-deleted, or a chapter thread the caller can't see.

## DELETE /api/bookmarks/:threadId

**Auth:** `requireAuth` · no limiter

**200** `{ "bookmarked": false }`. `deleteMany` scoped to the caller, so
removing a bookmark that doesn't exist is fine.
