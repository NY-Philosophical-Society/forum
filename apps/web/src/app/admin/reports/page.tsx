"use client";

import { useEffect, useState } from "react";
import { type ReportSummary, formatDateTime } from "@nyps-forum/shared";
import { api } from "~/lib/api";
import { useAuth } from "~/lib/auth-context";
import { useSettings } from "~/lib/settings-context";
import { EmptyState, Skeleton } from "../../ui";

export default function AdminReportsPage() {
  const { user, token, loading } = useAuth();
  const { dateFormat } = useSettings();
  const [reports, setReports] = useState<ReportSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api
      .get<{ reports: ReportSummary[] }>("/api/reports", token)
      .then((res) => setReports(res.reports))
      .catch((e) => setError(e.message));
  }, [token]);

  if (loading) return <Skeleton style={{ height: "2rem", width: "40%" }} />;
  if (!user || user.role !== "admin") {
    return <p className="error">Admin access required.</p>;
  }

  return (
    <div>
      <h1 className="page-title">Open Reports</h1>
      <p className="meta">
        Read-only for now — cross-reference the target id with the thread, post, message, or user
        it names.
      </p>
      {error && <p className="error">{error}</p>}

      {reports === null && !error && (
        <div style={{ marginTop: "1.5rem" }}>
          <Skeleton style={{ height: "5rem", marginBottom: "0.75rem", borderRadius: 10 }} />
          <Skeleton style={{ height: "5rem", borderRadius: 10 }} />
        </div>
      )}

      {reports?.length === 0 && (
        <EmptyState title="No open reports" hint="The community is conducting itself well." />
      )}

      <div style={{ marginTop: "1.5rem" }}>
        {reports?.map((r) => (
          <div className="card" key={r.id}>
            <div className="row wrap" style={{ marginBottom: "0.5rem" }}>
              <span className="tag-static">{r.targetType}</span>
              <span className="meta">{r.targetId}</span>
            </div>
            <p className="prose" style={{ fontSize: "var(--text-base)" }}>
              {r.reason}
            </p>
            <p className="meta" style={{ marginTop: "0.5rem" }}>
              {formatDateTime(r.createdAt, dateFormat)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
