"use client";

import { useEffect, useState } from "react";
import type { ReportSummary } from "@nyps-forum/shared";
import { api } from "~/lib/api";
import { useAuth } from "~/lib/auth-context";

export default function AdminReportsPage() {
  const { user, token, loading } = useAuth();
  const [reports, setReports] = useState<ReportSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api
      .get<{ reports: ReportSummary[] }>("/api/reports", token)
      .then((res) => setReports(res.reports))
      .catch((e) => setError(e.message));
  }, [token]);

  if (loading) return <p>Loading...</p>;
  if (!user || user.role !== "admin") {
    return <p className="error">Admin access required.</p>;
  }

  return (
    <div>
      <h1>Open Reports</h1>
      <p className="meta">
        No moderation actions from here yet — this just lists what&apos;s been reported. Cross-
        reference targetId with the thread/post/message/user it names.
      </p>
      {error && <p className="error">{error}</p>}
      {reports?.length === 0 && <p className="meta">No open reports.</p>}
      {reports?.map((r) => (
        <div className="card" key={r.id}>
          <p>
            <strong>{r.targetType}</strong> · <span className="meta">{r.targetId}</span>
          </p>
          <p>{r.reason}</p>
          <p className="meta">{new Date(r.createdAt).toLocaleString()}</p>
        </div>
      ))}
    </div>
  );
}
