# NYPS Forum (prototype)

> **Start here: [`docs/PROJECT.md`](docs/PROJECT.md)** — current state, decisions made,
> and every open question. Everything else in `docs/` is reference or history.

A real-name discussion feed for philosophical discussion — Reddit-style single feed (no boards),
like-only engagement (no downvotes), optional tags, and DMs — one backend, a Next.js web app, and
an Expo (React Native) iOS/Android app.

**Posting currently runs on the honor system, not a completed ID check** — see
"Access tiers" in [`docs/PROJECT.md`](docs/PROJECT.md). Real ID verification is built and can be
made mandatory again with a single environment variable whenever the club is ready for it.

**This is a working local prototype, not a production deployment.** See "What's stubbed / what's
missing before launch" below before you show this to real users.

> **Taking over the backend?** Start at **[`docs/API.md`](docs/API.md)** — the full API contract
> walked out of the running implementation: every endpoint with its auth tier, request/response
> shapes, error cases, rate limits and side effects; the auth and access-tier models; the four
> provider interfaces; every Prisma model and its invariants; and the list of skeleton shortcuts
> that must be replaced. `docs/API-CHANGES.md` logs anything added after it, and
> `docs/BACKEND-OPTIONS.md` covers the hosting decision.

## Why this shape

- **One single feed, not separate category boards.** Every thread lives in the same feed; tags
  (Ethics, Metaphysics, ...) are an optional filter on that feed, not a place a thread "lives" —
  a thread can have zero, one, or several tags.
- **Hot / New sort, like Reddit** — `GET /api/threads?sort=hot|new`. "Hot" uses the same shape as
  Reddit's original ranking formula (`log10(engagement) + seconds/45000`, see
  `apps/web/src/server/ranking.ts`), just without the sign term since there's no downvoting to push a
  score negative.
- **Likes only, no downvotes.** Voting is a plain toggle (`POST /api/threads/:id/like`,
  `POST /api/posts/:id/like`) — like or unlike, nothing else. This applies to both top-level
  threads and replies.
- **DMs.** Real-name-verified users can message each other directly (`apps/web/src/server/routes/messages.ts`).
  Gated the same way as posting: you must be `VERIFIED` to send, though anyone with an account can
  receive and read.
- **One deployable web application, one additional client.** `apps/web` contains both the
  Next.js UI and its same-origin REST route handlers; `apps/mobile` (Expo/React Native) remains
  an HTTP client. Both share types and validation through `packages/shared`.
- **Identity verification is delegated, not built.** Parsing government IDs from ~190 countries,
  detecting forged documents, and matching a live selfie to a photo ID is a specialized,
  adversarial problem — not something to hand-roll. `apps/web/src/server/verification-provider.ts`
  defines a small provider interface; the rest of the app only ever asks "is this user
  UNVERIFIED / PENDING / VERIFIED / REJECTED?" and never touches documents directly. Locally this
  runs against a stub provider so the whole product can be built and tested without a live vendor
  account. See "Going to production" below for wiring up a real provider (Stripe Identity /
  Persona / Veriff).
- **Sign up is deliberately easy; verification is deliberately separate.** Creating an account
  (email/password, Google, or Apple) never requires ID verification — that's only needed to post,
  reply, like, or DM. This is enforced server-side (`requireVerified` in
  `apps/web/src/server/guards.ts`), not just in the UI. See "Read access" below for how *reading*
  is gated differently — that's a distinct question from verification.
- **Supabase Auth is the identity provider.** Email/password and Google/Apple sign-in are all
  Supabase's; this API stores no password hash and signs no token of its own. It verifies the
  incoming Supabase JWT against the project's JWKS (`apps/web/src/server/supabase.ts`) and looks up the
  account. The local stack signs with asymmetric keys exactly so this is one code path in
  development and production. Google/Apple still need real provider credentials, configured in
  Supabase rather than here — see "Going to production" below.
- **Profiles and photos.** The founding requirement was a real name *and* a photo. Every author
  name links to a profile (`/u/[userId]` on web, a matching screen on mobile) showing avatar, bio,
  badges, and paginated threads/replies. Avatars upload from web (canvas crop/resize) and mobile
  (camera or library); the server independently validates format/dimensions/size, square-crops to
  512px, and strips EXIF metadata — embedded GPS coordinates are a real privacy leak on a
  real-name forum. Image storage follows the same provider pattern as verification
  (`apps/web/src/server/storage-provider.ts`): a zero-credential local-disk stub in dev, S3/R2 gated
  behind env vars for production. Account management (change/set password, change email, JSON data
  export, anonymizing account deletion) lives in Settings on both platforms; the credential parts
  call Supabase directly, while deletion stays ours and additionally deletes the auth user.
- **Deleting your account requires a fresh sign-in.** The API demands a recently-issued token
  (`apps/web/src/server/routes/users.ts`), so a borrowed or long-idle session can't delete an account.
  This replaces the password check it used to run itself, now that Supabase owns the password.
- **Writing is markdown, with an audit trail.** Threads, replies, and bios render markdown
  (bold, italic, links, blockquotes, lists, code, headings) through safe-by-default renderers —
  `react-markdown` without `rehype-raw` on web, `react-native-markdown-display` on mobile — so
  member text can never inject HTML. Both composers have a formatting toolbar, a live preview
  toggle, image insert, and an `@mention` autocomplete (mentions are stored structurally in a
  `Mention` table for the notifications work to come, and are suppressed across blocks in either
  direction). Authors can edit (with a visible "edited" timestamp) and delete their own posts;
  deletion is a soft delete, so a deleted reply with surviving children renders as a `[deleted]`
  tombstone instead of orphaning the conversation under it. Post images go through the same
  storage provider as avatars (`POST /api/uploads/image`, EXIF-stripped, ≤1600px), with their
  final dimensions baked into the URL so clients reserve space with no layout shift — and only
  images from our own storage render inline, so an external image URL can't be used to log
  readers' IPs.
- **Moderation is a dashboard with an audit trail.** Reports carry a required category
  (harassment, spam, off-topic, misinformation, impersonation, other) plus an optional note.
  Admins work them from `/admin` on web — a reports queue that inlines the reported content so a
  report can be judged without navigating away, member administration (ban/unban, warn, grant or
  revoke supporter, promote/demote), content management (pin, lock, delete), and a read-only
  moderation log. Every admin mutation writes one `ModerationLog` row through
  `apps/web/src/server/moderation-log.ts` — who, to whom, when, and why — and nothing in the API or
  the UI can edit or delete a row there. Every destructive action needs a typed reason before it
  will commit, so the confirmation step and the audit record are the same interaction. Bans are
  reversible and bite an existing session immediately (`requireAuth` re-reads `bannedAt`). Threads
  can be pinned above the feed, capped at 3 server-side and sorted as a separate column so
  `hotScore` is never distorted.
- **Per-user display settings** (date format MM/DD/YYYY vs. DD/MM/YYYY, light/dark mode) live
  entirely client-side — `apps/web/src/lib/settings-context.tsx` (localStorage) and
  `apps/mobile/src/lib/settings-context.tsx` (AsyncStorage). Dates are formatted with
  `formatDate`/`formatDateTime` in `packages/shared/src/format-date.ts`, which never renders
  seconds. Dark mode on web is CSS custom-property overrides (`[data-theme="dark"]` in
  `globals.css`); on mobile every screen's styles are built from a `ThemeColors` object supplied by
  context, since `StyleSheet.create` can't react to theme changes on its own.

## Layout

```
apps/
  web/      Next.js App Router UI + REST handlers + Prisma; supabase-js owns the session
  mobile/   Expo/React Native app, same API; supabase-js persists the session via AsyncStorage
supabase/   local stack config (config.toml) — ports, auth settings, email templates
packages/
  shared/   zod schemas + TS types shared by web/mobile (signup/login/thread/post/like/DM shapes)
docs/
  API.md            the API contract — start here for backend work (endpoint detail in docs/api/)
  API-CHANGES.md    dated log of everything added to the API since
  BACKEND-OPTIONS.md hosting comparison and recommendation
  DESIGN_SYSTEM.md  the binding visual system (palette, type, flat design)
  MEMBERSHIP.md     membership/chapters product decisions
  TESTING.md        how the test suite isolates itself and what it covers
```

## Running it locally

Requires Node 20+, the [Supabase CLI](https://supabase.com/docs/guides/local-development), and
Docker running. From the repo root:

```bash
npm install
```

**Supabase** (first time only — the database and the auth server both live here):

```bash
supabase gen signing-key --algorithm ES256   # writes supabase/signing_keys.json, gitignored
supabase start
```

This project deliberately runs on the **544xx** port block rather than Supabase's 543xx default,
and under its own `project_id`, so it can run alongside another local Supabase stack without
colliding on ports or container names — see `supabase/config.toml`. Studio is at
http://127.0.0.1:54423, and captured emails (password resets) at http://127.0.0.1:54424.

**Web application** (first time only: copy env, migrate, seed, run):

```bash
cd apps/web
cp .env.local.example .env.local
npm run db:migrate    # applies the Prisma migration to the local Supabase Postgres
npm run db:seed       # seeds 12 tags + 5 demo threads, and the demo accounts in Supabase Auth
cd ../..
npm run dev:web       # pages and /api at http://localhost:3000
```

**Mobile** (needs Xcode + iOS Simulator, or Expo Go on a physical device):

```bash
cd apps/mobile && cp .env.example .env && cd ../..
npm run dev:mobile     # opens Expo dev tools; press i for iOS simulator
```

On a physical device, `localhost` refers to the device itself — set `EXPO_PUBLIC_API_URL` in
`apps/mobile/.env` to your machine's LAN IP instead (e.g. `http://192.168.1.23:3000`).

## Read access

Reading and having an account are two independent gates, deliberately not tied together the same
way on every platform:

- **Web**: anonymous visitors can browse the full feed (titles, tags, sort, like counts) — that's
  the "little bit" they see for free. Opening a thread's full text and replies requires an
  account: `GET /api/threads/:id` returns a truncated body (first ~220 characters) and no replies
  at all when the request is unauthenticated (`previewOnly: true` in the response — see
  `apps/web/src/server/routes/threads.ts`), and the web app renders a "sign up to keep reading" wall card
  instead of the reply list (`apps/web/src/app/t/[id]/page.tsx`). This is enforced by the API, not
  just hidden in the UI — hitting the endpoint directly without a token gets the same truncated
  response.
- **Mobile**: there's no anonymous mode at all. `App.tsx` renders one of two entirely separate
  navigator stacks based on auth state — an `AuthStack` (Login/Signup/Settings only) when logged
  out, or the full `AppStack` once a session exists — so the feed, threads, etc. are simply
  unreachable without an account first.
- **Either way, any account (even unverified) reads in full.** The preview wall and the mobile
  login gate are both about *having an account at all*, not about identity verification — an
  unverified user reads exactly like a verified one. Verification only gates the write actions
  below.

## The verification flow, end to end

1. Sign up with your real name, email, password. Account starts `UNVERIFIED`.
2. Any signed-up user, verified or not, can **read** everything (see "Read access" above), but
   posting a thread, replying, liking, or sending a DM returns 403 until verification completes
   (`requireVerified` middleware, `apps/web/src/server/guards.ts`).
3. `/verify` calls `POST /api/verification/start`, which asks the configured
   `VerificationProvider` for a session and hosted verification URL, and flips the user to
   `PENDING`.
4. In production, that URL is the vendor's own hosted page (ID photo + selfie capture, document
   authenticity check, liveness check). Locally, it's `/verify/mock/:sessionId` — a page that
   just lets you simulate "approved" or "rejected", standing in for the vendor's webhook call.
5. Once `VERIFIED`, the user can post, reply, like, and DM other users under their real name.

## Sign-in options

Email/password, Google, and Apple all produce the exact same kind of account. Supabase issues the
session in every case; Google/Apple sign-in is just a faster way to create or return to that
account, not a separate system, and doesn't skip identity verification. A user who signs up via
Google is just as `UNVERIFIED` as one who used a password, and faces the same wall the first time
they try to post — because that wall reads our `User` row, not the token.

A Supabase user has **no forum account until their first authenticated request**. The API creates
that row from the token's claims (`resolveUser` in `apps/web/src/server/guards.ts`), which is why
both `requireAuth` and `optionalAuth` route through it — a new member whose first click is a thread
link would otherwise see the anonymous preview wall while signed in.

- Web: `apps/web/src/lib/auth-context.tsx` holds the session via supabase-js; OAuth is
  `signInWithOAuth` (`apps/web/src/app/oauth-buttons.tsx`).
- Mobile: same shape in `apps/mobile/src/lib/auth-context.tsx`, with AsyncStorage as the session
  store. OAuth opens Supabase's authorize URL through `expo-web-browser` and hands the returned
  tokens to `setSession`; the redirect scheme is declared in `app.json` **and** allow-listed in
  `supabase/config.toml`, and the flow silently fails to return if those disagree. Apple Sign-In
  still **requires a custom dev client build (EAS Build)** — it does not work in plain Expo Go.
- Password reset on web is Supabase's emailed link; on mobile it's the emailed **code**, since the
  app has no web page to land on. That code only reaches the user because the recovery email
  template includes `{{ .Token }}` — see `supabase/templates/recovery.html`. The hosted project
  needs the same template, or mobile password reset breaks while web keeps working.

## Going to production

Five things need real decisions before this goes live — flagged here rather than guessed at:

1. **Identity verification vendor.** Create a Stripe Identity (or Persona / Veriff) account,
   set `VERIFICATION_PROVIDER=stripe` + `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` in
   `apps/web/.env.local`, and implement `StripeVerificationProvider` in
   `apps/web/src/server/verification-provider.ts` (the file has the exact API calls and webhook
   events to use in its top comment). Point the vendor's webhook at
   `POST /api/verification/webhook` (not yet implemented — the stub's `/mock-complete` route is
   not safe to expose in production; it has no signature verification).
2. **Google / Apple OAuth credentials.** These are configured **in Supabase now**, not here — the
   apps never see a provider secret. In [Google Cloud Console](https://console.cloud.google.com)
   → APIs & Services → Credentials create a "Web application" OAuth client, and in
   [Apple Developer](https://developer.apple.com/account) create a Services ID with the
   "Sign In with Apple" capability on the app's Bundle ID (`org.nyphilosophy.forum`). Paste the
   client id/secret of each into the Supabase project's Authentication → Providers page, and add
   the app's redirect URLs to that project's allow-list. Locally the equivalents are the
   `[auth.external.*]` blocks and `additional_redirect_urls` in `supabase/config.toml`.
   Also copy `supabase/templates/recovery.html` into Authentication → Email Templates, or mobile
   password reset (which needs the `{{ .Token }}` code) will break.
3. **Image storage bucket.** Avatars and post-image embeds are stored via the
   provider in `apps/web/src/server/storage-provider.ts`. Locally they sit on disk under
   `apps/web/uploads/` and are served by the API itself — fine for one dev machine, not for
   production. Create an S3 or Cloudflare R2 bucket, set `STORAGE_PROVIDER=s3` plus the
   `STORAGE_S3_*` variables in `apps/web/.env.local`, and implement `S3StorageProvider` (the file's top
   comment has the exact steps). The local stub refuses to run once real credentials are set.
4. **Hosting.** The database is already Postgres on Supabase; point `DATABASE_URL` at the hosted
   project's **pooled** connection (Supavisor, port 6543, with
   `?pgbouncer=true&connection_limit=1`) and `DIRECT_URL` at the direct one on 5432 — Prisma runs
   migrations over the direct URL, and aiming migrations at the pooled one is the classic way to
   break this. Set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` to the hosted project's values, and the
   `NEXT_PUBLIC_SUPABASE_*` / `EXPO_PUBLIC_SUPABASE_*` pairs to its URL and publishable key. Host
   the consolidated `apps/web` project on Vercel. Ship `apps/mobile` via EAS Build once the
   application has a stable public URL.

   **Deploying `apps/web` to Vercel — two gotchas, both already hit:**
   - Set **Root Directory** to `apps/web` in Settings → General. This is a workspaces monorepo;
     the repo root has no `next` dependency, so a root-level build fails with
     *"No Next.js version detected."*
   - Server-side database, Supabase secret, and provider variables belong in Vercel; only
     `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are browser-visible.
     There is no separate API URL: web requests are same-origin.
   - Any page using `useSearchParams()` must sit inside a `<Suspense>` boundary or `next build`
     fails at static prerender (`next dev` won't catch this). Run `npx next build` locally before
     pushing.
5. **Legal/compliance review.** Storing real names + verification status (even without raw ID
   images, which the vendor should hold) still means handling PII under state/international
   privacy law. Get a privacy policy and ToS reviewed before launch, and decide who is the legal
   data controller (the Society itself, or a separate entity) for this application.

## What's stubbed / what's missing before launch

- Verification is a local mock — **no real identity is ever checked.** Do not treat any account
  in this prototype as verified in the real sense.
- Google/Apple sign-in is also a local mock until you add real credentials — the "Continue with
  Google/Apple" buttons currently create an account from whatever name/email you type in, no
  actual Google/Apple involved.
- The web preview wall truncates by character count only (`apps/web/src/server/routes/threads.ts`) — it
  doesn't try to cut at a sentence/word boundary, so the teaser can end mid-word.
- **No admin bootstrap.** The *first* admin still has to be promoted by setting `role: "admin"`
  directly in the database — after that, admins promote each other from `/admin/users`. The seed
  script creates one demo admin (`admin@demo.nyphilosophy.org` / `demo-password-123`) plus two
  open demo reports so the queue isn't empty.
- **Mobile moderation is the report queue only.** Member administration, content management,
  chapter administration, event-thread creation/attendee marking, and the moderation log are
  web-only.
- **Membership is live, but the unlock is still `WISDOMKEY`.** Redeeming it makes an account a
  Member, which opens chapters (member-only sub-forums with server-enforced visibility), the
  opt-in member directory with reading-partner matching, and posting in event threads — see
  `docs/MEMBERSHIP.md` for the decisions and `docs/API-CHANGES.md` for the endpoints. Reading is
  never gated. Swap the code for a real donation/subscription check before this means anything.
- **Mobile is behind web.** Reporting, blocking, pagination, password reset, thread locking,
  supporter redemption, and the admin report list exist on web only. Closed by
  `docs/prompts/01-foundation.md`.
- **User-uploaded images (avatars AND post embeds) have no moderation path.** Uploads are
  validated (type, size, dimensions) and EXIF-stripped, but nothing reviews what the picture
  *shows* — an offensive image stays up until an admin hears about it via a user report. Post
  embeds make this surface much larger than avatars alone: any verified member can now put an
  arbitrary picture in front of every reader. Decide on a review policy (and ideally an
  automated screen) before launch.
- Avatar files uploaded via the local storage stub live in `apps/web/uploads/` and die with the
  machine — see "Image storage bucket" above before pointing real users at this.
- Account deletion anonymizes to "[deleted]" rather than erasing content. A deleted author's
  threads/replies/messages remain readable; whether that satisfies a legal erasure request is a
  question for the compliance review above.
- **Push notifications are a log-only stub.** In-app notifications, search, and saved threads
  work on both platforms, but real push delivery needs an Apple Developer APNs key (plus FCM
  for Android) uploaded to an Expo project and `EXPO_ACCESS_TOKEN` set — see
  `apps/web/src/server/push-provider.ts`. Until then pushes are logged to the API console, and
  nothing push-related can be verified end to end.
- iOS app has not been run in a Simulator in this environment (Xcode is installed but not selected
  as the active developer directory — run
  `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`) — it typechecks cleanly and
  its screens mirror the web app's already-verified flow, but treat it as unverified visually
  until you run `npm run dev:mobile` yourself.
