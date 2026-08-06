"use client";

import { useState } from "react";
import { supabase } from "~/lib/supabase";

/**
 * Google and Apple sign-in, handled entirely by Supabase.
 *
 * This used to load Google Identity Services and Sign in with Apple by hand,
 * with a local mock flow behind it for when neither had credentials. Supabase
 * does the provider dance now: it redirects out, and on the way back
 * supabase-js reads the session from the URL and AuthProvider's
 * onAuthStateChange picks it up. Configure the providers under [auth.external]
 * in supabase/config.toml (locally) or in the project's dashboard.
 */
export function OAuthButtons() {
  const [error, setError] = useState<string | null>(null);

  async function signInWith(provider: "google" | "apple") {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      // Keep the trailing slash so this exactly matches the production root
      // registered in Supabase's redirect URL allow list.
      options: { redirectTo: new URL("/", window.location.href).toString() },
    });
    if (error) setError(error.message);
  }

  return (
    <div>
      {error && <p className="error">{error}</p>}

      <button type="button" className="oauth-button" onClick={() => signInWith("google")}>
        Continue with Google
      </button>
      <button type="button" className="oauth-button" onClick={() => signInWith("apple")}>
        Continue with Apple
      </button>

      <div className="auth-divider">or continue with email</div>
    </div>
  );
}
