"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "~/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post<{ message: string; devResetUrl?: string }>(
        "/api/auth/password-reset/request",
        { email },
      );
      setMessage(res.message);
      setDevResetUrl(res.devResetUrl ?? null);
    } catch (err: any) {
      setError(err.message ?? "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <img src="/nypc-icon.png" alt="The New York Philosophy Club" className="auth-logo" />
        <h1 className="auth-title">Reset your password</h1>
        <p className="auth-subtitle">
          <Link href="/login">Back to log in</Link>
        </p>

        {message ? (
          <>
            <p className="notice">{message}</p>
            {devResetUrl && (
              <p className="meta">
                No email service is configured on this server yet, so here&apos;s the link
                directly (dev-only):
                <br />
                <a href={devResetUrl}>{devResetUrl}</a>
              </p>
            )}
          </>
        ) : (
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
        )}
      </div>
    </div>
  );
}
