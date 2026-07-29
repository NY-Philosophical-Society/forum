"use client";

/**
 * Shared UI primitives for the forum. Visual primitives that are pure CSS
 * (buttons, cards, chips, badges) stay as classes in globals.css; these are
 * the ones that carry structure or state.
 */

export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      aria-hidden
    >
      {name.charAt(0).toUpperCase()}
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
