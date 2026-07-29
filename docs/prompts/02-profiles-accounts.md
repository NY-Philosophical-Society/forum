# 02 — Profiles, avatars, and account management

> Read `docs/prompts/README.md` first — palette, locked decisions, standing
> constraints, verification bar. Requires brief 01 to be complete; compose
> everything from the shared components it established.

## Why this matters

The founding requirement for this forum was that people post under **their real
name and a photo**. Real names are enforced. Photos don't exist anywhere — no
avatar upload, no profile picture, and no user profile pages at all. Usernames
aren't even clickable. This brief closes that gap.

## 1. User profile pages

A profile at `/u/[userId]` on web and a matching screen on mobile, showing:

- Avatar, display name (their real name), join date
- Verification badge and supporter badge
- Their threads and their replies, paginated, most recent first
- A "Message" button (respecting existing block state) and the existing report
  control

Make **every** author name across the app link to its profile — feed cards, thread
authors, reply authors, conversation headers, search results later.

Non-authors see the public view. Viewing your own profile offers an edit affordance
into the flow below.

## 2. Avatar upload

Photos are the missing half of the founding requirement, so treat them as a first-
class part of identity, not decoration.

**Storage — use the provider pattern.** Follow
`apps/api/src/lib/verification-provider.ts` exactly: define a `StorageProvider`
interface, ship a local-disk stub that works with zero credentials for development,
and gate a real implementation (S3 / Cloudflare R2 / Cloudinary — document the
setup steps in the file's top comment) behind env vars. Never make local
development depend on a vendor account. Document the env vars in
`apps/api/.env.example` and the README.

Requirements:

- Upload from web and from mobile (camera roll + camera)
- Client-side crop to square, resize, and compress before upload — don't ship
  multi-megabyte originals to storage
- Enforce a max file size and an image-only MIME allowlist **server-side**, not
  just in the picker
- `Avatar` (from brief 01) renders the photo when present, initials when not
- Sensible default state — never a broken image

**Flag but don't build**: user-uploaded photos are a moderation surface, and this
forum has no image moderation. Note it in your summary and in the README's
pre-launch list.

## 3. Edit your own profile

- Short bio (plain text, length-capped — markdown lands in brief 03)
- Avatar
- Display name — **with a constraint**: the display name is the legal name tied to
  ID verification. A `VERIFIED` user changing it invalidates that link. Either
  block the edit for verified users with a clear explanation, or reset them to
  `UNVERIFIED` and require re-verification. Pick one, implement it consistently,
  and say which you chose and why.

## 4. Account management

New account section in Settings, on both platforms:

- **Change password** while logged in (requires current password). Note: accounts
  created via Google/Apple have `passwordHash === null` — offer "set a password"
  rather than "change password" for them.
- **Change email**, with the same uniqueness rules as signup.
- **Delete account** — confirmation gated, and it must actually decide what happens
  to that person's threads, replies, and messages. Recommended: anonymize
  authorship (`[deleted]`) rather than cascade-deleting content and blowing holes
  in other people's conversations. State your choice.
- **Export my data** — JSON dump of their account, posts, and messages. This
  matters because you're storing PII plus identity-verification status.

## API work

`apps/api` needs extending in this brief (unlike 01):

- `GET /api/users/:id/profile` — public profile + paginated threads/replies
- `PATCH /api/users/me` — bio, display name, avatar
- `POST /api/users/me/avatar` — upload, via the storage provider
- `POST /api/auth/change-password` · `POST /api/auth/change-email`
- `DELETE /api/users/me` · `GET /api/users/me/export`

Add `avatarUrl` and `bio` to the `User` model and to `PublicUser` in
`packages/shared`. Apply the existing `writeLimiter` / `authLimiter` rate limits to
the new mutating routes. Keep the existing serialization pattern (`toPublicUser`).

## Out of scope

Markdown in bios · image embeds in posts (brief 03, reuses this storage layer) ·
following users · notifications · search.

## Acceptance

Standard bar from `README.md`, plus:
- Upload an avatar from web and from the iOS Simulator; confirm it renders in the
  feed, in a thread, in a conversation, and on the profile.
- Confirm the display-name-vs-verification rule you chose actually holds.
- Confirm account deletion leaves other people's threads readable.
