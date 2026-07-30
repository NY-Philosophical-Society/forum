# Run report — membership: chapters, directory, matching, event threads

Run of 2026-07-30, on `main` (no branch, per standing instructions). This run
implements the replacement brief for `docs/prompts/04-access-chapters.md` —
Part 1 of that file (supporter-gated reading) was **not** implemented, per the
owner decision recorded in `docs/MEMBERSHIP.md`. No existing tier lost any
capability.

## What landed, by commit

1. `bc87659` — **API: chapters.** `Chapter` + `ChapterMembership`
   (pending/active) models, `Thread.chapterId`, the `/api/chapters` routes
   (directory, per-chapter feed, join request, admin approve/add/remove), and
   the full visibility audit: main feed, thread detail/edit/delete/like,
   replies and reply likes, search (chapter content excluded for everyone),
   bookmarks (read-time filter + save gate), notifications (emission gate in
   `notify()`, read-time filter, purge on membership removal), public
   profiles (main-feed activity only), and tag counts. Probes get 404, not
   403, so ids can't be confirmed. Admins bypass member gating everywhere.
   13-test tier matrix in `chapters.test.ts`.
2. `d9feb28` — **API: directory, matching, events.**
   `User.directoryVisible/directoryBio/openToPartners` + member-only
   `GET /api/directory` (name/interest search, `partners=1` filter);
   `Thread.kind/eventDate/eventCode` + `EventAttendee`; admin-only event
   creation, member-only posting in main-feed events, `?kind=` feed split,
   per-event attendance codes (WISDOMKEY pattern) + admin attendee marking
   with moderation-log entries. 9 more tests.
3. `94d32b5` — **Seed.** NYC chapter (4 active members, 1 pending request),
   a chapter-only thread, 8 supporters, 6 directory opt-ins (3 open to
   partners), and a past event thread with pre-event questions, the
   post-event topics/recording/transcript drop, continuing replies, and 5
   attendees (code `MEWS-1124`).
4. `b9101bc` — **Web UI.** Shared `ThreadCard` extracted and reused by the
   main feed, chapter feeds (`/c/[slug]`), and the events grouping; chapter
   directory (`/chapters`) with join-state buttons; membership pitch page
   (`/membership`) rendered wherever a non-member meets a member space;
   admin **Chapters** tab (create, approve/reject, add/remove with logged
   reasons); member directory (`/directory`) with search + partners filter +
   Message link; Settings directory opt-in card with explicit
   what-becomes-visible copy; events strip on the feed; event panel on the
   thread page (date, attendance, code redemption, admin code display,
   attendee management); was-there markers; member-gated composer notice.
   New-thread page gains chapter context and the admin event section.
5. `fb4078e` — **Mobile UI.** Shared `ThreadCard` component; chapters nested
   under the Feed tab (strip on Home → Chapters directory → chapter feed
   with door states); membership pitch for non-members; member directory
   under the Profile tab with partners filter and DM jump; event panel +
   was-there markers + member-gated notice on the thread screen; Settings
   directory opt-ins and Membership retitle.
6. (this commit) — README refresh, this report.

## Deliberately narrowed / skipped

- **Admin tooling on mobile** (chapter management, event creation, attendee
  marking) — web-only, consistent with the existing "mobile moderation is the
  report queue only" stance.
- **No notification on chapter join requests.** Admins see pending counts in
  the chapters directory and admin tab instead. Adding a notification type
  means touching both clients' renderers; deferred.
- **Search excludes chapter content entirely — even for that chapter's own
  members.** The brief's flat "never in search" read. Per-viewer search
  inside a chapter would need viewer-scoped queries in `lib/search.ts`; the
  backend engineer may want to revisit.
- **Event fields are immutable after creation** (no PATCH for
  `eventDate`/`eventCode`). Admins can delete and recreate; skeleton scope.
- **Pin cap (3) stays global**, not per-chapter — pinned chapter threads pin
  within their chapter feed only, but count against the same cap.
- The events strip on web/mobile shows the latest 4 events with no dedicated
  "all events" page — `?kind=event` supports pagination when one is wanted.

## Assumptions made at ambiguities

- **404 over 403** for chapter content probed by non-members (the brief
  allowed either); 403 is used only where the viewer legitimately knows the
  thing exists (chapter feed for a not-yet-approved member, member-only
  routes for non-members).
- **Chapter access follows the membership row, not live `isSupporter`.**
  Revoking supporter status does not cascade into chapter memberships —
  admins remove members explicitly. A lapsed member with an active chapter
  membership keeps reading that chapter (but loses the chapters directory
  and member directory, which check `isSupporter` live).
- **Anyone signed in may redeem an event attendance code** — a free account
  can have been in the room; attendance records presence, posting stays
  member-only regardless.
- **Likes in event threads stay verification-gated, not member-gated** — the
  brief gates *posting* only.
- **Chapter events:** anyone who can see the thread can post in it (chapter
  visibility wins, as the brief says), and chapter events do not appear in
  the public events grouping.
- **Public profiles list main-feed activity only** — chapter threads/replies
  are absent from profile listings and counts even for viewers who could
  open them, since a profile is a public record.
- **Directory flags are saved for any account** but the directory query
  requires `isSupporter && directoryVisible` live, so lapsed members drop
  out without losing their settings.
- **`GET /api/notifications/unread-count` stays a bare indexed COUNT** —
  correctness comes from emission-time gating plus purge-on-removal; the
  list route additionally filters at read time as defense in depth.

## Things a human should check

- **No in-browser or in-simulator verification happened** — the standing
  instructions forbid starting dev servers in this environment. Everything is
  verified by typecheck, `next build`, and 179 API tests; the web/mobile
  screens themselves have not been *seen*. The seed makes every feature
  visible immediately: log in as `marguerite@demo.nyphilosophy.org` /
  `demo-password-123` (member, NYC chapter, directory), `owen@…` (member,
  pending request), `hannah@…` (verified non-member), `admin@…` (admin,
  deliberately not a supporter).
- The full vitest suite occasionally flakes on this machine with a transient
  `socket hang up` on one random test (iCloud-synced working directory is
  suspected); reruns pass. The one *real* failure found during the run —
  new tables missing from the test DB wipe order in `src/test/setup.ts` —
  was fixed in the chapters commit.
- The events strip fetches `?kind=event` unauthenticated on web, so
  anonymous visitors see event titles/dates — consistent with the feed
  showing titles to everyone, but worth an explicit product nod.
- `chapters.test.ts` covers a mention of a non-member inside a chapter
  producing no notification; blocked-pair and preference interactions with
  chapter gating were not separately tested (they compose in `notify()`).

## Verification output (final run, after the last code commit)

```
apps/api        npx tsc --noEmit   → PASS
packages/shared npx tsc --noEmit   → PASS
apps/mobile     npx tsc --noEmit   → PASS
apps/web        npx tsc --noEmit   → PASS
apps/web        npx next build     → ✓ Compiled successfully; 26 static pages generated
apps/api        npx vitest run     → Tests  179 passed (179)
```
