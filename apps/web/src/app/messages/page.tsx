"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ConversationSummary, PublicUser } from "@nyps-forum/shared";
import { api } from "~/lib/api";
import { useAuth } from "~/lib/auth-context";

export default function MessagesInboxPage() {
  const { user, token, loading } = useAuth();
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<PublicUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api
      .get<{ conversations: ConversationSummary[] }>("/api/messages/conversations", token)
      .then((res) => setConversations(res.conversations))
      .catch((e) => setError(e.message));
  }, [token]);

  useEffect(() => {
    if (!token || !search.trim()) {
      setResults([]);
      return;
    }
    const handle = setTimeout(() => {
      api
        .get<{ users: PublicUser[] }>(`/api/users?search=${encodeURIComponent(search)}`, token)
        .then((res) => setResults(res.users))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(handle);
  }, [search, token]);

  if (loading) return <p>Loading...</p>;
  if (!user) {
    return (
      <p>
        You need to <a href="/login">log in</a> to view messages.
      </p>
    );
  }

  return (
    <div>
      <h1>Messages</h1>

      <label>
        Find someone to message
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name"
        />
      </label>

      {results.length > 0 && (
        <div style={{ marginTop: "0.5rem" }}>
          {results.map((u) => (
            <div className="card" key={u.id}>
              <Link className="title" href={`/messages/${u.id}`}>
                {u.displayName}
              </Link>
            </div>
          ))}
        </div>
      )}

      <h3 style={{ marginTop: "1.5rem" }}>Conversations</h3>
      {error && <p className="error">{error}</p>}
      {conversations?.length === 0 && <p className="meta">No conversations yet.</p>}

      {conversations?.map((c) => (
        <Link href={`/messages/${c.otherUser.id}`} key={c.otherUser.id} style={{ textDecoration: "none" }}>
          <div className="card conversation-row">
            <div>
              <span className="title">{c.otherUser.displayName}</span>
              <p className="meta">{c.lastMessage.body}</p>
            </div>
            {c.unreadCount > 0 && <span className="unread-count">{c.unreadCount}</span>}
          </div>
        </Link>
      ))}
    </div>
  );
}
