# Chapters & the member directory

`apps/web/src/server/routes/chapters.ts` · `directory.ts` · `apps/web/src/server/chapter-access.ts`
Product decisions: `docs/MEMBERSHIP.md`. Cross-cutting rules: [`../API.md`](../API.md).

---

## The chapter access rule

One module owns it — `apps/web/src/server/chapter-access.ts` — and every gate in
the API calls into it. Rebuild it as one module too.

```
isActiveChapterMember(userId, chapterId)  -> ChapterMembership with state === "active"
canViewThread(viewer, thread)             -> true if thread.chapterId is null;
                                             else viewer must exist and be an
                                             admin or an active member
visibleThreadWhere(viewer)                -> Prisma `where` fragment: {} for admins,
                                             { chapterId: null } for anonymous,
                                             else chapterId null OR active membership
```

Invariants:

- **`state` is checked, never mere row existence.** A `pending` request grants
  nothing at all.
- **Admins bypass member gating** — moderating must never require donating. The
  seeded demo admin is deliberately not a supporter, which is what proves it.
- **Probes return 404, not 403**, on every route that takes a thread/post id, so
  an outsider cannot confirm that a chapter thread exists.
- Two membership tiers stack: `requireMember` (Society member — sees that
  chapters exist, may request to join) then *active chapter membership* (sees
  the chapter's contents).

Where chapter content is suppressed, and how:

| Surface | Rule |
| --- | --- |
| `GET /api/threads` (main feed) | `chapterId: null` always — for everyone, admins included |
| `GET/PATCH/DELETE /api/threads/:id`, `POST /:id/like`, `/attend` | `canViewThread` → 404 |
| `POST /api/posts`, `PATCH/DELETE /api/posts/:id`, `POST /:id/like` | `canViewThread` → 404 |
| `GET /api/search` (`lib/search.ts`) | chapter threads and their posts excluded **for everyone**, members included — snippets are exactly how gated content leaks |
| `POST /api/bookmarks` | `canViewThread` → 404 |
| `GET /api/bookmarks` | `visibleThreadWhere` at read time; the bookmark row is kept, so re-joining restores it |
| `GET /api/notifications` | `visibleThreadWhere` at read time (defense in depth) |
| `notify()` (`lib/notifications.ts`) | emission-time gate: no row is created for a recipient who can't open the thread |
| Membership removal | purges the leaver's notifications about that chapter's threads |
| `GET /api/users/:id/profile` | lists main-feed activity only — counts included. A profile is a public record |
| `GET /api/tags` | counts `deletedAt: null, chapterId: null` |

---

## GET /api/chapters

**Auth:** `requireAuth` + `requireMember` · no limiter

**200**

```json
{
  "chapters": [
    {
      "id": "clxc1…",
      "slug": "nyc",
      "name": "New York City",
      "description": "The founding chapter. Monthly readings in Manhattan.",
      "location": "New York, NY",
      "createdAt": "2026-07-30T14:45:26.000Z",
      "memberCount": 6,
      "myMembership": "active",
      "pendingCount": 1
    }
  ]
}
```

Ordered by `name`. `memberCount` counts `state: "active"` only.
`myMembership` is `"none" | "pending" | "active"`.
`pendingCount` is **present for admins only** (one grouped query covers all
rows).

Non-members get `403 { "error": "This area is for members of the Society. Redeem a membership code in Settings to join." }`
— the clients render the membership pitch off that, rather than off any data.

---

## POST /api/chapters

**Auth:** `requireAuth` + `requireAdmin` · **Limiter:** `adminLimiter`

Chapters are admin-created, never self-serve.

Request — `createChapterSchema`:

| Field | Rule |
| --- | --- |
| `name` | 2..80 — *"Give the chapter a name"* |
| `slug` | optional, 2..60, `/^[a-z0-9]+(-[a-z0-9]+)*$/`; derived from `name` when absent |
| `description` | 1..300 — *"Say what this chapter is"* |
| `location` | optional, max 80 |

Slug derivation: lowercase → NFKD → strip combining marks → non-alphanumerics
to `-` → trim leading/trailing `-` → first 60 chars.

**201** `{ "chapter": ChapterSummary }` (`memberCount: 0`, `myMembership: "none"`,
`pendingCount: 0`).

Errors: `400 Could not derive a slug from that name — provide one` ·
`409 A chapter with the slug "nyc" already exists`.

Side effect: `ModerationLog` — `chapter_created`, `targetType: "chapter"`.

There is no update or delete route for a chapter.

---

## GET /api/chapters/:slug

**Auth:** `requireAuth` + `requireMember`

**200** `{ "chapter": ChapterSummary }` — same shape as the list entry.
`404 Chapter not found` otherwise. Society members can see a chapter's door
(name, description, member count) without being in it; that is deliberate.

---

## GET /api/chapters/:slug/threads — the chapter feed

**Auth:** `requireAuth` + `requireMember` + **active membership** (or admin)

Query: `sort` (`hot` default / `new`), `limit` (≤100, default 20), `offset`.
Deliberately the **same shape as `GET /api/threads`** so both clients reuse
their feed components unchanged; each item additionally carries
`chapter: { id, slug, name }`.

`where` is `{ deletedAt: null, chapterId: <this chapter> }`, ordered
`[{ pinnedAt: desc }, <sort>]`.

**200** `{ threads: ThreadSummary[], total, limit, offset, hasMore }`.

Errors: `404 Chapter not found` ·
`403 { "error": "You're not a member of this chapter yet" }` — a Society member
who isn't in this chapter, or whose request is still pending.

Note the deliberate asymmetry: the chapter *door* 403s (you're told the chapter
exists — you can see it in the directory anyway), while a chapter *thread id*
404s.

---

## POST /api/chapters/:slug/join

**Auth:** `requireAuth` + `requireMember` · **Limiter:** `writeLimiter`

No body. Creates a `pending` membership; an admin approves it.

**201** `{ "state": "pending" }` · **200** `{ "state": "pending" | "active" }`
when a membership already exists (idempotent — the existing state is returned
as-is and nothing is written).

Errors: `404 Chapter not found`.

No notification is emitted to admins — the admin UI polls `pendingCount`
instead. Worth fixing when you rebuild.

---

## GET /api/chapters/:slug/members

**Auth:** `requireAuth` + `requireMember` + **active membership** (or admin)

**200**

```json
{
  "members": [{ "user": PublicUser, "state": "active", "createdAt": "…" }],
  "pending": [{ "user": PublicUser, "state": "pending", "createdAt": "…" }]
}
```

`pending` is **admin-only** — it is absent from the response entirely for
non-admins, and the underlying query filters to `state: "active"` for them so
pending rows never leave the database. Deleted accounts are filtered out of
both lists. Ordered oldest first.

Errors: `404 Chapter not found` · `403 You're not a member of this chapter yet`.

---

## POST /api/chapters/:slug/members

**Auth:** `requireAuth` + `requireAdmin` · **Limiter:** `adminLimiter`

Request — `addChapterMemberSchema`: `{ userId: string }`. Lands **active**
immediately, skipping the request step (upsert, so it also promotes a pending
row).

**201** `{ "state": "active" }`

Errors: `404 Chapter not found` · `404 User not found` (missing or deleted).

Side effect: `ModerationLog` — `chapter_member_added`, `targetType: "user"`,
`detail: { chapterId, chapterSlug }`.

---

## POST /api/chapters/:slug/members/:userId/approve

**Auth:** `requireAuth` + `requireAdmin` · **Limiter:** `adminLimiter`

No body. Flips `pending` → `active` and stamps `approvedAt`.

**200** `{ "state": "active" }` — also returned, without a log entry, when the
membership is already active.

Errors: `404 Chapter not found` · `404 { "error": "No join request from that user" }`.

Side effect: `ModerationLog` — `chapter_member_approved`.

---

## DELETE /api/chapters/:slug/members/:userId

**Auth:** `requireAuth` · **Limiter:** `writeLimiter` ·
admins may remove anyone; a member may remove **only themselves** (leave, or
withdraw a pending request).

**200** `{ "removed": true }` · `{ "removed": false }` when there was no
membership.

Errors: `404 Chapter not found` ·
`403 { "error": "Only admins can remove other members" }`.

Side effects:

- Deletes the `ChapterMembership` row.
- **Purges** `Notification` rows where `recipientId = target` and the
  notification's thread belongs to this chapter — so the unread badge can never
  point at content the user can no longer open. This is what lets
  `GET /api/notifications/unread-count` stay a bare indexed COUNT with no join.
- `ModerationLog` — `chapter_member_removed` — **only** when an admin removes
  someone else. Leaving on your own is not a moderation action.

Note: revoking `isSupporter` does **not** cascade into chapter memberships;
admins remove members explicitly. The chapter routes all sit behind
`requireMember`, so a lapsed member loses access to the routes anyway.

---

## GET /api/directory — the member directory

**Auth:** `requireAuth` + `requireMember` · no limiter

Query: `q` (matches `displayName` OR `directoryBio`, substring), `partners=1|true`
(narrows to `openToPartners`), `limit` (≤100, default 30), `offset`.

The `where` is the whole access rule, and all four conditions are mandatory:

```
{ deletedAt: null, bannedAt: null, isSupporter: true, directoryVisible: true }
```

**An entry appears only while the user has opted in AND is a current member.**
A lapsed membership hides the entry automatically without erasing the user's
saved settings.

**200**

```json
{
  "entries": [
    {
      "user": PublicUser,
      "directoryBio": "Kant, phenomenology, and the history of logic.",
      "openToPartners": true,
      "chapters": [{ "id": "clxc1…", "slug": "nyc", "name": "New York City" }]
    }
  ],
  "total": 4, "limit": 30, "offset": 0, "hasMore": false
}
```

Ordered by `displayName`. `chapters` lists **active** memberships only.

"Reading-partner matching" is exactly this filter — a flag and a search, not an
algorithm. Members take it from there by DM. Do not build a matcher without
asking.

The three directory fields are written through
[`PATCH /api/users/me`](users.md#patch-apiusersme); any account may save them
(they are the user's own preferences) — this query is the gate.
