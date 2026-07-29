# NYPS Forum (prototype)

A real-name, ID-verified discussion feed for philosophical discussion — Reddit-style single feed
(no boards), like-only engagement (no downvotes), optional tags, and DMs — one backend, a Next.js
web app, and an Expo (React Native) iOS/Android app.

**This is a working local prototype, not a production deployment.** See "What's stubbed / what's
missing before launch" below before you show this to real users.

## Why this shape

- **One single feed, not separate category boards.** Every thread lives in the same feed; tags
  (Ethics, Metaphysics, ...) are an optional filter on that feed, not a place a thread "lives" —
  a thread can have zero, one, or several tags.
- **Hot / New sort, like Reddit** — `GET /api/threads?sort=hot|new`. "Hot" uses the same shape as
  Reddit's original ranking formula (`log10(engagement) + seconds/45000`, see
  `apps/api/src/lib/ranking.ts`), just without the sign term since there's no downvoting to push a
  score negative.
- **Likes only, no downvotes.** Voting is a plain toggle (`POST /api/threads/:id/like`,
  `POST /api/posts/:id/like`) — like or unlike, nothing else. This applies to both top-level
  threads and replies.
- **DMs.** Real-name-verified users can message each other directly (`apps/api/src/routes/messages.ts`).
  Gated the same way as posting: you must be `VERIFIED` to send, though anyone with an account can
  receive and read.
- **One backend, two clients.** `apps/api` is a plain REST API; `apps/web` (Next.js) and
  `apps/mobile` (Expo/React Native) are both thin clients over it, sharing types/validation via
  `packages/shared`. Nothing platform-specific lives in the API.
- **Identity verification is delegated, not built.** Parsing government IDs from ~190 countries,
  detecting forged documents, and matching a live selfie to a photo ID is a specialized,
  adversarial problem — not something to hand-roll. `apps/api/src/lib/verification-provider.ts`
  defines a small provider interface; the rest of the app only ever asks "is this user
  UNVERIFIED / PENDING / VERIFIED / REJECTED?" and never touches documents directly. Locally this
  runs against a stub provider so the whole product can be built and tested without a live vendor
  account. See "Going to production" below for wiring up a real provider (Stripe Identity /
  Persona / Veriff).
- **Sign up is deliberately easy; verification is deliberately separate.** Anyone can create an
  account (email/password, Google, or Apple) and read/browse immediately — no wall. Only posting,
  replying, liking, and DMing require the identity check. This is enforced server-side
  (`requireVerified` in `apps/api/src/middleware/auth.ts`), not just in the UI.
- **Google / Apple sign-in verify a provider-issued identity token server-side** (same trust model
  as the identity-verification piece: verify a signed assertion, never touch a password). See
  `apps/api/src/lib/oauth.ts`. Neither works without real credentials from Google Cloud Console /
  Apple Developer, which only you can create — see "Going to production" below. Until then, both
  buttons fall back to a local mock sign-in screen so the UX can be built and demoed today.

## Layout

```
apps/
  api/      Express + Prisma (SQLite locally) + JWT auth + verification stub + feed/likes/DM API
  web/      Next.js app (App Router), talks to the API over HTTP, JWT stored in localStorage
  mobile/   Expo/React Native app, same API, JWT stored via AsyncStorage
packages/
  shared/   zod schemas + TS types shared by api/web/mobile (signup/login/thread/post/like/DM shapes)
```

## Running it locally

Requires Node 20+. From the repo root:

```bash
npm install
```

**API** (first time only: copy env, migrate, seed):

```bash
cd apps/api
cp .env.example .env
npm run db:migrate   # creates apps/api/prisma/dev.db (SQLite)
npm run db:seed       # seeds 4 sample tags
cd ../..
npm run dev:api        # http://localhost:4000
```

**Web:**

```bash
cd apps/web && cp .env.local.example .env.local && cd ../..
npm run dev:web        # http://localhost:3000
```

**Mobile** (needs Xcode + iOS Simulator, or Expo Go on a physical device):

```bash
cd apps/mobile && cp .env.example .env && cd ../..
npm run dev:mobile     # opens Expo dev tools; press i for iOS simulator
```

On a physical device, `localhost` refers to the device itself — set `EXPO_PUBLIC_API_URL` in
`apps/mobile/.env` to your machine's LAN IP instead (e.g. `http://192.168.1.23:4000`).

## The verification flow, end to end

1. Sign up with your real name, email, password. Account starts `UNVERIFIED`.
2. Any unverified/pending user can **read** everything, but posting a thread, replying, liking, or
   sending a DM returns 403 until verification completes (`requireVerified` middleware,
   `apps/api/src/middleware/auth.ts`).
3. `/verify` calls `POST /api/verification/start`, which asks the configured
   `VerificationProvider` for a session and hosted verification URL, and flips the user to
   `PENDING`.
4. In production, that URL is the vendor's own hosted page (ID photo + selfie capture, document
   authenticity check, liveness check). Locally, it's `/verify/mock/:sessionId` — a page that
   just lets you simulate "approved" or "rejected", standing in for the vendor's webhook call.
5. Once `VERIFIED`, the user can post, reply, like, and DM other users under their real name.

## Sign-in options

Email/password, Google, and Apple all produce the exact same kind of account (a `User` row with a
JWT session) — Google/Apple sign-in is just a faster way to create or return to that account, not
a separate system, and doesn't skip identity verification. A user who signs up via Google is just
as `UNVERIFIED` as one who used a password, and faces the same wall the first time they try to
post.

- Web: Google uses [Google Identity Services](https://developers.google.com/identity/gsi/web)
  (`apps/web/src/app/oauth-buttons.tsx`); Apple uses
  [Sign in with Apple JS](https://developer.apple.com/documentation/sign_in_with_apple/sign_in_with_apple_js).
  Both POST the resulting identity token to the API, which verifies it and returns our own JWT —
  same session mechanism as email/password.
- Mobile: Google uses `expo-auth-session`; Apple uses `expo-apple-authentication`
  (`apps/mobile/src/components/OAuthButtons.tsx`). Apple Sign-In specifically **requires a custom
  dev client build (EAS Build)** — it does not work in plain Expo Go, since it needs the "Sign In
  with Apple" capability tied to a real bundle identifier.
- Without real credentials configured, both platforms fall back to a mock sign-in screen
  (`/oauth/mock/[provider]` on web, `MockOAuthScreen` on mobile) backed by
  `POST /api/auth/oauth/dev-mock` — good enough to build and demo the flow, never a substitute for
  the real thing. That route refuses to run at all once real credentials are configured, so it
  can't become an accidental backdoor in production.

## Going to production

Four things need real decisions before this goes live — flagged here rather than guessed at:

1. **Identity verification vendor.** Create a Stripe Identity (or Persona / Veriff) account,
   set `VERIFICATION_PROVIDER=stripe` + `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` in
   `apps/api/.env`, and implement `StripeVerificationProvider` in
   `apps/api/src/lib/verification-provider.ts` (the file has the exact API calls and webhook
   events to use in its top comment). Point the vendor's webhook at
   `POST /api/verification/webhook` (not yet implemented — the stub's `/mock-complete` route is
   not safe to expose in production; it has no signature verification).
2. **Google / Apple OAuth credentials.** In
   [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials,
   create a "Web application" OAuth client (for `apps/web`) and an "iOS" OAuth client (for
   `apps/mobile`, using its bundle identifier `org.nyphilosophy.forum`). Set
   `GOOGLE_WEB_CLIENT_ID` / `GOOGLE_IOS_CLIENT_ID` in `apps/api/.env`,
   `NEXT_PUBLIC_GOOGLE_CLIENT_ID` in `apps/web/.env.local`, and
   `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` in `apps/mobile/.env`. In
   [Apple Developer](https://developer.apple.com/account) → Certificates, IDs & Profiles, create a
   Services ID (with your web domain + redirect URL registered) for web, and enable the "Sign In
   with Apple" capability on the app's Bundle ID for mobile. Set `APPLE_SERVICES_ID` /
   `APPLE_BUNDLE_ID` in `apps/api/.env`. Full detail in `apps/api/src/lib/oauth.ts`.
3. **Real database + hosting.** Swap `apps/api/prisma/schema.prisma`'s datasource from `sqlite`
   to `postgresql`, point `DATABASE_URL` at a real Postgres instance, and host the API somewhere
   that runs a long-lived Node process (Railway, Render, Fly.io — not Vercel serverless, which
   doesn't suit a stateful Express app well). Deploy `apps/web` to Vercel/Netlify pointed at that
   API. Ship `apps/mobile` via EAS Build once the API has a stable public URL.
4. **Legal/compliance review.** Storing real names + verification status (even without raw ID
   images, which the vendor should hold) still means handling PII under state/international
   privacy law. Get a privacy policy and ToS reviewed before launch, and decide who is the legal
   data controller (the Society itself, or a separate entity) for this application.

## What's stubbed / what's missing before launch

- Verification is a local mock — **no real identity is ever checked.** Do not treat any account
  in this prototype as verified in the real sense.
- Google/Apple sign-in is also a local mock until you add real credentials — the "Continue with
  Google/Apple" buttons currently create an account from whatever name/email you type in, no
  actual Google/Apple involved.
- No account-linking UI — if you sign up with a password then later use "Continue with Google"
  using the same email, the accounts merge automatically server-side, but there's no in-app
  indication that happened.
- No moderation tools (reporting, banning, thread locking) — notably absent given DMs exist; a
  block/report path for messages should land before real users touch this.
- No password reset flow.
- No rate limiting on signup/login/posting/messaging.
- No pagination (feed, reply lists, and conversation history all load in full — fine for a demo,
  not for scale).
- "Hot" is computed by fetching every thread and sorting in JS (`apps/api/src/routes/threads.ts`)
  — fine at prototype scale, but will need to move to a DB-computed/cached score before the feed
  has more than a few hundred threads.
- iOS app has not been run in a Simulator in this environment (Xcode's command-line tools are
  installed but not the full Xcode app, which the Simulator needs) — it typechecks cleanly and
  its screens mirror the web app's already-verified flow, but treat it as unverified visually
  until you run `npm run dev:mobile` yourself.
