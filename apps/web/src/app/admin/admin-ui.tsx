"use client";

import { useState } from "react";
import { useAuth } from "~/lib/auth-context";
import { Skeleton } from "../ui";

/**
 * Shared pieces of the admin area. This is internal tooling: dense, plain, and
 * unambiguous beats pretty. It still draws entirely from the design tokens —
 * destructive affordances use --danger, which is deliberately redder than the
 * terracotta accent so "destructive" never reads as "decorative".
 */

/**
 * Client-side gate. Not the enforcement — every /api/admin/* route and every
 * moderation mutation checks requireAdmin server-side — just the reason a
 * non-admin who guesses the URL sees a sentence instead of a broken page.
 */
export function AdminGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <Skeleton style={{ height: "2rem", width: "40%" }} />;
  }
  if (!user || user.role !== "admin") {
    return (
      <div className="card danger-card">
        <p className="error" style={{ margin: 0 }}>
          Admin access required.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}

/**
 * A two-step destructive action: the button reveals a panel that states what
 * will happen and takes the reason, and only that panel's button commits. The
 * reason isn't UI politeness — it's what gets written to the moderation log,
 * so the confirmation step and the audit record are the same interaction
 * rather than two things a hurried admin can get half of.
 */
export function ConfirmAction({
  label,
  title,
  description,
  confirmLabel,
  danger = false,
  reasonRequired = true,
  reasonLabel = "Reason (recorded in the moderation log)",
  reasonPlaceholder,
  disabled = false,
  onConfirm,
  onDone,
}: {
  label: string;
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  reasonRequired?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  disabled?: boolean;
  onConfirm: (reason: string) => Promise<void>;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function commit() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      setOpen(false);
      setReason("");
      onDone?.();
    } catch (e: any) {
      setError(e.message ?? "That didn't work");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        className={danger ? "btn-sm danger-button" : "secondary btn-sm"}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
    );
  }

  return (
    <div className={`confirm-panel ${danger ? "confirm-panel-danger" : ""}`}>
      <p className="confirm-title">{title}</p>
      <p className="meta">{description}</p>
      <label>
        {reasonLabel}
        {!reasonRequired && <span className="field-hint"> Optional</span>}
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={reasonPlaceholder}
          autoFocus
          style={{ minHeight: "58px" }}
        />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button
          className={danger ? "btn-sm danger-button" : "btn-sm"}
          onClick={commit}
          disabled={busy || (reasonRequired && reason.trim().length < 3)}
        >
          {busy ? "Working..." : confirmLabel}
        </button>
        <button
          className="secondary btn-sm"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          disabled={busy}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Dense filter bar shared by the queue, users, and content tables. */
export function AdminFilters({ children }: { children: React.ReactNode }) {
  return <div className="admin-filters">{children}</div>;
}

export function AdminSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="admin-field">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Search box that only fires on submit — no keystroke-per-request on a table. */
export function AdminSearch({
  value,
  placeholder,
  onSubmit,
}: {
  value: string;
  placeholder: string;
  onSubmit: (value: string) => void;
}) {
  const [input, setInput] = useState(value);
  return (
    <form
      className="admin-field"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(input.trim());
      }}
    >
      Search
      <span className="row">
        <input
          type="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
        />
        <button className="btn-sm" type="submit">
          Go
        </button>
      </span>
    </form>
  );
}
