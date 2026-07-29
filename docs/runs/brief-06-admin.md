# Run report — `brief-06-admin`

Brief: `docs/prompts/06-admin-moderation.md` (admin dashboard, thread pinning,
structured report reasons). Branched off `a193175` (the WIP mobile tail of the
brief-05 run), not off `main`.

## What I built

Six commits, each typechecking and building on its own.

1. **`0897065` — shared: report categories, moderation vocabulary, pin + warning types**
   `ReportCategory` / `ReportStatus` / `ReportAction` with display labels, the
   `ModerationAction` set the log is written from, zod schemas that make a reason
   mandatory on every destructive admin mutation, `MAX_PINNED_THREADS = 3`, and the
   admin response types. `ThreadSummary` gains `pinnedAt`. A `warning`
   `NotificationType` lands here too, with `prefKeyForNotificationType` now
   returning `NotificationPrefKey | null` — a moderation warning is the one
   notification a member can't switch off.

2. **`d514ae9` — API: moderation log, report triage, admin users/threads, thread pinning**
   Migration `20260729212031_admin_moderation`. `lib/moderation-log.ts`
   `logModeration()` is the single write path; `lib/moderation.ts` holds the
   report-target loader and the shared soft-delete helpers. New/changed routes:
   `POST /api/reports` (category + note), `GET /api/reports` (status + category
   filters, target inlined), `POST /api/reports/:id/resolve`,
   `POST /api/reports/:id/dismiss`, `GET /api/admin/{users,threads,log}`,
   `POST /api/users/:id/{ban,unban,warn,role,supporter}`,
   `POST|DELETE /api/threads/:id/pin`, plus a reason requirement and log entry on
   admin deletion of someone else's thread/reply and on lock/unlock. New
   `adminLimiter`. 14 new tests in `src/routes/admin.test.ts`.

3. **`5f5fdf0` — Web + mobile: structured report reasons**
   Required category + optional note on both clients. Web `<select>`, mobile
   tappable option list. Neither pre-selects.

4. **`78e4d7c` — Web: admin dashboard**
   `/admin` with four tabs — Reports queue (filters, inlined content, dismiss /
   delete / warn / ban / lock), Members (search + filters, ban/unban, warn,
   supporter grant/revoke, promote/demote with the last-admin guard), Content
   (pin/unpin against the cap, lock/unlock, delete), Moderation log (read-only,
   filterable, destructive rows in `--danger`). One `ConfirmAction` component
   carries every destructive action.

5. **`f5f431c` — Web: pinned threads in the feed, pin/unpin and logged admin removal in-thread**
   Pin marker in the feed and on the thread page, pin/unpin from the thread page,
   admin removal of others' content routed through `ConfirmAction` with the reason
   the API now requires, and moderation warnings rendered distinctly in the
   notification list.

6. **`07ec033` — Mobile: report triage screen, pinned threads in the feed, warning rows**
   The read-only mobile report list becomes a working triage screen with the same
   five actions; pinned-thread kicker in the feed; warning rows.

A seventh commit carries the seed's two demo reports, the README rewrite of the
moderation section, and this report.

## Design decisions worth knowing

- **Resolve performs the action and closes the report in one call.** Not two
  endpoints. A report that records "banned the author" must not be able to exist
  without the ban having run.
- **Confirmation and audit are one interaction.** `ConfirmAction`'s first click
  reveals a panel that states what will happen and takes the reason; only that
  panel commits. The reason is what `logModeration()` writes, so an admin can't
  get the action without the record.
- **`logModeration()` does not swallow errors**, unlike `notify()`. A moderation
  action whose audit record failed to write should surface a 500 rather than
  complete unrecorded — "we banned someone and nobody knows why" is the exact
  failure the table exists to prevent.
- **The log has no write path from outside the helper and no update/delete path
  anywhere** — not in the API, not in the UI. `prisma/seed.ts`'s wipe deliberately
  skips `ModerationLog`.
- **Pins are a separate `ORDER BY` column, not a `hotScore` nudge.** SQLite sorts
  NULLs last on `DESC`, so unpinned threads fall through to their real order,
  ranking is untouched, and unpinning needs no recomputation.
- **Hide == delete.** The brief asks for "delete or hide" but also says not to
  invent a second deletion semantics, so admin removal reuses the brief-03
  tombstone (`softDeleteThread` / `softDeletePost`, shared with the author's own
  delete). There is no separate hidden-but-not-deleted state.
- **Admin filters are local state, not URL search params.** No `useSearchParams`,
  so no `<Suspense>`-boundary class of build failure, and internal tooling doesn't
  need shareable filter URLs.

## Assumptions made at ambiguities

1. **`Report.reason` stays the column name; the API calls it `note`.** The brief
   wants the freeform text preserved as a note on migrated rows. A Prisma column
   rename on SQLite is a drop-and-add (data loss, and interactive confirmation
   this run can't answer), so the column keeps its name and the API/clients expose
   it as `note`. Both the schema comment and the type document this. Existing rows
   migrated to `category: "other"` with their text intact — that part is
   automatic via the column default.
2. **"Warn the author" is a notification, not a new model.** A `warning`
   `NotificationType` that bypasses preferences, blocks, and the banned check.
   The reason text doubles as what the member reads, so one field serves the
   audit record and the message.
3. **Reasons are mandatory on destructive actions, optional on restorative
   ones.** Ban, delete, demote, revoke supporter require ≥3 characters. Unban,
   unpin, lock/unlock, and dismiss accept an optional note. This changed the
   existing `POST /api/users/:id/ban` contract; `moderation.test.ts` was updated
   and now also asserts the 400 on a reasonless ban.
4. **An author deleting their own content is not a moderation action** — no
   reason required, nothing logged. Only admin action on *someone else's* content
   is. There's a test for both halves.
5. **Chapters were skipped entirely.** Brief 06 §"Chapters" depends on brief 04,
   which has not been run — there is no `Chapter` model in the schema. So there is
   no chapter management in the dashboard, and pinning applies to the single main
   feed only. The pin ordering is a plain `orderBy` prefix, so a chapter feed will
   inherit it unchanged when brief 04 lands.
6. **`openReportCount` on a member row counts reports filed *against the member*,
   not against their content.** One `groupBy` instead of N joins per page; content
   reports are counted in the queue where they're actionable.
7. **Report bodies render as raw text in the admin queue**, not through the
   markdown renderer — an admin should see exactly what was written.
8. **`GET /api/admin/*` read routes are not rate-limited**; the dashboard polls
   the open-report count. The mutations all carry `adminLimiter` (120 per 15 min),
   which is generous for a human working a queue and far below what a stolen token
   would need to mass-delete.
9. **Pin cap is 3**, as the brief suggested.

## What I skipped or narrowed, and why

- **Chapters** — see assumption 5. Blocked on brief 04, not on time.
- **Mobile member administration, content management, and moderation log.** The
  mobile admin surface is the report queue only. The brief explicitly allows
  deferring mobile admin if time runs short, and the run notes say to say so
  rather than ship it half-built. The queue is the part a moderator plausibly
  wants on a phone; a five-column audit log and a member table with eight
  actions per row are not. Banning from mobile is possible via a report; unbanning
  is web-only, which is the sharpest edge of this narrowing.
- **No admin bootstrap UI.** The *first* admin still has to be promoted in the
  database; after that admins promote each other from `/admin/users`. Out of
  scope for this brief and unchanged.
- **Out-of-scope items from the brief were left out as instructed**: automated
  moderation and word filters, image moderation, appeals workflow, chapter-level
  moderators, analytics.

## Things a human should check

1. **Nothing was verified in a browser or a simulator.** This run was
   non-interactive, so no dev server was started (per the standing instructions).
   Typecheck, `next build`, and the API test suite passed; the *visual* result at
   1280px / 375px, in light and dark, is unverified. The admin CSS is new and is
   the most likely place for a layout problem — particularly `.log-entry`, which
   is a 5-column grid with `min-width: 54rem` inside a horizontal scroller, and
   `.admin-actions`, where an open `ConfirmAction` panel takes the full row via
   `flex: 1 1 100%`.
2. **Dark mode of the new CSS is mechanical**, from the existing token
   overrides. `--danger` in dark is `#e0796b`; the destructive buttons and the
   `.confirm-panel-danger` border inherit it. Worth one pass.
3. **The migration renames nothing but does rebuild the `Report` table**
   (Prisma's SQLite table-redefinition for the nullability change). It preserved
   the two dev rows locally; on a real database, check `Report` row counts before
   and after.
4. **The warning notification's push title is generic** ("A moderation warning
   from the Society") rather than naming the admin, while the in-app row does show
   the admin's name via `describeNotification`. If the Society would rather
   warnings be attributed to the organization than to an individual moderator,
   that's a one-line change in `apps/web/src/app/notifications/page.tsx` and the
   mobile equivalent — worth an explicit decision, since real-name attribution of
   moderation decisions cuts both ways.
5. **`prisma/seed.ts` now deletes reports whose target is a thread or post**
   before reseeding, since those targets are about to vanish. It never touches
   `ModerationLog`. If you reseed a database you've been moderating in, the log
   will reference thread ids that no longer resolve — the entries still read
   correctly because `targetLabel` is captured at action time.
6. **A banned admin cannot unban themselves** (obviously), and the last-admin
   guard prevents demotion but *not* banning the last admin — I blocked
   self-banning, but admin A can still ban admin B when B is the only other admin.
   Recovery is a database edit. Worth deciding whether ban should carry a
   last-admin guard too.
7. **The stale "Mobile is behind web" bullet in the README** predates this run and
   still lists items closed by briefs 01 and 05. I updated the moderation bullets
   only and left that one alone rather than making claims about other runs' work.

## Verification output

All commands run from the repo root at the end of the run.

```
$ cd apps/api && npx tsc --noEmit
(no output — clean)

$ cd packages/shared && npx tsc --noEmit
(no output — clean)

$ cd apps/mobile && npx tsc --noEmit
(no output — clean)

$ cd apps/web && npx tsc --noEmit
(no output — clean)
```

```
$ cd apps/web && npx next build
   Linting and checking validity of types ...
   Collecting page data ...
 ✓ Generating static pages (22/22)
   Finalizing page optimization ...
   Collecting build traces ...

Route (app)                              Size     First Load JS
┌ ○ /                                    3.63 kB         116 kB
├ ○ /_not-found                          873 B          88.1 kB
├ ○ /admin                               432 B          87.7 kB
├ ○ /admin/content                       3.55 kB         116 kB
├ ○ /admin/log                           3.09 kB         115 kB
├ ○ /admin/reports                       4.21 kB         116 kB
├ ○ /admin/users                         3.96 kB         116 kB
├ ○ /forgot-password                     1.29 kB        97.3 kB
├ ○ /formatting                          3.9 kB          159 kB
├ ○ /login                               2.81 kB        98.8 kB
├ ○ /messages                            3.07 kB          99 kB
├ ƒ /messages/[userId]                   3.03 kB         115 kB
├ ○ /new-thread                          3.58 kB         159 kB
├ ○ /notifications                       2.95 kB         115 kB
├ ƒ /oauth/mock/[provider]               1.88 kB        89.1 kB
├ ○ /reset-password                      1.41 kB        97.4 kB
├ ○ /saved                               2.61 kB         115 kB
├ ○ /search                              3.49 kB         115 kB
├ ○ /settings                            4.06 kB         100 kB
├ ○ /settings/profile                    3.04 kB         115 kB
├ ○ /signup                              2.95 kB        98.9 kB
├ ƒ /t/[id]                              7.47 kB         163 kB
├ ƒ /u/[userId]                          5.94 kB         161 kB
├ ○ /verify                              3.03 kB        90.3 kB
└ ƒ /verify/mock/[sessionId]             1.75 kB          89 kB
+ First Load JS shared by all            87.2 kB
```

Not part of the required bar, but run because the brief's acceptance list is
mostly behavioural:

```
$ cd apps/api && npx vitest run

 Test Files  18 passed (18)
      Tests  150 passed (150)
   Duration  16.60s

$ cd apps/api && npx vitest run src/routes/admin.test.ts

 Test Files  1 passed (1)
      Tests  14 passed (14)
```

### The brief's acceptance list, mapped to tests

| Acceptance criterion | Covered by |
| --- | --- |
| Report filed from a second account, run end to end: triage → act → resolve, action in the log | `admin.test.ts` "triage → delete the content → resolve, with the action in the moderation log" |
| Non-admin gets 403 from every `/api/admin/*` route and every moderation mutation, with a valid token | `admin.test.ts` "a valid non-admin token gets 403 from every admin route and moderation mutation" (14 endpoints) |
| Last admin cannot demote themselves | `admin.test.ts` "promotes and demotes admins, but refuses to remove the last one" |
| Pinned threads sort first in hot and new; pin cap enforced by the API | `admin.test.ts` "pinned threads sort first in both hot and new, and the cap is enforced" |
| Banning immediately blocks an existing session | `admin.test.ts` "banning through a report bites the author's existing session immediately" |
| Pinned threads sort first in a *chapter* feed | **Not covered — chapters don't exist yet (assumption 5)** |
| Web verified in-browser at 1280px/375px, light + dark, with screenshots | **Not done — non-interactive run, see "Things a human should check" #1** |
| iOS verified live in the Simulator | **Not done — same reason** |

Also tested beyond the brief's list: report category required, log has no
write/edit/delete route, dismissal leaves content untouched, double-close returns
409, resolve requires a reason, warnings survive every notification preference
being switched off, manual supporter grant/revoke keeps and clears
`supporterSince`, admin content deletion requires a reason, and an author
deleting their own reply writes nothing to the log.
