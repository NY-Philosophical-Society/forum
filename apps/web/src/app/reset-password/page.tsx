"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "~/lib/supabase";

/**
 * Where the emailed reset link lands. supabase-js reads the recovery token out
 * of the URL on load and puts the browser into a short-lived authenticated
 * session, which is what makes updateUser() below legal — so there is no token
 * to handle here ourselves.
 *
 * Note there is no useSearchParams() here: the recovery credential arrives in
 * the URL *fragment*, which supabase-js consumes. That also keeps this page
 * out of the Suspense-boundary prerender trap that useSearchParams() causes.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/");
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/nypc-icon.png" alt="The New York Philosophy Club" className="auth-logo" />
        <h1 className="auth-title">Choose a new password</h1>

        {ready ? (
          <form onSubmit={onSubmit}>
            <label>
              New password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </label>
            {error && <p className="error">{error}</p>}
            <button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : "Save new password"}
            </button>
          </form>
        ) : (
          <p className="auth-subtitle">
            This reset link is invalid or has expired. Request a new one from the log-in page.
          </p>
        )}
      </div>
    </div>
  );
}
