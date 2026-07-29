# Run report — brief-02-profiles

Implements `docs/prompts/02-profiles-accounts.md` in full: profile pages, avatar
upload (storage provider pattern), profile editing, and account management, on
API, web, and mobile.

## Commits

1. `a3d4be8` — API: `User.avatarUrl/bio/deletedAt` migration + shared profile &
   account schemas; deleted accounts rejected by session middleware and login.
2. `4562c84` — API: `StorageProvider` (local-disk stub + env-gated S3/R2 path) +
   `POST/DELETE /api/users/me/avatar` with sharp validation, 512px square crop,
   EXIF strip; 9 tests.
3. `d24ed34` — API: `GET /api/users/:id/profile` (paginated threads/replies,
   anonymous preview) + `PATCH /api/users/me` (bio, display-name rule); 8 tests.
4. `cf7fbc1` — API: change-password / change-email / `DELETE /api/users/me`
   (anonymize) / `GET /api/users/me/export` / `GET /api/auth/account`; 10 tests.
5. `0443561` — Web: Avatar photo support, `/u/[userId]` profile page, every
   author name clickable, "My profile" in the dropdown.
6. `1a23157` — Web: `/settings/profile` — avatar upload with client-side canvas
   crop/resize/compress, bio, display name.
7. `755fb4c` — Web: account management in Settings (password, email, export
   download, confirmation-gated deletion).
8. `a4e6516` — Mobile: shared `Avatar` component, `UserProfile` screen in all
   three tab stacks, tappable author bylines everywhere.
9. `e9601a2` — Mobile: `EditProfile` screen — camera/library picker (square-crop
   UI) + manipulator resize, bio, display name; `expo-image-picker` +
   `expo-image-manipulator` added.
10. `c722ad4` — Mobile: `Account` screen (password, email, share-sheet export,
    deletion).
11. `582c9bc` — README update; this report follows as the final commit.

## Decisions the brief asked me to make

- **Display name vs. verification: BLOCK, don't reset.** A `VERIFIED` user
  cannot change their display name (API returns 403 with an explanation; both
  clients disable the field and show the same wording, pointing at the Society
  for legal-name changes). Rationale: silently resetting to `UNVERIFIED` would
  strip posting/reply/like/DM rights as a side effect of a profile edit —
  user-hostile and confusing. Unverified/pending/rejected users edit freely.
  Covered by a test.
- **Account deletion: anonymize, not cascade-delete.** The `User` row stays with
  `deletedAt` set; displayName becomes `[deleted]`, email is tombstoned to
  `deleted-<id>@deleted.invalid` (frees the address for future signup — tested),
  password/OAuth ids/avatar/bio/supporter/role are cleared, the avatar file is
  removed from storage. Threads, replies, and message history survive under
  "[deleted]" (tested). Deleted accounts: can't log in, sessions die, profile
  404s, excluded from user search, can't receive new DMs.
- **Profile read access mirrors the thread preview wall.** Anonymous web
  visitors get the profile header (name, photo, badges, counts) but no
  threads/replies lists (`previewOnly`), same philosophy as `GET /threads/:id`.
  Any account reads in full. Mobile is behind its login gate anyway.

## Storage provider (the interface later briefs depend on)

`apps/api/src/lib/storage-provider.ts` — `put({key, body, contentType}) →
{url}`, `remove(key)`, `keyForUrl(url)`. Local stub writes to
`apps/api/uploads/` (gitignored), served by the API at `/uploads` with immutable
caching (keys are content-unique per upload). S3/R2 path is documented in the
file header and gated on `STORAGE_PROVIDER=s3` + `STORAGE_S3_*` env vars; it
deliberately throws until implemented. **The local stub refuses to start if any
`STORAGE_S3_*` credential is present**, matching the dev-mock OAuth rule. Env
vars documented in `apps/api/.env.example` and the README.

Upload hardening (server-side, tested): MIME allowlist on the raw-body parser
*and* re-checked against the sniffed format (a GIF sent as `image/jpeg` is
rejected); 8 MB cap; min 100×100 / max 10,000px; EXIF orientation baked in via
`rotate()` then all metadata (incl. GPS) dropped by re-encode — verified by a
test that writes EXIF and confirms the stored file has none.

## Assumptions made at ambiguities

- **Client-side crop is center-crop on web** (canvas), not an interactive drag
  crop. Mobile gets the native square-crop UI from `expo-image-picker`
  (`allowsEditing`). The brief said "crop to square"; it didn't demand an
  interactive cropper, and the server center-crops as a backstop.
- `avatarUrl` is stored as the **absolute URL** the provider returned. For the
  local stub that embeds the API origin (`API_PUBLIC_URL`, default
  `http://localhost:4000`) — if that changes, old rows point at the old origin.
  Acceptable for a prototype; a real S3/R2 URL is stable.
- Email change takes effect immediately after password re-entry — no
  verification email to the new address (no mailer exists in this repo; the
  password-reset flow has the same limitation and says so).
- Mobile data export hands the JSON to the OS share sheet rather than writing a
  file — there's no downloads folder UX on iOS, and AirDrop/Files/Mail cover the
  need.
- `GET /api/auth/account` was added (email + `hasPassword`) because `PublicUser`
  deliberately doesn't expose email, and settings needs both; the brief's
  "offer set-a-password for OAuth accounts" requires knowing `hasPassword`.
- `req.user` now carries `passwordHash` (server-internal only, never serialized)
  so account routes can verify passwords without a second DB read.
- Blocking someone hides the **Message** button on their profile and shows
  Unblock instead — that's my reading of "respecting existing block state".

## Deliberately narrowed / not done

- **`S3StorageProvider` is not implemented** — exactly as the provider pattern
  prescribes (same as `StripeVerificationProvider`). The interface, env gating,
  and setup docs are in place; the class throws with instructions.
- **No image content moderation** — flagged in the brief as "flag but don't
  build". Now called out in README's pre-launch list (two bullets: moderation
  path, and local-disk fragility) and here.
- Replies on the profile page link to their **thread**, not to the individual
  reply (no anchor/deep-link support exists for posts yet).
- The web `Avatar` in the feed appears in `next/image`-less `<img>` form,
  matching the repo's existing `no-img-element` eslint-disable pattern.
- Search results (mentioned in the brief as "search results later") don't exist
  yet — nothing to link.

## Things a human should check

- **iOS was NOT run in the Simulator.** The standing instructions for this
  overnight run forbid long-running dev servers, so the brief's "verify in the
  Simulator" acceptance item is unmet. Everything typechecks and mirrors the
  web flow, but treat the mobile screens (especially the image picker → upload
  path and cross-tab navigation from a profile's Message button) as visually
  unverified. Same for browser screenshots at 1280/375px — not taken.
- The mobile upload converts the manipulated file URI to a Blob via
  `fetch(uri).blob()`. This is the standard Expo approach, but it's the one
  piece of the mobile flow I could not exercise without a device/simulator.
- `expo-image-manipulator`'s modern context API (`ImageManipulator.manipulate`)
  is used, not the deprecated `manipulateAsync` — worth a quick on-device sanity
  check since the API is new in recent SDKs.
- Rate limits: avatar upload/remove and `PATCH /me` sit behind `writeLimiter`;
  password/email/delete sit behind `authLimiter` (10 per 15 min — deletion with
  wrong password is a brute-force oracle otherwise). Sensible, but numbers are
  judgment calls.
- Deleted users' names render as "[deleted]" with a "?" initial avatar; tapping
  through to their profile 404s ("User not found"). Fine, but slightly abrupt —
  a designed tombstone page would be nicer.
- `docs/prompts/README.md` says "apps/api is feature-complete for briefs 01–03
  and should not be modified by them" — but brief 02's own "API work" section
  explicitly lists the endpoints added here. I followed the brief (the task
  instructions also demanded the storage provider). Flagging the contradiction.

## Verification output (actual)

```
apps/api:        npx tsc --noEmit   → clean (exit 0)
packages/shared: npx tsc --noEmit   → clean (exit 0)
apps/mobile:     npx tsc --noEmit   → clean (exit 0)
apps/web:        npx tsc --noEmit   → clean (exit 0)

apps/web: npx next build →
  ✓ Compiled successfully; all 18 routes generated, including
  ├ ○ /settings/profile                    4.11 kB         113 kB
  ├ ƒ /u/[userId]                          4.72 kB         114 kB

apps/api: npm test →
  Test Files  13 passed (13)
  Tests       96 passed (96)     (69 pre-existing + 27 added by this run)

packages/shared: npm test →
  Tests       7 passed (7)
```
