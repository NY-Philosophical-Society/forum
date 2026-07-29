"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { flattenPostTree, formatDateTime, type ThreadDetail } from "@nyps-forum/shared";
import { api } from "~/lib/api";
import { useAuth } from "~/lib/auth-context";
import { useSettings } from "~/lib/settings-context";

export default function ThreadPage() {
  const { id } = useParams<{ id: string }>();
  const { user, token } = useAuth();
  const { dateFormat } = useSettings();
  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    try {
      const { thread } = await api.get<{ thread: ThreadDetail }>(`/api/threads/${id}`, token);
      setThread(thread);
    } catch (e: any) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, token]);

  async function toggleThreadLike() {
    if (!token) return;
    await api.post(`/api/threads/${id}/like`, {}, token);
    load();
  }

  async function togglePostLike(postId: string) {
    if (!token) return;
    await api.post(`/api/posts/${postId}/like`, {}, token);
    load();
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
      load();
    } finally {
      setSubmitting(false);
    }
  }

  if (error) return <p className="error">{error}</p>;
  if (!thread) return <p>Loading...</p>;

  const canPost = user?.verificationStatus === "VERIFIED";
  const orderedPosts = flattenPostTree(thread.posts);

  return (
    <div>
      <h1>{thread.title}</h1>
      <p className="meta">
        by {thread.author.displayName} &middot; {formatDateTime(thread.createdAt, dateFormat)}
      </p>
      {thread.tags.length > 0 && (
        <div className="tag-row" style={{ marginTop: "0.4rem" }}>
          {thread.tags.map((tag) => (
            <span className="tag-chip" key={tag.id}>
              {tag.name}
            </span>
          ))}
        </div>
      )}
      <div className="card">
        <p>{thread.body}</p>
        <div className="like-row">
          <button
            className={`like-button ${thread.myLiked ? "like-button-active" : ""}`}
            disabled={!canPost}
            onClick={toggleThreadLike}
          >
            ♥ {thread.likeCount}
          </button>
        </div>
      </div>

      {thread.previewOnly ? (
        <div className="wall-card">
          <p className="wall-title">
            {thread.postCount > 0
              ? `${thread.postCount} ${thread.postCount === 1 ? "reply" : "replies"} — sign up to keep reading`
              : "Sign up to join this discussion"}
          </p>
          <p className="meta">
            NYPS Forum is free to join — read the full discussion, like posts, and reply once
            you've verified your identity.
          </p>
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.75rem" }}>
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
          <h3>{thread.postCount} Replies</h3>
          {orderedPosts.map((p) => (
            <div className="post" key={p.id} style={{ marginLeft: `${p.depth * 1.75}rem` }}>
              <p>{p.body}</p>
              <p className="meta">
                {p.author.displayName} &middot; {formatDateTime(p.createdAt, dateFormat)}
              </p>
              <div className="like-row">
                <button
                  className={`like-button ${p.myLiked ? "like-button-active" : ""}`}
                  disabled={!canPost}
                  onClick={() => togglePostLike(p.id)}
                >
                  ♥ {p.likeCount}
                </button>
                {canPost && (
                  <button className="secondary" onClick={() => setReplyTo(p.id)}>
                    Reply
                  </button>
                )}
              </div>
            </div>
          ))}

          {canPost ? (
            <form onSubmit={submitReply} style={{ marginTop: "1.5rem" }}>
              <label>
                {replyTo ? "Replying to a comment" : "Add a reply"}
                {replyTo && (
                  <button
                    type="button"
                    className="secondary"
                    style={{ marginLeft: "0.5rem", padding: "0.1rem 0.5rem" }}
                    onClick={() => setReplyTo(null)}
                  >
                    cancel
                  </button>
                )}
              </label>
              <textarea
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                required
              />
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
