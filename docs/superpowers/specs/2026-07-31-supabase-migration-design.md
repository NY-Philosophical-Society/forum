# Supabase migration — design

**Date:** 2026-07-31
**Status:** approved, not yet implemented

Moves the API off SQLite onto Supabase Postgres and replaces our hand-rolled
identity layer with Supabase Auth, across API, web, and mobile in one pass.

This is the execution design for `docs/SUPABASE-MIGRATION.md`, which already
settled the architecture: **Supabase is the database host and auth provider;
Express stays the API layer; no PostgREST; no RLS.** That is not reopened here.

The repository is three days old (77 commits) and the Supabase project holds
zero rows. There is no data to preserve and no backward compatibility to keep.

---

## 1. Local Supabase stack, isolated

The developer runs a second local Supabase stack for another project
(`proposit-server`), which holds the default port block. This project takes its
own `project_id` — which namespaces the Docker container names — and a distinct
port block, so both stacks run simultaneously.

`supabase init` at the repo root, then in `supabase/config.toml`:

| | `proposit-server` | this project |
| --- | --- | --- |
| `project_id` | `proposit-server` | `nyps-forum` |
| API / kong | 54321 | **54421** |
| Postgres | 54322 | **54422** |
| Studio | 54323 | **54423** |
| Inbucket | 54324 | **54424** |
| analytics | 54327 | **54427** |
| db shadow | 54320 | **54420** |
| db pooler | 54329 | **54429** |

Also in `config.toml`:

- `[auth] enable_confirmations = false` — the test suite and seed create users
  non-interactively.
- `[auth.rate_limit]` raised well above defaults. GoTrue rate-limits signups per
  hour by default; 184 tests each minting several users will trip it, and the
  failure looks like an unrelated auth bug.
- Verify whether CLI 2.106 supports local asymmetric JWT signing keys
  (`supabase gen signing-key` + `[auth] signing_keys_path`). See §4.

`supabase start` must be running for `npm test` and for local dev. This ends
zero-setup local dev; that cost was accepted when Supabase was chosen.

## 2. Database: Prisma → Postgres

`apps/api/prisma/schema.prisma`:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")      // pooled (Supavisor 6543) in production
  directUrl = env("DIRECT_DATABASE_URL") // direct (5432), used for migrations
}
```

The 12 existing migrations contain SQLite DDL and cannot replay on Postgres.
Delete `prisma/migrations/` and generate a single fresh initial migration
against the local stack. Nothing is lost — every database involved is empty.

### Case-insensitive search must be restored explicitly

SQLite's `LIKE` is case-insensitive for ASCII; Postgres' is not. Prisma's
`{ contains: q }` compiles to `LIKE`, so search silently stops matching on
Postgres unless each site passes `mode: "insensitive"`. This is a query-level
fix — regenerating migrations does not address it.

Eight sites:

- `src/lib/search.ts` — thread title, thread body, post body, `displayName`
- `src/routes/directory.ts` — `displayName`, `directoryBio`
- `src/routes/admin.ts` — member `displayName`, member `email`, thread `title`
- `src/routes/users.ts` — mention autocomplete `displayName`

A test asserting a case-mismatched search hit must exist, or this regresses
silently again later.

## 3. Identity model: `User.id` **is** `auth.users.id`

`User.id` becomes the Supabase auth uid (uuid) rather than a cuid, with no
separate `supabaseId` column. One identity, one column, no join on every
authenticated request, nothing that can drift out of sync. Every foreign key in
the schema is already `String`, so no relation changes shape.

`@default(cuid())` is dropped from `User.id` — the id is always supplied.

### Row creation: lazy, via upsert — in **one shared resolver**

`docs/SUPABASE-MIGRATION.md` leaves trigger-vs-lazy open. Lazy is chosen: the
logic lives in one place in application code, it is testable without database
triggers, and it keeps the local test database (which has no `auth` schema —
see §7) working identically to production.

The upsert lives in a single `resolveUser(token)` helper that **both
`requireAuth` and `optionalAuth` call**. Putting it only in `requireAuth` would
be a bug: `optionalAuth` does its own lookup and treats a missing row as logged
out, so a user whose first request after signing up hits an `optionalAuth` route
— `GET /api/threads` or `GET /api/threads/:id`, i.e. the feed and any thread
page — would hold a valid token, have no row, and be served the anonymous
220-character preview wall while the UI showed them signed in. It would
self-heal the moment `/me` ran, which makes it an intermittent bug rather than
an obvious one.

Upsert rather than find-then-create, so two concurrent first requests cannot
race into a unique-constraint error.

`optionalAuth` keeps its never-reject contract: `resolveUser` returning nothing,
or throwing on an invalid token, still reads as logged out.

- `id` ← `sub`
- `email` ← `email` claim, refreshed on every request so an email changed in
  Supabase propagates (admin screens and DM code read `User.email`)
- `displayName` ← `user_metadata.display_name`, falling back to the email
  local-part; set on create only, never overwritten (users can edit it here)

### There is no foreign key to `auth.users`

Deliberate. In production both live in one database and an FK would be possible;
in tests `public.User` lives in a throwaway database while auth lives in the
shared local stack. Not modelling the FK keeps the two environments identical.

## 4. API: JWT verification

New `apps/api/src/lib/supabase.ts`:

- **Verification** — `jose` with `createRemoteJWKSet` against
  `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`, cached by `jose`. Preferred
  because it is one code path shared by local and production and needs no
  secret in the API's environment.
- **Fallback** — if the local stack in CLI 2.106 cannot be configured for
  asymmetric signing keys, verification falls back to HS256 against
  `SUPABASE_JWT_SECRET`. Decide this by inspecting the generated `config.toml`
  during implementation; prefer the single JWKS path if it is available.
- **Admin client** — `createClient` with the service-role key, used only by the
  seed script and by account deletion (§5).

`middleware/auth.ts` changes in exactly one place: `verifyToken(token)` →
verify the Supabase JWT, take `sub`, upsert/load the local row.

**Everything downstream is untouched.** `requireVerified`, `requireMember`,
`requireAdmin`, and the per-request `bannedAt`/`deletedAt` re-read all read our
`User` row, not the token. The authorization ladder and every access tier keep
their current semantics — including the anonymous 220-character preview wall,
which is why Express stays in front of the database at all.

`optionalAuth` keeps its contract: an invalid token reads as logged out, never
as an error.

## 5. What is deleted

**API dependencies:** `bcryptjs`, `jsonwebtoken`, `google-auth-library`,
`apple-signin-auth`.

**API files:** `src/auth.ts`, `src/lib/oauth.ts`, `src/lib/oauth-user.ts`.

**The `Express.Request.user` type declaration** in `src/middleware/auth.ts`
carries `passwordHash`, and `toRequestUser` copies it. Both must drop it or the
build fails.

**Prisma models/columns:** `PasswordResetToken` model;
`User.passwordHash`, `User.googleId`, `User.appleId`.

**API routes** (all in `src/routes/auth.ts`): `POST /signup`, `POST /login`,
`POST /change-password`, `POST /change-email`, `GET /oauth/config`,
`POST /oauth/google`, `POST /oauth/apple`, `POST /oauth/dev-mock`,
`POST /password-reset/request`, `POST /password-reset/confirm`.

**Kept:** `GET /me`, `GET /account`, `POST /redeem-code`. `GET /account` loses
`hasPassword` and keeps `email` plus the directory settings.

### `hasPassword` needs a replacement, not just a deletion

Both settings screens use `hasPassword` to switch between "Set a password" and
"Change password", and to decide whether to demand the current password. Under
Supabase every account *can* have a password — an OAuth user adds one with
`updateUser` — so the flag's meaning changes rather than disappearing. The
clients read `user.identities` / `app_metadata.providers` from the Supabase
session instead, and the distinction is now "this account signs in with Google"
rather than "this account has no password". The API is out of this loop
entirely.

**Web:** `src/app/oauth/`, `src/app/forgot-password/`, `src/app/reset-password/`.
Additionally `src/app/settings/page.tsx` calls `/auth/change-password`,
`/auth/change-email` and `DELETE /api/users/me`, and branches on `hasPassword`
in ten places — all of it moves to supabase-js (§6).

**Mobile:** `MockOAuthScreen.tsx`, `ForgotPasswordScreen.tsx`, `OAuthButtons.tsx`
and their navigation entries. Additionally `AccountScreen.tsx` (calls
`/auth/account`, `/auth/change-password`, `/auth/change-email`),
`SettingsScreen.tsx` (`/auth/account` for directory settings — that part
survives) and `lib/auth-context.tsx` all need rework, not just deletion.

**Shared schemas** that no longer have an endpoint *or* a form:
`googleAuthSchema`, `appleAuthSchema`, `oauthDevMockSchema`,
`confirmPasswordResetSchema`, and the `AuthResponse` type.

`signupSchema`, `loginSchema`, `changePasswordSchema`, `changeEmailSchema` and
`requestPasswordResetSchema` are **kept** — their endpoints go, but the web and
mobile forms still validate against them client-side before calling Supabase.
Losing `signupSchema` would silently drop the "Enter your real first and last
name" rule, which is a product behavior, not an artifact of our auth endpoints.

### Account deletion: re-authentication replaces the password check

`DELETE /api/users/me` (`src/routes/users.ts`) today bcrypt-compares a submitted
password against `passwordHash`, then anonymizes the row — and that anonymize
update writes `passwordHash: null, googleId: null, appleId: null`, columns that
are about to stop existing. This is the one place where deleting the credential
layer removes a live security check rather than just moving it.

The bar being protected: a borrowed or stolen session must not be able to delete
the account. Under a hard switch, the server has no password to verify, so the
equivalent is a **freshly-authenticated session**:

- Clients re-authenticate through Supabase immediately before deleting —
  `signInWithPassword` for password accounts, `signInWithOAuth` for the rest —
  which mints a new token.
- The API enforces it server-side by requiring the JWT's `iat` to be within a
  short window (5 minutes). UI-only enforcement would not be a security control.
- `deleteAccountSchema.password` is dropped; `confirm: "DELETE"` stays. The
  schema comment explaining the password rule goes with it.

The anonymize update drops the three credential columns; everything else about
it is unchanged — content stays under `[deleted]`, the email is still
tombstoned, push tokens and notifications are still cleared. It then calls the
Supabase admin API to delete the auth user, so the credentials go with it.

## 6. Clients

### Web (`apps/web`)

Add `@supabase/supabase-js`. All of it lands inside
`src/lib/auth-context.tsx`; the context keeps exposing `{ user, token, loading,
login, signup, logout, refreshUser }`, so **no screen and no call in `api.ts`
changes**. Only the token's origin moves.

- `token` becomes `session.access_token`, read from `onAuthStateChange` rather
  than `localStorage`; supabase-js owns persistence and refresh.
- `login`/`signup` call `signInWithPassword`/`signUp`; signup passes
  `options.data.display_name`.
- `user` still comes from `GET /api/auth/me`, which is what applies the ban
  check and returns our application fields.
- Google/Apple buttons call `signInWithOAuth`; the mock screens go.
- Password reset becomes `resetPasswordForEmail` plus a Supabase-hosted flow.

New env in `.env.local.example`: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`.

`npx next build` before pushing — `next dev` does not catch the
`useSearchParams()`-outside-`<Suspense>` prerender failure, and the auth
callback route is exactly the shape that trips it.

### Mobile (`apps/mobile`)

Same shape, in `src/lib/auth-context.tsx`. Add `@supabase/supabase-js`;
`@react-native-async-storage/async-storage`, `expo-auth-session`,
`expo-web-browser`, and `expo-apple-authentication` are already installed.

Client configured with `storage: AsyncStorage`, `detectSessionInUrl: false`.
OAuth uses `expo-auth-session` + `expo-web-browser` against Supabase's authorize
URL. New env: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

Mobile has never been run in a simulator (`xcode-select` is unresolved), so
mobile ships typechecked only, as every mobile change in this repo has. That is
a known limitation, not a new one.

## 7. Tests

The compatibility bar: **the ~135 non-auth tests must pass untouched.** If they
don't, the migration went wider than intended — stop and look.

- `src/test/global-setup.ts` creates a throwaway *database* on the local stack
  (`nyps_api_test_<random>`) instead of a temp SQLite file, runs
  `prisma migrate deploy` against it, and drops it in teardown.
- `src/test/setup.ts` keeps its guard, matching on the `nyps_api_test_` database
  name instead of the temp file path. It must still refuse to run against
  anything else. Its per-file wipe list calls
  `prisma.passwordResetToken.deleteMany()` — that model is gone, so the line
  must go too or every test file dies in `beforeAll`.
- `src/test/helpers.ts` — `signup()` is the single chokepoint every test funnels
  through for a token. It calls the local GoTrue (`signUp` with the anon key,
  confirmations disabled) and returns the access token. `verifyUser`,
  `promoteToAdmin`, `makeSupporter`, `signupMember`, `signupAdmin`,
  `createThread`, `createPost` and the rest are unchanged.
- Auth users accumulate in the shared local stack across runs. Emails are
  already unique per test (`randomUUID`), so this is harmless; `supabase stop
  --no-backup` clears it. Not worth cleanup code.
- `rate-limit.test.ts` must be **repointed**: it drives `POST /api/auth/login`,
  which this migration deletes. It still proves our limiter's 429 path fires
  with `DISABLE_RATE_LIMIT` unset — that is our `authLimiter`, not GoTrue's —
  but against a surviving route that still uses it (`POST /api/auth/redeem-code`
  or `DELETE /api/users/me`).

Test fates, per `docs/SUPABASE-MIGRATION.md`:

| File | Fate |
| --- | --- |
| `middleware/auth.test.ts` | Rewritten — same assertions, Supabase-issued tokens |
| `routes/auth.test.ts` | Mostly deleted; signup/login are Supabase's now |
| `routes/auth.account.test.ts` | Split — password/email change go; deletion and export stay |
| `routes/auth.password-reset.test.ts` | Deleted |
| `routes/auth.redeem.test.ts` | Unchanged — WISDOMKEY is ours |

New coverage required:

1. A token signed by something other than Supabase is rejected 401.
2. First authenticated request creates the `User` row; the second reuses it.
3. A banned user's live session is rejected 403 on the next request, with a
   valid Supabase token — the ban check must not have moved into the token.
4. Case-mismatched search returns the hit (§2).
5. An `optionalAuth` route as the very first request after signup returns the
   full body, not the preview wall — the shared resolver, §3.
6. Account deletion with a stale token is rejected; with a fresh one it
   succeeds — §5.

## 8. Seed

`prisma/seed.ts` creates its five demo accounts through the Supabase admin API
(`email_confirm: true`) and uses the returned uids as `User.id`. The demo
password stays `demo-password-123` so `docs/PROJECT.md`'s account list keeps
working. The seed is idempotent: an existing auth user is looked up rather than
re-created.

## 9. Remote project

`izvomynkpvguisjdintq` (`forum`, us-east-1) already has 21 public tables from a
`prisma db push` — no `_prisma_migrations` table, so Prisma does not consider it
managed. All tables are empty.

Local is brought fully green first. Then the remote public schema is dropped and
`prisma migrate deploy` applies the fresh migration properly. **The drop is
confirmed with the owner before it runs**, even at zero rows.

RLS stays enabled with no policies on every table, which is correct: Express
connects with a privileged role and bypasses it, and a stray client with the
anon key gets nothing.

## 10. Documentation to update

- `docs/PROJECT.md` §4 — open backend questions 1 and 2 are now answered
- `docs/SUPABASE-MIGRATION.md` — mark executed, record the linkage decision
- `docs/API-CHANGES.md` — the deleted auth endpoints
- `README.md` — `supabase start` is now a prerequisite; the OAuth mock and
  password-reset dev-link sections go
- `CLAUDE.md` — SQLite test isolation description, and the auth ladder entry

## Acceptance

1. `supabase start` runs alongside `proposit-server` with neither stack
   disturbed.
2. `cd apps/api && npm test` — the ~135 non-auth tests pass unmodified; the
   rewritten auth tests pass; total count is reported honestly.
3. `cd apps/api && npm run build`, `cd apps/web && npx next build`,
   `cd apps/mobile && npx tsc --noEmit` all clean.
4. Web: sign up, sign out, sign in, post a thread, reply, get banned by an admin
   and be rejected on the next request — driven in a browser, not asserted from
   tests alone.
5. `grep -r "bcrypt\|jsonwebtoken\|passwordHash" apps/ packages/` returns
   nothing outside deleted files.

## Risks

| Risk | Handling |
| --- | --- |
| Local CLI cannot do asymmetric signing keys | HS256 fallback via `SUPABASE_JWT_SECRET` (§4) |
| GoTrue rate limits break the suite | Raised in `config.toml` before the first test run |
| Case-insensitive search regresses silently | Explicit test, §2 |
| Port collision with the other stack | Distinct `project_id` and port block, verified by running both |
| Mobile unverifiable at runtime | Typecheck only, as with every prior mobile change |
