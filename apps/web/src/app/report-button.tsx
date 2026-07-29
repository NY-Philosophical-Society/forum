"use client";

import { useState } from "react";
import {
  REPORT_CATEGORIES,
  REPORT_CATEGORY_LABELS,
  type ReportCategory,
  type ReportTargetType,
} from "@nyps-forum/shared";
import { api } from "~/lib/api";
import { useAuth } from "~/lib/auth-context";

export function ReportButton({ targetType, targetId }: { targetType: ReportTargetType; targetId: string }) {
  const { token, user } = useAuth();
  const [open, setOpen] = useState(false);
  // No pre-selection: the category is the substance of the report, so the
  // reporter has to say which one rather than accepting a default.
  const [category, setCategory] = useState<ReportCategory | "">("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !category) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/api/reports", { targetType, targetId, category, note: note.trim() }, token);
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
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as ReportCategory)}
          required
        >
          <option value="">Choose a reason…</option>
          {REPORT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {REPORT_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Anything to add? <span className="field-hint">Optional</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Context that would help a moderator judge this."
          style={{ minHeight: "60px" }}
        />
      </label>
      {error && <p className="error">{error}</p>}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button type="submit" disabled={submitting || !category}>
          {submitting ? "Submitting..." : "Submit report"}
        </button>
        <button type="button" className="secondary" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
