"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { ConversationResponse, DirectMessage, PublicUser } from "@nyps-forum/shared";
import { api } from "~/lib/api";
import { useAuth } from "~/lib/auth-context";
import { ReportButton } from "../../report-button";
import { Avatar, EmptyState, Skeleton } from "../../ui";

const MESSAGES_PAGE = 30;

export default function ConversationPage() {
  const { userId } = useParams<{ userId: string }>();
  const { user, token } = useAuth();
  const [otherUser, setOtherUser] = useState<PublicUser | null>(null);
  const [messages, setMessages] = useState<DirectMessage[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [messagesWindow, setMessagesWindow] = useState(MESSAGES_PAGE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function load(window: number) {
    if (!token) return;
    try {
      const res = await api.get<ConversationResponse>(
        `/api/messages/${userId}?limit=${window}&offset=0`,
        token,
      );
      setOtherUser(res.otherUser);
      setMessages(res.messages);
      setHasMore(res.hasMore);
    } catch (e: any) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load(messagesWindow);
    api
      .get<{ blocked: boolean }>(`/api/users/${userId}/block`, token)
      .then((res) => setBlocked(res.blocked))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, token]);

  async function loadOlder() {
    setLoadingMore(true);
    const nextWindow = messagesWindow + MESSAGES_PAGE;
    await load(nextWindow);
    setMessagesWindow(nextWindow);
    setLoadingMore(false);
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

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !body.trim()) return;
    setSending(true);
    setError(null);
    try {
      await api.post("/api/messages", { recipientId: userId, body }, token);
      setBody("");
      load(messagesWindow);
    } catch (err: any) {
      setError(err.message ?? "Could not send message");
    } finally {
      setSending(false);
    }
  }

  if (error && !otherUser) return <p className="error">{error}</p>;

  if (!otherUser || !messages) {
    return (
      <div>
        <Skeleton style={{ height: "1.8rem", width: "40%", marginBottom: "1.5rem" }} />
        <Skeleton style={{ height: "3rem", width: "60%", marginBottom: "0.75rem", borderRadius: 16 }} />
        <Skeleton
          style={{ height: "3rem", width: "55%", marginLeft: "auto", borderRadius: 16 }}
        />
      </div>
    );
  }

  const canSend = user?.canMessage && !blocked;

  return (
    <div>
      <Link href="/messages" className="back-link">
        ← All messages
      </Link>

      <div className="row between wrap">
        <Link className="author-link" href={`/u/${otherUser.id}`}>
          <Avatar name={otherUser.displayName} src={otherUser.avatarUrl} size={36} />
          <h1 style={{ margin: 0, fontSize: "var(--text-xl)" }}>{otherUser.displayName}</h1>
        </Link>
        <div className="row">
          <ReportButton targetType="user" targetId={otherUser.id} />
          <button className="link-button" onClick={toggleBlock}>
            {blocked ? "Unblock" : "Block"}
          </button>
        </div>
      </div>

      {blocked && (
        <p className="notice" style={{ marginTop: "1rem" }}>
          You&apos;ve blocked this user — you can&apos;t send or receive new messages until you
          unblock them.
        </p>
      )}

      {hasMore && (
        <button className="load-more" onClick={loadOlder} disabled={loadingMore}>
          {loadingMore ? "Loading..." : "Load older messages"}
        </button>
      )}

      <div style={{ margin: "1.5rem 0" }}>
        {messages.length === 0 && (
          <EmptyState title="No messages yet" hint="Open with a question worth answering." />
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`message-bubble ${m.senderId === user?.id ? "message-mine" : "message-theirs"}`}
          >
            {m.body}
          </div>
        ))}
      </div>

      {canSend ? (
        <form onSubmit={send} style={{ maxWidth: "none" }}>
          <label>
            Message
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              style={{ minHeight: "80px" }}
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={sending}>
            {sending ? "Sending..." : "Send"}
          </button>
        </form>
      ) : (
        !blocked && (
          <p className="notice">
            {user ? (
              <>
                <a href="/verify">Verify your identity</a> to send messages.
              </>
            ) : (
              <>
                <a href="/login">Log in</a> to send messages.
              </>
            )}
          </p>
        )
      )}
    </div>
  );
}
