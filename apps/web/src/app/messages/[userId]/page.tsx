"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { DirectMessage, PublicUser } from "@nyps-forum/shared";
import { api } from "~/lib/api";
import { useAuth } from "~/lib/auth-context";

export default function ConversationPage() {
  const { userId } = useParams<{ userId: string }>();
  const { user, token } = useAuth();
  const [otherUser, setOtherUser] = useState<PublicUser | null>(null);
  const [messages, setMessages] = useState<DirectMessage[] | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function load() {
    if (!token) return;
    try {
      const res = await api.get<{ otherUser: PublicUser; messages: DirectMessage[] }>(
        `/api/messages/${userId}`,
        token,
      );
      setOtherUser(res.otherUser);
      setMessages(res.messages);
    } catch (e: any) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, token]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !body.trim()) return;
    setSending(true);
    setError(null);
    try {
      await api.post("/api/messages", { recipientId: userId, body }, token);
      setBody("");
      load();
    } catch (err: any) {
      setError(err.message ?? "Could not send message");
    } finally {
      setSending(false);
    }
  }

  if (error && !otherUser) return <p className="error">{error}</p>;
  if (!otherUser || !messages) return <p>Loading...</p>;

  const canSend = user?.verificationStatus === "VERIFIED";

  return (
    <div>
      <h1>{otherUser.displayName}</h1>

      <div style={{ margin: "1rem 0" }}>
        {messages.length === 0 && <p className="meta">No messages yet — say hello.</p>}
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
        <form onSubmit={send}>
          <label>
            Message
            <textarea value={body} onChange={(e) => setBody(e.target.value)} required />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={sending}>
            {sending ? "Sending..." : "Send"}
          </button>
        </form>
      ) : (
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
      )}
    </div>
  );
}
