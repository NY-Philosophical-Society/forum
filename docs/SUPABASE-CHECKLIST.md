# Supabase migration — checklist

Companion to `docs/SUPABASE-MIGRATION.md` (which explains *why*). This is the
ordered list of what to do. Branch `supabase-prep` has steps 1–4 done and
verified; the rest is yours.

Project: `izvomynkpvguisjdintq.supabase.co`

---

## Done on `supabase-prep` — verified, not guessed

- [x] **Prisma switched to `postgresql`** with a separate `directUrl`.
- [x] **Migration history regenerated** as a single Postgres baseline
      (`init_postgres`). The old SQLite migrations are gone; there is no
      production data, so a clean baseline beats a fake lineage.
- [x] **Seed runs clean** against real Postgres.
- [x] **Test harness converted.** Isolation is now a uniquely-named Postgres
      *schema* per run instead of a throwaway SQLite file. The name still
      contains `nyps-api-test-`, which `src/test/setup.ts` hard-checks, so the
      suite refuses to run against a real database if env propagation breaks.
- [x] **187/187 tests pass on Postgres.**
- [x] **`supabase-js` installed** in web and mobile, with an inert client in
      `src/lib/supabase.ts` on each. Both are no-ops until their env vars are
      set, so this is safe to merge before the server side is ready.

### Two real bugs this surfaced

Worth knowing these existed — they were invisible on SQLite and would have
shipped silently:

1. **Pinned threads sorted to the bottom.** `ORDER BY pinnedAt DESC` puts
   NULLs *last* in SQLite but *first* in Postgres, so every unpinned thread
   outranked the pinned ones. Fixed in three places (`threads.ts`,
   `admin.ts`, `chapters.ts`) with explicit `nulls: "last"`.
2. **Search became case-sensitive.** Prisma's `contains` maps to `LIKE`, which
   SQLite treats case-insensitively and Postgres does not — "hume" would stop
   matching "Hume". Fixed at all 8 call sites with `mode: "insensitive"`
   (search, directory, admin member/content search, user search).

---

## 1. Connection strings — the classic failure

Supabase dashboard → **Connect → ORM → Prisma**. You need *both*:

| Variable | Port | Used for |
| --- | --- | --- |
| `DATABASE_URL` | **6543** (pooled/Supavisor) | app runtime — add `?pgbouncer=true&connection_limit=1` |
| `DIRECT_DATABASE_URL` | **5432** (direct) | migrations only |

Prisma opens a session-mode connection for migrations that the transaction
pooler cannot serve. Using the pooled URL for migrations fails confusingly.

- [ ] Set both in the API's environment
- [ ] `npx prisma migrate deploy`
- [ ] `npm run db:seed` (optional — demo content)

**Do not put the database password anywhere client-side.** It is not the same
thing as the publishable key.

## 2. Decide the `User` ↔ `auth.users` linkage

**This is the one real architectural decision, and it's yours.** Every Supabase
auth user needs a matching row in our `User` table, which holds the things
Supabase has no opinion about: `displayName`, `verificationStatus`,
`isSupporter`, `role`, `bannedAt`, `directoryVisible`.

- [ ] **Option A — database trigger** on `auth.users` insert. Harder to get
      wrong in production; the row always exists.
- [ ] **Option B — lazy creation** on first authenticated request. Easier to
      test, keeps the logic in application code, no SQL to maintain.

Whichever you pick, `User` needs a column holding the Supabase user id
(the JWT's `sub`), unique and indexed.

## 3. Rewrite `middleware/auth.ts` to verify Supabase JWTs

Currently `requireAuth` verifies a token we signed ourselves. It should verify
Supabase's instead, then load the local `User` row.

**Verified against the live project — this is ES256, not the legacy HS256:**

```
JWKS:  https://izvomynkpvguisjdintq.supabase.co/auth/v1/.well-known/jwks.json
alg:   ES256 (asymmetric, 1 key published)
```

So verification is a JWKS fetch + asymmetric verify (e.g. `jose`), **not** an
HMAC against a shared secret. Cache the JWKS; it rotates rarely.

- [ ] Verify signature, `iss`, `aud`, expiry
- [ ] Map `sub` → local `User`
- [ ] Leave `requireVerified`, `requireMember`, `requireAdmin`, the ban check
      and the access tiers **untouched** — they read our `User` row, not the
      token, so they keep working unchanged

## 4. Delete what Supabase now owns

- [ ] `passwordHash` + bcrypt
- [ ] `googleId` / `appleId` and `lib/oauth.ts`
- [ ] `PasswordResetToken` model and the reset flow
- [ ] Our JWT signing
- [ ] The dev OAuth mock screens

## 5. Dashboard settings to revisit

Checked against the live project today:

- [ ] **Email confirmation is ON** (`mailer_autoconfirm: false`) — signups need
      a confirmation email, so an SMTP sender must be configured or nobody can
      complete signup.
- [ ] **Only email auth is enabled.** Google and Apple are off; both need
      enabling and configuring if we keep social sign-in.
- [ ] Region is fixed at project creation — confirm it's `us-east-1`.
- [ ] Free projects pause after ~1 week idle.

## 6. Test impact

Roughly **44 of 187** tests assert behaviour Supabase Auth takes over
(`middleware/auth.test.ts`, `auth.test.ts`, `auth.account.test.ts`,
`auth.password-reset.test.ts`). Rewrite those against Supabase-issued tokens.

**The other ~143 should keep passing untouched.** If they don't, the migration
went wider than intended — that's the signal to stop and look.

## 7. Client switchover (Claude's side, on request)

Both apps have an inert `supabase.ts`. Once the API verifies Supabase JWTs:

- [ ] Set `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
      (web) and the `EXPO_PUBLIC_` equivalents (mobile)
- [ ] Point `auth-context` at `getSupabaseAccessToken()` instead of the stored
      legacy token — that function is the single seam
- [ ] Replace login/signup/reset screens with Supabase flows

---

## Local development

Postgres now, not SQLite, so local matches production. No Docker needed:

```
cd apps/api && npm run db:up      # leave running
```

Then in `apps/api/.env`:

```
DATABASE_URL="postgresql://nyps:nyps@localhost:5455/nyps_forum"
DIRECT_DATABASE_URL="postgresql://nyps:nyps@localhost:5455/nyps_forum"
```

`npx prisma migrate deploy && npm run db:seed && npm run dev`.
