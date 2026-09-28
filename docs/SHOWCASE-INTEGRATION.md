# Showcase integration plan

This document is the implementation checklist for turning `/showcase` from a
browser-local product prototype into the next web interface for the existing
forum. The governing constraint is simple: keep one identity system, one API,
and one database. The showcase may replace presentation and navigation, but it
must not create a parallel backend.

## Hosted visual review before database access

The separate Vercel showcase can be built with
`NEXT_PUBLIC_SHOWCASE_REVIEW_MODE=true`. This exposes an explicitly labeled,
browser-memory preview of the latest interface and illustrative discussions;
it does not sign users up, call the forum API, or persist actions. A review-only
middleware blocks API routes and redirects other app pages back to `/showcase`.
The Events screen links to the official Luma calendar rather than displaying
unverified or expired dates. Never set this flag on the club's forum deployment,
and never describe a review-mode deployment as proof of hosted signup, posting,
or access controls. The connected release still requires the approved hosted
database and end-to-end checks below.

## What already maps cleanly

| Showcase capability | Existing production foundation | Status |
| --- | --- | --- |
| Google and email sign-in | Supabase Auth through `AuthProvider` | Local email/session/account path verified; real Google provider pending |
| Home and events | Existing discussion/event thread feeds and detail | Showcase home and events load current forum event threads, including local demo's default view; Luma remains the source for registrations |
| Discussions, replies, and likes | Thread and post API routes; Prisma models | Live forum feed is the default, including read-only local demo; sample discussions require an explicit switch |
| Member profiles and directory | User profile and directory API routes | Authenticated directory connected locally; profiles link to original real route pending showcase migration |
| Chapters and membership | Chapter API routes and `ChapterMembership` | Authenticated chapter feed and join request connected locally; browser/API journey pending |
| Direct messages | Message API routes and verification guard | Authenticated showcase links to original real route; showcase UI migration pending |
| Notifications | Notification and preference API routes | In-app triggers and original notification inbox are connected; showcase-native inbox and real mobile push delivery remain open |
| Search and bookmarks | Search and bookmark API routes | Search links to original real route; bookmark UI migration pending |
| Reporting and moderation | Report routes, admin tools, audit log | Preserve as-is |

## Missing domain capabilities

These are product gaps, not reasons to replace the existing architecture.

- **Canonical events:** event threads now power the signed-in calendar, but
  the showcase still needs a first-class event/session shape for venues,
  capacity, multiple locations, and a reliable start time. An existing record's
  timestamp conflicted with its description, so the UI displays only the date
  and sends members to Luma to confirm the exact schedule.
- **Luma synchronization:** Luma remains the registration source of truth. Add
  an idempotent import/webhook boundary instead of copying registration state
  into browser storage.
- **Notification delivery:** replies, mentions, messages, likes, and moderation
  actions create in-app notification rows and the original inbox reads them.
  The showcase's authenticated bell links to that inbox; its demo bell is sample
  only. Mobile push defaults to a log-only adapter until Expo/APNs/FCM
  credentials and a device-delivery test are approved. Do not describe push as
  live based on in-app tests.
- **Member follows:** add a follow relation and endpoints before connecting the
  showcase follow controls.
- **Group conversations:** the current API supports direct messages; the
  showcase's group-chat examples require a separate conversation model and
  permission rules.
- **Richer member discovery:** location, interests, and connection preferences
  need durable profile fields and privacy-aware filtering.

## Migration checklist

Follow [CONNECTION-VERIFICATION.md](CONNECTION-VERIFICATION.md) one gate at a
time. A connected screen requires retained regression tests, failure-path
coverage, actual local integration evidence, and a recorded gate decision.

Each item should land as a focused, reviewable pull request. A screen is not
considered migrated until loading, empty, error, unauthorized, and optimistic
mutation states are covered.

- [x] Route showcase Google and email authentication through the shared
  Supabase `AuthProvider`; verify the local email/session/account journey.
- [ ] Verify real Google consent, cancellation, returning-user behavior, and
  hosted redirect allow-lists once provider credentials are available. Until
  then the Google/Apple controls are off unless their explicit public flags
  are set.
- [x] Keep the demo-member path explicitly browser-local and label its data
  boundary in the interface.
- [x] Replace authenticated showcase main-feed, detail, compose, reply, and
  like actions with runtime-validated thread/post API calls; retain local data
  only for the explicitly labeled demo member.
- [x] Add authenticated chapter-scoped forum browsing and pending-join states;
  adapter tests pass, but server/API journey and interactive browser review
  remain open.
- [x] Replace sample people in the authenticated Community screen with the
  opt-in directory API and real chapter list; client contract tests pass.
  Profiles and settings currently link to the original forum's real screens;
  HTTP/browser verification and an integrated showcase profile remain open.
- [x] Connect authenticated Home and Events to existing discussion and event
  thread APIs; verify upcoming/past ordering, empty states, real detail, and
  the external calendar handoff locally. The local demo now shows the live
  read-only forum and current forum event threads by default; its sample forum
  is behind an explicit switch. Production does not offer demo sign-in.
- [x] Add confirmation and visibility controls to both signup forms; add a
  member-positioned photo crop before uploading to the existing avatar API.
- [x] Let discussion authors describe a topic in their own words without
  silently creating a shared taxonomy tag. This adds a nullable thread field
  and requires migration before deployment.
- [ ] Replace direct-message interactions with the message API and preserve
  the server's identity-verification gate.
- [ ] Connect chapters, joined membership, notifications, search, bookmarks,
  profile editing, and preferences to their existing endpoints.
- [ ] Define the first-class event/session schema and Luma adapter before
  claiming live venue, capacity, or RSVP state. Current event-thread screens
  are a read-only bridge, not a Luma sync.
- [ ] Add the follow model, endpoints, authorization tests, and UI states.
- [ ] Decide whether group conversations are in launch scope; remove the
  prototype affordance if they are not.
- [x] Port the Stripe Identity adapter and signed webhook into this branch;
  keep the real provider disabled until the club supplies credentials.
- [ ] Replace per-process rate limiting with a shared production store.
- [ ] Verify hosted Supabase Auth, redirect allow-lists, Storage, SMTP, and
  production secrets without committing credentials.
- [x] Fail closed in production for the original unlimited-use supporter code
  and local mock identity-verification routes. This is a safety boundary, not
  a substitute for a membership source or a real verification provider.
- [ ] Configure pooled and direct hosted Postgres URLs on the showcase Vercel
  project and run a read-only hosted readiness check before deploying.
- [ ] Verify the target Vercel deployment runs this branch and the new
  `topicLabel` migration is applied to an approved database. A local code
  change does not update the existing public link by itself.
- [ ] Run the full API suite against an isolated Supabase database and add UI
  tests for the migrated showcase journeys.
- [x] Stop loading/writing browser-local mock accounts and activity. On the
  updated showcase's next load, remove only its four known legacy storage keys;
  leave Supabase Auth storage and other origin data untouched. Prototype-only
  interactions remain in session memory until their screens are migrated.
- [ ] Remove remaining sample-only views and session-memory mutations after
  each has a real API source and verified behavior.
- [x] Remove the signup chapter selector that implied unapproved membership,
  wire password recovery to the existing route, and label remaining unfinished
  screens as previews for authenticated accounts.
- [ ] Update `docs/PROJECT.md`, the API contract, and the launch checklist as
  each slice lands.

## Verification record · 2026-09-26

- Local isolated Supabase API suite: 194 tests passed across 24 files; the
  focused thread test also covers creating, finding, and editing a custom
  topic. Client suite: 74 tests passed across 6 files; shared package: 16
  tests passed across 2 files. Production build passed after upgrading the web
  app to supported Next.js 15.
- An isolated Vercel visual preview rendered Home, Forum, and Events from this
  branch. The review banner labels illustrative content, Events points to the
  current club calendar, and signup/API routes are intentionally unavailable.
  The stable public alias has not been promoted; this is not a connected test.
- Browser check: local `/showcase` loaded the real read-only forum, displayed
  current API discussions, and showed no expired event as upcoming. The
  discussion form retained its text through the guidelines toggle; desktop
  and 390px layouts had no horizontal overflow.
- Applied the pending access-grants and new topic-label migrations to the
  loopback-only local development database. No hosted database was changed.
- Still unverified: hosted database migration/signup-to-post, real Luma event
  sync, mobile push delivery, and a real-user photo-upload journey. Do not
  present these local checks as a production sign-off.

## Pull-request standard

Every integration pull request should be small enough to review by capability,
not by file count. It must include:

1. The user problem and the exact slice being migrated.
2. The reused model, endpoint, and authorization rules.
3. Any schema or API changes, including backward-compatibility impact.
4. Before/after screenshots for visible changes.
5. Automated tests and the commands used to verify them.
6. Known limitations and an explicit rollback path.
7. No unrelated formatting, generated output, sample secrets, or drive-by
   refactors.

## Recommended pull-request sequence

1. **Authentication bridge:** shared OAuth helper, Google sign-in on the
   showcase, and authenticated-session handoff.
2. **Forum data:** feed, thread detail, compose, reply, and like flows.
3. **Member data:** profiles, directory, chapters, and preferences.
4. **Communication:** direct messages and notifications.
5. **Events:** first-class event model and Luma synchronization.
6. **Launch hardening:** shared rate limits, provider configuration, full test
   pass, accessibility review, and removal of remaining sample state.
