"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { VerificationSessionResponse } from "@nyps-forum/shared";
import { api } from "~/lib/api";
import { useAuth } from "~/lib/auth-context";

export default function VerifyPage() {
  const { user, token, loading } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  if (loading) return <p>Loading...</p>;
  if (!user) {
    return (
      <div>
        <p>
          You need to <a href="/login">log in</a> first.
        </p>
      </div>
    );
  }

  async function startVerification() {
    setError(null);
    setStarting(true);
    try {
      const res = await api.post<VerificationSessionResponse>(
        "/api/verification/start",
        {},
        token,
      );
      router.push(res.verificationUrl.replace(window.location.origin, ""));
    } catch (err: any) {
      setError(err.message ?? "Could not start verification");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div>
      <h1>Identity Verification</h1>
      <p>
        Current status: <strong>{user.verificationStatus}</strong>
      </p>

      {user.verificationStatus === "VERIFIED" && (
        <p className="notice">You&apos;re verified — you can post and reply.</p>
      )}

      {user.verificationStatus !== "VERIFIED" && (
        <>
          <p className="meta">
            In production this hands off to a hosted identity-verification provider (Stripe
            Identity / Persona / Veriff): you photograph a government ID and take a live selfie,
            the provider matches the two and checks the document for authenticity, and we only
            ever store the pass/fail result — never the document image itself. This prototype
            simulates that step locally.
          </p>
          {error && <p className="error">{error}</p>}
          <button onClick={startVerification} disabled={starting}>
            {starting ? "Starting..." : "Start verification"}
          </button>
        </>
      )}
    </div>
  );
}
