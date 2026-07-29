# Backend hosting — options, trade-offs, recommendation

For review before we commit to a host. Target: web app (live), iOS and Android
(planned). Written 2026-07-29.

**All prices are approximate and must be re-checked before signing up.** Hosting
pricing changes often; treat the numbers here as orders of magnitude, not quotes.

---

## 1. What this app actually requires

Not generic requirements — these come from reading `apps/api`.

| Requirement | Evidence in the code | Consequence |
| --- | --- | --- |
| **A persistent Node process** | `apps/api/src/index.ts` calls `listen()` on a long-lived Express 4 app | Rules out pure serverless without a rewrite |
| **Postgres** | Prisma, currently SQLite — a single file that cannot be shared between instances or survive a container restart | Needs a managed database |
| **Object storage** | `lib/storage-provider.ts`; the local stub writes avatars to disk and `app.ts` serves them from `/uploads` | Container filesystems are ephemeral — uploads vanish on redeploy |
| **In-memory rate limiting** | `express-rate-limit` with the default memory store | Correct on **one** instance only. Scale to two and limits halve per attacker |
| **Image processing** | `sharp` — a native binary dependency | Needs a real container, not an edge runtime |
| **Push notifications** | `lib/push-provider.ts` is a stub; a device-token registry already exists | Needs outbound APNs/FCM, and a stable public URL |
| **Polling, soon websockets** | Notifications and unread counts poll every 15s | Polling multiplies request count; realtime would need sticky connections |

Two conclusions worth stating plainly:

1. **The app is a container, not a function.** Any option that requires
   rewriting Express into serverless handlers is not a hosting decision, it's a
   re-architecture. That cost belongs in the comparison.
2. **The mobile apps raise the stakes.** A web frontend can be re-pointed at a
   new API by changing one env var and redeploying. A shipped iOS app has the
   API URL baked into a binary that took a week to get through review. **Pick a
   host you can stay on, or put the API behind your own domain from day one**
   (e.g. `api.nyphilosophy.org`) so the host can change without an app update.
   This is the single most consequential decision here and it costs nothing today.

---

## 2. The decision has three independent axes

Treating "backend" as one choice is what makes it feel hard. It's three:

- **Compute** — where the Express container runs
- **Database** — managed Postgres
- **Object storage** — avatars and post images

You can mix providers. The recommendation below does.

---

## 3. Compute options

### A. Render

*Managed containers, deploys from GitHub, flat pricing.*

**Pros**
- Closest thing to "it just works" for a Node service. Push to `main`, it builds and deploys.
- **Flat, predictable pricing** — the thing a 501(c)(3) budget actually wants. You know the bill before the month starts.
- Managed Postgres on the same platform, private networking between them, automated daily backups.
- `render.yaml` gives infrastructure-as-code, so the setup is reviewable in the repo rather than clicked into a dashboard.
- Zero-downtime deploys and health checks on paid tiers.

**Cons**
- The **free tier spins down after inactivity** — a ~30–50s cold start. Fatal for a mobile app's first impression. You must be on a paid instance; treat free as evaluation only.
- Free Postgres expires (historically ~90 days). Paid from the start, or you will migrate under time pressure.
- Builds are slower than Railway's.
- Single-region unless you pay considerably more. Fine for a New York club.

**~Cost:** ~$7/mo web service + ~$7/mo Postgres ≈ **$14/mo**

---

### B. Railway

*Usage-based containers, best-in-class developer experience.*

**Pros**
- The nicest DX of the group. Postgres is one click, env vars propagate between services automatically, logs and metrics are genuinely good.
- Very fast builds and deploys.
- Scales down to near-nothing when idle — cheap for a quiet forum.
- Also container-native; `sharp` and Express work unmodified.

**Cons**
- **Usage-based billing is the risk.** A polling bug or a crawler can turn a $5 month into a $60 month with no ceiling you set in advance. For a nonprofit answering to a board, an unpredictable line item is a real problem, not a theoretical one.
- Railway has changed its pricing model more than once. Migration risk is non-zero.
- Postgres backups need explicit configuration — do not assume.

**~Cost:** ~$5–20/mo at this scale, but **variable**

---

### C. Fly.io

*Docker-native, global, closest to raw infrastructure.*

**Pros**
- Genuinely excellent if you ever need multi-region or low latency worldwide.
- Docker-native, so what runs locally runs in production. No build-pack surprises.
- Scale-to-zero is available, and per-second billing is cheap at low volume.
- Persistent volumes exist, if you ever wanted local disk (you shouldn't — use object storage).

**Cons**
- **More operational surface than you need.** Historically Fly Postgres was "here is a Postgres app, you maintain it" — backups, failover, upgrades are yours. Managed Postgres is newer; verify its maturity before relying on it.
- More concepts to learn (`fly.toml`, machines, volumes, regions) for a single-region app.
- You are the DBA. For a solo maintainer, that is the expensive part.

**~Cost:** ~$5–15/mo, plus your time

---

### D. A VPS (Hetzner / DigitalOcean) with Docker Compose

**Pros**
- Cheapest by a wide margin — a capable box for roughly €5/mo runs API, Postgres and everything else.
- Total control, no platform lock-in, trivially portable.

**Cons**
- **You own everything**: OS patching, TLS renewal, Postgres backups *and restore testing*, monitoring, uptime, security updates. That is a standing obligation, not a setup task.
- No zero-downtime deploys without building that yourself.
- A backup you have never restored is not a backup. For member data on a real-name forum, this matters.

**Verdict:** the right answer only if someone genuinely enjoys running servers and will still be doing it in two years.

---

### E. Vercel serverless (same platform as the web app)

**Pros**
- One vendor, one dashboard.
- Preview deployments for the API too.

**Cons** — and these are disqualifying as things stand:
- Requires **rewriting Express into serverless functions**. Days of work, and it breaks in-memory rate limiting (needs Redis), background work, and any future websockets.
- Serverless + Postgres needs connection pooling (PgBouncer/Neon proxy) or you exhaust connections.
- `sharp` in a serverless bundle is workable but fiddly.
- Cold starts on a mobile app's first request.

**Verdict:** not a hosting choice, a re-architecture. Revisit only if the app were being rebuilt.

---

### F. Supabase

Supabase deserves its own treatment because it isn't a compute option — it's a
bundle of Postgres, Auth, Storage, Realtime and Deno "edge functions". The
honest answer is **it depends entirely on which of two things you mean**.

#### F1. Supabase as the *whole* backend — replacing Express

Use PostgREST's auto-generated API with Row Level Security instead of route
handlers, Supabase Auth instead of our JWT/bcrypt, Supabase Storage instead of
`storage-provider.ts`.

**Pros**
- Enormous amount of backend you no longer write or run.
- Supabase Auth handles email confirmation, password reset, and Google/Apple
  sign-in — including the fiddly mobile OAuth redirect flows — for free.
- **Realtime is the standout.** Subscribe to Postgres changes over websockets
  with almost no server code. We currently poll every 15 seconds for
  notifications and unread counts; with web + iOS + Android that polling gets
  expensive and feels dated. This is a genuine advantage over every other option here.
- Generous free tier; good dashboard; self-hostable, so not a total lock-in.

**Cons — and these are decisive *for this project*:**
- **It discards a working, tested backend.** There are 133 passing API tests
  against Express routes. Moving to PostgREST + RLS invalidates essentially all
  of them and the middleware they cover.
- **Our authorization model is a poor fit for RLS.** RLS filters *rows*. Our
  anonymous tier doesn't hide rows — it returns the same thread with the body
  truncated to 220 characters and replies omitted. That's application logic, not
  a row predicate. You'd end up writing Postgres functions or edge functions to
  express it, which is the thing you adopted Supabase to avoid.
- **Auth migration is a one-way door with real user impact.** Password hashes,
  linked Google/Apple identities, and the verification-status model would all
  need migrating.
- `sharp` image processing and the ID-verification vendor integration still need
  somewhere to run. Deno edge functions are a different runtime with different
  constraints.
- Free-tier projects **pause after inactivity**, which is unacceptable for a live
  app — so realistically Pro, ~$25/mo, more than the recommendation below.

#### F2. Supabase as *just* Postgres + Storage, Express hosted elsewhere

Perfectly viable. You'd get managed Postgres and S3-compatible storage from one
vendor, keep every line of the Express app, and could adopt Realtime later
without a rewrite.

But compared to Render Postgres + Cloudflare R2 it adds a second vendor and
cross-provider network latency on every query, and costs more. The main things
it buys — dashboard quality, branching, an easy path to Realtime later — are
real but not worth the extra hop today.

#### Verdict

**Supabase is the option I'd pick if we were starting this project from
scratch.** We are not. The value of the backend we already have — tested access
tiers, working OAuth, a moderation system — exceeds what Supabase would replace
it with, and the parts that don't fit RLS are precisely the parts that matter
most.

**Revisit it specifically for Realtime** when polling becomes a problem. Adopting
Supabase Realtime alongside the existing Express API is possible without
migrating auth, and that's a much smaller, reversible step.

---

## 4. Database

**Managed Postgres from whoever runs the compute** (Render/Railway) is the
simplest correct answer — private networking, no cross-provider latency, one bill.

**Neon** is worth knowing about: serverless Postgres with database *branching*,
so each preview environment can have its own copy of the data. Genuinely useful,
and the free tier is generous. It adds a second vendor and a little latency if
compute is elsewhere. Reasonable to adopt later; not worth the extra moving part
on day one.

**Non-negotiable regardless of choice:** automated daily backups, **and one
restore actually performed and verified** before launch.

---

## 5. Object storage

**Cloudflare R2** is the clear pick. S3-compatible — so the existing
`storage-provider.ts` interface works with the AWS SDK unchanged — and critically
**no egress fees**. Avatars and post images are read far more often than written,
and egress is exactly what makes S3 bills grow unpredictably.

Backblaze B2 is a close second. Plain S3 is fine but you pay to serve your own images.

---

## 6. Push notifications

Since mobile is Expo, **Expo Push Notifications** is the path of least
resistance: one API call from the backend, Expo handles APNs and FCM
credentials. `lib/push-provider.ts` is already shaped for exactly this.

This is host-independent — it does not affect the decision above.

---

## 7. Recommendation

**Render for compute + Render Postgres + Cloudflare R2 for images**, with the
API served from `api.nyphilosophy.org` from day one.

The reasoning, in order of weight:

1. **Predictable cost.** A nonprofit budgets in advance. Render's flat pricing is
   worth more than Railway's slightly better DX, because a surprise bill is an
   organisational problem, not just a technical one.
2. **Lowest operational burden.** This project is maintained by one person plus
   AI agents. Every hour spent being a DBA is an hour not spent on the forum.
   Fly and a VPS both tax that budget continuously.
3. **No code rewrite.** Container-native means the Express app deploys as-is.
   Vercel serverless would cost days and break rate limiting.
4. **Your own domain from the start** decouples the mobile binaries from the
   hosting choice, so being wrong about Render is recoverable without an App
   Store release.

**Choose Railway instead if** DX and deploy speed matter more than budget
predictability, and someone is willing to watch the usage graph.

**Choose Fly instead if** there is a concrete plan for an international
membership where latency matters — and someone will own Postgres.

---

## 8. What must change in the code regardless of host

These are required by *any* of the options, and are worth doing before the
decision is made:

1. **SQLite → Postgres** in `schema.prisma`, plus a regenerated baseline
   migration. Watch for SQLite-specific behaviour — case-insensitive `contains`
   needs an explicit `mode: "insensitive"` on Postgres.
2. **Wire the real `S3StorageProvider`** (currently a documented throw) and stop
   serving `/uploads` from local disk.
3. **Move rate limiting to a shared store** (Redis) — or accept a hard
   single-instance limit and document it. Today, scaling to two instances
   silently doubles what an attacker is allowed.
4. **Dockerfile** for `apps/api` — multi-stage, non-root, `prisma generate` at
   build.
5. **CORS** must accept the Vercel production domain and preview domains.
6. **`NEXT_PUBLIC_API_URL`** set in Vercel; the same base URL configured in the
   mobile app.
7. **Health check endpoint** — every platform wants one.

Items 1, 2, 4, 6 and 7 are what the `postgres-prep` automation run was written
to do, and it can run as soon as the host is chosen (or before — none of that
work depends on which host wins).
