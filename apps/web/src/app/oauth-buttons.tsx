"use client";

import { useState } from "react";
import { supabase } from "~/lib/supabase";

/**
 * Google sign-in, handled entirely by Supabase.
 *
 * This used to load Google Identity Services and Sign in with Apple by hand,
 * with a local mock flow behind it for when neither had credentials. Supabase
 * does the provider dance now: it redirects out, and on the way back
 * supabase-js reads the session from the URL and AuthProvider's
 * onAuthStateChange picks it up. Configure the providers under [auth.external]
 * in supabase/config.toml (locally) or in the project's dashboard.
 *
 * Apple is deliberately not offered on the web. Note that App Store guideline
 * 4.8 requires Sign in with Apple in the iOS app if any other third-party
 * sign-in is offered there, so removing it here does not remove the
 * requirement from the mobile build.
 */
export function OAuthButtons() {
  const [error, setError] = useState<string | null>(null);

  async function signInWith(provider: "google") {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    });
    if (error) setError(error.message);
  }

  return (
    <div>
      {error && <p className="error">{error}</p>}

      <button type="button" className="oauth-button" onClick={() => signInWith("google")}>
        Continue with Google
      </button>

      <div className="auth-divider">or continue with email</div>
    </div>
  );
}
