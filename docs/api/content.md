# Tags, threads, posts & uploads

`apps/api/src/routes/tags.ts` · `threads.ts` · `posts.ts` · `uploads.ts`
Cross-cutting rules live in [`../API.md`](../API.md); chapter visibility is
detailed in [`chapters.md`](chapters.md).

---

## GET /api/tags

**Auth:** anonymous · no limiter

**200**

```json
{
  "tags": [
    { "id": "clx…", "slug": "ethics", "name": "Ethics",
      "description": "Right action, obligation, and the good life.", "threadCount": 14 }
  ]
}
```

Ordered by `name` ascending. `threadCount` counts threads with
`deletedAt: null, chapterId: null` — deleted threads and chapter threads never
register in a public count.

There are 12 seeded tags; slugs and names are fixed product decisions
(`docs/prompts/README.md`). There is no create/update/delete route — tags come
from the seed.

---

## GET /api/threads — the main feed

**Auth:** `optionalAuth` · no limiter

Query parameters:

| Param | Default | Notes |
| --- | --- | --- |
| `sort` | `hot` | `new` for `createdAt desc`; anything else is `hot` (`hotScore desc`) |
| `tag` | — | tag **slug**; filters to threads carrying it |
| `kind` | `discussion` | `event` · `all` · anything else → `discussion` |
| `limit` | 20 | `Math.min(Number(limit) \|\| 20, 100)` |
| `offset` | 0 | `Math.max(Number(offset) \|\| 0, 0)` |

Base `where` is always `{ deletedAt: null, chapterId: null }` — **the main feed
never contains chapter threads, for anybody, admins included.**

Order is `[{ pinnedAt: "desc" }, <sort>]`. SQLite sorts NULLs last on `DESC`,
so pinned threads ride in front and everything else falls through to its real
order. When `kind=event` the second key is `eventDate desc` instead of
hot/new — clients split upcoming vs past themselves.

**200**

```json
{
  "threads": [
    {
      "id": "clx9a…",
      "title": "Is moral luck a coherent notion?",
      "author": { "id": "clx8k…", "displayName": "Ada Lovelace", "avatarUrl": null,
                  "bio": null, "verificationStatus": "VERIFIED", "role": "user",
                  "isSupporter": true, "createdAt": "2026-07-01T10:00:00.000Z" },
      "createdAt": "2026-07-28T18:41:07.882Z",
      "kind": "discussion",
      "eventDate": null,
      "tags": [{ "id": "clx…", "slug": "ethics", "name": "Ethics", "description": "…" }],
      "likeCount": 7,
      "myLiked": false,
      "postCount": 12,
      "locked": false,
      "pinnedAt": null,
      "myBookmarked": false
    }
  ],
  "total": 43,
  "limit": 20,
  "offset": 0,
  "hasMore": true
}
```

`myLiked` / `myBookmarked` are `false` for anonymous callers (the joins are
skipped entirely rather than queried with an undefined id). **No thread body is
ever returned by this endpoint**, at any tier — that is what keeps the feed
free to browse while the preview wall still means something.

`postCount` counts non-deleted replies.

---

## GET /api/threads/:id — thread detail

**Auth:** `optionalAuth` · no limiter

Query: `repliesLimit` (default 20, capped 100), `repliesOffset` (default 0,
floored at 0).

Visibility: after loading, `canViewThread(req.user, thread)` must pass or the
response is **404**, not 403 — a probed chapter-thread id must not confirm the
thread exists.

**200** (signed-in viewer, discussion thread)

```json
{
  "thread": {
    "id": "clx9a…",
    "title": "Is moral luck a coherent notion?",
    "body": "Williams and Nagel both…",
    "previewOnly": false,
    "deleted": false,
    "locked": false,
    "pinnedAt": null,
    "chapter": null,
    "kind": "discussion",
    "eventDate": null,
    "author": { "…PublicUser…": null },
    "createdAt": "2026-07-28T18:41:07.882Z",
    "editedAt": null,
    "tags": [],
    "likeCount": 7,
    "myLiked": true,
    "myBookmarked": false,
    "postCount": 12,
    "repliesTotal": 5,
    "repliesLimit": 20,
    "repliesOffset": 0,
    "hasMoreReplies": false,
    "posts": [
      {
        "id": "clxb1…",
        "threadId": "clx9a…",
        "parentId": null,
        "body": "The asymmetry only bites if…",
        "author": { "…PublicUser…": null },
        "createdAt": "2026-07-28T19:02:44.117Z",
        "editedAt": null,
        "deleted": false,
        "likeCount": 2,
        "myLiked": false
      }
    ]
  }
}
```

### Anonymous truncation — the teaser

When there is no viewer (`previewOnly: true`):

- `body` = `thread.body.slice(0, 220) + "…"` when the body exceeds 220
  characters; shorter bodies are returned whole. The cut is by character count
  only — it can land mid-word.
- `posts` is `[]` regardless of `repliesLimit`. `repliesTotal` still reports the
  true count.
- `myLiked`, `myBookmarked` are `false`.

Any account — even `UNVERIFIED` — reads in full. Verification gates writing,
not reading.

### Soft-deleted threads

A thread with `deletedAt` keeps its page so surviving replies stay readable:
`title` becomes `"[deleted]"`, `body` `""`, `deleted: true`, `editedAt: null`,
and `author` is the tombstone `DELETED_AUTHOR` (`id: ""`, `displayName:
"[deleted]"`). Clients treat an empty id as "don't link to a profile".

### Reply tree and pagination

- A deleted post is dropped entirely **unless** something visible survives below
  it, in which case it is kept as a tombstone (`deleted: true`, `body: ""`,
  `author: DELETED_AUTHOR`, `likeCount: 0`) so the tree doesn't orphan.
- Pagination is over **top-level** replies (`repliesTotal` = top-level count),
  and each paginated top-level reply always ships with its **entire descendant
  subtree** — cutting a page mid-tree would orphan nested replies whose parent
  didn't make the page.
- Clients rebuild the tree with `flattenPostTree` from `packages/shared`.

### Event threads

When `kind === "event"` the thread object also carries:

| Field | Meaning |
| --- | --- |
| `attendeeCount` | number of `EventAttendee` rows |
| `myAttended` | the viewer has one |
| `canPost` | chapter event → `Boolean(viewer)`; main-feed event → `viewer && (isSupporter \|\| admin)` |
| `eventCode` | **admins only** — the code an admin reads out in the room |

and every non-deleted post gains `wasThere: boolean` (its author has an
attendee row). `canPost` is advisory for the UI; `POST /api/posts` enforces it
again.

### Performance note

This handler loads **every** post of the thread and **every** thread like before
paginating in JS. Fine at prototype scale, not at real scale — page in SQL when
you rebuild.

---

## POST /api/threads

**Auth:** `requireAuth` + `requireVerified` · **Limiter:** `writeLimiter` (60 / 15 min / IP)

Request — `createThreadSchema`:

| Field | Type | Rule |
| --- | --- | --- |
| `title` | string | 4..200 |
| `body` | string | 1..20000 (markdown) |
| `tagIds` | string[] | max 5, defaults `[]` |
| `chapterId` | string \| null | optional; active membership (or admin) required |
| `kind` | `"discussion"` \| `"event"` | optional, defaults discussion |
| `eventDate` | string | required when `kind === "event"`; must `Date.parse` |
| `eventCode` | string | optional, 4..40, event threads only |

```json
{ "title": "Is moral luck a coherent notion?", "body": "Williams and Nagel…", "tagIds": ["clx…"] }
```

**201** `{ "thread": { "id": "clx9a…" } }` — id only; clients refetch the detail.

Errors:

| Status | Message | Cause |
| --- | --- | --- |
| 403 | `Only admins can create event threads` | `kind: "event"` from a non-admin |
| 400 | `An event thread needs the event's date` | event without `eventDate` |
| 400 | `Event fields only apply to event threads` | `eventDate`/`eventCode` on a discussion |
| 400 | `One or more tags are invalid` | any `tagId` doesn't exist |
| 404 | `Chapter not found` | unknown chapter **or** caller isn't an active member |

Side effects:

- `hotScore` is computed inline as `hotScore(0, 0, createdAt)` and stored — the
  only place a thread's score is set without `recomputeThreadHotScore`.
- `eventCode` is normalized `trim().toUpperCase()`.
- `syncMentions()` parses `[@Name](/u/<id>)` links out of the body into
  `Mention` rows, then one `notify({ type: "mention" })` per **newly created**
  mention.

---

## PATCH /api/threads/:id

**Auth:** `requireAuth` · **Limiter:** `writeLimiter`

Request — `updateThreadSchema`: `{ title?: 4..200, body?: 1..20000, tagIds?: string[] (max 5) }`.
All optional; only provided keys are written. **`chapterId` is deliberately not
updatable** — a thread cannot be moved between the feed and a chapter.

**200** `{ "ok": true }`

Errors: `404 Thread not found` (missing, soft-deleted, or invisible chapter
thread) · `403 You can only edit your own threads` (not the author, or the
author is no longer `VERIFIED`) · `403 This thread is locked` (non-admins) ·
`400 One or more tags are invalid`.

Side effects: stamps `editedAt`; if `body` was provided, re-runs `syncMentions`
(attributed to the **thread author**, not the editing admin) and notifies only
newly added mentions.

---

## DELETE /api/threads/:id

**Auth:** `requireAuth` · **Limiter:** `writeLimiter`

Body: none for an author deleting their own thread. When an **admin deletes
someone else's** thread the body is parsed with `adminDeleteSchema` —
`{ reason: string(3..500) }` — and a missing reason is a `400`.

**200** `{ "deleted": true }`

Errors: `404 Thread not found` · `403 You can only delete your own threads`.

Side effects: `softDeleteThread()` — sets `deletedAt` and clears the opening
post's `Mention` rows (so they can never become notifications later). Replies
survive and stay readable. Admin deletion additionally writes one
`ModerationLog` row (`content_deleted`, `targetType: "thread"`,
`detail: { authorId }`); an author deleting their own work writes nothing —
it isn't a moderation action.

---

## POST /api/threads/:id/like

**Auth:** `requireAuth` + `requireVerified` · **Limiter:** `writeLimiter`

No body. Plain toggle — there are no downvotes anywhere in this product.

**200** `{ "liked": true }` (created) or `{ "liked": false }` (removed).

Errors: `404 Thread not found` (missing, deleted, or invisible).

Side effects: on a *new* like only, `notify({ type: "like_thread" })` to the
thread author. **`recomputeThreadHotScore(threadId)` runs on both like and
unlike** — this and reply creation/deletion are the only writes to `hotScore`
after creation.

---

## POST /api/threads/:id/lock

**Auth:** `requireAuth` + `requireAdmin` · **Limiter:** `adminLimiter` (120 / 15 min / IP)

Request — `toggleLockSchema`: `{ reason?: string (max 500) }`. Toggles.

**200** `{ "locked": true }` · Errors: `404 Thread not found`.

Side effect: `ModerationLog` row, `thread_locked` or `thread_unlocked`.

A locked thread rejects new replies and rejects edits to the thread and its
replies from non-admins.

---

## POST /api/threads/:id/pin · DELETE /api/threads/:id/pin

**Auth:** `requireAuth` + `requireAdmin` · **Limiter:** `adminLimiter`

POST request — `pinThreadSchema`: `{ reason?: string (max 500) }`.

**200** `{ "pinnedAt": "2026-07-30T09:12:00.000Z" }` / `{ "pinnedAt": null }`.
Both are idempotent: pinning an already-pinned thread returns its existing
timestamp without a log entry.

Errors: `404 Thread not found` ·
`409 { "error": "3 threads are already pinned — unpin one first so the feed stays readable." }`
— `MAX_PINNED_THREADS = 3`, exported from `packages/shared`, **enforced
server-side** and counted over `{ pinnedAt: { not: null }, deletedAt: null }`.
The cap is global, not per chapter.

Side effect: `ModerationLog` — `thread_pinned` / `thread_unpinned`.

`pinnedAt` is deliberately a separate column from `hotScore`: pinning lifts a
thread without distorting its ranking, and unpinning restores the true order
with nothing to recompute.

---

## Event attendance

### POST /api/threads/:id/attend

**Auth:** `requireAuth` · **Limiter:** `writeLimiter`

Request — `attendEventSchema`: `{ code: string(min 1) }`, compared
`trim().toUpperCase()` against `Thread.eventCode`.

Any signed-in reader of the thread may redeem — attendance records who was in
the room, and a free account can have been in the room. Posting stays
member-only regardless.

**200** `{ "attended": true }` (upsert, idempotent).

Errors: `404 Thread not found` · `400 This isn't an event thread` ·
`400 This event has no attendance code — ask an admin to mark you` ·
`400 That code isn't valid.`

Side effect: `EventAttendee` row with `source: "code"`. No moderation-log entry.

### GET /api/threads/:id/attendees

**Auth:** `requireAuth` + `requireAdmin` · no limiter

**200** `{ "attendees": [{ "user": PublicUser, "source": "code", "createdAt": "…" }] }`,
oldest first, deleted accounts filtered out.

Errors: `404 Thread not found` · `400 This isn't an event thread`.

### POST /api/threads/:id/attendees · DELETE /api/threads/:id/attendees/:userId

**Auth:** `requireAuth` + `requireAdmin` · **Limiter:** `adminLimiter`

POST request — `addEventAttendeeSchema`: `{ userId: string }`.

**201** `{ "attended": true }` / **200** `{ "attended": false }` (DELETE is
idempotent — removing a non-attendee returns `false` without a log entry).

Errors: `404 Thread not found` · `400 This isn't an event thread` (POST only) ·
`404 User not found`.

Side effect: `ModerationLog` — `event_attendee_added` / `event_attendee_removed`,
`targetType: "user"`, `detail: { threadId, threadTitle }`.

---

## POST /api/posts — reply

**Auth:** `requireAuth` + `requireVerified` · **Limiter:** `writeLimiter`

Request — `createPostSchema`:

```json
{ "threadId": "clx9a…", "body": "The asymmetry only bites if…", "parentId": null }
```

`parentId` is `null`/absent for a top-level reply, otherwise the id of a post
**in the same thread**.

**201** `{ "post": { "id": "clxb1…" } }`

Errors, in order:

| Status | Message |
| --- | --- |
| 404 | `Thread not found` — missing, soft-deleted, or invisible chapter thread |
| 403 | `This thread is locked` |
| 403 | `Posting in event threads is for members of the Society. Redeem a membership code in Settings to join the conversation.` |
| 400 | `Invalid parent post` — unknown parent, or a parent in another thread |

The event gate fires only for **main-feed** event threads
(`kind === "event" && !chapterId`) and passes for `isSupporter` or admins. A
chapter event inherits the chapter rule instead — anyone who can see it can
post.

Side effects:

- `syncMentions()` on the body.
- `recomputeThreadHotScore(threadId)` — replies count at half a like's weight.
- Exactly one reply notification: `reply_post` to the parent's author when the
  parent exists and isn't a tombstone, else `reply_thread` to the thread author.
- One `mention` notification per newly created mention, **skipping the reply
  recipient** so nobody gets two notifications for one reply.

---

## PATCH /api/posts/:id

**Auth:** `requireAuth` · **Limiter:** `writeLimiter`

Request — `updatePostSchema`: `{ body: string(1..20000) }` (required).

**200** `{ "ok": true }`

Errors: `404 Post not found` (missing, deleted, or invisible) ·
`403 You can only edit your own replies` (non-author, or author no longer
`VERIFIED`) · `403 This thread is locked` — also returned when the **thread**
is soft-deleted: surviving replies stay readable but are no longer editable.

Side effects: stamps `editedAt`; re-syncs mentions (attributed to the post
author) and notifies only newly added ones.

---

## DELETE /api/posts/:id

**Auth:** `requireAuth` · **Limiter:** `writeLimiter`

Body: `adminDeleteSchema` `{ reason: string(3..500) }` **only** when an admin
deletes someone else's reply.

**200** `{ "deleted": true }` · Errors: `404 Post not found` ·
`403 You can only delete your own replies`.

Side effects: `softDeletePost()` — sets `deletedAt`, clears the post's mentions,
and calls `recomputeThreadHotScore` (the reply no longer counts). The row's
`body` is retained in the database as an audit trail but is **never** sent to
clients once `deletedAt` is set. Admin deletion writes a `content_deleted`
`ModerationLog` row with `detail: { authorId, threadId }`.

---

## POST /api/posts/:id/like

**Auth:** `requireAuth` + `requireVerified` · **Limiter:** `writeLimiter`

No body. Toggle.

**200** `{ "liked": true }` / `{ "liked": false }` · Errors: `404 Post not found`.

Side effect: on a new like only, `notify({ type: "like_post" })` to the post
author. **Post likes do not touch `hotScore`** — the score is a function of
thread likes and reply count only.

---

## POST /api/uploads/image

**Auth:** `requireAuth` + `requireVerified` · **Limiter:** `writeLimiter`

**Not JSON.** Send the raw bytes with
`Content-Type: image/jpeg | image/png | image/webp`; the body parser is
`express.raw({ type: [...], limit: "8MB" })`.

```
POST /api/uploads/image
Authorization: Bearer <jwt>
Content-Type: image/png

<binary>
```

**201**

```json
{ "url": "http://localhost:4000/uploads/post-images/clx8k…-3f9a2b71-1600x1067.jpg",
  "width": 1600, "height": 1067 }
```

The final pixel size is baked into the object key (`…-WxH.jpg`) so clients can
reserve layout space from the URL alone — no layout shift, no extra round trip.

Errors:

| Status | Message |
| --- | --- |
| 415 | `Send the image bytes directly with a Content-Type of image/jpeg, image/png, or image/webp` — empty/non-buffer body (also what a wrong `Content-Type` produces, since `express.raw` then leaves `req.body` as `{}`) |
| 415 | `Only JPEG, PNG, or WebP images are accepted` — sniffed format disagrees with the declared one |
| 400 | `That image is too small to embed` (< 10px on an edge) |
| 400 | `That image's dimensions are too large` (> 10000px on an edge) |
| 400 | `That file doesn't look like a valid image` — sharp threw |
| 413 | payload over 8 MB (from `express.raw`, Express's own HTML error) |

Processing (`sharp`): `.rotate()` bakes EXIF orientation into pixels, resize to
fit within 1600×1600 without enlargement, re-encode as JPEG q85 — the re-encode
is what strips **all** metadata (EXIF, GPS, ICC). Embedded GPS is a real privacy
leak on a real-name forum; the same pipeline runs for avatars.

The MIME allowlist is enforced twice — on the raw parser and against the sniffed
format — so a mislabeled `Content-Type` can't smuggle another file type through.

Storage goes through `storageProvider.put()` (see [`../API.md`](../API.md#providers)).
There is **no moderation of what an image depicts** and no delete route for post
images.
