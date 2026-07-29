"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  DESTRUCTIVE_MODERATION_ACTIONS,
  formatDateTime,
  MODERATION_ACTION_LABELS,
  ModerationAction,
  type ModerationLogResponse,
} from "@nyps-forum/shared";
import { api } from "~/lib/api";
import { useAuth } from "~/lib/auth-context";
import { useSettings } from "~/lib/settings-context";
import { EmptyState, Skeleton } from "../../ui";
import { AdminFilters, AdminSelect } from "../admin-ui";

const PAGE_SIZE = 50;

const ACTION_OPTIONS = [
  { value: "", label: "Every action" },
  ...Object.values(ModerationAction).map((a) => ({ value: a, label: MODERATION_ACTION_LABELS[a] })),
];

/** Where an entry's target can be opened, when it's still reachable. */
function targetHref(targetType: string, targetId: string): string | null {
  if (targetType === "user") return `/u/${targetId}`;
  if (targetType === "thread") return `/t/${targetId}`;
  return null;
}

export default function AdminLogPage() {
  const { token } = useAuth();
  const { dateFormat } = useSettings();
  const [action, setAction] = useState("");
  const [data, setData] = useState<ModerationLogResponse | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (nextOffset: number) => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(nextOffset) });
        if (action) qs.set("action", action);
        const res = await api.get<ModerationLogResponse>(`/api/admin/log?${qs.toString()}`, token);
        setData(res);
        setOffset(nextOffset);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    },
    [token, action],
  );

  useEffect(() => {
    load(0);
  }, [load]);

  return (
    <div>
      <AdminFilters>
        <AdminSelect label="Action" value={action} onChange={setAction} options={ACTION_OPTIONS} />
        <p className="meta admin-filter-count">{data ? `${data.total} entries` : "…"}</p>
      </AdminFilters>

      <p className="meta" style={{ marginBottom: "0.75rem" }}>
        Append-only and read-only. Nothing in this product edits or deletes an entry — this is the
        record the Society&apos;s board relies on to reconstruct what happened.
      </p>

      {error && <p className="error">{error}</p>}

      {loading && (
        <>
          <Skeleton style={{ height: "2.5rem", marginBottom: "0.4rem", borderRadius: 8 }} />
          <Skeleton style={{ height: "2.5rem", borderRadius: 8 }} />
        </>
      )}

      {!loading && data?.entries.length === 0 && !error && (
        <EmptyState
          title="Nothing logged yet"
          hint="Moderation actions appear here the moment they're taken."
        />
      )}

      {!loading && data && data.entries.length > 0 && (
        <div className="log-table">
          {data.entries.map((e) => {
            const href = targetHref(e.targetType, e.targetId);
            const destructive = DESTRUCTIVE_MODERATION_ACTIONS.includes(e.action);
            return (
              <div className="log-entry" key={e.id}>
                <span className="log-when">{formatDateTime(e.createdAt, dateFormat)}</span>
                <span className={`log-action ${destructive ? "log-action-danger" : ""}`}>
                  {MODERATION_ACTION_LABELS[e.action] ?? e.action}
                </span>
                <span className="log-who">
                  {e.actor ? (
                    <Link href={`/u/${e.actor.id}`}>{e.actor.displayName}</Link>
                  ) : (
                    "[deleted admin]"
                  )}
                </span>
                <span className="log-target">
                  {href ? (
                    <Link href={href}>{e.targetLabel ?? e.targetId}</Link>
                  ) : (
                    (e.targetLabel ?? e.targetId)
                  )}
                </span>
                <span className="log-reason">{e.reason ?? "—"}</span>
              </div>
            );
          })}
        </div>
      )}

      {!loading && data && (data.hasMore || offset > 0) && (
        <div className="row" style={{ marginTop: "1rem" }}>
          <button
            className="secondary btn-sm"
            disabled={offset === 0}
            onClick={() => load(Math.max(offset - PAGE_SIZE, 0))}
          >
            ← Newer
          </button>
          <button
            className="secondary btn-sm"
            disabled={!data.hasMore}
            onClick={() => load(offset + PAGE_SIZE)}
          >
            Older →
          </button>
        </div>
      )}
    </div>
  );
}
