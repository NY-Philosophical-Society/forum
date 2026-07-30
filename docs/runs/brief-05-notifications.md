# Run report — `brief-05-notifications`

Brief: `docs/prompts/05-notifications-discovery.md` (in-app + push
notifications, search, bookmarks). This report covers **two runs**: the
original overnight run that was killed partway through the mobile layer
(4 complete commits + 1 WIP checkpoint, 2026-07-29, no report written), and
the completion run of 2026-07-30 that finished, tested, and verified it.

## The original run (2026-07-29, interrupted)

1. **`18a308e` — API: in-app notifications with collapse rules, push provider
   stub, token registry.** `Notification` / `NotificationPreference` /
   `PushToken` / `Bookmark` models; every emission through one `notify()`
   helper (self/block/preference/ban rules in one place, likes collapse per
   target with a distinct-actor guard, DMs per sender, moderation warnings
   exempt from suppression); paginated list, single-COUNT unread poll,
   read/read-all, preferences; Expo push behind the provider pattern with a
   log-only stub that refuses to run once `EXPO_ACCESS_TOKEN` is set.
   19 tests landed with it.
2. **`7690370` — API: search behind a swappable module; bookmarks.**
   `lib/search.ts` isolates the SQLite `LIKE` queries so Postgres full-text
   can replace them without touching route or clients; search is 401 for
   anonymous callers, deliberately — snippets would leak past the
   read-preview wall. Bookmarks save/list/unsave, deleted threads filtered at
   read time. 6 tests.
3. **`c9863f7` — Web: notification bell and list, per-type preferences, reply
   deep links.** Bell with polled badge, list with collapse phrasing and
   read/unread state, `#post-<id>` deep links that widen the reply window,
   master + per-type switches in Settings.
4. **`1dd15a0` — Web: search page with typed, highlighted results;
   saved-threads list.** Segmented type filter, term highlighting, save
   toggles on feed and thread page, `/saved`.
5. **`a193175` — WIP mobile (checkpoint).** The three screens
   (`Notifications`, `Search`, `Saved`), `lib/push.ts`, and the unread-count
   hooks all existed and were well-built — but almost nothing was wired:
   see the gap list below. Typechecked only; no verification, no report.

## Gap audit (what the diff against the brief showed)

API and web: complete against the brief. Mobile, from the WIP checkpoint:

1. The Alerts tab was never registered — `AlertsStack` defined but unused, so
   NotificationsScreen was unreachable and there was no unread badge.
2. `onPushOpened` was imported but never called — push taps went nowhere.
3. Push tokens registered only when the (unreachable) Alerts screen gained
   focus; logout never deregistered the device.
4. `Saved` was in the param list but not registered in the Profile stack —
   navigating there would have crashed — and no profile row pointed at it.
5. Search had no entry point anywhere.
6. `ThreadScreen` ignored `highlightPostId`: no wide reply window, no scroll,
   no highlight — notification deep links landed at the top of the thread.
7. No save/unsave anywhere on mobile (thread page or feed).
8. No notification-preferences UI on mobile.
9. No pull-to-refresh on the new lists.

Also: `push-tokens` routes had zero tests, and `docs/API-CHANGES.md` (required
by the handoff rules) did not exist, so none of brief 05's API surface was
logged for the backend engineer.

## The completion run (2026-07-30)

1. **`976d86a` — Mobile: Alerts tab + badge, push deep links, login/logout
   token lifecycle.** Tab registered with the unread badge (which the
   existing hook also mirrors onto the app icon); push taps deep-link to the
   exact reply / the DM conversation (display name fetched from the profile
   endpoint, falling back to the Messages list) / the alerts list; login
   silently re-registers an already-granted token (`ask: false` — the
   permission prompt itself still happens on the Alerts tab, not cold on
   launch); logout revokes the token while the session can still
   authenticate the DELETE.
2. **`0e7f688` — Mobile: search + saved entry points, save toggles, reply
   deep-link highlight.** Search icon in the feed header; "Saved threads" row
   in the profile list (and the screen actually registered); optimistic
   ❧ Save toggle on feed cards and the thread page, matching web; deep-link
   arrivals load the 100-reply window, scroll to the reply
   (`scrollToIndex` with an estimate-then-retry fallback for unmeasured
   rows), and mark it with an accent hairline.
3. **`a4def2d` — Mobile: notification preferences in Settings,
   pull-to-refresh.** Master + four per-type switches, optimistic with
   revert-on-failure, per-type disabled while master is off; RefreshControl
   on the Alerts and Saved lists.
4. **`24974b6` — API: missing tests + `docs/API-CHANGES.md` backfill.**
   `push-tokens.test.ts` (auth required, platform validation, upsert-by-token
   moving a shared device between accounts, owner-scoped delete);
   preferences-default and search-pagination tests; API-CHANGES.md created
   with a dated backfill of the whole brief-05 surface.
5. Final commit: this report + the README's stale "No notifications, no
   search" bullet replaced with the true state (features exist, push is a
   log-only stub).

## Assumptions made at ambiguities

- **"Register the push token on login"** — interpreted as: *re*-register
  silently whenever a session starts **if permission was already granted**.
  The permission ask itself stays on the Alerts tab (the WIP's design, and
  the brief's "not cold on first launch" requirement). A fresh install
  therefore has no push until the user first opens Alerts — deliberate.
- **DM push deep-link needs a display name** the push payload doesn't carry;
  I fetch `/api/users/:id/profile` and fall back to the Messages list if that
  fails, rather than adding a payload field (an API change the brief didn't
  ask for).
- **Bookmarking is not gated on verification** (any account can save), since
  it's a private reading aid, not a write action — this matches the API
  (`requireAuth` only) and web behavior.
- **Pull-to-refresh added only to the two new list screens** (Alerts, Saved).
  No pre-existing screen has it; retrofitting Feed/Messages is out of this
  brief's scope.
- **Alerts tab position**: Feed · Messages · Alerts · Profile, matching the
  `RootTabParamList` declaration order in the WIP.
- **Chapter visibility** (brief 04) is referenced throughout the brief but
  chapters were never built; `notify()`'s `canRecipientSee()` and the
  bookmark-list `where` are the two documented landing spots, both noted in
  API-CHANGES.md.

## What was skipped or narrowed, and why

- **No new API endpoints or models** — the API layer was already complete;
  the completion run touched only tests and docs on the API side.
- **Badge count via polling only** (15 s, same cadence as the DM poll) — the
  brief explicitly rules real-time delivery out of scope.
- **`STORAGE.lastToken` in `lib/push.ts` is in-memory**, so deregistration
  after an app restart depends on `getExpoPushTokenAsync()` returning the
  same token (it does) — left as the WIP built it; stale tokens are also
  pruned server-side on `DeviceNotRegistered` receipts.

## Things a human should check

- **Nothing mobile has been seen in a Simulator.** Xcode is installed but not
  the active developer directory in this environment
  (`sudo xcode-select -s /Applications/Xcode.app/Contents/Developer` needs
  your password). Everything mobile in both runs is typecheck-verified only.
  The specific behaviors that genuinely need a device/simulator pass:
  `scrollToIndex` timing on deep links, the push permission banner flow, tab
  badge rendering, and pull-to-refresh feel.
- **Real push delivery is untestable end to end** without an Apple Developer
  APNs key (plus FCM for Android) and an Expo access token — the brief said
  to say this plainly: it can't be tested until you create those. Locally the
  stub logs to the API console and degrades with no crash and no user-facing
  error (the `catch`-and-return paths in `lib/push.ts`).
- The web build failure below (stale `.next`) is worth knowing about: if the
  Vercel build ever reports `PageNotFoundError: Cannot find module for page`,
  it's a cache artifact, not the code.

## Verification output (all observed, 2026-07-30)

```
apps/api        npx tsc --noEmit   → exit 0
apps/web        npx tsc --noEmit   → exit 0
apps/mobile     npx tsc --noEmit   → exit 0
packages/shared npx tsc --noEmit   → exit 0

apps/api        npm test           → Test Files 19 passed (19)
                                     Tests 157 passed (157)
                                     (150 before this run; +7 new)

apps/web        npx next build     → ✓ Generating static pages (22/22)
                                     all routes emitted, no prerender errors
```

The first `next build` attempt failed with `PageNotFoundError` ENOENT during
page-data collection on routes untouched by this run; `rm -rf apps/web/.next`
and rebuilding produced the clean output above — a stale build cache, not a
code problem. No test failures traceable to the reverted Postgres conversion
were found; the suite was green before this run's new tests.
