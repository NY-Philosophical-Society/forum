# 06 — Admin dashboard, pinning, structured reports

> Read `docs/prompts/README.md` first. Requires briefs 01–05.

## Goal

Moderation currently exists as API endpoints with almost no interface. An admin can
ban someone only by calling the API by hand, and reports are a read-only list with
freeform text. Everything here is internal tooling — it should be plain, fast, and
unambiguous rather than beautiful.

## 1. Structured report reasons

Replace the freeform "why are you reporting this?" textarea with a category plus an
optional note:

`Harassment or abuse` · `Spam or advertising` · `Off-topic` ·
`Misinformation` · `Impersonation` · `Other`

- Category is required; the note stays optional and free text
- Migrate existing reports into `Other`, preserving their text as the note
- Add the category to the `Report` model and to `packages/shared`
- Update the report UI on web and mobile (from brief 01) to match

## 2. Admin dashboard

One admin area, gated by the existing `requireAdmin` middleware, with server-side
enforcement on every route — never rely on a hidden nav link.

**Reports queue**
- Filter by status (open / resolved / dismissed) and by category
- Each report shows the reported content inline — an admin shouldn't have to
  navigate away to judge it
- Actions per report: dismiss · delete the content · warn the author · ban the
  author · lock the thread
- Resolving records who resolved it and when

**Users**
- Search users; view verification status, supporter status, role, join date,
  content counts
- Ban and unban (endpoints already exist — give them an interface)
- Grant or revoke supporter status manually — the Society will need this for people
  who donate outside whatever the eventual payment integration is
- Promote to admin / demote. **Guard against removing the last admin.**

**Content**
- Delete or hide any thread or reply, with the reason recorded
- Lock and unlock threads (endpoint exists)
- Pin threads — see below

**Chapters** (from brief 04)
- Create chapters; review and approve join requests; add and remove members

**Moderation log**
- Append-only record of every admin action: who, what, which target, when, why
- Read-only in the UI. This is the accountability record for a nonprofit board —
  treat it as non-negotiable, and never allow edits or deletes.

## 3. Pin / feature threads

- An admin can pin a thread to the top of the main feed, or of a chapter feed
- Pinned threads sort above everything regardless of hot/new — they must not
  distort `hotScore`
- Visually distinct in the feed (a pin marker), and clearly unpinnable
- Cap the number of simultaneous pins (3 is reasonable) so the feed can't be
  buried, and enforce that server-side

## API work

- `Report.category`, `Report.resolvedBy`, `Report.resolvedAt`; migrate existing rows
- `POST /api/reports/:id/resolve` · `POST /api/reports/:id/dismiss`
- `GET /api/admin/users` (search, filter) ·
  `POST /api/users/:id/role` · `POST /api/users/:id/supporter`
- `POST /api/threads/:id/pin` · `DELETE /api/threads/:id/pin`; `Thread.pinnedAt`
- Content deletion/hiding by admins, reusing the tombstone behavior from brief 03 —
  don't invent a second deletion semantics
- `ModerationLog` model, written from every admin mutation. Route them through one
  helper so it can't be forgotten on a new endpoint.
- Rate-limit admin routes too — a compromised admin token shouldn't be able to mass-
  delete at machine speed

## Out of scope

Automated moderation and word filters · image moderation (still an open gap — see
briefs 02 and 03) · appeals workflow · chapter-level moderators distinct from
global admins · analytics dashboards.

## Acceptance

Standard bar from `README.md`, plus:
- As the seeded admin, file a report from a second account and run it end to end:
  triage → act → resolve, with the action appearing in the moderation log.
- Confirm a non-admin gets 403 from every `/api/admin/*` route and every moderation
  mutation, called directly with a valid non-admin token.
- Confirm the last admin cannot demote themselves.
- Confirm pinned threads sort first in both the main feed and a chapter feed, in
  both hot and new, and that the pin cap is enforced by the API.
- Confirm banning a user immediately blocks their existing session (the `bannedAt`
  check in `requireAuth` already exists — verify it actually bites).
