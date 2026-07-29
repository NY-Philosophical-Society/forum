"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  describeNotification,
  formatRelativeTime,
  type NotificationItem,
  type NotificationsResponse,
} from "@nyps-forum/shared";
import { api } from "~/lib/api";
import { useAuth } from "~/lib/auth-context";
import { useSettings } from "~/lib/settings-context";
import { Avatar, EmptyState, PostSkeleton } from "../ui";

const PAGE_SIZE = 20;

/**
 * Where tapping a notification lands: the exact reply, not just the thread.
 * Null for a moderation warning — the warning text *is* the content, so
 * clicking it marks it read rather than navigating somewhere unrelated.
 */
function targetHref(n: NotificationItem): string | null {
  if (n.type === "warning") return null;
  if (n.type === "message" && n.actor) return `/messages/${n.actor.id}`;
  if (n.threadId) return `/t/${n.threadId}${n.postId ? `#post-${n.postId}` : ""}`;
  return "/";
}

export default function NotificationsPage() {
  const { user, token, loading: authLoading } = useAuth();
  const { dateFormat } = useSettings();
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api
      .get<NotificationsResponse>(`/api/notifications?limit=${PAGE_SIZE}&offset=0`, token)
      .then((res) => {
        setItems(res.notifications);
        setHasMore(res.hasMore);
      })
      .catch((e) => setError(e.message));
  }, [token]);

  async function loadMore() {
    if (!token || !items) return;
    setLoadingMore(true);
    try {
      const res = await api.get<NotificationsResponse>(
        `/api/notifications?limit=${PAGE_SIZE}&offset=${items.length}`,
        token,
      );
      setItems([...items, ...res.notifications]);
      setHasMore(res.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }

  function open(n: NotificationItem) {
    if (token && !n.readAt) {
      // Fire-and-forget: the destination shouldn't wait on the read receipt.
      api.post("/api/notifications/read", { ids: [n.id] }, token).catch(() => {});
      setItems((prev) =>
        prev?.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)) ?? null,
      );
    }
    const href = targetHref(n);
    if (href) router.push(href);
  }

  async function markAllRead() {
    if (!token) return;
    await api.post("/api/notifications/read-all", {}, token);
    setItems((prev) => prev?.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) ?? null);
  }

  if (!authLoading && !user) {
    return (
      <EmptyState
        title="Sign in to see your notifications"
        action={
          <Link href="/login">
            <button>Log in</button>
          </Link>
        }
      />
    );
  }

  const hasUnread = items?.some((n) => !n.readAt) ?? false;

  return (
    <div>
      <div className="row between wrap">
        <h1 className="page-title">Notifications</h1>
        {hasUnread && (
          <button className="secondary btn-sm" onClick={markAllRead}>
            Mark all read
          </button>
        )}
      </div>

      {error && <p className="error">{error}</p>}
      {items === null && !error && (
        <>
          <PostSkeleton />
          <PostSkeleton />
          <PostSkeleton />
        </>
      )}

      {items?.length === 0 && (
        <EmptyState
          title="All quiet so far"
          hint="Replies, likes, mentions, and messages will gather here."
        />
      )}

      {items?.map((n) => (
        <button
          key={n.id}
          className={`notif-row ${n.readAt ? "" : "notif-unread"} ${
            n.type === "warning" ? "notif-warning" : ""
          }`}
          onClick={() => open(n)}
        >
          <Avatar name={n.actor?.displayName ?? "?"} src={n.actor?.avatarUrl} size={34} />
          <span className="notif-body">
            <span className="notif-line">
              <strong>{n.actor?.displayName ?? "Someone"}</strong> {describeNotification(n)}
              {n.threadTitle && n.type !== "message" && (
                <>
                  {" "}
                  <span className="notif-thread">“{n.threadTitle}”</span>
                </>
              )}
            </span>
            {n.snippet && <span className="notif-snippet">{n.snippet}</span>}
            <span className="meta">{formatRelativeTime(n.createdAt, dateFormat)}</span>
          </span>
          {!n.readAt && <span className="notif-dot" aria-label="unread" />}
        </button>
      ))}

      {hasMore && (
        <button className="load-more" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? "Loading..." : "Load more"}
        </button>
      )}
    </div>
  );
}
