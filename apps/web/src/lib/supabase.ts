import { createClient } from "@supabase/supabase-js";

/**
 * Supabase is the identity provider for the whole forum. This client only ever
 * handles authentication — every read and write still goes through our own API
 * (lib/api.ts), which is where authorization lives. Nothing here talks to the
 * database directly, so the publishable key gives a visitor nothing.
 *
 * Plain browser client, not @supabase/ssr: this app renders client-side and
 * authenticates to our API with a bearer token, so there is no server-side
 * session to keep in cookies.
 */
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
);

/**
 * True when the account signs in with a password rather than only through
 * Google/Apple. Replaces the API's old `hasPassword` flag, which existed
 * because we stored the hash; Supabase owns credentials now, so the answer
 * comes off the session's linked identities.
 */
export function hasPasswordIdentity(
  identities: { provider: string }[] | undefined | null,
): boolean {
  return (identities ?? []).some((i) => i.provider === "email");
}
