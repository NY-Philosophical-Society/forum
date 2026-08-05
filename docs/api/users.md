# Users, profiles, accounts & blocking

`apps/api/src/routes/users.ts` (everything under `/api/users`).
Cross-cutting rules: [`../API.md`](../API.md). The admin mutations at the bottom
of this file are also indexed from [`moderation.md`](moderation.md).

---

## GET /api/users/:id/profile

**Auth:** `optionalAuth` · no limiter

Query: `threadsLimit` / `threadsOffset` / `repliesLimit` / `repliesOffset`
(each limit defaults to 10, capped at 50; offsets floored at 0). The two lists
paginate independently.

**200**

```json
{
  "user": PublicUser,
  "threadCount": 12,
  "replyCount": 41,
  "previewOnly": false,
  "threads": [ ThreadSummary ],
  "hasMoreThreads": true,
  "replies": [
    { "id": "clxb1…", "threadId": "clx9a…", "threadTitle": "Is moral luck…",
      "body": "The asymmetry only bites if…", "createdAt": "…", "likeCount": 2 }
  ],
  "hasMoreReplies": false
}
```

Errors: `404 { "error": "User not found" }` — including for soft-deleted
accounts.

Access tiers: anonymous callers get `previewOnly: true`, the header and the two
**counts**, and empty `threads`/`replies` arrays (`hasMore*` forced `false`).
Any account reads the lists in full. This mirrors the thread preview wall.

Chapter content: both the lists **and the counts** are restricted to
`chapterId: null` — main-feed activity only, even for a viewer who could open
the chapter thread. A profile is a public record. Soft-deleted content is
excluded from counts and lists too.

`ThreadSummary` items here carry no `myBookmarked` field.

---

## PATCH /api/users/me

**Auth:** `requireAuth` · **Limiter:** `writeLimiter`

Request — `updateProfileSchema`, every field optional; only provided keys are
written:

| Field | Rule | Notes |
| --- | --- | --- |
| `bio` | string ≤500, nullable | markdown; trimmed, empty string stored as `null` |
| `displayName` | 2..80 | see the verification rule below |
| `directoryVisible` | boolean | member-directory opt-in |
| `directoryBio` | string ≤280, nullable | plain text, not markdown; trimmed, empty → `null` |
| `openToPartners` | boolean | "open to a reading partner / study group" |

**200** `{ "user": PublicUser }` — note `PublicUser` does not carry the
directory fields; read those back from `GET /api/auth/account`.

Errors: `400` validation ·
`403 { "error": "Your display name is the legal name your identity was verified against, so it can't be changed while verified. Contact the Society if your legal name has changed." }`

The display name is the legal name tied to ID verification, so a `VERIFIED`
user cannot change it. The alternative — silently resetting them to
`UNVERIFIED` and stripping posting rights — was rejected. Unverified users may
change it freely. A no-op change (same string) is allowed at any status.

Directory settings can be saved by **any** account, member or not; the
directory query itself is the gate, so a lapsed membership hides the entry
without erasing the choices.

---

## POST /api/users/me/avatar

**Auth:** `requireAuth` · **Limiter:** `writeLimiter`

**Not JSON.** Raw bytes with `Content-Type: image/jpeg | image/png | image/webp`;
parser is `express.raw({ type: [...], limit: "4MB" })`.

**200** `{ "user": PublicUser }` with `avatarUrl` set.

Errors:

| Status | Message |
| --- | --- |
| 415 | `Send the image bytes directly with a Content-Type of image/jpeg, image/png, or image/webp` |
| 415 | `Only JPEG, PNG, or WebP images are accepted` (sniffed format) |
| 400 | `That image is too small — avatars need to be at least 100×100px` |
| 400 | `That image's dimensions are too large` (> 10000px) |
| 400 | `That file doesn't look like a valid image` |

Processing: `.rotate()` (bakes EXIF orientation), `.resize(512, 512, { fit: "cover" })`,
JPEG q85 — the re-encode strips all metadata including GPS. Key is
`avatars/<userId>-<8 hex>.jpg`.

Side effect: the **previous** avatar object is deleted from storage after the
new URL is written (`storageProvider.keyForUrl` → `remove`).

Notably this route is **not** `requireVerified` — an unverified account may set
a photo. There is no review of what an avatar depicts.

## DELETE /api/users/me/avatar

**Auth:** `requireAuth` · **Limiter:** `writeLimiter`

**200** `{ "user": PublicUser }` with `avatarUrl: null`; the stored object is
removed. Clients fall back to initials.

---

## GET /api/users?search=

**Auth:** `requireAuth` · no limiter

Backs "start a new DM" and the composer's `@mention` autocomplete.

**200** `{ "users": PublicUser[] }` — max 20, no pagination, no `total`.
An empty or whitespace-only `search` returns `{ "users": [] }` without querying.

Matching is `displayName contains <search>` (SQLite `LIKE`, case-insensitive
for ASCII). Excluded: the caller themself, deleted accounts, and **anyone with
a block in either direction** — a blocked pair can't DM anyway, and offering
them as a mention target would create the notification the block exists to
prevent. Banned accounts are *not* excluded.

---

## DELETE /api/users/me — delete your account

**Auth:** `requireAuth` · **Limiter:** `authLimiter`

Request — `deleteAccountSchema`:

```json
{ "password": "correct-horse-battery", "confirm": "DELETE" }
```

`confirm` must be the literal string `"DELETE"` (*'Type "DELETE" to confirm'*).
`password` is required whenever the account has a `passwordHash`; OAuth-only
accounts rely on the typed confirmation alone.

**200** `{ "deleted": true }`

Errors: `400 Enter your password to delete your account` ·
`401 Password is incorrect`.

Side effects — **anonymization, not erasure.** The row survives with:

```
displayName: "[deleted]"
email:       "deleted-<id>@deleted.invalid"   (frees the real address for reuse)
passwordHash / googleId / appleId / avatarUrl / bio: null
verificationStatus: "UNVERIFIED", role: "user", isSupporter: false
directoryVisible: false, directoryBio: null, openToPartners: false
deletedAt: now
```

plus: the avatar object is deleted from storage, all `PushToken` rows are
deleted, and all `Notification` rows *received* by the user are deleted.

Threads, replies, and messages stay readable under `[deleted]` so other
people's conversations don't get holes blown in them. `deletedAt` makes the
account unable to log in (`requireAuth` and `login` both reject it). Whether
this satisfies a legal erasure request is an open compliance question.

---

## GET /api/users/me/export

**Auth:** `requireAuth` · no limiter

Sets `Content-Disposition: attachment; filename="nyps-forum-export.json"`.

**200** — `DataExport` from `packages/shared`:

```json
{
  "exportedAt": "2026-07-30T15:00:00.000Z",
  "account": { "id": "…", "email": "…", "displayName": "…", "bio": null,
               "avatarUrl": null, "verificationStatus": "VERIFIED",
               "isSupporter": true, "createdAt": "…" },
  "threads":  [{ "id": "…", "title": "…", "body": "…", "createdAt": "…" }],
  "posts":    [{ "id": "…", "threadId": "…", "body": "…", "createdAt": "…" }],
  "messagesSent":     [{ "id": "…", "recipientId": "…", "body": "…", "createdAt": "…" }],
  "messagesReceived": [{ "id": "…", "senderId": "…", "body": "…", "createdAt": "…" }]
}
```

Unpaginated and includes soft-deleted content (the `where` is `authorId` only).
Notifications, bookmarks, likes, reports, and chapter memberships are **not**
included — extend this before claiming GDPR/CCPA completeness.

---

## Blocking

Blocking prevents **new DMs in either direction**. It does not hide existing
message history, threads, or replies — that is what reporting is for.

### POST /api/users/:id/block

**Auth:** `requireAuth` · **no limiter**

No body. Upsert, idempotent.

**201** `{ "blocked": true }` · Errors: `400 { "error": "You can't block yourself" }` ·
`404 { "error": "User not found" }` (the lookup does not exclude deleted accounts).

### DELETE /api/users/:id/block

**Auth:** `requireAuth` · **200** `{ "blocked": false }`. Deleting a
non-existent block is silently fine.

### GET /api/users/:id/block

**Auth:** `requireAuth` · **200** `{ "blocked": true | false }` — whether the
**caller** blocks that user (one direction only).

Downstream effects of a `Block` row, in either direction:

- `POST /api/messages` → `403 { "error": "You can't message this user" }`
- `notify()` drops the notification (except `warning`)
- `syncMentions()` skips the mention, so no `Mention` row is written
- `GET /api/users?search=` omits the user

---

## Moderation (admin) — mutations on a member

All five require `requireAuth` + `requireAdmin` and carry `adminLimiter`
(120 / 15 min / IP). All five write exactly one `ModerationLog` row through
`logModeration()`. Reasons are validated by
`moderationReason = z.string().min(3, "Say why — this goes in the moderation log").max(500)`.

### POST /api/users/:id/ban

Request — `banUserSchema`: `{ reason: <moderationReason> }` — **mandatory**.

**200** `{ "user": PublicUser }` · Errors: `400 You can't ban yourself` ·
`404 User not found` (missing or deleted) · `400` missing/short reason.

Sets `bannedAt` (idempotent: an existing `bannedAt` is preserved). **Takes
effect on the existing session immediately** — `requireAuth` re-reads the row
and 403s — so no token revocation is needed. Log: `user_banned`.

### POST /api/users/:id/unban

Request — `unbanUserSchema`: `{ reason?: string ≤500 }` — optional, since
unbanning restores access rather than removing it.

**200** `{ "user": PublicUser }`. Clears `bannedAt`. Log: `user_unbanned`.

### POST /api/users/:id/warn

Request — `warnUserSchema`: `{ reason: <moderationReason> }`. **The reason is
delivered to the member verbatim** as the notification's snippet — write it as
something a person should read.

**200** `{ "warned": true }` · Errors: `400 You can't warn yourself` ·
`404 User not found`.

Side effects: `notify({ type: "warning" })` — the one notification type that
bypasses preferences, blocks, and ban state, because the member has to be able
to read why. Log: `user_warned`.

### POST /api/users/:id/role

Request — `setUserRoleSchema`: `{ role: "user" | "admin", reason: <moderationReason> }`.

**200** `{ "user": PublicUser }` — returned unchanged, with no log entry, if the
role already matches.

Errors: `404 User not found` ·
`400 { "error": "This is the last admin account — promote someone else first, or the forum is left with no moderators." }`
— demotion is refused when `count(role: "admin", deletedAt: null) <= 1`,
including self-demotion. An empty admin role locks the Society out of its own
moderation tools with no in-product way back (there is no admin bootstrap; the
first admin is promoted by direct DB access).

Log: `role_granted` / `role_revoked`, `detail: { from, to }`.

### POST /api/users/:id/supporter

Request — `setSupporterSchema`: `{ isSupporter: boolean, reason: <moderationReason> }`.

For people who donate outside whatever payment integration eventually exists.
The `WISDOMKEY` code path is unaffected.

**200** `{ "user": PublicUser }`. `supporterSince` keeps its original value on a
re-grant and is cleared to `null` on revoke. Revoking does **not** cascade into
chapter memberships. Log: `supporter_granted` / `supporter_revoked`.
