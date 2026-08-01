import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase is the **auth provider only** — it is not a data source for this
 * app. Clients sign in here to obtain a JWT, then send that JWT to our Express
 * API, which verifies it and does all the actual data work. No table is ever
 * queried from the browser, which is why there are no RLS policies to write.
 *
 * Inert until both env vars are set, so nothing changes for anyone running
 * the app today: `supabase` is null and the existing email/password flow
 * against our own API stays in charge. That lets this land on main safely
 * ahead of the server-side switchover.
 *
 * The publishable (anon) key is designed to be public and ships in the client
 * bundle. The service-role key must never appear here.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabaseConfigured = Boolean(url && publishableKey);

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url!, publishableKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // The session lives in localStorage under Supabase's own key; our
        // legacy token stays under "nyps-forum:token" until it's retired.
        detectSessionInUrl: true,
      },
    })
  : null;

/**
 * The bearer token to send to our API.
 *
 * During the migration this is the single seam: once the API verifies
 * Supabase JWTs, auth-context calls this instead of reading our own stored
 * token, and nothing else in the app has to change.
 */
export async function getSupabaseAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
