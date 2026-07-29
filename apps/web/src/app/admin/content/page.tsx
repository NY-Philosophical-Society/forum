"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  formatDate,
  MAX_PINNED_THREADS,
  type AdminThreadsResponse,
  type AdminThreadSummary,
} from "@nyps-forum/shared";
import { api } from "~/lib/api";
import { useAuth } from "~/lib/auth-context";
import { useSettings } from "~/lib/settings-context";
import { ConfirmAction, EmptyState, Skeleton } from "../../ui";
import { AdminFilters, AdminSearch, AdminSelect } from "../admin-ui";

const PAGE_SIZE = 25;

export default function AdminContentPage() {
  const { token } = useAuth();
  const { dateFormat } = useSettings();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [data, setData] = useState<AdminThreadsResponse | null>(null);
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
        if (search) qs.set("search", search);
        if (filter) qs.set(filter, "1");
        const res = await api.get<AdminThreadsResponse>(`/api/admin/threads?${qs.toString()}`, token);
        setData(res);
        setOffset(nextOffset);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    },
    [token, search, filter],
  );

  useEffect(() => {
    load(0);
  }, [load]);

  const pinsLeft = data ? data.pinLimit - data.pinnedCount : 0;

  return (
    <div>
      <AdminFilters>
        <AdminSearch value={search} placeholder="Thread title" onSubmit={setSearch} />
        <AdminSelect
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "", label: "Live threads" },
            { value: "pinned", label: "Pinned" },
            { value: "locked", label: "Locked" },
            { value: "deleted", label: "Deleted" },
          ]}
        />
        <p className="meta admin-filter-count">
          {data
            ? `${data.total} threads · ${data.pinnedCount}/${data.pinLimit} pins used`
            : "…"}
        </p>
      </AdminFilters>

      <p className="meta" style={{ marginBottom: "0.75rem" }}>
        At most {MAX_PINNED_THREADS} threads can be pinned at once, so the feed can&apos;t be
        buried. Pinned threads sort above everything in both Hot and New without touching their
        ranking.
      </p>

      {error && <p className="error">{error}</p>}

      {loading && (
        <>
          <Skeleton style={{ height: "3.5rem", marginBottom: "0.5rem", borderRadius: 10 }} />
          <Skeleton style={{ height: "3.5rem", borderRadius: 10 }} />
        </>
      )}

      {!loading && data?.threads.length === 0 && !error && (
        <EmptyState title="No threads match" hint="Loosen the filters above." />
      )}

      {!loading &&
        data?.threads.map((t) => (
          <ThreadRow
            key={t.id}
            thread={t}
            pinsLeft={pinsLeft}
            dateFormat={dateFormat}
            token={token}
            onChanged={() => load(offset)}
          />
        ))}

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

function ThreadRow({
  thread,
  pinsLeft,
  dateFormat,
  token,
  onChanged,
}: {
  thread: AdminThreadSummary;
  pinsLeft: number;
  dateFormat: Parameters<typeof formatDate>[1];
  token: string | null;
  onChanged: () => void;
}) {
  return (
    <article className="card admin-row">
      <div className="row wrap between">
        <Link className="admin-row-name" href={`/t/${thread.id}`}>
          {thread.pinnedAt && <span className="pin-mark">❖</span>}
          {thread.title}
        </Link>
        <div className="row wrap">
          {thread.locked && <span className="badge badge-unverified">locked</span>}
          {thread.deleted && <span className="badge badge-rejected">deleted</span>}
        </div>
      </div>
      <p className="meta" style={{ marginTop: "0.3rem" }}>
        {thread.author.displayName} · {formatDate(thread.createdAt, dateFormat)} · ♥{" "}
        {thread.likeCount} · {thread.postCount} {thread.postCount === 1 ? "reply" : "replies"}
      </p>

      {!thread.deleted && (
        <div className="admin-actions">
          {thread.pinnedAt ? (
            <ConfirmAction
              label="Unpin"
              title="Unpin this thread"
              description="It returns to its natural position in Hot and New — nothing is recomputed."
              confirmLabel="Unpin"
              reasonRequired={false}
              reasonLabel="Note (recorded in the moderation log)"
              onConfirm={() => api.delete(`/api/threads/${thread.id}/pin`, token)}
              onDone={onChanged}
            />
          ) : (
            <ConfirmAction
              label={pinsLeft > 0 ? "Pin" : "Pin (cap reached)"}
              title="Pin this thread to the top of the feed"
              description={`Sorts above everything in both Hot and New. ${pinsLeft} of ${MAX_PINNED_THREADS} pins free.`}
              confirmLabel="Pin thread"
              reasonRequired={false}
              reasonLabel="Note (recorded in the moderation log)"
              disabled={pinsLeft <= 0}
              onConfirm={(reason) => api.post(`/api/threads/${thread.id}/pin`, { reason }, token)}
              onDone={onChanged}
            />
          )}

          <ConfirmAction
            label={thread.locked ? "Unlock" : "Lock"}
            title={thread.locked ? "Unlock this thread" : "Lock this thread"}
            description={
              thread.locked
                ? "Replies and edits are possible again."
                : "Freezes replies and edits. Nothing is removed."
            }
            confirmLabel={thread.locked ? "Unlock thread" : "Lock thread"}
            reasonRequired={false}
            onConfirm={(reason) => api.post(`/api/threads/${thread.id}/lock`, { reason }, token)}
            onDone={onChanged}
          />

          <ConfirmAction
            label="Delete"
            title="Delete this thread"
            description="Soft delete: the title and text go, and replies underneath stay readable under a [deleted] notice."
            confirmLabel="Delete thread"
            danger
            onConfirm={(reason) =>
              api.deleteWithBody(`/api/threads/${thread.id}`, { reason }, token)
            }
            onDone={onChanged}
          />
        </div>
      )}
    </article>
  );
}
