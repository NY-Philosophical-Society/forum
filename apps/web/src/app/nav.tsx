"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ConversationSummary } from "@nyps-forum/shared";
import { api } from "~/lib/api";
import { useAuth } from "~/lib/auth-context";

const statusBadgeClass: Record<string, string> = {
  VERIFIED: "badge badge-verified",
  PENDING: "badge badge-pending",
  UNVERIFIED: "badge badge-unverified",
  REJECTED: "badge badge-rejected",
};

export function Nav() {
  const { user, token, logout, loading } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!token) {
      setUnreadCount(0);
      return;
    }
    function refresh() {
      api
        .get<{ conversations: ConversationSummary[] }>("/api/messages/conversations", token)
        .then((res) => setUnreadCount(res.conversations.reduce((sum, c) => sum + c.unreadCount, 0)))
        .catch(() => {});
    }
    refresh();
    const interval = setInterval(refresh, 15000);
    return () => clearInterval(interval);
  }, [token]);

  return (
    <div className="nav">
      <div className="nav-inner">
        <Link href="/" className="brand">
          NYPS Forum
        </Link>
        <div className="nav-links">
          {!loading && user && (
            <>
              <span className={statusBadgeClass[user.verificationStatus]}>
                {user.verificationStatus.toLowerCase()}
              </span>
              <Link href="/verify">Verification</Link>
              <Link href="/messages">
                Messages{unreadCount > 0 && <span className="unread-count" style={{ marginLeft: "0.35rem" }}>{unreadCount}</span>}
              </Link>
              <span>{user.displayName}</span>
              <button className="secondary" onClick={logout}>
                Log out
              </button>
            </>
          )}
          {!loading && !user && (
            <>
              <Link href="/login">Log in</Link>
              <Link href="/signup">Sign up</Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
