"use client";

import { useState } from "react";

/**
 * Shared UI primitives for the forum. Visual primitives that are pure CSS
 * (buttons, cards, chips, badges) stay as classes in globals.css; these are
 * the ones that carry structure or state.
 */

/** First letter of the name; "?" for names with none (e.g. "[deleted]"). */
export function avatarInitial(name: string): string {
  const letter = name.match(/\p{L}/u);
  return letter ? letter[0].toUpperCase() : "?";
}

export function Avatar({
  name,
  src,
  size = 28,
}: {
  name: string;
  /** Photo URL; null/undefined falls back to initials. */
  src?: string | null;
  size?: number;
}) {
  // Tracks the exact URL that failed, so a *new* src gets a fresh chance.
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  if (src && brokenSrc !== src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="avatar avatar-photo"
        style={{ width: size, height: size }}
        src={src}
        alt=""
        // A dead URL must degrade to initials, never a broken-image glyph.
        onError={() => setBrokenSrc(src)}
        aria-hidden
      />
    );
  }
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      aria-hidden
    >
      {avatarInitial(name)}
    </span>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-mark" aria-hidden>
        ❦
      </span>
      <p className="empty-title">{title}</p>
      {hint && <p className="meta">{hint}</p>}
      {action}
    </div>
  );
}

export function Skeleton({ style }: { style?: React.CSSProperties }) {
  return <span className="skeleton" style={style} aria-hidden />;
}

export function ThreadCardSkeleton() {
  return (
    <div className="card" aria-hidden>
      <Skeleton style={{ height: "1.1rem", width: "70%", marginBottom: "0.75rem" }} />
      <Skeleton style={{ height: "0.8rem", width: "40%", marginBottom: "1rem" }} />
      <Skeleton style={{ height: "1.4rem", width: "6rem", borderRadius: 999 }} />
    </div>
  );
}

export function PostSkeleton() {
  return (
    <div className="post" aria-hidden>
      <Skeleton style={{ height: "0.9rem", width: "95%", marginBottom: "0.5rem" }} />
      <Skeleton style={{ height: "0.9rem", width: "80%", marginBottom: "0.75rem" }} />
      <Skeleton style={{ height: "0.75rem", width: "30%" }} />
    </div>
  );
}

/**
 * A two-step destructive action: the button reveals a panel that states what
 * will happen and takes the reason, and only that panel's button commits. The
 * reason isn't UI politeness — for moderation actions it's what gets written to
 * the moderation log, so the confirmation step and the audit record are one
 * interaction rather than two things a hurried admin can get half of.
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

const statusBadgeClass: Record<string, string> = {
  VERIFIED: "badge badge-verified",
  PENDING: "badge badge-pending",
  UNVERIFIED: "badge badge-unverified",
  REJECTED: "badge badge-rejected",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={statusBadgeClass[status] ?? statusBadgeClass.UNVERIFIED}>
      {status.toLowerCase()}
    </span>
  );
}
