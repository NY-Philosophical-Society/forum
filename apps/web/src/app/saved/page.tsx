"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDate, type ThreadFeedResponse, type ThreadSummary } from "@nyps-forum/shared";
import { api } from "~/lib/api";
import { useAuth } from "~/lib/auth-context";
import { useSettings } from "~/lib/settings-context";
import { Avatar, EmptyState, ThreadCardSkeleton } from "../ui";

const PAGE_SIZE = 20;

export default function SavedPage() {
  const { user, token, loading: authLoading } = useAuth();
  const { dateFormat } = useSettings();
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api
      .get<ThreadFeedResponse>(`/api/bookmarks?limit=${PAGE_SIZE}&offset=0`, token)
      .then((res) => {
        setThreads(res.threads);
        setHasMore(res.hasMore);
      })
      .catch((e) => setError(e.message));
  }, [token]);

  async function loadMore() {
    if (!token || !threads) return;
    setLoadingMore(true);
    try {
      const res = await api.get<ThreadFeedResponse>(
        `/api/bookmarks?limit=${PAGE_SIZE}&offset=${threads.length}`,
        token,
      );
      setThreads([...threads, ...res.threads]);
      setHasMore(res.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }

  async function unsave(threadId: string) {
    if (!token) return;
    await api.delete(`/api/bookmarks/${threadId}`, token);
    setThreads((prev) => prev?.filter((t) => t.id !== threadId) ?? null);
  }

  if (!authLoading && !user) {
    return (
      <EmptyState
        title="Sign in to see your saved threads"
        action={
          <Link href="/login">
            <button>Log in</button>
          </Link>
        }
      />
    );
  }

  return (
    <div>
      <h1 className="page-title">Saved threads</h1>

      {error && <p className="error">{error}</p>}
      {threads === null && !error && (
        <>
          <ThreadCardSkeleton />
          <ThreadCardSkeleton />
        </>
      )}

      {threads?.length === 0 && (
        <EmptyState
          title="Nothing saved yet"
          hint="Use “Save” on any thread to keep it here for later."
          action={
            <Link href="/">
              <button className="secondary">Browse the feed</button>
            </Link>
          }
        />
      )}

      {threads?.map((t) => (
        <article className="card thread-card" key={t.id}>
          <Link className="title" href={`/t/${t.id}`}>
            {t.title}
            {t.locked && " 🔒"}
          </Link>
          <div className="row" style={{ marginTop: "0.6rem" }}>
            <Link className="author-link" href={`/u/${t.author.id}`}>
              <Avatar name={t.author.displayName} src={t.author.avatarUrl} size={24} />
              <p className="meta">{t.author.displayName}</p>
            </Link>
            <p className="meta">· {formatDate(t.createdAt, dateFormat)}</p>
          </div>
          <div className="like-row">
            <span className="meta">
              ♥ {t.likeCount} · {t.postCount} {t.postCount === 1 ? "reply" : "replies"}
            </span>
            <button className="link-button" onClick={() => unsave(t.id)}>
              Remove
            </button>
          </div>
        </article>
      ))}

      {hasMore && (
        <button className="load-more" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? "Loading..." : "Load more"}
        </button>
      )}
    </div>
  );
}
