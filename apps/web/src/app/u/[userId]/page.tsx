"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { formatDate, stripMarkdown, type UserProfileResponse } from "@nyps-forum/shared";
import { api } from "~/lib/api";
import { useAuth } from "~/lib/auth-context";
import { useSettings } from "~/lib/settings-context";
import { Markdown } from "../../markdown";
import { ReportButton } from "../../report-button";
import { Avatar, EmptyState, Skeleton, StatusBadge } from "../../ui";

const PAGE = 10;

export default function UserProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const { user: viewer, token } = useAuth();
  const { dateFormat } = useSettings();
  const [profile, setProfile] = useState<UserProfileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [loadingMore, setLoadingMore] = useState<"threads" | "replies" | null>(null);

  useEffect(() => {
    api
      .get<UserProfileResponse>(`/api/users/${userId}/profile`, token)
      .then(setProfile)
      .catch((e) => setError(e.message));
    if (token) {
      api
        .get<{ blocked: boolean }>(`/api/users/${userId}/block`, token)
        .then((res) => setBlocked(res.blocked))
        .catch(() => {});
    }
  }, [userId, token]);

  async function loadMore(section: "threads" | "replies") {
    if (!profile) return;
    setLoadingMore(section);
    try {
      const qs =
        section === "threads"
          ? `threadsLimit=${PAGE}&threadsOffset=${profile.threads.length}&repliesLimit=0`
          : `repliesLimit=${PAGE}&repliesOffset=${profile.replies.length}&threadsLimit=0`;
      const res = await api.get<UserProfileResponse>(`/api/users/${userId}/profile?${qs}`, token);
      setProfile({
        ...profile,
        threads: section === "threads" ? [...profile.threads, ...res.threads] : profile.threads,
        hasMoreThreads: section === "threads" ? res.hasMoreThreads : profile.hasMoreThreads,
        replies: section === "replies" ? [...profile.replies, ...res.replies] : profile.replies,
        hasMoreReplies: section === "replies" ? res.hasMoreReplies : profile.hasMoreReplies,
      });
    } finally {
      setLoadingMore(null);
    }
  }

  async function toggleBlock() {
    if (!token) return;
    if (blocked) {
      await api.delete(`/api/users/${userId}/block`, token);
      setBlocked(false);
    } else {
      await api.post(`/api/users/${userId}/block`, {}, token);
      setBlocked(true);
    }
  }

  if (error) return <p className="error">{error}</p>;

  if (!profile) {
    return (
      <div>
        <div className="profile-header">
          <Skeleton style={{ width: 84, height: 84, borderRadius: 999 }} />
          <div style={{ flex: 1 }}>
            <Skeleton style={{ height: "1.6rem", width: "50%", marginBottom: "0.75rem" }} />
            <Skeleton style={{ height: "0.85rem", width: "35%" }} />
          </div>
        </div>
      </div>
    );
  }

  const { user } = profile;
  const isSelf = viewer?.id === user.id;

  return (
    <div>
      <Link href="/" className="back-link">
        ← Back to the feed
      </Link>

      <div className="profile-header">
        <Avatar name={user.displayName} src={user.avatarUrl} size={84} />
        <div className="profile-header-info">
          <h1 className="profile-name">{user.displayName}</h1>
          <div className="row wrap">
            <StatusBadge status={user.verificationStatus} />
            {user.isSupporter && <span className="badge badge-supporter">supporter</span>}
          </div>
          <p className="meta" style={{ marginTop: "0.5rem" }}>
            Member since {formatDate(user.createdAt, dateFormat)} · {profile.threadCount}{" "}
            {profile.threadCount === 1 ? "thread" : "threads"} · {profile.replyCount}{" "}
            {profile.replyCount === 1 ? "reply" : "replies"}
          </p>
          {user.bio && (
            <div className="profile-bio">
              <Markdown>{user.bio}</Markdown>
            </div>
          )}
          <div className="row wrap" style={{ marginTop: "0.9rem" }}>
            {isSelf ? (
              <Link href="/settings/profile">
                <button className="secondary btn-sm">Edit profile</button>
              </Link>
            ) : viewer ? (
              <>
                {!blocked && (
                  <Link href={`/messages/${user.id}`}>
                    <button className="btn-sm">Message</button>
                  </Link>
                )}
                <ReportButton targetType="user" targetId={user.id} />
                <button className="link-button" onClick={toggleBlock}>
                  {blocked ? "Unblock" : "Block"}
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {blocked && (
        <p className="notice">
          You&apos;ve blocked this member — you can&apos;t exchange messages until you unblock them.
        </p>
      )}

      {profile.previewOnly ? (
        <div className="wall-card">
          <span className="empty-mark" aria-hidden>
            ❦
          </span>
          <p className="wall-title">See what {user.displayName} has written</p>
          <p className="meta">
            NYPS Forum is free to join — read members&apos; threads and replies once you have an
            account.
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
          <h3 className="profile-section-title">Threads</h3>
          {profile.threads.length === 0 && (
            <EmptyState title="No threads yet" hint="They haven't opened a discussion so far." />
          )}
          {profile.threads.map((t) => (
            <article className="card thread-card" key={t.id}>
              <Link className="title" href={`/t/${t.id}`}>
                {t.title}
                {t.locked && " 🔒"}
              </Link>
              <p className="meta" style={{ marginTop: "0.5rem" }}>
                {formatDate(t.createdAt, dateFormat)} · ♥ {t.likeCount} · {t.postCount}{" "}
                {t.postCount === 1 ? "reply" : "replies"}
              </p>
              {t.tags.length > 0 && (
                <div className="row wrap" style={{ marginTop: "0.6rem" }}>
                  {t.tags.map((tag) => (
                    <span className="tag-static" key={tag.id}>
                      {tag.name}
                    </span>
                  ))}
                </div>
              )}
            </article>
          ))}
          {profile.hasMoreThreads && (
            <button
              className="load-more"
              onClick={() => loadMore("threads")}
              disabled={loadingMore !== null}
            >
              {loadingMore === "threads" ? "Loading..." : "More threads"}
            </button>
          )}

          <h3 className="profile-section-title">Replies</h3>
          {profile.replies.length === 0 && (
            <EmptyState title="No replies yet" hint="They haven't joined a discussion so far." />
          )}
          {profile.replies.map((r) => (
            <div className="card" key={r.id}>
              <p className="profile-reply-quote">{stripMarkdown(r.body)}</p>
              <p className="meta">
                in{" "}
                <Link href={`/t/${r.threadId}`} style={{ fontWeight: 600 }}>
                  {r.threadTitle}
                </Link>{" "}
                · {formatDate(r.createdAt, dateFormat)} · ♥ {r.likeCount}
              </p>
            </div>
          ))}
          {profile.hasMoreReplies && (
            <button
              className="load-more"
              onClick={() => loadMore("replies")}
              disabled={loadingMore !== null}
            >
              {loadingMore === "replies" ? "Loading..." : "More replies"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
