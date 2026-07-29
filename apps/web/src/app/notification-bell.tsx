"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "~/lib/api";
import { useAuth } from "~/lib/auth-context";

/**
 * Nav bell with the unread notification count. Polls the dedicated
 * unread-count endpoint on the same 15s cadence as the DM badge next to it.
 */
export function NotificationBell() {
  const { token } = useAuth();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!token) {
      setUnread(0);
      return;
    }
    function refresh() {
      api
        .get<{ unreadCount: number }>("/api/notifications/unread-count", token)
        .then((res) => setUnread(res.unreadCount))
        .catch(() => {});
    }
    refresh();
    const interval = setInterval(refresh, 15000);
    return () => clearInterval(interval);
  }, [token]);

  return (
    <Link href="/notifications" className="bell-link" aria-label="Notifications">
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.7 21a2 2 0 0 1-3.4 0" />
      </svg>
      {unread > 0 && <span className="unread-count">{unread}</span>}
    </Link>
  );
}
