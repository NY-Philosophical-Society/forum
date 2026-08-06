# Auth & verification

`apps/web/src/server/routes/auth.ts` · `apps/web/src/server/routes/verification.ts`
Cross-cutting rules (JWT shape, hashing, tiers, limiters) live in [`../API.md`](../API.md).

All request bodies are `application/json` unless stated. Every validation
failure returns `400 { "error": "<first zod issue message>" }`.

---

## POST /api/auth/signup

**Auth:** anonymous · **Limiter:** `authLimiter` (10 / 15 min / IP)

Request — `signupSchema`:

| Field | Type | Rule |
| --- | --- | --- |
| `email` | string | `z.string().email()` |
| `password` | string | min 8 — *"Password must be at least 8 characters"* |
| `displayName` | string | min 2 (*"Enter your real first and last name"*), max 80 |

```json
{ "email": "ada@example.org", "password": "correct-horse-battery", "displayName": "Ada Lovelace" }
```

**201**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "clx8k2p9q0000abcd1234efgh",
    "displayName": "Ada Lovelace",
    "avatarUrl": null,
    "bio": null,
    "verificationStatus": "UNVERIFIED",
    "role": "user",
    "isSupporter": false,
    "createdAt": "2026-07-30T14:02:11.301Z"
  }
}
```

Errors: `400` validation · `409 { "error": "An account with this email already exists" }`.

Side effects: `bcrypt.hash(password, 10)`. The account starts `UNVERIFIED`,
`role: "user"`, `isSupporter: false`. No email is sent (no mailer is configured).

---

## POST /api/auth/login

**Auth:** anonymous · **Limiter:** `authLimiter`

Request — `loginSchema`: `{ email: email, password: string (min 1) }`.

**200** — same body as signup (`{ token, user }`).

Errors, in evaluation order:

| Status | Message | Cause |
| --- | --- | --- |
| 400 | first zod issue | malformed body |
| 401 | `Invalid email or password` | no such user, **or** `deletedAt` set |
| 403 | `This account has been suspended.` | `bannedAt` set |
| 401 | `This account signs in with Google or Apple — use that button instead of a password.` | `passwordHash === null` |
| 401 | `Invalid email or password` | bcrypt mismatch |

Note the 403 for banned accounts is returned **before** the password is
checked, so it is an oracle for "this email exists and is banned".

---

## GET /api/auth/me

**Auth:** `requireAuth` · no limiter

**200** `{ "user": PublicUser }` — the caller's own row, re-read from the DB by
the middleware on every request.

---

## GET /api/auth/account

**Auth:** `requireAuth`

Private fields deliberately excluded from `PublicUser`.

**200**

```json
{
  "email": "ada@example.org",
  "hasPassword": true,
  "directory": { "directoryVisible": false, "directoryBio": null, "openToPartners": false }
}
```

`hasPassword` is `passwordHash !== null` — the clients use it to show
"Change password" vs "Set a password" for OAuth-created accounts.

---

## POST /api/auth/change-password

**Auth:** `requireAuth` · **Limiter:** `authLimiter`

Request — `changePasswordSchema`: `{ currentPassword?: string(min 1), newPassword: string(min 8) }`.

`currentPassword` is required **only when the account has a `passwordHash`**;
an OAuth-created account is setting a first password and may omit it.

**200** `{ "ok": true }`

Errors: `400 { "error": "Enter your current password" }` · `401 { "error": "Current password is incorrect" }`.

Side effects: none beyond the hash write. **Existing JWTs stay valid** — there
is no token version/blacklist, so a password change does not sign other
sessions out.

---

## POST /api/auth/change-email

**Auth:** `requireAuth` · **Limiter:** `authLimiter`

Request — `changeEmailSchema`: `{ email: email, password?: string(min 1) }`.
`password` required when the account has one.

**200** `{ "ok": true, "email": "new@example.org" }` — also returned unchanged
(no write) when `email` equals the current one.

Errors: `400 { "error": "Enter your password to change your email" }` ·
`401 { "error": "Password is incorrect" }` ·
`409 { "error": "An account with this email already exists" }`.

**No verification of the new address** — the change is immediate. A real
backend should send a confirmation link before committing it.

---

## POST /api/auth/redeem-code

**Auth:** `requireAuth` · **no limiter** (see below)

Request — `redeemCodeSchema`: `{ code: string(min 1) }`.

The only accepted value is `WISDOMKEY`, compared as
`code.trim().toUpperCase()`. It is a standing, unlimited-use placeholder for a
real donation/subscription check.

**200** `{ "user": PublicUser }` with `isSupporter: true`.
`supporterSince` is set on first grant and **left untouched** on a repeat
redemption.

Errors: `400 { "error": "That code isn't valid." }`.

> **Gap to close:** this route carries no rate limiter, so codes can be guessed
> at request speed. Harmless while the code is a public placeholder; not
> harmless once redemption means money.

---

## GET /api/auth/oauth/config

**Auth:** anonymous

**200**

```json
{
  "google": { "enabled": false, "webClientId": null, "iosClientId": null },
  "apple":  { "enabled": false, "servicesId": null }
}
```

`enabled` mirrors `isGoogleConfigured()` / `isAppleConfigured()` — i.e. whether
the relevant env vars are set. Both clients call this on boot to decide between
the real SDK button and the dev-mock fallback screen.

---

## POST /api/auth/oauth/google · POST /api/auth/oauth/apple

**Auth:** anonymous · **no limiter**

Google request — `googleAuthSchema`: `{ idToken: string(min 1) }`.
Apple request — `appleAuthSchema`: `{ identityToken: string(min 1), displayName?: string(2..80) }`.

Apple only releases the user's name on their *first* authorization and does not
put it in the identity token, so the client must capture and forward it or it is
lost permanently.

**200** `{ token, user: PublicUser, linked: boolean }`.

Errors: `503 { "error": "Google sign-in is not configured on this server" }`
(when the env vars are absent) · `400` validation ·
`401 { "error": "Could not verify Google sign-in" }` (any verification throw) ·
`403 { "error": "This account has been suspended." }`.

Verification: `google-auth-library`'s `verifyIdToken` with
`audience = [GOOGLE_WEB_CLIENT_ID, GOOGLE_IOS_CLIENT_ID]`;
`apple-signin-auth`'s `verifyIdToken` with
`audience = [APPLE_SERVICES_ID, APPLE_BUNDLE_ID]`. See
[Provider linking](#provider-linking) below.

---

## POST /api/auth/oauth/dev-mock

**Auth:** anonymous · **no limiter** · **dev only**

Request — `oauthDevMockSchema`: `{ provider: "google"|"apple", email: email, displayName: string(2..80) }`.

**Skips all token verification** and creates/returns an account from whatever is
posted. It exists so the sign-in UX can be built without Google Cloud / Apple
Developer accounts.

**It refuses to run once the real provider is configured:**
`403 { "error": "Google sign-in is configured — use the real flow" }` (likewise
for Apple). That guard is the reason it cannot become a production backdoor —
**keep it when you rebuild, or delete the route entirely.**

**200** `{ token, user, linked }`.

---

## Provider linking

`apps/web/src/server/oauth-user.ts`, shared by the real and mock paths:

1. Match on `googleId` / `appleId` → return that user, `linked: false`.
2. Otherwise match on `email` → write the provider id onto that row,
   `linked: true` (this is how a password account gains Google sign-in).
3. Otherwise create a user with `displayName = name ?? email.split("@")[0]`.

Step 2 means **an identity provider asserting an email takes over the existing
account with that email.** That is only safe because Google and Apple verify
the address; if you ever add a provider that does not, gate step 2 behind an
explicit "link account" confirmation.

`linked: true` is what drives the clients' "we linked this to your existing
account" toast.

---

## POST /api/auth/password-reset/request

**Auth:** anonymous · **Limiter:** `authLimiter`

Request — `requestPasswordResetSchema`: `{ email: email }`.

**200 — always the same shape**, whether or not the account exists:

```json
{ "message": "If that email has a password-based account, we've sent reset instructions." }
```

In non-production (`NODE_ENV !== "production"`) the response *additionally*
carries the token, because no mailer is configured:

```json
{
  "message": "If that email has a password-based account, we've sent reset instructions.",
  "devResetUrl": "http://localhost:3000/reset-password?token=8f3c…",
  "devToken": "8f3c…"
}
```

The link is `console.log`ged in every environment. **`devResetUrl`/`devToken`
are the production guard: they are gated on `NODE_ENV !== "production"` and
nothing else.** Wire a real mailer (SES / Postmark / Resend) and drop both
fields; `apps/web/src/server/routes/auth.password-reset.test.ts` has a test that
asserts they are absent under `NODE_ENV=production` — keep it.

Token semantics — `PasswordResetToken`:

- 32 random bytes, hex (`randomBytes(32).toString("hex")`), unique column.
- `expiresAt = now + 1 hour`.
- Single use: `usedAt` is stamped on confirm.
- Only issued when the account exists **and** has a `passwordHash` (OAuth-only
  accounts get the generic message and no token).
- Issuing a new token does **not** invalidate outstanding ones, and used/expired
  rows are never pruned.

---

## POST /api/auth/password-reset/confirm

**Auth:** anonymous · **Limiter:** `authLimiter`

Request — `confirmPasswordResetSchema`: `{ token: string(min 1), password: string(min 8) }`.

**200** `{ "ok": true }`

Errors: `400 { "error": "This reset link is invalid or has expired." }` for
unknown, already-used, or expired tokens — one message for all three, so the
endpoint can't be used to probe token validity.

Side effect: a `$transaction` that writes the new hash and stamps `usedAt`
together. Existing sessions are **not** invalidated.

---

## POST /api/verification/start

**Auth:** `requireAuth` · no limiter

No request body.

**201**

```json
{
  "sessionId": "stub_2f1c9d54-8f7e-4a3b-9d21-6c0a1b2e3f44",
  "status": "PENDING",
  "verificationUrl": "http://localhost:3000/verify/mock/stub_2f1c9d54-…"
}
```

Errors: `400 { "error": "Already verified" }`.

Side effects: creates a `VerificationSession` row and flips the user to
`PENDING`. Calling it repeatedly creates a **new session each time** — old
sessions are not invalidated.

In production `verificationUrl` is the vendor's own hosted capture page.

---

## GET /api/verification/status

**Auth:** `requireAuth`

**200** `{ "status": "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED" }`

---

## POST /api/verification/mock-complete/:sessionId

**Auth: none — anonymous** · dev only

Body: `{ approve?: boolean }`, read straight off `req.body` (**not** zod-parsed).
Anything falsy rejects.

**200** `{ "status": "VERIFIED" }` or `{ "status": "REJECTED" }`.

Errors: `403 { "error": "Mock completion is only available with the stub provider" }`
when `verificationProvider.name !== "stub"` ·
`404 { "error": "Verification session not found" }`.

Side effects: writes the new status onto both the `VerificationSession` and the
`User`.

> **This route stands in for the vendor's webhook and is unauthenticated.**
> Anyone holding a session id can mark that user `VERIFIED`. It is safe only
> because the stub provider is the sole configured provider. When you implement
> a real provider, replace this with `POST /api/verification/webhook` doing
> `stripe.webhooks.constructEvent` (or the equivalent) signature verification —
> and make sure the stub route stops resolving, exactly as the `name !== "stub"`
> guard already does.
