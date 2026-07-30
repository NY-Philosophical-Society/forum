# Reports, admin dashboard & the moderation log

`apps/api/src/routes/reports.ts` · `admin.ts` · `apps/api/src/lib/moderation.ts` ·
`lib/moderation-log.ts`
Cross-cutting rules: [`../API.md`](../API.md).

Mutations live with the resource they change, not here — banning a member is
`POST /api/users/:id/ban` ([`users.md`](users.md#moderation-admin--mutations-on-a-member)),
locking/pinning/deleting a thread is under `/api/threads`
([`content.md`](content.md)). `/api/admin/*` is the **read side only**.

---

## The moderation log invariant

Every admin mutation in the API writes exactly one `ModerationLog` row through
`logModeration()` in `apps/api/src/lib/moderation-log.ts`. One helper rather
than an inline `prisma.create` per endpoint, so adding a moderation route and
forgetting the audit record takes a deliberate omission rather than an
oversight.

- **Append-only by construction.** There is no POST, PATCH, or DELETE for this
  resource anywhere in the API, and no code path updates or deletes a row. Keep
  it that way: it is the record a nonprofit board relies on to reconstruct what
  happened, so it cannot be editable by the people it holds accountable.
- **It does not swallow errors** (unlike `notify()`). A moderation action whose
  audit record failed to write must fail loudly — a 500 is the correct outcome,
  not a completed-but-unrecorded ban.
- `targetLabel` is captured **at action time** (thread title, member name) so
  the entry still reads sensibly after the target is deleted or renamed.
  `contentLabel(text, max = 80)` collapses whitespace and truncates with `…`.
- `detail` is a JSON string of action-specific extras
  (`{ reportId }`, `{ authorId, threadId }`, `{ chapterId, chapterSlug }`,
  `{ from, to }`, `{ threadId, threadTitle }`).
- Actions never claim something that didn't happen: resolving a report whose
  content is *already* deleted closes the report without logging a deletion.

The vocabulary is `ModerationAction` in `packages/shared/src/schemas.ts`:

```
chapter_created · chapter_member_added · chapter_member_approved · chapter_member_removed
event_attendee_added · event_attendee_removed
report_resolved · report_dismissed · content_deleted
user_warned · user_banned · user_unbanned
thread_locked · thread_unlocked · thread_pinned · thread_unpinned
role_granted · role_revoked · supporter_granted · supporter_revoked
```

`MODERATION_ACTION_LABELS` gives the UI strings;
`DESTRUCTIVE_MODERATION_ACTIONS` marks the five the UI renders in `--danger`.
`targetType` is one of `user | thread | post | report | chapter`.

---

## POST /api/reports

**Auth:** `requireAuth` + `requireVerified` · **Limiter:** `writeLimiter`

Request — `createReportSchema`:

| Field | Rule |
| --- | --- |
| `targetType` | `"thread" \| "post" \| "message" \| "user"` |
| `targetId` | string |
| `category` | `harassment \| spam \| off_topic \| misinformation \| impersonation \| other` — required, *"Choose a reason for this report"* |
| `note` | optional free text, ≤1000 |

```json
{ "targetType": "post", "targetId": "clxb1…", "category": "harassment",
  "note": "Repeated personal attacks in this reply." }
```

**201** `{ "report": { "id": "clxr…" } }` · Errors: `400` validation only.

Side effects: none — no notification, no log entry. Filing a report is not a
moderation action.

Storage quirk to preserve: the column is `Report.reason` but the API and both
clients call it **`note`**. The column kept its name so rows filed before
categories existed carry their original text through unchanged (they were
migrated to `category: "other"`).

`targetId` is a **bare id, not a foreign key** — nothing validates that the
target exists, at report time or ever. That is why every read path has to
handle a `missing` target.

---

## GET /api/reports — the admin queue

**Auth:** `requireAuth` + `requireAdmin` · **no limiter** (the dashboard polls it)

Query: `status` ∈ `open | resolved | dismissed` (default `open`, unknown →
`open`), `category` (one of the six, unknown → no filter), `limit` (≤100,
default 20), `offset`.

**200**

```json
{
  "reports": [
    {
      "id": "clxr…",
      "reporter": PublicUser,
      "targetType": "post",
      "targetId": "clxb1…",
      "category": "harassment",
      "note": "Repeated personal attacks in this reply.",
      "status": "open",
      "createdAt": "2026-07-29T22:10:00.000Z",
      "resolvedBy": null,
      "resolvedAt": null,
      "resolutionAction": null,
      "resolutionNote": null,
      "target": {
        "kind": "post",
        "threadId": "clx9a…",
        "postId": "clxb1…",
        "title": "Is moral luck a coherent notion?",
        "body": "<the reported markdown>",
        "author": PublicUser,
        "createdAt": "…",
        "deleted": false,
        "locked": false,
        "missing": false
      }
    }
  ],
  "total": 2, "limit": 20, "offset": 0, "hasMore": false, "openCount": 2
}
```

`openCount` is open reports overall regardless of the current filter — it drives
the nav badge. `reporter` is `null` if that account has since been deleted.

`target` is resolved by `loadReportTarget()`:

| `kind` | `title` | `body` |
| --- | --- | --- |
| `thread` | thread title (`"[deleted]"` if tombstoned) | thread body, `null` if deleted |
| `post` | the **thread's** title | post body, `null` if deleted |
| `message` | `"Direct message"` | the message body |
| `user` | display name (`"[deleted]"`) | the user's bio |

`missing: true` (with every other field null/false) means the target has been
hard-deleted or never existed. Soft-deleted content is still returned, marked
`deleted: true`, with the author tombstoned as `DELETED_AUTHOR` — the record of
what was reported matters after it's gone.

Performance: one `loadReportTarget()` query per row (N+1). Fine for a queue
page, worth batching if the queue ever gets long.

---

## POST /api/reports/:id/resolve

**Auth:** `requireAuth` + `requireAdmin` · **Limiter:** `adminLimiter`

Request — `resolveReportSchema`:

```json
{ "action": "delete_content", "reason": "Personal attacks; removed under the conduct policy." }
```

`action` ∈ `no_action | delete_content | warn_author | ban_author | lock_thread`.
`reason` is **mandatory** (3..500) — for `warn_author` it is also the text the
member reads.

**Deliberately not two endpoints.** The action runs and the report closes in the
same call, so a report that says "banned the author" cannot exist without the
ban having run.

**200** `{ "report": { "id": "clxr…", "status": "resolved" } }`

Errors:

| Status | Message |
| --- | --- |
| 404 | `Report not found` |
| 409 | `That report has already been closed` |
| 404 | `The reported thread no longer exists` / `The reported reply no longer exists` |
| 400 | `Direct messages can't be deleted by an admin — warn or ban the sender instead.` |
| 400 | `There's no content to delete on a member report — warn or ban them instead.` |
| 404 | `The reported member no longer exists` |
| 400 | `You can't ban yourself` |
| 400 | `That report doesn't point at a thread to lock` |
| 404 | `The thread no longer exists` |

Per-action behaviour:

- **`no_action`** — closes the report, nothing else runs.
- **`delete_content`** — thread → `softDeleteThread()`; post → `softDeletePost()`.
  Skipped (no second deletion, no log entry) if already deleted. Logs
  `content_deleted` with `detail: { reportId, authorId }`.
- **`warn_author`** — `notify({ type: "warning", snippet: reason })` to the
  author resolved from the target; logs `user_warned`.
- **`ban_author`** — sets `bannedAt` unless already set; logs `user_banned`.
  The log entry is written even when the user was already banned.
- **`lock_thread`** — thread target → itself; post target → its thread; anything
  else → 400. Skipped if already locked. Logs `thread_locked`.

Then, always: the `Report` row gets `status: "resolved"`, `resolvedById`,
`resolvedAt`, `resolutionAction`, `resolutionNote`, **and** a second
`ModerationLog` row `report_resolved` (`targetType: "report"`,
`detail: { action, targetType, targetId }`). So a resolve with an action writes
**two** log rows.

The whole sequence is a series of separate writes, **not a transaction** — a
failure midway can leave the action applied with the report still open.

---

## POST /api/reports/:id/dismiss

**Auth:** `requireAuth` + `requireAdmin` · **Limiter:** `adminLimiter`

Request — `dismissReportSchema`: `{ reason?: string ≤500 }` — optional here,
since dismissing takes nothing away.

**200** `{ "report": { "id": "clxr…", "status": "dismissed" } }`

Errors: `404 Report not found` · `409 That report has already been closed`.

Side effects: sets `status: "dismissed"`, `resolvedById`, `resolvedAt`,
`resolutionNote` (`resolutionAction` stays `null`); logs `report_dismissed`.
The reported content is untouched.

---

## GET /api/admin/users

**Auth:** `requireAuth` + `requireAdmin` (applied via `adminRouter.use(...)` to
every `/api/admin` route) · no limiter

Query: `search` (matches `displayName` OR `email`, substring), `role` ∈
`user|admin`, `verification` ∈ `UNVERIFIED|PENDING|VERIFIED|REJECTED`,
`banned=1`, `supporter=1`, `limit` (≤100, default 25), `offset`.
Unrecognised values for `role`/`verification` are ignored rather than erroring.

**200**

```json
{
  "users": [
    { "id": "clx8k…", "displayName": "Ada Lovelace", "email": "ada@example.org",
      "avatarUrl": null, "verificationStatus": "VERIFIED", "role": "user",
      "isSupporter": true, "bannedAt": null, "deletedAt": null,
      "createdAt": "…", "threadCount": 12, "replyCount": 41, "openReportCount": 0 }
  ],
  "total": 38, "limit": 25, "offset": 0, "hasMore": true, "adminCount": 2
}
```

Newest account first. **This is the only endpoint that exposes other members'
email addresses.** `threadCount`/`replyCount` exclude soft-deleted content but
do **not** exclude chapter content (unlike the public profile).
`openReportCount` counts open reports filed **directly against the member**
(`targetType: "user"`) — reports about their content are counted in the queue,
not here. `adminCount` drives the UI's greyed-out last-admin demote; the guard
itself is enforced in `POST /api/users/:id/role`.

---

## GET /api/admin/threads

**Auth:** `requireAuth` + `requireAdmin` · no limiter

Query: `search` (title substring), `pinned=1`, `locked=1`, `deleted=1`,
`limit` (≤100, default 25), `offset`. Deleted threads are **hidden by default**
(`deletedAt: null`) but reachable with `deleted=1`, since an admin may need to
confirm a removal actually happened.

**200**

```json
{
  "threads": [
    { "id": "clx9a…", "title": "…", "author": PublicUser, "createdAt": "…",
      "locked": false, "pinnedAt": null, "deleted": false,
      "likeCount": 7, "postCount": 12 }
  ],
  "total": 43, "limit": 25, "offset": 0, "hasMore": true,
  "pinnedCount": 1, "pinLimit": 3
}
```

Ordered `[{ pinnedAt: desc }, { createdAt: desc }]`. `pinLimit` is
`MAX_PINNED_THREADS` from `packages/shared`. **Chapter threads are included**
here — this listing has no `chapterId` filter, which is consistent with admins
bypassing chapter gating everywhere else.

---

## GET /api/admin/log — the moderation log

**Auth:** `requireAuth` + `requireAdmin` · no limiter

Query: `action` (exact `ModerationAction` string), `targetId` (exact),
`limit` (≤200, default 50), `offset`. Newest first.

**200**

```json
{
  "entries": [
    { "id": "clxl…", "actor": PublicUser, "action": "user_banned",
      "targetType": "user", "targetId": "clx7j…", "targetLabel": "Some Member",
      "reason": "Repeated personal attacks after a warning.",
      "createdAt": "2026-07-29T22:31:04.000Z" }
  ],
  "total": 214, "limit": 50, "offset": 0, "hasMore": true
}
```

`actor` is `null` when the acting admin's account has since been deleted — the
action still happened. `detail` is stored but **not** returned by this
endpoint; read it from the database if you need it.

This is the only route for this resource. There is no write, edit, or delete
counterpart, by design — `apps/api/src/routes/admin.test.ts` has a test that
asserts it (`"is read-only — no route writes, edits, or deletes an entry"`).
Keep that test.
