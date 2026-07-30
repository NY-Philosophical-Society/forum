"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  formatDate,
  type ChapterSummary,
  type TagWithCount,
  type ThreadFeedResponse,
  type ThreadSummary,
} from "@nyps-forum/shared";
import { api } from "~/lib/api";
import { useAuth } from "~/lib/auth-context";
import { useSettings } from "~/lib/settings-context";
import { ThreadCard } from "./thread-card";
import { EmptyState, ThreadCardSkeleton } from "./ui";

const PAGE_SIZE = 20;
const EVENTS_STRIP_COUNT = 4;

/**
 * Members' chapter row: the main feed stays the front page, chapters ride
 * above it as one quiet line of links, never burying the feed.
 */
function ChapterSwitcher() {
  const { user, token } = useAuth();
  const [chapters, setChapters] = useState<ChapterSummary[] | null>(null);
  const isMemberViewer = Boolean(user && (user.isSupporter || user.role === "admin"));

  useEffect(() => {
    if (!token || !isMemberViewer) return;
    api
      .get<{ chapters: ChapterSummary[] }>("/api/chapters", token)
      .then((res) => setChapters(res.chapters))
      .catch(() => {});
  }, [token, isMemberViewer]);

  if (!isMemberViewer || !chapters || chapters.length === 0) return null;
  const mine = chapters.filter((c) => c.myMembership === "active");

  return (
    <div className="chapter-switcher row wrap">
      <span className="chapter-switcher-label">Chapters</span>
      {mine.map((c) => (
        <Link className="chapter-link" href={`/c/${c.slug}`} key={c.id}>
          {c.name}
        </Link>
      ))}
      <Link className="chapter-link chapter-link-all" href="/chapters">
        {mine.length > 0 ? "All chapters" : "Browse chapters"}
      </Link>
    </div>
  );
}

/** The Events grouping: upcoming first, then the freshest afterlives. */
function EventsStrip() {
  const { token } = useAuth();
  const { dateFormat } = useSettings();
  const [events, setEvents] = useState<ThreadSummary[] | null>(null);

  useEffect(() => {
    api
      .get<ThreadFeedResponse>(`/api/threads?kind=event&limit=${EVENTS_STRIP_COUNT}`, token)
      .then((res) => setEvents(res.threads))
      .catch(() => {});
  }, [token]);

  if (!events || events.length === 0) return null;
  const now = Date.now();

  return (
    <section className="events-strip">
      <div className="row between">
        <span className="eyebrow">Events</span>
      </div>
      <div className="events-row">
        {events.map((t) => {
          const upcoming = t.eventDate ? Date.parse(t.eventDate) > now : false;
          return (
            <Link className="event-card" href={`/t/${t.id}`} key={t.id}>
              <span className="event-card-date">
                {upcoming ? "Upcoming · " : ""}
                {t.eventDate ? formatDate(t.eventDate, dateFormat) : ""}
              </span>
              <span className="event-card-title">{t.title}</span>
              <span className="meta">
                {t.postCount} {t.postCount === 1 ? "reply" : "replies"}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function HomeFeed() {
  const { user, token } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sort = searchParams.get("sort") === "new" ? "new" : "hot";
  const activeTag = searchParams.get("tag") ?? "";
  const justLinked = searchParams.get("linked") === "1";

  const [tags, setTags] = useState<TagWithCount[] | null>(null);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllTags, setShowAllTags] = useState(false);
  const [showLinkedToast, setShowLinkedToast] = useState(justLinked);

  const VISIBLE_TAG_COUNT = 6;

  useEffect(() => {
    if (!justLinked) return;
    const qs = new URLSearchParams(searchParams.toString());
    qs.delete("linked");
    router.replace(qs.toString() ? `/?${qs.toString()}` : "/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api
      .get<{ tags: TagWithCount[] }>("/api/tags")
      .then((res) => setTags(res.tags))
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams({ sort, limit: String(PAGE_SIZE), offset: "0" });
    if (activeTag) qs.set("tag", activeTag);
    api
      .get<ThreadFeedResponse>(`/api/threads?${qs.toString()}`, token)
      .then((res) => {
        setThreads(res.threads);
        setHasMore(res.hasMore);
        setOffset(res.threads.length);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [sort, activeTag, token]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const qs = new URLSearchParams({ sort, limit: String(PAGE_SIZE), offset: String(offset) });
      if (activeTag) qs.set("tag", activeTag);
      const res = await api.get<ThreadFeedResponse>(`/api/threads?${qs.toString()}`, token);
      setThreads((prev) => [...prev, ...res.threads]);
      setHasMore(res.hasMore);
      setOffset(offset + res.threads.length);
    } finally {
      setLoadingMore(false);
    }
  }

  function setSort(next: "hot" | "new") {
    const qs = new URLSearchParams(searchParams.toString());
    qs.set("sort", next);
    router.push(`/?${qs.toString()}`);
  }

  function setTag(slug: string) {
    const qs = new URLSearchParams(searchParams.toString());
    if (slug) qs.set("tag", slug);
    else qs.delete("tag");
    router.push(`/?${qs.toString()}`);
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

  const activeTagName = tags?.find((t) => t.slug === activeTag)?.name;

  return (
    <div>
      {showLinkedToast && (
        <div className="toast">
          Signed in — this provider was linked to your existing account.{" "}
          <button className="link-button" onClick={() => setShowLinkedToast(false)}>
            Dismiss
          </button>
        </div>
      )}

      <h1 className="page-title">Forum</h1>

      <ChapterSwitcher />
      <EventsStrip />

      <div className="feed-controls row between wrap">
        <div className="segmented">
          <button className={sort === "hot" ? "segmented-active" : ""} onClick={() => setSort("hot")}>
            Hot
          </button>
          <button className={sort === "new" ? "segmented-active" : ""} onClick={() => setSort("new")}>
            New
          </button>
        </div>
        {user?.verificationStatus === "VERIFIED" && (
          <Link href={activeTag ? `/new-thread?tag=${activeTag}` : "/new-thread"}>
            <button>Start a thread</button>
          </Link>
        )}
      </div>

      <div className="tag-row">
        <button
          className={`tag-chip ${activeTag === "" ? "tag-chip-active" : ""}`}
          onClick={() => setTag("")}
        >
          All
        </button>
        {(showAllTags ? tags : tags?.slice(0, VISIBLE_TAG_COUNT))?.map((t) => (
          <button
            key={t.id}
            className={`tag-chip ${activeTag === t.slug ? "tag-chip-active" : ""}`}
            onClick={() => setTag(t.slug)}
            title={t.description}
          >
            {t.name}
          </button>
        ))}
        {tags && tags.length > VISIBLE_TAG_COUNT && (
          <button className="tag-chip" onClick={() => setShowAllTags((v) => !v)}>
            {showAllTags ? "Show less" : `More +${tags.length - VISIBLE_TAG_COUNT}`}
          </button>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      {loading && (
        <>
          <ThreadCardSkeleton />
          <ThreadCardSkeleton />
          <ThreadCardSkeleton />
        </>
      )}

      {!loading && !error && threads.length === 0 && (
        <EmptyState
          title={activeTagName ? `Nothing under ${activeTagName} yet` : "The floor is open"}
          hint={
            activeTagName
              ? "No one has raised a question here — perhaps that's your opening."
              : "Every great discussion starts with someone willing to ask first."
          }
          action={
            user?.verificationStatus === "VERIFIED" ? (
              <Link href={activeTag ? `/new-thread?tag=${activeTag}` : "/new-thread"}>
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
    </div>
  );
}

// useSearchParams() forces client-side rendering, which `next build` rejects
// during static prerender unless it sits inside a Suspense boundary.
export default function HomePage() {
  return (
    <Suspense fallback={<ThreadCardSkeleton />}>
      <HomeFeed />
    </Suspense>
  );
}
