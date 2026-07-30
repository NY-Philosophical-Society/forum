"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type {
  ChapterMembersResponse,
  ChapterSummary,
  ThreadFeedResponse,
  ThreadSummary,
} from "@nyps-forum/shared";
import { api } from "~/lib/api";
import { useAuth } from "~/lib/auth-context";
import { MembershipPitch } from "../../membership-pitch";
import { ThreadCard } from "../../thread-card";
import { Avatar, EmptyState, Skeleton, ThreadCardSkeleton } from "../../ui";

const PAGE_SIZE = 20;

/**
 * A chapter's own feed — the same feed components as the front page, scoped
 * to the chapter. The API only serves it to active chapter members (and
 * admins); everyone else sees the chapter's door.
 */
export default function ChapterPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user, token, loading } = useAuth();
  const isMemberViewer = Boolean(user && (user.isSupporter || user.role === "admin"));

  const [chapter, setChapter] = useState<ChapterSummary | null>(null);
  const [members, setMembers] = useState<ChapterMembersResponse | null>(null);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [sort, setSortState] = useState<"hot" | "new">("hot");
  const [feedLoading, setFeedLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const canRead = chapter?.myMembership === "active" || user?.role === "admin";

  useEffect(() => {
    if (!token || !isMemberViewer) return;
    api
      .get<{ chapter: ChapterSummary }>(`/api/chapters/${slug}`, token)
      .then((res) => setChapter(res.chapter))
      .catch((e) => setError(e.message));
  }, [token, isMemberViewer, slug]);

  useEffect(() => {
    if (!token || !chapter || !canRead) return;
    setFeedLoading(true);
    api
      .get<ThreadFeedResponse>(
        `/api/chapters/${slug}/threads?sort=${sort}&limit=${PAGE_SIZE}&offset=0`,
        token,
      )
      .then((res) => {
        setThreads(res.threads);
        setHasMore(res.hasMore);
        setOffset(res.threads.length);
      })
      .catch((e) => setError(e.message))
      .finally(() => setFeedLoading(false));
    api
      .get<ChapterMembersResponse>(`/api/chapters/${slug}/members`, token)
      .then(setMembers)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, chapter?.id, canRead, sort]);

  if (loading) return <Skeleton style={{ height: "2rem", width: "40%" }} />;
  if (!isMemberViewer) return <MembershipPitch />;
  if (error && !chapter) return <p className="error">{error}</p>;
  if (!chapter) return <Skeleton style={{ height: "2rem", width: "40%" }} />;

  async function requestJoin() {
    if (!token || !chapter) return;
    setJoining(true);
    try {
      const res = await api.post<{ state: "pending" | "active" }>(
        `/api/chapters/${slug}/join`,
        {},
        token,
      );
      setChapter({ ...chapter, myMembership: res.state });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setJoining(false);
    }
  }

  async function toggleLike(threadId: string) {
    if (!token) return;
    const res = await api.post<{ liked: boolean }>(`/api/threads/${threadId}/like`, {}, token);
    setThreads((prev) =>
      prev.map((t) =>
        t.id === threadId
          ? { ...t, myLiked: res.liked, likeCount: t.likeCount + (res.liked ? 1 : -1) }
          : t,
      ),
    );
  }

  async function toggleBookmark(thread: ThreadSummary) {
    if (!token) return;
    const wasBookmarked = Boolean(thread.myBookmarked);
    setThreads((prev) =>
      prev.map((t) => (t.id === thread.id ? { ...t, myBookmarked: !wasBookmarked } : t)),
    );
    try {
      if (wasBookmarked) await api.delete(`/api/bookmarks/${thread.id}`, token);
      else await api.post("/api/bookmarks", { threadId: thread.id }, token);
    } catch {
      setThreads((prev) =>
        prev.map((t) => (t.id === thread.id ? { ...t, myBookmarked: wasBookmarked } : t)),
      );
    }
  }

  async function loadMore() {
    if (!token) return;
    setLoadingMore(true);
    try {
      const res = await api.get<ThreadFeedResponse>(
        `/api/chapters/${slug}/threads?sort=${sort}&limit=${PAGE_SIZE}&offset=${offset}`,
        token,
      );
      setThreads((prev) => [...prev, ...res.threads]);
      setHasMore(res.hasMore);
      setOffset(offset + res.threads.length);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div>
      <Link href="/chapters" className="back-link">
        ← All chapters
      </Link>

      <div className="row between wrap" style={{ alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: "0.25rem" }}>
            {chapter.name}
          </h1>
          <p className="meta">
            {chapter.location ? `${chapter.location} · ` : ""}
            {chapter.memberCount} {chapter.memberCount === 1 ? "member" : "members"}
          </p>
        </div>
        {canRead && user?.role === "admin" && (
          <Link href="/admin/chapters">
            <button className="secondary btn-sm">Manage</button>
          </Link>
        )}
      </div>
      {chapter.description && (
        <p style={{ margin: "0.75rem 0 1.25rem", lineHeight: "var(--leading-body)" }}>
          {chapter.description}
        </p>
      )}

      {!canRead ? (
        // The chapter's door: a member who isn't in this chapter yet.
        <div className="wall-card">
          <span className="empty-mark" aria-hidden>
            ❦
          </span>
          <p className="wall-title">
            {chapter.myMembership === "pending"
              ? "Your request is with the admins"
              : "A private space for this chapter"}
          </p>
          <p className="meta">
            {chapter.myMembership === "pending"
              ? "You'll be able to read and post here as soon as an admin approves it."
              : "Chapter discussions are visible to its members only. Request to join and an admin will wave you in."}
          </p>
          {chapter.myMembership === "none" && (
            <div className="row" style={{ marginTop: "1rem" }}>
              <button disabled={joining} onClick={requestJoin}>
                {joining ? "Requesting..." : "Request to join"}
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          {members && members.members.length > 0 && (
            <div className="row wrap chapter-members" style={{ marginBottom: "1rem" }}>
              <span className="meta">In this chapter:</span>
              {members.members.slice(0, 8).map((m) => (
                <Link className="author-link" href={`/u/${m.user.id}`} key={m.user.id}>
                  <Avatar name={m.user.displayName} src={m.user.avatarUrl} size={22} />
                </Link>
              ))}
              {members.members.length > 8 && (
                <span className="meta">+{members.members.length - 8} more</span>
              )}
            </div>
          )}

          <div className="feed-controls row between wrap">
            <div className="segmented">
              <button
                className={sort === "hot" ? "segmented-active" : ""}
                onClick={() => setSortState("hot")}
              >
                Hot
              </button>
              <button
                className={sort === "new" ? "segmented-active" : ""}
                onClick={() => setSortState("new")}
              >
                New
              </button>
            </div>
            {user?.verificationStatus === "VERIFIED" && (
              <Link href={`/new-thread?chapter=${chapter.slug}`}>
                <button>Start a thread</button>
              </Link>
            )}
          </div>

          {error && <p className="error">{error}</p>}

          {feedLoading && (
            <>
              <ThreadCardSkeleton />
              <ThreadCardSkeleton />
            </>
          )}

          {!feedLoading && threads.length === 0 && (
            <EmptyState
              title="Nothing here yet"
              hint="The chapter's first thread is waiting to be written."
              action={
                user?.verificationStatus === "VERIFIED" ? (
                  <Link href={`/new-thread?chapter=${chapter.slug}`}>
                    <button>Start a thread</button>
                  </Link>
                ) : undefined
              }
            />
          )}

          {threads.map((t) => (
            <ThreadCard
              key={t.id}
              thread={t}
              onToggleLike={toggleLike}
              onToggleBookmark={toggleBookmark}
            />
          ))}

          {hasMore && (
            <button className="load-more" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? "Loading..." : "Load more"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
