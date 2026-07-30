"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { VerificationSessionResponse } from "@nyps-forum/shared";
import { api } from "~/lib/api";
import { useAuth } from "~/lib/auth-context";
import { StatusBadge } from "../ui";

export default function VerifyPage() {
  const { user, token, loading } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  if (loading) return <p className="meta">Loading...</p>;
  if (!user) {
    return (
      <p className="meta">
        You need to <a href="/login">log in</a> first.
      </p>
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
      <h1 className="page-title">Identity Verification</h1>

      <div className="card" style={{ marginTop: "1.5rem" }}>
        {user.verificationStatus !== "UNVERIFIED" && (
          <div className="row" style={{ marginBottom: "1rem" }}>
            <span className="meta">Current status</span>
            <StatusBadge status={user.verificationStatus} />
          </div>
        )}

        {user.verificationStatus === "VERIFIED" ? (
          <p className="toast" style={{ marginBottom: 0 }}>
            You&apos;re ID-verified — a stronger confirmation than the honor system alone, and it
            shows next to your name.
          </p>
        ) : (
          <>
            <p className="prose" style={{ fontSize: "var(--text-base)", marginBottom: "1rem" }}>
              This forum runs on the honor system for now: you&apos;re already posting under the
              real name you gave when you signed up, and no ID check is required for that.
              Completing verification adds a stronger, confirmed badge next to your name — useful
              if you&apos;d like your identity backed by more than your word. In production this
              hands off to a hosted identity-verification provider (Stripe Identity / Persona /
              Veriff): you photograph a government ID and take a live selfie, the provider matches
              the two, and we only ever store the pass/fail result — never the document itself.
              This prototype simulates that step locally.
            </p>
            {error && <p className="error">{error}</p>}
            <button onClick={startVerification} disabled={starting}>
              {starting ? "Starting..." : "Start verification"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
