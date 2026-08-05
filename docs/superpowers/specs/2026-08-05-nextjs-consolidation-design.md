# Next.js consolidation — design

Fold `apps/api` into `apps/web`. One deployable, one Vercel project, one set of
environment variables. The Express server stops existing.

The motivation is operational, not technical: this project is maintained by
someone who is not an engineer, and "deploy the frontend, then separately deploy
the API, and keep a URL pointing from one to the other" is a standing tax on
every future change. A single web application is one `git push`.

The moment is cheap. `apps/api` has never been deployed — there is no running
backend to migrate, no traffic to preserve, no cutover. The cost of doing this
never goes down from here.

## 0. Decisions already taken

Do not relitigate these.

- **Big bang, on a branch.** All 72 endpoints and all 19 test files in one pass.
  No proxy scaffolding, no route-by-route merge to `main`. The branch does not
  run until it runs.
- **Mobile is out of scope.** `apps/mobile` keeps pointing at `:4000` and will
  break when Express is deleted. Picking it back up is a follow-up (§11).
- **The web app keeps its current shape.** 41 of its 45 files are already
  `"use client"` with zero server-side data fetching. That stays true. Client
  components keep calling the same paths with the same bearer tokens; only the
  base URL changes, to the empty string.
- **Uploads keep flowing through the function**, capped at 4MB (already landed
  in `ef67ebf`). Signed direct-to-storage is a separate project.
- **Rate limiting is deferred** — but see §4.5, because "deferred" is not the
  same as "unchanged", and the difference is a security regression.

## 1. Target layout

```
apps/web/
  src/
    app/
      api/                      ← the HTTP surface, was apps/api/src/routes
        auth/…/route.ts
        threads/route.ts
        threads/[id]/route.ts
        …
    server/                     ← was apps/api/src/{lib,middleware}, plus db.ts
      guards.ts                 ← was middleware/auth.ts
      db.ts
      ranking.ts  search.ts  moderation.ts  moderation-log.ts
      mentions.ts  notifications.ts  serialize.ts  chapter-access.ts
      supabase.ts  storage-provider.ts  verification-provider.ts
      push-provider.ts  rate-limit.ts
    lib/                        ← unchanged; client-side
      api.ts  supabase.ts  auth-context.tsx
  prisma/                       ← moved wholesale from apps/api
packages/shared/                ← unchanged
apps/api/                       ← deleted
```

`src/server/` is a hard boundary, enforced mechanically — see §6.

`packages/shared` does not move and does not change. It is consumed as
TypeScript source by both the route handlers and the client components, exactly
as it is today.

## 2. The authorization ladder becomes wrappers

This is the security boundary and the only genuinely delicate part of the port.

Express composes it positionally:

```ts
threadsRouter.post("/", requireAuth, requireVerified, writeLimiter, handler)
```

Next has no per-route middleware chain. (`middleware.ts` is a single global
matcher running on the Edge runtime — it cannot reach Prisma, so it cannot
resolve a user. It is not a substitute and will not be used for authorization.)

Handlers are wrapped instead:

```ts
// src/server/guards.ts
export type Actor = {
  id: string; email: string; displayName: string; role: string;
  isSupporter: boolean; verificationStatus: string; /* …as req.user is today */
};

type Ctx<A> = {
  req: NextRequest;
  params: Record<string, string>;
  actor: A;
  claims: SupabaseClaims;
};

export function withAuth<T>(h: (c: Ctx<Actor>) => Promise<T>): RouteHandler
export function withOptionalAuth<T>(h: (c: Ctx<Actor | null>) => Promise<T>): RouteHandler
export function withVerified<T>(h: (c: Ctx<Actor>) => Promise<T>): RouteHandler
export function withMember<T>(h: (c: Ctx<Actor>) => Promise<T>): RouteHandler
export function withAdmin<T>(h: (c: Ctx<Actor>) => Promise<T>): RouteHandler
```

Call site:

```ts
export const POST = withVerified(async ({ req, actor }) => { … })
```

Three properties this must have:

**`resolveUser` does not change.** It already takes a token and returns a
discriminated result; it is framework-agnostic today. Only the Express glue
around it is replaced. Every behaviour documented in its comment survives
verbatim: lazy row creation on first authenticated request, the race fallback,
`deletedAt` checked before the email sync, `bannedAt` re-read per request so a
ban bites live sessions, and `optionalAuth` treating a banned or invalid token
as logged-out rather than as an error.

**Each wrapper is total.** `requireVerified`, `requireMember` and `requireAdmin`
carry the comment "Must run after requireAuth" three separate times, and
`requireMember` reads `req.user?.role` with an optional chain — meaning a
route that forgot `requireAuth` would fall through to `undefined !== "admin"`
and *deny*, which is safe, but only by luck. `withAdmin` performs the
authentication itself. There is no ordering to get wrong and no `?.` on the
actor: inside a wrapped handler `actor` is non-null by type.

**`withOptionalAuth` is the only one that yields a nullable actor**, and it is
a distinct type, so a handler cannot accidentally treat an anonymous request as
authenticated. This is what protects the `previewOnly` truncation in the threads
route.

`idVerificationRequired()` stays a per-request read of
`REQUIRE_ID_VERIFICATION`, unchanged, so the honor system remains one switch.

## 3. Mechanical route translation

Everything below is a find-and-replace applied ~72 times. It is tedious and it
is not where the risk lives.

| Express | Next route handler |
| --- | --- |
| `app.use("/api/threads", r)` + `r.get("/:id")` | `app/api/threads/[id]/route.ts` → `export const GET` |
| `req.params.id` | `({ params }) => params.id` |
| `req.query.page` | `req.nextUrl.searchParams.get("page")` |
| `req.body` | `await req.json()` |
| `res.status(400).json({ error })` | `NextResponse.json({ error }, { status: 400 })` |
| `res.status(204).end()` | `new NextResponse(null, { status: 204 })` |

A `json(data, status)` helper in `src/server/http.ts` keeps the diff to one
token per response.

Every handler file declares:

```ts
export const runtime = "nodejs";   // Prisma and sharp cannot run on Edge
```

**Route collisions to verify, not assume.** Express resolves by registration
order, so `usersRouter.get("/me")` works only because it is registered before
`usersRouter.get("/:id")`. Next resolves static segments before dynamic ones
regardless of file order, so `app/api/users/me/route.ts` still wins over
`app/api/users/[id]/route.ts` — but this is a behavioural coincidence between
two different resolution models, and every static-vs-dynamic pair in the tree
gets an explicit test rather than a shrug.

## 4. The five places a mechanical port silently drops behaviour

Each of these compiles, passes type-checking, and is wrong. They are the
reason this is a design document and not a ticket.

### 4.1 `express.raw` was doing two jobs

```ts
express.raw({ type: IMAGE_ALLOWED_TYPES, limit: IMAGE_MAX_BYTES })
```

That single line enforces the MIME allowlist *and* the byte cap before the
handler runs. `await req.arrayBuffer()` enforces neither. Both checks are
re-implemented explicitly in `src/server/http.ts` as `rawBody(req, { types,
maxBytes })`, returning a 415 or 413 exactly as Express did. The sniffed-format
re-check inside the handler stays — it was always the second line of defence,
never the first.

This applies to both upload paths: `/api/uploads/image` and
`/api/users/me/avatar`.

### 4.2 `sharp` re-encoding is a privacy control

Every uploaded image is decoded and re-encoded, which strips EXIF — including
GPS. On a real-name forum an avatar taken on a phone otherwise carries the
coordinates of someone's home. It also sniffs the true format so a mislabelled
`Content-Type` cannot smuggle another file type through.

It moves unchanged. It is not an optimisation and must not be dropped for
bundle size or cold-start reasons. If it ever becomes a problem, the answer is
to move re-encoding to a background job, never to skip it.

### 4.3 The local storage stub served its own files

`app.ts` mounts `express.static(LOCAL_UPLOADS_DIR)` when
`storageProvider.name === "local"`. Nothing in Next replaces that implicitly.
A route handler at `app/api/uploads/[...path]/route.ts` serves the stub's
directory with the same `immutable`, one-year cache headers, and only when the
stub is active. Without it, every locally uploaded image 404s — and only
locally, so it would pass review and break the next developer's machine.

### 4.4 `cors()` goes away, and that is correct

Same-origin now. It is deleted rather than carried over.

Note for the mobile follow-up: React Native's `fetch` is not a browser and is
not subject to CORS, so mobile does not need it back. Re-adding a permissive
`cors()` "for mobile" would be a real regression, since the API would then be
callable from any origin with a stolen token.

### 4.5 Rate limiting cannot be carried over at all

`express-rate-limit` is Express middleware. There is no version of this port
where it keeps working. Deferring the *fix* is fine; silently deferring the
*enforcement* is not, so:

- `src/server/rate-limit.ts` keeps its three exports (`authLimiter`,
  `writeLimiter`, `adminLimiter`) reimplemented as a `withRateLimit(kind)`
  wrapper over an **in-memory store** — identical behaviour to today, including
  the per-request `DISABLE_RATE_LIMIT` check.
- All 45 existing call sites keep their limiter, and `rate-limit.test.ts`
  survives with its assertion that the 429 path still fires.
- The store is the only thing left to swap. `docs/API-CHANGES.md` records that
  in-memory counters are per-instance and therefore approximately unenforced
  once this is running on serverless.

The seams stay in place and the tests keep proving the limiter fires. What is
knowingly accepted is that, in production, the counters are per-lambda. That is
a real weakening of an abuse control and it will not announce itself — the code
looks correct and the test suite stays green. It goes on the follow-up list at
the top, not the bottom.

## 5. Prisma in a serverless runtime

**Connection pooling** is already handled — `2e412c7` moved local development
onto Supavisor, so `DATABASE_URL` is pooled (`?pgbouncer=true`) and
`DIRECT_URL` is direct for migrations. Production adds `connection_limit=1` and
uses `postgres.<project-ref>` as the tenant-qualified username.

**Interactive transactions remain banned.** Both existing `$transaction` calls
are the array form, which is a single implicit transaction and safe in
transaction mode. The callback form is not. This is now a rule, not an
accident.

**The client needs a singleton.** `apps/api/src/db.ts` is a plain module today,
which was fine for one long-lived process. Under Next's dev-mode hot reloading
every edit would construct a new `PrismaClient` and leak its pool. `src/server/db.ts`
uses the `globalThis` singleton pattern. `containsInsensitive` moves with it,
unchanged — it is still required for anything a human typed, because `contains`
is case-sensitive on Postgres.

**`maxDuration`** is set explicitly on the handful of handlers that do real
work (uploads, search, the admin dashboard queries) rather than relying on the
plan default.

## 6. One deployable means the secret key shares a bundle

This is a new risk created by consolidation and it deserves naming.

Today `SUPABASE_SECRET_KEY` lives in a service that has no browser bundle at
all. It cannot leak into client JavaScript because there is no client
JavaScript. After this change, the code that reads it sits in the same
application as 41 `"use client"` components, and Next inlines anything reachable
from a client component into the browser bundle.

Three mitigations, all mechanical:

1. Every file under `src/server/` starts with `import "server-only"`. Importing
   one from a client component then fails the build rather than shipping the
   secret.
2. No server-side variable gains a `NEXT_PUBLIC_` prefix. The three that are
   already public (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) stay public and are the only ones.
   `NEXT_PUBLIC_API_URL` is then deleted entirely — same origin.
3. Acceptance includes grepping the built client chunks for the secret key's
   value and for `sb_secret_`. This is a build-output assertion, not a code
   review item.

## 7. Tests

19 files, 172 tests, 3,499 lines. This is the project's only proof that the
authorization ladder is correct, and the ladder is exactly what is being
rewritten. None of it is skipped or thinned.

**What does not change:** `global-setup.ts` and `setup.ts` keep working as-is —
the throwaway `nyps_api_test_*` database, the refusal to run against a
non-loopback `SUPABASE_URL`, the per-file wipe, `fileParallelism: false`. The
`helpers.ts` fixtures still mint users through the real signup →
`/api/verification/start` → mock-complete flow, never by writing
`verificationStatus`.

**What changes:** supertest is deleted. Route handlers are plain
`(Request) => Response` functions, so tests import and call them:

```ts
// src/test/call.ts
export async function call(handler, { method = "GET", path = "/", body, token, params }) {
  const req = new NextRequest(`http://test.local${path}`, { method, … });
  const res = await handler(req, { params: params ?? {} });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
```

Test bodies stay recognisable:

```ts
// before
const res = await request(app).post("/api/threads").set("Authorization", `Bearer ${u.token}`).send({…});
// after
const res = await call(POST, { method: "POST", token: u.token, body: {…} });
```

The wrappers run inside `handler`, so the ladder is still exercised at the HTTP
boundary — which `CLAUDE.md` requires, and which is the whole point of testing
through routes rather than through Prisma.

**This deletes the flaky hang.** `docs/TESTING.md` and `vitest.config.ts` both
document a test that hangs roughly one run in five, reproduced on a bare Express
app, caused by supertest opening an ephemeral server per request with no
timeout. Two runs during this session's pooler work failed that way — once as a
30-second timeout, and once, more strangely, with a 401 whose body was an
Anthropic API error envelope, i.e. something other than our app answered on the
port supertest had just bound. No server, no socket, no ephemeral port, no
hang. The `hookTimeout`/`testTimeout` comments explaining the workaround come
out with it.

## 8. What is deleted

- `apps/api/` entirely, after its contents move.
- `express`, `cors`, `supertest`, `@types/*` for each, `express-rate-limit`,
  `tsx` from the dependency tree.
- `npm run dev:api`, and the root script that runs it.
- `NEXT_PUBLIC_API_URL`, from `.env.local.example` and from Vercel — both
  Preview and Production.
- The `?? "http://localhost:4000"` fallback in `apps/web/src/lib/api.ts`, which
  becomes `const API_URL = ""`.

## 9. Environment and deployment

`apps/web/.env.local` absorbs the server-side variables from `apps/api/.env`:
`DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`,
`SUPABASE_PUBLISHABLE_KEY`, `WEB_APP_URL`, and the three provider switches.
The API's `PORT=4000` goes away; `PORT` still selects the web app's dev port,
which is how this machine runs it on 4100 instead of the committed 3000
default.

On Vercel (`ren168/forum-web`) the same set is added for Preview and
Production, pointing at the hosted project. Two things that are currently
untrue and must be true before the first deploy of this branch:

- The hosted project still carries the unmanaged `prisma db push` schema with
  no `_prisma_migrations` table. Wiring it properly means dropping the public
  schema and running `prisma migrate deploy` — **confirmed with the owner
  before it runs, even at zero rows.**
- The hosted project needs the `{{ .Token }}` recovery email template, or
  mobile password reset breaks while web keeps working.

## 10. Documentation to update

`CLAUDE.md`'s "Things that will bite you" list goes stale in several places and
is load-bearing for future work:

- "Register routes in `apps/api/src/app.ts`, not `index.ts`" — both files are
  gone; the replacement rule is the file-system router.
- "The authorization ladder lives in `apps/api/src/middleware/auth.ts`" — now
  `apps/web/src/server/guards.ts`, and composition is by wrapping, not ordering.
- The `apps/api` / `apps/web` / `apps/mobile` architecture paragraph.
- Test conventions: supertest is gone.

Also: `README.md` (commands, ports, what's stubbed), `docs/API.md` and
`docs/api/*.md` (the endpoint contract is unchanged, but every "the API server"
reference is), `docs/TESTING.md` (the whole supertest section, including the
flaky-hang note), `docs/PROJECT.md`.

## Acceptance

1. All 172 tests pass, run five times consecutively with no failures — the
   flake is expected to be gone, and five clean runs is the evidence.
2. All 72 endpoints respond at their existing paths with their existing status
   codes. The endpoint contract in `docs/API.md` does not change.
3. `npx next build` succeeds from a clean tree.
4. `grep -r "sb_secret_" apps/web/.next/static/` returns nothing.
5. The authorization ladder is proven by test at every tier: anonymous,
   authenticated-unverified, verified, member, admin, banned, deleted.
6. Anonymous thread reads still return the truncated body and no replies.
7. A locally uploaded image renders, and its EXIF is stripped.
8. `apps/api` no longer exists and nothing references it.

## Risks

- **The ladder is rewritten wholesale.** 134 middleware applications become 134
  wrappers — `requireAuth` ×85, `requireAdmin` ×24, `requireVerified` ×10,
  `requireMember` ×10, `optionalAuth` ×5. A single wrong wrapper is a silent
  authorization hole. Mitigated by
  the wrappers being total (§2) and by tier-by-tier tests (Acceptance 5), but
  this is the risk that matters and it deserves a slow review.
- **Big bang means no partial signal.** Nothing runs until everything runs. The
  first green test run is also the first integration test. This was chosen with
  eyes open; the mitigation is that the branch is reviewed in slices even
  though it lands in one piece.
- **Rate limiting is knowingly weakened in production** (§4.5) while the tests
  continue to pass. Highest-priority follow-up.
- **Mobile breaks the moment Express is deleted** and stays broken until
  picked up (§11).
- **Vercel's platform limits are now ours.** 4.5MB request bodies (handled),
  function duration, and a cold start that now includes `sharp`.

## 11. Out of scope, tracked

- **Mobile.** `EXPO_PUBLIC_API_URL` → the web origin, then re-verify auth,
  threads, posts, DMs, push tokens, uploads and deep links.
- **Rate-limit store.** Postgres-backed or Upstash, replacing the in-memory one.
- **Signed direct-to-storage uploads**, which would also move `sharp` off the
  request path.
- **Server components.** The app stays a client-rendered SPA; RSC and cookie
  sessions are a separate project, and one that would have to keep bearer
  tokens working for mobile regardless.
