# Supabase migration plan

> **Executed 2026-07-31.** Kept as the record of what was decided and why. Two
> things went differently from the plan below and are worth knowing:
> **(1)** there is no `supabaseId` column — `User.id` *is* the Supabase auth
> uuid; **(2)** account deletion could not simply "keep working", because it
> authenticated with the password hash being deleted. It now requires a
> freshly-issued token instead. The linkage question is settled: lazy creation,
> in a resolver shared by `requireAuth` and `optionalAuth`.
>
> Current state lives in `docs/PROJECT.md`; the execution design, including the
> Postgres behaviour changes that fail silently, is in
> `docs/superpowers/specs/2026-07-31-supabase-migration-design.md`.

**Decision (2026-07-30):** Supabase is the **database host and auth provider**.
Express stays as the API layer. This is narrower than "Supabase for everything"
and it avoids the objections in `docs/BACKEND-OPTIONS.md` — we are not adopting
PostgREST, and we are not expressing our authorization rules in RLS.

Read `docs/API.md` for what the current implementation does. This document is
only the delta.

## Target architecture

```
web / mobile  ──sign in──▶  Supabase Auth  ──issues JWT──▶  client
client  ──Bearer <supabase jwt>──▶  Express API  ──Prisma──▶  Supabase Postgres
```

Express remains the only database client, and remains where authorization is
enforced. Supabase is infrastructure, not the API.

## What changes

### 1. Database host

Point Prisma at Supabase Postgres. Two connection strings, and using the wrong
one is the classic mistake:

- **Application runtime** → the **pooled** connection (Supavisor, port 6543),
  with `?pgbouncer=true&connection_limit=1` for Prisma
- **Migrations** → the **direct** connection (port 5432), via Prisma's
  `directUrl`

Everything else about the data model is unchanged — the SQLite→Postgres notes in
`BACKEND-OPTIONS.md` §7 still apply (case-insensitive `contains` needs an
explicit `mode: "insensitive"` on Postgres).

### 2. Auth provider

Supabase Auth replaces our JWT issuance, password hashing, and OAuth linking.

**Deleted from our codebase:**

| Gone | Replaced by |
| --- | --- |
| `passwordHash` + bcrypt | Supabase Auth |
| `googleId` / `appleId` + `lib/oauth.ts` | Supabase social providers |
| Password-reset tokens + `PasswordResetToken` model | Supabase's reset flow |
| Our JWT signing | Supabase-issued JWT |
| The dev OAuth mock screens | Real providers work in dev |

**Kept in our `User` table**, keyed by the Supabase user id — these are
application state, not identity, and Supabase has no opinion about them:

`displayName` · `avatarUrl` · `bio` · `verificationStatus` · `isSupporter` ·
`supporterSince` · `role` · `bannedAt` · `directoryVisible` · `directoryBio` ·
`deletedAt`

**Middleware change:** `requireAuth` stops verifying our own JWT and instead
verifies the Supabase JWT (JWKS or the project's JWT secret), then loads the
local `User` row by Supabase id. Everything downstream — `requireVerified`,
`requireAdmin`, the ban check, the access tiers — is unchanged, because those
read our `User` row, not the token.

**A `User` row must exist for every Supabase auth user.** Either a database
trigger on `auth.users` insert, or lazy creation on first authenticated request.
Lazy creation is simpler to test and keeps the logic in one place; a trigger is
harder to get wrong in production. Engineer's call.

### 3. RLS is not needed

Because Express is the only database client and connects with a privileged role,
**row-level security adds nothing here** and would duplicate rules that already
live in middleware. Do not spend time on RLS policies unless a client is ever
pointed directly at Postgres.

This matters: the reason full Supabase was rejected is that our anonymous tier
truncates a thread body to 220 characters rather than hiding rows — RLS cannot
express that. Keeping Express keeps that logic where it works.

### 4. Storage

Supabase Storage can replace Cloudflare R2 if you want one fewer vendor —
`lib/storage-provider.ts` is already an interface with a local-disk stub, so
this is one new implementation behind the existing contract. R2 remains fine.
Either way the interface does not change.

## Cost: the test suite

Roughly **44 of 179 tests** assert behavior that Supabase Auth takes over:

| File | Tests | Fate |
| --- | --- | --- |
| `middleware/auth.test.ts` | 14 | Rewrite — same assertions, Supabase-issued tokens |
| `routes/auth.test.ts` | 9 | Mostly deleted (signup/login become Supabase's) |
| `routes/auth.account.test.ts` | 10 | Split — password/email change go to Supabase; deletion and export stay |
| `routes/auth.password-reset.test.ts` | 6 | Deleted |
| `routes/auth.redeem.test.ts` | 5 | Unchanged — WISDOMKEY is ours |

The other ~135 tests cover threads, posts, chapters, directory, events,
moderation, notifications, search and bookmarks. **They should keep passing
untouched.** If they don't, something in the migration went wider than intended
— that is the signal to stop and look.

## Frontend impact (Claude's side)

- Web and mobile sign-in move to `supabase-js` — the API client keeps sending a
  bearer token, so only the token's origin changes
- Session refresh becomes Supabase's problem instead of ours
- Password reset and email confirmation screens are replaced by Supabase flows
- Google/Apple buttons point at Supabase providers; the mock OAuth screens go
- Nothing else in the frontend touches auth mechanics

**Not started yet, deliberately.** Migrating now would break zero-setup local
dev (network + credentials required for every run) while the remaining product
work barely touches auth. The clean trigger is: the Supabase project exists, the
`User`-row linkage is decided, and we have the project URL and anon key. Then
it's one focused pass rather than a slow bleed.

## Sequence

1. Engineer provisions the project — **region `us-east-1`**, closest to New York
   and unchangeable later
2. Engineer decides the `User` ↔ `auth.users` linkage (trigger vs lazy)
3. Engineer moves the database, keeps Express, rewrites `middleware/auth.ts`
4. Claude swaps the frontend to `supabase-js` in one pass
5. Confirm the ~135 non-auth tests still pass; rewrite the ~44 auth tests

## Notes for the engineer

- Free-tier projects pause after about a week of inactivity. Expect to un-pause.
- Nothing real should go in the project until the linkage decision is made — no
  member data, no production secrets.
- `docs/API.md` is the behavioural spec; the test suite is the compatibility
  bar. An API that passes the non-auth tests is presumptively correct.
- Anything added after that document is appended to `docs/API-CHANGES.md`.
