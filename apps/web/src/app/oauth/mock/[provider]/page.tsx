"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import type { AuthResponse } from "@nyps-forum/shared";
import { api } from "~/lib/api";
import { useAuth } from "~/lib/auth-context";

/**
 * Stands in for Google's / Apple's own hosted consent screen. A real
 * integration never shows this — the provider's own SDK/page handles it and
 * this app only ever sees the resulting identity token. This exists purely
 * so the sign-up/sign-in UX can be tried locally without real OAuth
 * credentials (see apps/api/src/lib/oauth.ts).
 */
export default function MockOAuthPage() {
  const { provider } = useParams<{ provider: string }>();
  const { setSession } = useAuth();
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const providerLabel = provider === "apple" ? "Apple" : "Google";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post<AuthResponse>("/api/auth/oauth/dev-mock", {
        provider,
        email,
        displayName,
      });
      setSession(res.token, res.user);
      router.push("/");
    } catch (err: any) {
      setError(err.message ?? "Could not sign in");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1>Mock {providerLabel} Sign-In</h1>
      <p className="notice">
        This screen exists only because real {providerLabel} sign-in isn&apos;t configured on
        this server yet. In production, this would be {providerLabel}&apos;s own hosted sign-in
        page — you&apos;d never see this app&apos;s UI at all during that step.
      </p>
      <form onSubmit={onSubmit}>
        <label>
          Name (as {providerLabel} would provide it)
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
        </label>
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
          {submitting ? "Signing in..." : `Continue as this ${providerLabel} user`}
        </button>
      </form>
    </div>
  );
}
