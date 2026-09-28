# Home and event-thread connection — local verification

- Scope: isolated `codex/production-foundation` worktree. No changes to the
  club's original main branch, hosted Supabase records, or public Vercel link.
- Connected paths: signed-in Home reads the upcoming event feed and newest
  discussions; Events reads upcoming/past event threads with pagination; event
  detail reads the original thread endpoint and links to the original thread
  page. Luma remains a calendar link, not an RSVP or live registration API.
- API contract change: `GET /api/threads?kind=event&period=upcoming|past`
  filters dated events on the server. Upcoming is nearest-first; past is
  newest-first. The default discussion feed is unchanged.
- Privacy and accuracy: production builds do not offer the sample demo entry
  point. The original forum contains an event whose timestamp renders as
  3 PM New York time while its description says 7 PM. The showcase therefore
  displays the date, renders the original description safely as Markdown, and
  directs members to Luma to confirm time, venue, and registration. No source
  record was modified; forum attendance is not represented as RSVP.

## Executed evidence

Executable-source fingerprint:
`406440542c8a965383c4ed50e32ce362c237d8caf1d36dbae0679014ea54556b`.
All five successful automated records below refer to that same fingerprint:

- Client: 72/72, `.verification/2026-09-21T22-59-09-271Z-client-20aa4d9a/`
- Shared: 16/16, `.verification/2026-09-21T22-59-09-290Z-shared-02ec82d4/`
- Original/local API: 177/177, `.verification/2026-09-21T22-59-18-366Z-api-c5fa43be/`
- Forum HTTP: 11/11 with exact synthetic cleanup,
  `.verification/2026-09-21T23-00-58-795Z-forum-http-7dbb85bf/`
- Directory HTTP: 11/11 with exact synthetic cleanup,
  `.verification/2026-09-21T23-01-07-479Z-directory-http-6ca25841/`

The optimized production build and `git diff --check` also passed. One forum
HTTP rerun failed while the development server and production build shared
`.next` output; that record is retained at
`.verification/2026-09-21T23-00-02-303Z-forum-http-d9c3a1ee/`.
After stopping the development server and starting the clean production build,
the same journey passed 11/11; the failed run did not expose an API regression.

A separate interactive local browser pass used one synthetic email account. It
observed signed-in Home with real discussions, an empty upcoming calendar, a
past event, and that event's detail. The visual pass found and fixed the
misleading time, raw Markdown, and low-contrast event text. The synthetic
browser account and its local Auth user were then removed exactly. This was
desktop inspection, not a mobile, Google OAuth, or hosted-provider pass.

The first cleanup pass happened while another local browser tab still held
that account's signed JWT. Because the original forum lazily recreates a
missing local user row from a valid JWT, that tab recreated the synthetic row.
I signed out that tab, removed the exact synthetic row again, and verified the
production preview returned to the login screen. This does **not** occur in
the app's normal account-deletion flow, which keeps an anonymized tombstone,
but it is an operational warning: do not delete an Auth user and its local row
independently while a session may still be active. Use the account-deletion
route or retain a tombstone.

## Remaining release gates

- Real Google OAuth and hosted redirect configuration are unverified.
- The original shared `WISDOMKEY` supporter unlock is not safe membership
  authorization for a public launch. A membership-source decision is needed.
- Luma venue/session/registration data is not synchronized; the forum event
  record is only a discussion bridge. The inconsistent event timestamp remains
  in the original local data and must be reconciled by its owner.
- Direct messages, notifications, profiles, search, and settings currently
  use the original forum pages for signed-in members rather than new showcase
  equivalents. Two-account browser, mobile, and staging journeys remain open.
- No branch push, PR, or deployment was performed. The public Vercel alias
  continues to serve its older deployment until an authorized release.
