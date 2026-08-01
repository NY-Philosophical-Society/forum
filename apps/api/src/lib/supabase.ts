import { createClient } from "@supabase/supabase-js";
import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * Supabase is the identity provider; this API signs nothing. Incoming bearer
 * tokens are Supabase-issued JWTs, verified here against the project's public
 * JWKS. Local development uses asymmetric (ES256) signing keys for exactly this
 * reason — see supabase/config.toml — so local and production share one
 * verification path rather than a shared-secret special case that only exists
 * on developer machines.
 *
 * Production wiring: set SUPABASE_URL to the project URL and
 * SUPABASE_SECRET_KEY to the project's secret (service-role) key. Nothing else
 * changes.
 */

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54421";

/**
 * Server-only. This key bypasses every access rule in the project, so it must
 * never be sent to a client or logged. Only two things need it: deleting an
 * auth user when someone deletes their account, and the seed script.
 */
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? "";

/** jose caches the fetched key set and refetches on an unknown `kid`. */
const jwks = createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`));

export interface SupabaseClaims {
  /** auth.users.id — this is also our User.id. */
  sub: string;
  email: string;
  /** From user_metadata, set at signup by the clients. */
  displayName: string | null;
  /** Token issue time, seconds since epoch. Used for the re-auth freshness check. */
  issuedAt: number;
}

export async function verifySupabaseToken(token: string): Promise<SupabaseClaims | null> {
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `${SUPABASE_URL}/auth/v1`,
      // A signed-in user's token, not a project API key. Pinning to asymmetric
      // algorithms also rules out an HMAC algorithm-confusion attack, where a
      // token claims HS256 and the verifier is tricked into treating a public
      // key as the shared secret.
      audience: "authenticated",
      algorithms: ["ES256", "RS256"],
    });

    const sub = payload.sub;
    const email = typeof payload.email === "string" ? payload.email : null;
    if (!sub || !email) return null;

    const metadata = payload.user_metadata as Record<string, unknown> | undefined;
    const displayName =
      typeof metadata?.display_name === "string" ? metadata.display_name : null;

    return { sub, email, displayName, issuedAt: payload.iat ?? 0 };
  } catch {
    // Expired, wrong issuer/audience, unknown key, tampered — all read the
    // same to callers: not a valid session.
    return null;
  }
}

/**
 * How recently a token must have been minted for an irreversible action
 * (account deletion). Supabase owns the password, so the API cannot re-check
 * one; requiring a freshly-issued token is the equivalent bar, and unlike a
 * client-side prompt it is actually enforced here.
 */
export const REAUTH_MAX_AGE_SECONDS = 5 * 60;

export function isFreshlyAuthenticated(issuedAt: number, now = Date.now()): boolean {
  return now / 1000 - issuedAt <= REAUTH_MAX_AGE_SECONDS;
}

let adminClient: ReturnType<typeof createClient> | null = null;

/**
 * Admin (service-role) client. Throws rather than silently no-opping if the
 * key is absent — a missing key means account deletion would leave the auth
 * user alive, which is exactly the failure that must not pass quietly.
 */
export function supabaseAdmin() {
  if (!SECRET_KEY) {
    throw new Error(
      "SUPABASE_SECRET_KEY is not set — admin operations (account deletion, seeding) cannot run.",
    );
  }
  adminClient ??= createClient(SUPABASE_URL, SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return adminClient;
}
