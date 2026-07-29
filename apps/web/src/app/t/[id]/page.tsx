"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { flattenPostTree, formatDateTime, type ThreadDetail } from "@nyps-forum/shared";
import { api } from "~/lib/api";
import { useAuth } from "~/lib/auth-context";
import { useSettings } from "~/lib/settings-context";
import { ReportButton } from "../../report-button";
import { Avatar, PostSkeleton, Skeleton } from "../../ui";

const REPLIES_PAGE = 20;

export default function ThreadPage() {
  const { id } = useParams<{ id: string }>();
  const { user, token } = useAuth();
  const { dateFormat } = useSettings();
  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [repliesWindow, setRepliesWindow] = useState(REPLIES_PAGE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [locking, setLocking] = useState(false);

  async function load(window: number) {
    try {
      const { thread } = await api.get<{ thread: ThreadDetail }>(
        `/api/threads/${id}?repliesLimit=${window}&repliesOffset=0`,
        token,
      );
      setThread(thread);
    } catch (e: any) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load(repliesWindow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, token]);

  async function loadMoreReplies() {
    setLoadingMore(true);
    const nextWindow = repliesWindow + REPLIES_PAGE;
    await load(nextWindow);
    setRepliesWindow(nextWindow);
    setLoadingMore(false);
  }

  async function toggleThreadLike() {
    if (!token) return;
    await api.post(`/api/threads/${id}/like`, {}, token);
    load(repliesWindow);
  }

  async function togglePostLike(postId: string) {
    if (!token) return;
    await api.post(`/api/posts/${postId}/like`, {}, token);
    load(repliesWindow);
  }

  async function toggleLock() {
    if (!token) return;
    setLocking(true);
    try {
      await api.post(`/api/threads/${id}/lock`, {}, token);
      await load(repliesWindow);
    } finally {
      setLocking(false);
    }
  }

  async function submitReply(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSubmitting(true);
    try {
      await api.post(
        "/api/posts",
        { threadId: id, body: replyBody, parentId: replyTo },
        token,
      );
      setReplyBody("");
      setReplyTo(null);
      // Grow the window by one so the just-posted reply is visible even if
      // it landed past what was previously loaded.
      const nextWindow = repliesWindow + 1;
      await load(nextWindow);
      setRepliesWindow(nextWindow);
    } finally {
      setSubmitting(false);
    }
  }

  if (error) return <p className="error">{error}</p>;

  if (!thread) {
    return (
      <div>
        <Skeleton style={{ height: "1.8rem", width: "80%", marginBottom: "0.75rem" }} />
        <Skeleton style={{ height: "0.85rem", width: "35%", marginBottom: "1.5rem" }} />
        <div className="card">
          <Skeleton style={{ height: "0.95rem", width: "100%", marginBottom: "0.5rem" }} />
          <Skeleton style={{ height: "0.95rem", width: "92%", marginBottom: "0.5rem" }} />
          <Skeleton style={{ height: "0.95rem", width: "60%" }} />
        </div>
        <PostSkeleton />
        <PostSkeleton />
      </div>
    );
  }

  const canPost = user?.verificationStatus === "VERIFIED" && !thread.locked;
  const orderedPosts = flattenPostTree(thread.posts);

  return (
    <div>
      <Link href="/" className="back-link">
        ← Back to the feed
      </Link>

      <div className="row between wrap" style={{ alignItems: "flex-start" }}>
        <h1 style={{ margin: 0, maxWidth: "34rem" }}>
          {thread.title}
          {thread.locked && " 🔒"}
        </h1>
        {user?.role === "admin" && (
          <button className="secondary btn-sm" onClick={toggleLock} disabled={locking}>
            {thread.locked ? "Unlock" : "Lock"} thread
          </button>
        )}
      </div>

      <div className="row" style={{ margin: "0.75rem 0" }}>
        <Avatar name={thread.author.displayName} size={26} />
        <p className="meta">
          {thread.author.displayName} · {formatDateTime(thread.createdAt, dateFormat)}
        </p>
      </div>

      {thread.tags.length > 0 && (
        <div className="row wrap" style={{ marginBottom: "1rem" }}>
          {thread.tags.map((tag) => (
            <span className="tag-static" key={tag.id}>
              {tag.name}
            </span>
          ))}
        </div>
      )}

      <div className="card">
        <p className="prose">{thread.body}</p>
        <div className="like-row">
          <button
            className={`like-button ${thread.myLiked ? "like-button-active" : ""}`}
            disabled={user?.verificationStatus !== "VERIFIED"}
            onClick={toggleThreadLike}
          >
            ♥ {thread.likeCount}
          </button>
          <ReportButton targetType="thread" targetId={thread.id} />
        </div>
      </div>

      {thread.previewOnly ? (
        <div className="wall-card">
          <span className="empty-mark" aria-hidden>
            ❦
          </span>
          <p className="wall-title">
            {thread.postCount > 0
              ? `${thread.postCount} ${thread.postCount === 1 ? "reply" : "replies"} await`
              : "Join this discussion"}
          </p>
          <p className="meta">
            NYPS Forum is free to join — read the full discussion, like posts, and reply once
            you've verified your identity.
          </p>
          <div className="row" style={{ marginTop: "1rem" }}>
            <a href="/signup">
              <button>Sign up free</button>
            </a>
            <a href="/login">
              <button className="secondary">Log in</button>
            </a>
          </div>
        </div>
      ) : (
        <>
          <h3 style={{ marginTop: "2rem" }}>
            {thread.postCount} {thread.postCount === 1 ? "Reply" : "Replies"}
          </h3>
          {orderedPosts.map((p) => (
            <div className="post" key={p.id} style={{ marginLeft: `${p.depth * 1.5}rem` }}>
              <p className="prose">{p.body}</p>
              <div className="row" style={{ marginTop: "0.6rem" }}>
                <Avatar name={p.author.displayName} size={22} />
                <p className="meta">
                  {p.author.displayName} · {formatDateTime(p.createdAt, dateFormat)}
                </p>
              </div>
              <div className="like-row">
                <button
                  className={`like-button ${p.myLiked ? "like-button-active" : ""}`}
                  disabled={user?.verificationStatus !== "VERIFIED"}
                  onClick={() => togglePostLike(p.id)}
                >
                  ♥ {p.likeCount}
                </button>
                {canPost && (
                  <button className="link-button" onClick={() => setReplyTo(p.id)}>
                    Reply
                  </button>
                )}
                <ReportButton targetType="post" targetId={p.id} />
              </div>
            </div>
          ))}

          {thread.hasMoreReplies && (
            <button className="load-more" onClick={loadMoreReplies} disabled={loadingMore}>
              {loadingMore ? "Loading..." : "Load more replies"}
            </button>
          )}

          {thread.locked ? (
            <p className="notice">This thread is locked — no new replies.</p>
          ) : canPost ? (
            <form onSubmit={submitReply} style={{ marginTop: "2rem", maxWidth: "none" }}>
              <label>
                <span className="row wrap">
                  {replyTo ? "Replying to a comment" : "Add a reply"}
                  {replyTo && (
                    <button type="button" className="link-button" onClick={() => setReplyTo(null)}>
                      cancel
                    </button>
                  )}
                </span>
                <textarea
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  placeholder="Make your case..."
                  required
                />
              </label>
              <button type="submit" disabled={submitting}>
                {submitting ? "Posting..." : "Post reply"}
              </button>
            </form>
          ) : (
            <p className="notice">
              <a href="/verify">Verify your identity</a> to reply and like.
            </p>
          )}
        </>
      )}
    </div>
  );
}
