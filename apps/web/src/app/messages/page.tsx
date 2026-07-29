"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ConversationSummary, PublicUser } from "@nyps-forum/shared";
import { api } from "~/lib/api";
import { useAuth } from "~/lib/auth-context";
import { Avatar, EmptyState, Skeleton } from "../ui";

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

  if (loading) return <Skeleton style={{ height: "2rem", width: "40%" }} />;
  if (!user) {
    return (
      <p className="meta">
        You need to <a href="/login">log in</a> to view messages.
      </p>
    );
  }

  return (
    <div>
      <h1 className="page-title">Messages</h1>

      <label style={{ maxWidth: "480px" }}>
        Find someone to message
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name"
        />
      </label>

      {results.length > 0 && (
        <div style={{ marginTop: "1rem" }}>
          {results.map((u) => (
            <Link href={`/messages/${u.id}`} key={u.id} style={{ textDecoration: "none" }}>
              <div className="card conversation-row">
                <div className="row">
                  <Avatar name={u.displayName} src={u.avatarUrl} size={32} />
                  <span className="title">{u.displayName}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <h3 style={{ marginTop: "2rem" }}>Conversations</h3>
      {error && <p className="error">{error}</p>}

      {conversations === null && !error && (
        <>
          <Skeleton style={{ height: "4rem", marginBottom: "0.75rem", borderRadius: 10 }} />
          <Skeleton style={{ height: "4rem", borderRadius: 10 }} />
        </>
      )}

      {conversations?.length === 0 && (
        <EmptyState
          title="No conversations yet"
          hint="Search for a member above and open the first line of dialogue."
        />
      )}

      {conversations?.map((c) => (
        <Link href={`/messages/${c.otherUser.id}`} key={c.otherUser.id} style={{ textDecoration: "none" }}>
          <div className="card conversation-row">
            <div className="row" style={{ minWidth: 0 }}>
              <Avatar name={c.otherUser.displayName} src={c.otherUser.avatarUrl} size={36} />
              <div style={{ minWidth: 0 }}>
                <span className="title">{c.otherUser.displayName}</span>
                <p
                  className="meta"
                  style={{
                    marginTop: "0.15rem",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: "26rem",
                  }}
                >
                  {c.lastMessage.body}
                </p>
              </div>
            </div>
            {c.unreadCount > 0 && <span className="unread-count">{c.unreadCount}</span>}
          </div>
        </Link>
      ))}
    </div>
  );
}
