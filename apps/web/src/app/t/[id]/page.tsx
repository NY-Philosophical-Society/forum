"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  flattenPostTree,
  formatDateTime,
  MAX_PINNED_THREADS,
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
import { Avatar, ConfirmAction, PostSkeleton, Skeleton } from "../../ui";

const REPLIES_PAGE = 20;
// Notification deep links (#post-...) may point past the first page of
// replies, so those arrivals load with the maximum window instead.
const DEEP_LINK_REPLIES = 100;

/** The #post-<id> fragment this page was opened at, if any. */
function anchoredPostId(): string | null {
  if (typeof window === "undefined") return null;
  const m = window.location.hash.match(/^#post-(.+)$/);
  return m ? m[1] : null;
}

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
  const [repliesWindow, setRepliesWindow] = useState(() =>
    anchoredPostId() ? DEEP_LINK_REPLIES : REPLIES_PAGE,
  );
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

  // Replies render after an async load, so the browser's native
  // scroll-to-fragment fires too early — repeat it once the content exists.
  useEffect(() => {
    const postId = anchoredPostId();
    if (!thread || !postId) return;
    document.getElementById(`post-${postId}`)?.scrollIntoView({ block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread === null]);

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

  async function toggleBookmark() {
    if (!token || !thread) return;
    const wasBookmarked = Boolean(thread.myBookmarked);
    setThread({ ...thread, myBookmarked: !wasBookmarked });
    try {
      if (wasBookmarked) await api.delete(`/api/bookmarks/${id}`, token);
      else await api.post("/api/bookmarks", { threadId: id }, token);
    } catch {
      setThread({ ...thread, myBookmarked: wasBookmarked });
    }
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

  async function togglePin(reason: string) {
    if (!token) return;
    if (thread?.pinnedAt) await api.delete(`/api/threads/${id}/pin`, token);
    else await api.post(`/api/threads/${id}/pin`, { reason }, token);
    await load(repliesWindow);
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
  // Acting on someone else's content is moderation and needs a logged reason;
  // acting on your own is not.
  const moderatingThread = Boolean(isAdmin && user && user.id !== thread.author.id);
  const isEvent = thread.kind === "event";
  // Event threads: reading is open, posting is member-only — thread.canPost
  // is the server's verdict (and the server enforces it again on POST).
  const memberGated = isEvent && thread.canPost === false;
  const canPost = Boolean(user?.canWrite) && !thread.locked && !thread.deleted && !memberGated;
  const canEditThread =
    !thread.deleted && Boolean(user) && (isAdmin || user!.id === thread.author.id);
  const orderedPosts = flattenPostTree(thread.posts);

  return (
    <div>
      <Link
        href={thread.chapter ? `/c/${thread.chapter.slug}` : "/"}
        className="back-link"
      >
        ← Back to {thread.chapter ? thread.chapter.name : "the feed"}
      </Link>

      <div className="row between wrap" style={{ alignItems: "flex-start" }}>
        <h1 style={{ margin: 0, maxWidth: "34rem" }}>
          {thread.pinnedAt && (
            <span className="pin-mark" title="Pinned to the top of the feed" aria-hidden>
              ❖
            </span>
          )}
          {thread.title}
          {thread.locked && " 🔒"}
        </h1>
        <div className="row wrap">
          {canEditThread && !editingThread && (
            <>
              <button className="secondary btn-sm" onClick={startThreadEdit}>
                Edit
              </button>
              {/* An author deleting their own thread just confirms; an admin
                  removing someone else's owes the moderation log a reason. */}
              {moderatingThread ? (
                <ConfirmAction
                  label="Remove"
                  title="Remove this thread"
                  description="Soft delete: the title and text go, and replies underneath stay readable under a [deleted] notice."
                  confirmLabel="Remove thread"
                  danger
                  onConfirm={async (reason) => {
                    await api.deleteWithBody(`/api/threads/${id}`, { reason }, token);
                    router.push("/");
                  }}
                />
              ) : (
                <button className="secondary btn-sm" onClick={deleteThread}>
                  Delete
                </button>
              )}
            </>
          )}
          {isAdmin && (
            <>
              <button className="secondary btn-sm" onClick={toggleLock} disabled={locking}>
                {thread.locked ? "Unlock" : "Lock"} thread
              </button>
              <ConfirmAction
                label={thread.pinnedAt ? "Unpin" : "Pin"}
                title={thread.pinnedAt ? "Unpin this thread" : "Pin this thread to the feed"}
                description={
                  thread.pinnedAt
                    ? "It returns to its natural position in Hot and New."
                    : `Sorts above everything in both Hot and New. At most ${MAX_PINNED_THREADS} threads can be pinned at once.`
                }
                confirmLabel={thread.pinnedAt ? "Unpin" : "Pin thread"}
                reasonRequired={false}
                reasonLabel="Note (recorded in the moderation log)"
                onConfirm={togglePin}
              />
            </>
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

      {(thread.tags.length > 0 || thread.chapter) && (
        <div className="row wrap" style={{ marginBottom: "1rem" }}>
          {thread.chapter && (
            <Link href={`/c/${thread.chapter.slug}`} className="tag-static chapter-tag">
              {thread.chapter.name} chapter
            </Link>
          )}
          {thread.tags.map((tag) => (
            <span className="tag-static" key={tag.id}>
              {tag.name}
            </span>
          ))}
        </div>
      )}

      {isEvent && (
        <EventPanel
          thread={thread}
          isAdmin={isAdmin}
          onChanged={() => load(repliesWindow)}
        />
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
                disabled={!user?.canWrite}
                onClick={toggleThreadLike}
              >
                ♥ {thread.likeCount}
              </button>
              {user && (
                <button
                  className={`bookmark-button ${thread.myBookmarked ? "bookmark-button-active" : ""}`}
                  onClick={toggleBookmark}
                >
                  {thread.myBookmarked ? "❧ Saved" : "❧ Save"}
                </button>
              )}
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
              ? `${thread.postCount} ${thread.postCount === 1 ? "reply awaits" : "replies await"}`
              : "Join this discussion"}
          </p>
          <p className="meta">
            The forum is free to join — read the full discussion, like posts, and reply as soon as
            you sign up.
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
            <div
              className="post"
              key={p.id}
              id={`post-${p.id}`}
              style={{ marginLeft: `${p.depth * 1.5}rem` }}
            >
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
                    {p.wasThere && (
                      <span className="was-there" title="Attended this event">
                        ◆ was there
                      </span>
                    )}
                    <p className="meta">· {formatDateTime(p.createdAt, dateFormat)}</p>
                    {p.editedAt && (
                      <p className="edited-note">edited {formatDateTime(p.editedAt, dateFormat)}</p>
                    )}
                  </div>
                  <div className="like-row">
                    <button
                      className={`like-button ${p.myLiked ? "like-button-active" : ""}`}
                      disabled={!user?.canWrite}
                      onClick={() => togglePostLike(p.id)}
                    >
                      ♥ {p.likeCount}
                    </button>
                    {canPost && (
                      <button className="link-button" onClick={() => setReplyTo(p.id)}>
                        Reply
                      </button>
                    )}
                    {user && (isAdmin || user.id === p.author.id) && (
                        <>
                          <button className="link-button" onClick={() => startPostEdit(p)}>
                            Edit
                          </button>
                          {isAdmin && user.id !== p.author.id ? (
                            <ConfirmAction
                              label="Remove"
                              title="Remove this reply"
                              description="Soft delete: replies below it stay readable under a [deleted] notice."
                              confirmLabel="Remove reply"
                              danger
                              onConfirm={async (reason) => {
                                await api.deleteWithBody(`/api/posts/${p.id}`, { reason }, token);
                                await load(repliesWindow);
                              }}
                            />
                          ) : (
                            <button className="link-button" onClick={() => deletePost(p.id)}>
                              Delete
                            </button>
                          )}
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
          ) : memberGated ? (
            <p className="notice">
              Posting in event threads is for members of the Society —{" "}
              <Link href="/membership" className="inline-link">
                what membership opens
              </Link>
              . Reading stays free.
            </p>
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

/**
 * The event header: date, attendance, and the "I was there" code redemption.
 * Admins additionally see the code to read out in the room and a panel to
 * mark attendees by hand.
 */
function EventPanel({
  thread,
  isAdmin,
  onChanged,
}: {
  thread: ThreadDetail;
  isAdmin: boolean;
  onChanged: () => void;
}) {
  const { user, token } = useAuth();
  const { dateFormat } = useSettings();
  const [code, setCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upcoming = thread.eventDate ? Date.parse(thread.eventDate) > Date.now() : false;

  async function redeem(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setRedeeming(true);
    setError(null);
    try {
      await api.post(`/api/threads/${thread.id}/attend`, { code }, token);
      setCode("");
      setRedeemOpen(false);
      onChanged();
    } catch (err: any) {
      setError(err.message ?? "Could not record your attendance");
    } finally {
      setRedeeming(false);
    }
  }

  return (
    <div className="card event-panel">
      <div className="row wrap between">
        <p className="event-label" style={{ margin: 0 }}>
          <span className="event-mark" aria-hidden>
            ◆
          </span>
          {upcoming ? "Upcoming event" : "Event"}
          {thread.eventDate ? ` · ${formatDateTime(thread.eventDate, dateFormat)}` : ""}
        </p>
        <p className="meta" style={{ margin: 0 }}>
          {thread.attendeeCount ?? 0} {(thread.attendeeCount ?? 0) === 1 ? "person" : "people"} were
          there
        </p>
      </div>
      <p className="meta" style={{ margin: "0.5rem 0 0" }}>
        {upcoming
          ? "Questions gathered here go to the speaker. Afterwards the topics, recording, and transcript land in this thread."
          : "The topics, recording, and transcript live in this thread — and the conversation continues."}
        {" "}Anyone may read; posting is for members.
      </p>

      {user && !thread.myAttended && !upcoming && (
        <div style={{ marginTop: "0.75rem" }}>
          {!redeemOpen ? (
            <button className="secondary btn-sm" onClick={() => setRedeemOpen(true)}>
              I was there — enter the event code
            </button>
          ) : (
            <form className="row wrap" onSubmit={redeem}>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Event code"
                style={{ maxWidth: "12rem" }}
                required
              />
              <button className="btn-sm" type="submit" disabled={redeeming}>
                {redeeming ? "Checking..." : "Confirm"}
              </button>
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setRedeemOpen(false);
                  setError(null);
                }}
              >
                cancel
              </button>
            </form>
          )}
          {error && <p className="error">{error}</p>}
        </div>
      )}
      {user && thread.myAttended && (
        <p className="was-there" style={{ marginTop: "0.75rem" }}>
          ◆ You were there — your posts here carry the mark.
        </p>
      )}

      {isAdmin && (
        <div className="event-admin">
          {thread.eventCode ? (
            <p className="meta" style={{ margin: 0 }}>
              Attendance code (visible to admins only): <strong>{thread.eventCode}</strong>
            </p>
          ) : (
            <p className="meta" style={{ margin: 0 }}>
              No attendance code was set for this event — mark attendees below.
            </p>
          )}
          <AttendeeAdmin threadId={thread.id} onChanged={onChanged} />
        </div>
      )}
    </div>
  );
}

/** Admin: mark someone as having been in the room, or unmark them. */
function AttendeeAdmin({ threadId, onChanged }: { threadId: string; onChanged: () => void }) {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [attendees, setAttendees] = useState<
    { user: { id: string; displayName: string; avatarUrl: string | null }; source: string }[] | null
  >(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    { id: string; displayName: string; avatarUrl: string | null }[] | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    if (!token) return;
    try {
      const res = await api.get<{ attendees: NonNullable<typeof attendees> }>(
        `/api/threads/${threadId}/attendees`,
        token,
      );
      setAttendees(res.attendees);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !query.trim()) return;
    const res = await api.get<{ users: NonNullable<typeof results> }>(
      `/api/users?search=${encodeURIComponent(query.trim())}`,
      token,
    );
    setResults(res.users);
  }

  async function add(userId: string) {
    if (!token) return;
    await api.post(`/api/threads/${threadId}/attendees`, { userId }, token);
    setResults(null);
    setQuery("");
    await refresh();
    onChanged();
  }

  async function remove(userId: string) {
    if (!token) return;
    await api.delete(`/api/threads/${threadId}/attendees/${userId}`, token);
    await refresh();
    onChanged();
  }

  if (!open) {
    return (
      <button
        className="link-button"
        style={{ marginTop: "0.5rem" }}
        onClick={() => {
          setOpen(true);
          refresh();
        }}
      >
        Manage attendees
      </button>
    );
  }

  return (
    <div style={{ marginTop: "0.75rem" }}>
      {error && <p className="error">{error}</p>}
      {attendees?.map((a) => (
        <div className="row between wrap admin-chapter-row" key={a.user.id}>
          <span className="row">
            <Avatar name={a.user.displayName} src={a.user.avatarUrl} size={22} />
            <span>{a.user.displayName}</span>
            <span className="meta">{a.source === "code" ? "redeemed code" : "marked by admin"}</span>
          </span>
          <button className="secondary btn-sm" onClick={() => remove(a.user.id)}>
            Unmark
          </button>
        </div>
      ))}
      {attendees && attendees.length === 0 && <p className="meta">No attendees marked yet.</p>}
      <form className="row" onSubmit={search} style={{ marginTop: "0.5rem" }}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Mark an attendee by name..."
        />
        <button className="secondary btn-sm" type="submit">
          Find
        </button>
      </form>
      {results?.length === 0 && <p className="meta">No one by that name.</p>}
      {results?.map((u) => (
        <div className="row between wrap admin-chapter-row" key={u.id}>
          <span className="row">
            <Avatar name={u.displayName} src={u.avatarUrl} size={22} />
            <span>{u.displayName}</span>
          </span>
          <button className="btn-sm" onClick={() => add(u.id)}>
            Mark as attended
          </button>
        </div>
      ))}
      <button className="link-button" style={{ marginTop: "0.5rem" }} onClick={() => setOpen(false)}>
        Close
      </button>
    </div>
  );
}
