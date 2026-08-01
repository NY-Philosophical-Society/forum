import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

/**
 * Supabase is the identity provider. This client only handles authentication —
 * every read and write still goes through our API (lib/api.ts), which is where
 * authorization lives.
 *
 * `detectSessionInUrl: false` because React Native has no URL to read a session
 * out of; the OAuth flow hands its tokens back through the app's deep link and
 * sets the session explicitly (see OAuthButtons).
 */
export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

/** See the web copy of this helper — replaces the API's old hasPassword flag. */
export function hasPasswordIdentity(
  identities: { provider: string }[] | undefined | null,
): boolean {
  return (identities ?? []).some((i) => i.provider === "email");
}
