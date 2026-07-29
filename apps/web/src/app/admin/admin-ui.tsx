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
