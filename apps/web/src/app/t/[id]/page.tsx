"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { ThreadDetail } from "@nyps-forum/shared";
import { api } from "~/lib/api";
import { useAuth } from "~/lib/auth-context";

export default function ThreadPage() {
  const { id } = useParams<{ id: string }>();
  const { user, token } = useAuth();
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

  return (
    <div>
      <h1>{thread.title}</h1>
      <p className="meta">
        by {thread.author.displayName} &middot; {new Date(thread.createdAt).toLocaleString()}
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

      <h3>{thread.posts.length} Replies</h3>
      {thread.posts.map((p) => (
        <div className="post" key={p.id}>
          <p>{p.body}</p>
          <p className="meta">
            {p.author.displayName} &middot; {new Date(p.createdAt).toLocaleString()}
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
          {user ? (
            <>
              <a href="/verify">Verify your identity</a> to reply and like.
            </>
          ) : (
            <>
              <a href="/login">Log in</a> to reply and like.
            </>
          )}
        </p>
      )}
    </div>
  );
}
