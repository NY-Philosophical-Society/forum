"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "~/lib/api";
import { useAuth } from "~/lib/auth-context";

/**
 * Stands in for a real provider's hosted verification page (Stripe Identity,
 * Persona, Veriff). A real integration redirects here instead of rendering it
 * inside this app — the user never sees this screen in production.
 */
export default function MockVerificationPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { refreshUser } = useAuth();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function resolve(approve: boolean) {
    setSubmitting(true);
    try {
      await api.post(`/api/verification/mock-complete/${sessionId}`, { approve });
      await refreshUser();
      router.push("/verify");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-icon" aria-hidden>
          Φ
        </div>
        <h1 className="auth-title">Mock Identity Verification</h1>
        <p className="auth-subtitle">
          A stand-in for the provider&apos;s hosted ID + selfie check — this screen never exists
          in production.
        </p>
        <p className="meta" style={{ marginBottom: "1.25rem" }}>
          Session: {sessionId}
        </p>
        <div className="row" style={{ justifyContent: "center" }}>
          <button onClick={() => resolve(true)} disabled={submitting}>
            Simulate: approved
          </button>
          <button className="secondary" onClick={() => resolve(false)} disabled={submitting}>
            Simulate: rejected
          </button>
        </div>
      </div>
    </div>
  );
}
