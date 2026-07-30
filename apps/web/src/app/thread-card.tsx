"use client";

import Link from "next/link";
import { formatDate, type ThreadSummary } from "@nyps-forum/shared";
import { useAuth } from "~/lib/auth-context";
import { useSettings } from "~/lib/settings-context";
import { Avatar } from "./ui";

/**
 * One thread in a feed — the main feed, a chapter feed, and the events
 * grouping all render exactly this, so the chapter experience is the same
 * product rather than a bolt-on. Like/save handlers come from the parent so
 * each page keeps its own list state.
 */
export function ThreadCard({
  thread: t,
  onToggleLike,
  onToggleBookmark,
}: {
  thread: ThreadSummary;
  onToggleLike: (threadId: string) => void;
  onToggleBookmark: (thread: ThreadSummary) => void;
}) {
  const { user } = useAuth();
  const { dateFormat } = useSettings();

  return (
    <article className={`card thread-card ${t.pinnedAt ? "pinned-card" : ""}`}>
      {t.pinnedAt && (
        <p className="pinned-label" style={{ marginBottom: "0.35rem" }}>
          <span className="pin-mark" aria-hidden>
            ❖
          </span>
          Pinned
        </p>
      )}
      {t.kind === "event" && (
        <p className="event-label" style={{ marginBottom: "0.35rem" }}>
          <span className="event-mark" aria-hidden>
            ◆
          </span>
          Event{t.eventDate ? ` · ${formatDate(t.eventDate, dateFormat)}` : ""}
        </p>
      )}
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
      {t.tags.length > 0 && (
        <div className="row wrap" style={{ marginTop: "0.75rem" }}>
          {t.tags.map((tag) => (
            <span className="tag-static" key={tag.id}>
              {tag.name}
            </span>
          ))}
        </div>
      )}
      <div className="like-row">
        <button
          className={`like-button ${t.myLiked ? "like-button-active" : ""}`}
          disabled={!user?.canWrite}
          onClick={() => onToggleLike(t.id)}
        >
          ♥ {t.likeCount}
        </button>
        <span className="meta">
          {t.postCount} {t.postCount === 1 ? "reply" : "replies"}
        </span>
        {user && (
          <button
            className={`bookmark-button ${t.myBookmarked ? "bookmark-button-active" : ""}`}
            onClick={() => onToggleBookmark(t)}
          >
            {t.myBookmarked ? "❧ Saved" : "❧ Save"}
          </button>
        )}
      </div>
    </article>
  );
}
