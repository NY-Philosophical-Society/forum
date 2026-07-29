# 05 — Notifications, search, bookmarks

> Read `docs/prompts/README.md` first. Requires briefs 01–04 — mention
> notifications depend on the `Mention` model from 03, and every list here must
> respect the chapter visibility rules from 04.

## Goal

Nothing currently tells anyone that anything happened. You reply to someone and
they find out only if they happen to return to the thread. This brief closes the
loop.

## 1. In-app notifications

Build this first — push (part 2) is a delivery channel for the same events.

**Trigger on:** a reply to your thread · a reply to your reply · a like on your
thread or reply · a new DM · an `@mention` of you (using the structural `Mention`
records from brief 03) · your join request to a chapter being approved (brief 04).

Requirements:

- A notification bell / tab with an unread count, on web and mobile
- Notification list: actor (with avatar), what happened, a snippet, relative time,
  read/unread state
- Tapping one deep-links to the exact thing — the specific reply, not just the
  thread
- Mark one read, mark all read
- **Never notify someone about their own action.** Liking your own post, replying
  to yourself — no notification.
- Respect blocks in both directions
- Respect chapter visibility — never surface a notification about content the
  recipient can't see
- Collapse repetition sensibly: "3 people liked your reply", not three rows

Notification preferences in Settings, per type, with a master toggle.

## 2. Push notifications (mobile)

**This needs credentials you can't create.** Use the established provider pattern:
build against Expo's push service, gate the real path behind env vars, ship a
no-op/log-only stub so local development works with zero setup, and document the
setup in the file's top comment and `apps/api/.env.example`.

Requirements:

- Register the device push token on login; clear it on logout
- Ask for permission at a sensible moment — not cold on first launch
- Respect the same per-type preferences as in-app notifications
- Deep-link from a push into the right screen
- Badge count on the app icon

Tell the user plainly in your summary that shipping real push requires an Apple
Developer account with an APNs key (and FCM for Android), and that it can't be
tested end-to-end without it.

## 3. Search

Search across **threads, replies, and users**.

- One search entry point — web nav, and mobile within the Feed tab
- Result types visually distinguished; each links to the right destination
- Paginated, using the existing pagination conventions
- **Must respect access rules**: no chapter content for non-members, and no full
  thread bodies for non-supporters (brief 04). Search is a common place to leak
  gated content — audit it deliberately.
- Highlight matched terms in results
- A designed empty state for no results, using the `EmptyState` component

Implementation note: SQLite in development, Postgres in production. Don't paint
yourself into a `LIKE '%term%'` corner that can't be swapped for real full-text
search later — keep the query logic behind a small module with a documented
upgrade path.

## 4. Bookmarks

- Save/unsave a thread from the feed and from the thread page
- A "Saved" list, reachable from the profile area
- Saving a chapter thread you later lose access to must not leak it back

## API work

- `Notification` model (recipient, actor, type, target, `readAt`) with an index on
  `(recipientId, readAt)` — this table grows fastest of anything in the app
- `GET /api/notifications` (paginated) · `POST /api/notifications/read` ·
  `POST /api/notifications/read-all` · unread count
- `NotificationPreference` per user per type
- `PushToken` model; registration and deregistration endpoints
- `GET /api/search?q=&type=` respecting supporter and chapter gating
- `Bookmark` model; save/unsave/list endpoints
- Emit notifications from the existing create paths (reply, like, message, mention,
  chapter approval) — ideally through one `notify()` helper rather than scattered
  inline creates, so the block/visibility rules live in exactly one place

## Out of scope

Email notifications and digests · real-time/websocket delivery (polling is fine —
the nav already polls for unread DMs) · saved searches · following users or tags.

## Acceptance

Standard bar from `README.md`, plus:
- Trigger each notification type with two accounts and confirm each arrives,
  deep-links correctly, and marks read.
- Confirm no self-notifications, and that a blocked user generates none.
- Search as an anonymous user, a non-supporter, a supporter, and a chapter
  non-member — confirm no gated content appears in any result set.
- Confirm push degrades gracefully with no credentials configured (stub path, no
  crash, no error surfaced to the user).
