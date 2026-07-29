"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  flattenPostTree,
  formatDateTime,
  stripMarkdown,
  type PostWithDepth,
  type TagWithCount,
  type ThreadDetail,
} from "@nyps-forum/shared";
import { api } from "~/lib/api";
import { useAuth } from "~/lib/auth-context";
import { useSettings } from "~/lib/settings-context";
import { Markdown, MarkdownEditor } from "../../markdown";
import { ReportButton } from "../../report-button";
import { Avatar, PostSkeleton, Skeleton } from "../../ui";

const REPLIES_PAGE = 20;

export default function ThreadPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
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

  // Thread edit mode (author or admin).
  const [editingThread, setEditingThread] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editTagIds, setEditTagIds] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<TagWithCount[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Reply edit mode.
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingPostBody, setEditingPostBody] = useState("");

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

  function startThreadEdit() {
    if (!thread) return;
    setEditTitle(thread.title);
    setEditBody(thread.body);
    setEditTagIds(thread.tags.map((t) => t.id));
    setEditingThread(true);
    setActionError(null);
    if (!allTags) {
      api.get<{ tags: TagWithCount[] }>("/api/tags").then((res) => setAllTags(res.tags));
    }
  }

  async function saveThreadEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    setActionError(null);
    try {
      await api.patch(
        `/api/threads/${id}`,
        { title: editTitle, body: editBody, tagIds: editTagIds },
        token,
      );
      setEditingThread(false);
      await load(repliesWindow);
    } catch (err: any) {
      setActionError(err.message ?? "Could not save changes");
    } finally {
      setSaving(false);
    }
  }

  async function deleteThread() {
    if (!token) return;
    const hasReplies = (thread?.postCount ?? 0) > 0;
    const message = hasReplies
      ? "Delete this thread? Your title and text are removed; existing replies stay readable under a [deleted] notice."
      : "Delete this thread? This can't be undone.";
    if (!window.confirm(message)) return;
    try {
      await api.delete(`/api/threads/${id}`, token);
      router.push("/");
    } catch (err: any) {
      setActionError(err.message ?? "Could not delete the thread");
    }
  }

  function startPostEdit(p: PostWithDepth) {
    setEditingPostId(p.id);
    setEditingPostBody(p.body);
    setActionError(null);
  }

  async function savePostEdit(postId: string) {
    if (!token) return;
    setSaving(true);
    setActionError(null);
    try {
      await api.patch(`/api/posts/${postId}`, { body: editingPostBody }, token);
      setEditingPostId(null);
      await load(repliesWindow);
    } catch (err: any) {
      setActionError(err.message ?? "Could not save changes");
    } finally {
      setSaving(false);
    }
  }

  async function deletePost(postId: string) {
    if (!token) return;
    if (!window.confirm("Delete this reply? Replies to it will stay under a [deleted] notice."))
      return;
    try {
      await api.delete(`/api/posts/${postId}`, token);
      await load(repliesWindow);
    } catch (err: any) {
      setActionError(err.message ?? "Could not delete the reply");
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

  const isAdmin = user?.role === "admin";
  const canPost = user?.verificationStatus === "VERIFIED" && !thread.locked && !thread.deleted;
  const canEditThread =
    !thread.deleted &&
    Boolean(user) &&
    (isAdmin || (user!.id === thread.author.id && user!.verificationStatus === "VERIFIED"));
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
        <div className="row wrap">
          {canEditThread && !editingThread && (
            <>
              <button className="secondary btn-sm" onClick={startThreadEdit}>
                Edit
              </button>
              <button className="secondary btn-sm" onClick={deleteThread}>
                Delete
              </button>
            </>
          )}
          {isAdmin && (
            <button className="secondary btn-sm" onClick={toggleLock} disabled={locking}>
              {thread.locked ? "Unlock" : "Lock"} thread
            </button>
          )}
        </div>
      </div>

      <div className="row wrap" style={{ margin: "0.75rem 0" }}>
        {thread.author.id ? (
          <Link className="author-link" href={`/u/${thread.author.id}`}>
            <Avatar name={thread.author.displayName} src={thread.author.avatarUrl} size={26} />
            <p className="meta">{thread.author.displayName}</p>
          </Link>
        ) : (
          <p className="meta">{thread.author.displayName}</p>
        )}
        <p className="meta">· {formatDateTime(thread.createdAt, dateFormat)}</p>
        {thread.editedAt && (
          <p className="edited-note">edited {formatDateTime(thread.editedAt, dateFormat)}</p>
        )}
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

      {editingThread ? (
        <form className="card inline-edit" onSubmit={saveThreadEdit} style={{ maxWidth: "none" }}>
          <label>
            Title
            <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required />
          </label>
          <label>
            Text
            <MarkdownEditor value={editBody} onChange={setEditBody} minHeight="200px" required />
          </label>
          <label>
            Tags
            <div className="tag-row" style={{ marginBottom: 0 }}>
              {allTags?.map((t) => (
                <button
                  type="button"
                  key={t.id}
                  className={`tag-chip ${editTagIds.includes(t.id) ? "tag-chip-active" : ""}`}
                  onClick={() =>
                    setEditTagIds((prev) =>
                      prev.includes(t.id) ? prev.filter((x) => x !== t.id) : [...prev, t.id],
                    )
                  }
                >
                  {t.name}
                </button>
              ))}
            </div>
          </label>
          <div className="row">
            <button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save changes"}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setEditingThread(false)}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="card">
          {thread.deleted ? (
            <p className="tombstone">
              This thread was deleted. The replies below are preserved.
            </p>
          ) : thread.previewOnly ? (
            <p style={{ margin: 0 }}>{stripMarkdown(thread.body)}</p>
          ) : (
            <Markdown>{thread.body}</Markdown>
          )}
          {!thread.deleted && (
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
          )}
        </div>
      )}

      {actionError && <p className="error">{actionError}</p>}

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
              {p.deleted ? (
                <>
                  <p className="tombstone">[deleted]</p>
                  <div className="row" style={{ marginTop: "0.6rem" }}>
                    <p className="meta">· {formatDateTime(p.createdAt, dateFormat)}</p>
                  </div>
                </>
              ) : editingPostId === p.id ? (
                <div className="inline-edit">
                  <MarkdownEditor
                    value={editingPostBody}
                    onChange={setEditingPostBody}
                    minHeight="120px"
                  />
                  <div className="row">
                    <button className="btn-sm" onClick={() => savePostEdit(p.id)} disabled={saving}>
                      {saving ? "Saving..." : "Save"}
                    </button>
                    <button
                      className="secondary btn-sm"
                      onClick={() => setEditingPostId(null)}
                      disabled={saving}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <Markdown>{p.body}</Markdown>
                  <div className="row wrap" style={{ marginTop: "0.6rem" }}>
                    <Link className="author-link" href={`/u/${p.author.id}`}>
                      <Avatar name={p.author.displayName} src={p.author.avatarUrl} size={22} />
                      <p className="meta">{p.author.displayName}</p>
                    </Link>
                    <p className="meta">· {formatDateTime(p.createdAt, dateFormat)}</p>
                    {p.editedAt && (
                      <p className="edited-note">edited {formatDateTime(p.editedAt, dateFormat)}</p>
                    )}
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
                    {user &&
                      (isAdmin ||
                        (user.id === p.author.id && user.verificationStatus === "VERIFIED")) && (
                        <>
                          <button className="link-button" onClick={() => startPostEdit(p)}>
                            Edit
                          </button>
                          <button className="link-button" onClick={() => deletePost(p.id)}>
                            Delete
                          </button>
                        </>
                      )}
                    <ReportButton targetType="post" targetId={p.id} />
                  </div>
                </>
              )}
            </div>
          ))}

          {thread.hasMoreReplies && (
            <button className="load-more" onClick={loadMoreReplies} disabled={loadingMore}>
              {loadingMore ? "Loading..." : "Load more replies"}
            </button>
          )}

          {thread.deleted ? (
            <p className="notice">This thread was deleted — no new replies.</p>
          ) : thread.locked ? (
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
                <MarkdownEditor
                  value={replyBody}
                  onChange={setReplyBody}
                  placeholder="Make your case..."
                  minHeight="120px"
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
