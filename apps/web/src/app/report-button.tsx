"use client";

import { useState } from "react";
import type { ReportTargetType } from "@nyps-forum/shared";
import { api } from "~/lib/api";
import { useAuth } from "~/lib/auth-context";

export function ReportButton({ targetType, targetId }: { targetType: ReportTargetType; targetId: string }) {
  const { token, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/api/reports", { targetType, targetId, reason }, token);
      setDone(true);
      setOpen(false);
    } catch (err: any) {
      setError(err.message ?? "Could not submit report");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return <span className="meta">Reported</span>;
  }

  if (!open) {
    return (
      <button className="link-button" onClick={() => setOpen(true)}>
        Report
      </button>
    );
  }

  return (
    <form onSubmit={submit} style={{ marginTop: "0.5rem", maxWidth: "100%" }}>
      <label>
        Why are you reporting this?
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          style={{ minHeight: "60px" }}
        />
      </label>
      {error && <p className="error">{error}</p>}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button type="submit" disabled={submitting}>
          {submitting ? "Submitting..." : "Submit report"}
        </button>
        <button type="button" className="secondary" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
