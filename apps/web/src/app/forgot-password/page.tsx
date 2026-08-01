"use client";

import Link from "next/link";
import { useState } from "react";
import { supabase } from "~/lib/supabase";

/**
 * Supabase sends the reset email and owns the token; we only collect the
 * address and name the page the link should land on. Locally the mail is
 * caught by Inbucket — see supabase/config.toml for its port — so the flow can
 * be walked end to end without a mail provider.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSubmitting(false);
    if (error && /rate limit/i.test(error.message)) {
      setError("Too many attempts just now. Try again in a few minutes.");
      return;
    }
    // Any other error is swallowed on purpose: whether an address has an
    // account here is not something this form should confirm to a stranger.
    setSent(true);
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/nypc-icon.png" alt="The New York Philosophy Club" className="auth-logo" />
        <h1 className="auth-title">Reset your password</h1>

        {sent ? (
          <p className="auth-subtitle">
            If that email has an account, we&apos;ve sent a link to reset your password. The link
            expires in an hour.
          </p>
        ) : (
          <>
            <p className="auth-subtitle">
              We&apos;ll email you a link to choose a new one.
            </p>
            <form onSubmit={onSubmit}>
              <label>
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>
              {error && <p className="error">{error}</p>}
              <button type="submit" disabled={submitting}>
                {submitting ? "Sending..." : "Send reset link"}
              </button>
            </form>
          </>
        )}

        <p className="auth-footer">
          <Link href="/login">Back to log in</Link>
        </p>
      </div>
    </div>
  );
}
