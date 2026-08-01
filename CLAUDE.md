# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Orientation

Read these before non-trivial work — they are maintained and authoritative:

- `docs/PROJECT.md` — current state, decisions already made, open questions. **Start here.**
- `docs/API.md` (+ `docs/api/*.md`, `docs/API-CHANGES.md`) — the endpoint contract, auth tiers, Prisma models.
- `docs/TESTING.md` — how the suite isolates its database and what the conventions are.
- `README.md` — running locally, the verification/OAuth flows, and the full "what's stubbed" list.
- `docs/prompts/README.md` — "decisions already made — don't relitigate these".

## Commands

```bash
npm install                     # root; npm workspaces

# API (first run)
cp apps/api/.env.example apps/api/.env
npm run db:migrate              # creates apps/api/prisma/dev.db
npm run db:seed                 # 12 tags, 5 demo threads, demo admin, 2 open reports

npm run dev:api                 # :4000
npm run dev:web                 # :3000  (needs apps/web/.env.local, see .env.local.example)
npm run dev:mobile              # Expo

npm test                        # all workspaces
cd apps/api && npm test         # API suite only
cd apps/api && npx vitest run src/routes/threads.access.test.ts   # one file
cd apps/api && npm run test:watch
```

Typecheck: `cd apps/api && npm run build` (tsc), `cd apps/web && npx next build`,
`cd apps/mobile && npx tsc --noEmit`. There is no lint step.

`npx next build` locally before pushing web changes — `next dev` does not catch the
`useSearchParams()`-outside-`<Suspense>` prerender failure.

## Architecture

npm-workspaces monorepo. `apps/api` (Express 4 + Prisma/SQLite) is the only backend;
`apps/web` (Next.js 14 App Router) and `apps/mobile` (Expo RN) are thin HTTP clients over it.
`packages/shared` is consumed as **TypeScript source** (`main: src/index.ts`, no build step) —
zod schemas, types, `thread-tree`, `format-date`, `strip-markdown`, `mentions`.

### Things that will bite you

- **Register routes in `apps/api/src/app.ts`, not `index.ts`.** `index.ts` only calls `listen()`;
  tests drive `app.ts` through supertest, so a route mounted elsewhere is invisible to them.
- **The authorization ladder lives in `apps/api/src/middleware/auth.ts`** and is the security
  boundary — every gate is server-side, never UI-only:
  `requireAuth` (re-reads `bannedAt`/`deletedAt` per request, so a ban bites live sessions) →
  `requireVerified` → `requireMember` (supporter or admin) → `requireAdmin`.
  `optionalAuth` never rejects — an invalid token reads as logged out (anonymous preview).
- **Posting is on the honor system.** `requireVerified` is a no-op unless
  `REQUIRE_ID_VERIFICATION=true`. The ID-verification flow is fully built behind that one switch;
  don't remove the middleware from write routes.
- **Anonymous reads get a truncated body and no replies** (`previewOnly` in
  `apps/api/src/routes/threads.ts`). That truncation is API-side — don't move the wall into the client.
- **`Thread.hotScore` is a stored column**, recomputed on like/reply (`src/lib/ranking.ts`) and used
  as a DB `ORDER BY`. Never sort in JS. Pinned threads sort as a separate column so they don't
  distort the score.
- **Four provider interfaces** follow the same shape — a zero-credential local stub, a real
  implementation gated behind env vars, and the stub refuses to run once real credentials appear:
  `verification-provider.ts`, `storage-provider.ts`, `push-provider.ts`, `oauth.ts`. Each file's top
  comment has the exact production wiring steps. The rest of the app never touches vendor details.
- **Every admin mutation writes a `ModerationLog` row** via `src/lib/moderation-log.ts`, and nothing
  may edit or delete one. Destructive admin actions require a typed reason.
- **Deletes are soft.** Deleted posts render as `[deleted]` tombstones so replies don't orphan;
  account deletion anonymizes rather than erases.
- **Uploaded images are re-encoded server-side** (sharp): format/dimension/size validated, EXIF
  stripped — GPS in an avatar is a real leak on a real-name forum. Only images from our own storage
  render inline, so an external URL can't log readers' IPs.
- **Markdown renders without raw HTML** — `react-markdown` with no `rehype-raw` on web,
  `react-native-markdown-display` on mobile. Keep it that way.
- **Format dates with `formatDate`/`formatDateTime` from `packages/shared`**, never
  `toLocaleDateString` — the MM/DD vs DD/MM choice is a per-user setting and timestamps never show
  seconds.

### Tests

Vitest + supertest, colocated as `*.test.ts`. Global setup builds a throwaway migrated SQLite DB in
`$TMPDIR/nyps-api-test-*`; the worker setup refuses to run if `DATABASE_URL` lacks that marker, so
`dev.db` can never be hit. Files run serially in fresh forks and the DB is wiped per file.

Test through the routes, not Prisma — the authorization bugs live in middleware. Mint verified users
via the real signup → `/api/verification/start` → mock-complete flow, not by writing
`verificationStatus`. Rate limits are bypassed via `DISABLE_RATE_LIMIT=1`, checked per request, and
`src/lib/rate-limit.test.ts` unsets it to prove the 429 path still fires.

### UI

Design tokens (stone / ink / terracotta, the type and spacing scales) are defined once per platform:
CSS custom properties in `apps/web/src/app/globals.css`, with dark mode as `:root[data-theme="dark"]`
overrides; a `ThemeColors` object from `apps/mobile/src/lib/theme.ts` passed through context on mobile,
because `StyleSheet.create` can't react to theme changes. Reference the tokens, never hardcode hexes.
`docs/DESIGN_SYSTEM.md` is the palette's source of truth — but note it describes the marketing site's
Tailwind `@theme` setup; this repo has no Tailwind, only the token *values* carry over.

Shared web primitives live in `apps/web/src/app/ui.tsx` (Avatar, EmptyState, Skeletons, ConfirmAction,
StatusBadge); mobile equivalents in `apps/mobile/src/components/`. Look there before writing a new one.

Mobile trails web deliberately — see the parity gaps listed in README's "what's stubbed" section
before assuming a feature exists on both.
