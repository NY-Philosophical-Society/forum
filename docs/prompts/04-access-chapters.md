# 04 — Access model and chapter sub-forums

> Read `docs/prompts/README.md` first. Requires briefs 01–03.
>
> **This is the riskiest brief in the sequence.** It rewrites authorization across
> the whole app and can lock every user out if it's wrong. Work carefully and test
> each tier explicitly.

## Part 1 — Supporter-gated reading

The forum is a perk of supporting the Society: donating to events, or subscribing
to the journal. Supporter status must actually gate something, which today it
doesn't — it's stored and unlocks nothing.

### The four tiers

| Tier | Can |
| --- | --- |
| Anonymous | Browse the feed (titles, tags, counts). Open a thread to a **truncated teaser + join wall**. Nothing more. |
| Signed up, not a supporter | Exactly the same as anonymous, but the wall becomes a **"become a supporter"** CTA instead of a "sign up" one. |
| Supporter | Read everything in full — thread bodies, all replies, DMs. |
| Supporter **and** ID-verified | Post, reply, like, and send DMs. |

Notes that matter:

- The public preview stays. It's deliberate — it's how people discover the forum
  and how it stays indexable. Don't remove `thread.previewOnly`; extend it so
  "signed in but not a supporter" also receives the preview shape.
- **Verification alone is not enough.** A verified non-supporter cannot post.
  Enforce supporter status *and* verification on every write path.
- **Admins bypass supporter gating** — otherwise moderating requires donating.
- Existing accounts: everyone currently in the database is a non-supporter, so
  everyone loses read access the moment this ships. Handle it deliberately —
  either grandfather existing accounts in a migration, or make it obvious in the
  summary that they need to redeem `WISDOMKEY`. Say which you did.

### Server-side, not cosmetic

Add a `requireSupporter` middleware next to the existing `requireVerified` in
`apps/api/src/middleware/auth.ts`, and apply it to read routes that return full
content as well as to write routes. A client hitting the API directly with a
non-supporter token must get the truncated shape or a 403 — never full content.

Update the wall copy on web and mobile to reflect which gate the viewer is behind.
The supporter CTA should explain *why* (it supports the Society's events and
journal) and link to redeeming a code in Settings.

## Part 2 — Chapters

Supporters organize locally. A chapter is a private space for one group — the NYC
chapter, say — to discuss among themselves.

**Chapters are not tags and not boards.** The main feed stays a single feed with
optional tags; that decision stands. A chapter is a separate, access-controlled
space with its own feed.

### Model

- Admin-created: name, slug, short description, optional location
- Membership is explicit. A supporter **requests to join**; an admin approves. An
  admin can also add someone directly. Both paths must exist.
- A thread belongs to either the main feed **or** exactly one chapter — never both
- Chapter threads never appear in the main feed, never in main-feed search
  (brief 05), and are invisible to non-members including in direct URL access
- Only chapter members may read or post in that chapter
- Chapters keep all existing thread mechanics unchanged: tags, likes, hot/new sort,
  nested replies, locking, reporting

### UI

- A chapter directory listing chapters the viewer can see, with join/request state
- A chapter feed reusing the main feed's components — this should feel like the
  same product, not a bolt-on
- A chapter switcher that doesn't bury the main feed
- On mobile this needs to fit the bottom tab bar from brief 01 without adding a
  fifth tab — consider nesting chapters under Feed rather than promoting them
- Admin: create a chapter, review join requests, add/remove members

## API work

- `Chapter`, `ChapterMembership` (with a `pending | active` state) models
- `Thread.chapterId` — nullable; null means the main feed
- `GET /api/chapters` · `POST /api/chapters` (admin) ·
  `GET /api/chapters/:slug` · `GET /api/chapters/:slug/threads`
- `POST /api/chapters/:slug/join` (request) ·
  `POST /api/chapters/:slug/members` (admin add) ·
  `DELETE /api/chapters/:slug/members/:userId`
- Every existing thread/post/message route needs a chapter-visibility check —
  audit them all rather than only the obvious ones
- Extend the seed script with one demo chapter so this is testable

## Out of scope

Real donation/subscription API integration (`WISDOMKEY` stays the placeholder) ·
per-event ephemeral spaces (chapters only) · chapter-level moderators distinct from
global admins · paid tiers beyond the single supporter flag.

## Acceptance

Standard bar from `README.md`, plus — test **all four tiers explicitly**, on web
and iOS:

1. Anonymous: sees feed, gets teaser + join wall on a thread.
2. Signed-up non-supporter: same preview, supporter CTA.
3. Supporter, unverified: reads in full, cannot post/like/reply/DM.
4. Supporter + verified: full participation.

Then, by hitting the API directly with each token type, confirm a non-supporter
cannot retrieve full thread bodies or replies. Confirm a non-member gets a 404 or
403 on a chapter URL they know. Confirm admins can still moderate without being
supporters.
