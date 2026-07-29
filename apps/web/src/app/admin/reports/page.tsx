"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  formatDateTime,
  type DateFormatPreference,
  REPORT_ACTION_LABELS,
  REPORT_CATEGORIES,
  REPORT_CATEGORY_LABELS,
  type ReportAction,
  type ReportCategory,
  type ReportsResponse,
  type ReportStatus,
  type ReportSummary,
} from "@nyps-forum/shared";
import { api } from "~/lib/api";
import { useAuth } from "~/lib/auth-context";
import { useSettings } from "~/lib/settings-context";
import { Avatar, ConfirmAction, EmptyState, Skeleton } from "../../ui";
import { AdminFilters, AdminSelect } from "../admin-ui";

const PAGE_SIZE = 20;

const STATUS_OPTIONS: { value: ReportStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
  { value: "dismissed", label: "Dismissed" },
];

/** Which resolve actions make sense for a given target. */
function actionsFor(report: ReportSummary): ReportAction[] {
  const actions: ReportAction[] = [];
  if (report.targetType === "thread" || report.targetType === "post") {
    if (!report.target.deleted && !report.target.missing) actions.push("delete_content");
    if (!report.target.locked && !report.target.missing) actions.push("lock_thread");
  }
  actions.push("warn_author", "ban_author", "no_action");
  return actions;
}

function targetHref(report: ReportSummary): string | null {
  const { target } = report;
  if (target.missing) return null;
  if (report.targetType === "user") return `/u/${report.targetId}`;
  if (target.postId) return `/t/${target.threadId}#post-${target.postId}`;
  if (target.threadId) return `/t/${target.threadId}`;
  return null;
}

export default function AdminReportsPage() {
  const { token } = useAuth();
  const { dateFormat } = useSettings();
  const [status, setStatus] = useState<ReportStatus>("open");
  const [category, setCategory] = useState<ReportCategory | "">("");
  const [data, setData] = useState<ReportsResponse | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (nextOffset: number) => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({
          status,
          limit: String(PAGE_SIZE),
          offset: String(nextOffset),
        });
        if (category) qs.set("category", category);
        const res = await api.get<ReportsResponse>(`/api/reports?${qs.toString()}`, token);
        setData(res);
        setOffset(nextOffset);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    },
    [token, status, category],
  );

  useEffect(() => {
    load(0);
  }, [load]);

  const reports = data?.reports ?? [];

  return (
    <div>
      <AdminFilters>
        <AdminSelect
          label="Status"
          value={status}
          onChange={(v) => setStatus(v as ReportStatus)}
          options={STATUS_OPTIONS}
        />
        <AdminSelect
          label="Category"
          value={category}
          onChange={(v) => setCategory(v as ReportCategory | "")}
          options={[
            { value: "", label: "All categories" },
            ...REPORT_CATEGORIES.map((c) => ({ value: c, label: REPORT_CATEGORY_LABELS[c] })),
          ]}
        />
        <p className="meta admin-filter-count">
          {data ? `${data.total} ${status}` : "…"}
          {data && data.openCount > 0 && status !== "open" ? ` · ${data.openCount} open` : ""}
        </p>
      </AdminFilters>

      {error && <p className="error">{error}</p>}

      {loading && (
        <>
          <Skeleton style={{ height: "7rem", marginBottom: "0.75rem", borderRadius: 10 }} />
          <Skeleton style={{ height: "7rem", borderRadius: 10 }} />
        </>
      )}

      {!loading && reports.length === 0 && !error && (
        <EmptyState
          title={status === "open" ? "No open reports" : `Nothing ${status}`}
          hint={
            status === "open"
              ? "The community is conducting itself well."
              : "Change the filters above to see other reports."
          }
        />
      )}

      {!loading &&
        reports.map((r) => (
          <ReportCard
            key={r.id}
            report={r}
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

function ReportCard({
  report,
  dateFormat,
  token,
  onChanged,
}: {
  report: ReportSummary;
  dateFormat: DateFormatPreference;
  token: string | null;
  onChanged: () => void;
}) {
  const { target } = report;
  const href = targetHref(report);
  const open = report.status === "open";

  async function resolve(action: ReportAction, reason: string) {
    await api.post(`/api/reports/${report.id}/resolve`, { action, reason }, token);
  }

  return (
    <article className="card admin-report">
      <div className="row wrap between">
        <div className="row wrap">
          <span className="tag-static">{REPORT_CATEGORY_LABELS[report.category]}</span>
          <span className="tag-static">{report.targetType}</span>
          {target.deleted && <span className="badge badge-rejected">deleted</span>}
          {target.locked && <span className="badge badge-unverified">locked</span>}
          {target.missing && <span className="badge badge-rejected">gone</span>}
        </div>
        <span className="meta">{formatDateTime(report.createdAt, dateFormat)}</span>
      </div>

      <p className="meta" style={{ marginTop: "0.4rem" }}>
        Filed by{" "}
        {report.reporter ? (
          <Link href={`/u/${report.reporter.id}`}>{report.reporter.displayName}</Link>
        ) : (
          "[deleted]"
        )}
      </p>

      {report.note && <p className="admin-report-note">“{report.note}”</p>}

      {/* The reported content, inline — judging a report shouldn't require
          leaving the queue. */}
      <div className="admin-target">
        {target.missing ? (
          <p className="tombstone">That content no longer exists.</p>
        ) : (
          <>
            <div className="row wrap">
              {target.author && (
                <span className="row">
                  <Avatar name={target.author.displayName} src={target.author.avatarUrl} size={22} />
                  <span className="meta">{target.author.displayName}</span>
                </span>
              )}
              {target.createdAt && (
                <span className="meta">· {formatDateTime(target.createdAt, dateFormat)}</span>
              )}
              {href && (
                <Link className="meta" href={href} target="_blank">
                  open ↗
                </Link>
              )}
            </div>
            {target.title && <p className="admin-target-title">{target.title}</p>}
            {target.body ? (
              <p className="admin-target-body">{target.body}</p>
            ) : (
              <p className="tombstone">[no text]</p>
            )}
          </>
        )}
      </div>

      {open ? (
        <div className="admin-actions">
          <ConfirmAction
            label="Dismiss"
            title="Dismiss this report"
            description="Closes the report with no action against the member or the content."
            confirmLabel="Dismiss report"
            reasonRequired={false}
            reasonPlaceholder="e.g. disagreement, not abuse"
            onConfirm={(reason) => api.post(`/api/reports/${report.id}/dismiss`, { reason }, token)}
            onDone={onChanged}
          />
          {actionsFor(report).map((action) => (
            <ConfirmAction
              key={action}
              label={REPORT_ACTION_LABELS[action].replace(/^Resolve with /, "")}
              title={REPORT_ACTION_LABELS[action]}
              description={describeAction(action, target.author?.displayName ?? "the author")}
              confirmLabel={confirmLabelFor(action)}
              danger={action === "delete_content" || action === "ban_author"}
              reasonLabel={
                action === "warn_author"
                  ? "Warning (the member reads this, and it's recorded in the log)"
                  : "Reason (recorded in the moderation log)"
              }
              onConfirm={(reason) => resolve(action, reason)}
              onDone={onChanged}
            />
          ))}
        </div>
      ) : (
        <p className="meta admin-resolution">
          {report.status === "dismissed" ? "Dismissed" : "Resolved"} by{" "}
          {report.resolvedBy?.displayName ?? "[deleted]"}
          {report.resolvedAt ? ` · ${formatDateTime(report.resolvedAt, dateFormat)}` : ""}
          {report.resolutionAction
            ? ` · ${REPORT_ACTION_LABELS[report.resolutionAction].toLowerCase()}`
            : ""}
          {report.resolutionNote ? ` — “${report.resolutionNote}”` : ""}
        </p>
      )}
    </article>
  );
}

function describeAction(action: ReportAction, authorName: string): string {
  switch (action) {
    case "delete_content":
      return "Soft-deletes it: the text goes, replies underneath stay readable under a [deleted] notice. Resolves the report.";
    case "warn_author":
      return `Sends ${authorName} a notification they can't switch off. Nothing is removed. Resolves the report.`;
    case "ban_author":
      return `Suspends ${authorName} immediately, including their current session. Reversible from the Members tab. Resolves the report.`;
    case "lock_thread":
      return "Freezes the thread — no new replies, no edits. Nothing is removed. Resolves the report.";
    case "no_action":
      return "Closes the report as handled without touching the member or the content.";
  }
}

function confirmLabelFor(action: ReportAction): string {
  switch (action) {
    case "delete_content":
      return "Delete it";
    case "warn_author":
      return "Send warning";
    case "ban_author":
      return "Ban member";
    case "lock_thread":
      return "Lock thread";
    case "no_action":
      return "Resolve";
  }
}
