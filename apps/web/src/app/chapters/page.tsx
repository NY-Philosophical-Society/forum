"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ChapterSummary } from "@nyps-forum/shared";
import { api } from "~/lib/api";
import { useAuth } from "~/lib/auth-context";
import { MembershipPitch } from "../membership-pitch";
import { EmptyState, Skeleton } from "../ui";

/**
 * The chapter directory. Members see every chapter with their own join
 * state; non-members meet the membership pitch instead (the API refuses
 * them regardless — the pitch is the UX, not the gate).
 */
export default function ChaptersPage() {
  const { user, token, loading } = useAuth();
  const isMemberViewer = Boolean(user && (user.isSupporter || user.role === "admin"));

  const [chapters, setChapters] = useState<ChapterSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !isMemberViewer) return;
    api
      .get<{ chapters: ChapterSummary[] }>("/api/chapters", token)
      .then((res) => setChapters(res.chapters))
      .catch((e) => setError(e.message));
  }, [token, isMemberViewer]);

  if (loading) return <Skeleton style={{ height: "2rem", width: "40%" }} />;
  if (!isMemberViewer) return <MembershipPitch />;

  async function requestJoin(chapter: ChapterSummary) {
    if (!token) return;
    setJoining(chapter.slug);
    try {
      const res = await api.post<{ state: "pending" | "active" }>(
        `/api/chapters/${chapter.slug}/join`,
        {},
        token,
      );
      setChapters((prev) =>
        prev?.map((c) => (c.slug === chapter.slug ? { ...c, myMembership: res.state } : c)) ?? null,
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setJoining(null);
    }
  }

  return (
    <div>
      <div className="row between wrap">
        <h1 className="page-title">Chapters</h1>
        {user?.role === "admin" && (
          <Link href="/admin/chapters">
            <button className="secondary btn-sm">Manage chapters</button>
          </Link>
        )}
      </div>
      <p className="meta" style={{ marginBottom: "1.5rem" }}>
        Private spaces where a local group talks among itself. Request to join and an admin will
        wave you in.
      </p>

      {error && <p className="error">{error}</p>}

      {!chapters && !error && (
        <>
          <Skeleton style={{ height: "5rem", width: "100%", marginBottom: "1rem" }} />
          <Skeleton style={{ height: "5rem", width: "100%" }} />
        </>
      )}

      {chapters?.length === 0 && (
        <EmptyState
          title="No chapters yet"
          hint="When a local group forms, its chapter will appear here."
        />
      )}

      {chapters?.map((c) => (
        <article className="card chapter-card" key={c.id}>
          <div className="row between wrap" style={{ alignItems: "flex-start" }}>
            <div>
              {c.myMembership === "active" ? (
                <Link className="title" href={`/c/${c.slug}`}>
                  {c.name}
                </Link>
              ) : (
                <span className="title" style={{ cursor: "default" }}>
                  {c.name}
                </span>
              )}
              <p className="meta" style={{ marginTop: "0.35rem" }}>
                {c.location ? `${c.location} · ` : ""}
                {c.memberCount} {c.memberCount === 1 ? "member" : "members"}
                {user?.role === "admin" && c.pendingCount
                  ? ` · ${c.pendingCount} pending`
                  : ""}
              </p>
            </div>
            <div className="row">
              {c.myMembership === "active" && (
                <Link href={`/c/${c.slug}`}>
                  <button className="btn-sm">Open</button>
                </Link>
              )}
              {c.myMembership === "pending" && (
                <span className="badge badge-pending">request pending</span>
              )}
              {c.myMembership === "none" && (
                <button
                  className="secondary btn-sm"
                  disabled={joining === c.slug}
                  onClick={() => requestJoin(c)}
                >
                  {joining === c.slug ? "Requesting..." : "Request to join"}
                </button>
              )}
            </div>
          </div>
          {c.description && (
            <p style={{ margin: "0.75rem 0 0", lineHeight: "var(--leading-body)" }}>{c.description}</p>
          )}
        </article>
      ))}
    </div>
  );
}
