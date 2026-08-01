import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Mobile twin of apps/web/src/lib/supabase.ts. Supabase is the **auth
 * provider only** — clients sign in here to get a JWT and send it to our
 * Express API, which does all the data work.
 *
 * Inert until both env vars are set, so the current auth flow is untouched.
 *
 * Two React Native specifics that differ from web:
 *  - session storage must be AsyncStorage; there is no localStorage
 *  - detectSessionInUrl must be false; there is no URL to parse, and leaving
 *    it on makes Supabase reach for browser APIs that don't exist here
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabaseConfigured = Boolean(url && publishableKey);

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url!, publishableKey!, {
      auth: {
        storage: AsyncStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;

/** The bearer token to send to our API. See the web file for the rationale. */
export async function getSupabaseAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
