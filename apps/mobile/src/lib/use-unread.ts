import { useEffect, useState } from "react";
import type { ConversationSummary } from "@nyps-forum/shared";
import { api } from "./api";
import { useAuth } from "./auth-context";
import { syncAppBadge } from "./push";

/** Polls the conversation list for the total unread count (Messages tab badge). */
export function useUnreadCount(): number {
  const { token } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!token) {
      setCount(0);
      return;
    }
    function refresh() {
      api
        .get<{ conversations: ConversationSummary[] }>("/api/messages/conversations", token)
        .then((res) => setCount(res.conversations.reduce((sum, c) => sum + c.unreadCount, 0)))
        .catch(() => {});
    }
    refresh();
    const interval = setInterval(refresh, 15000);
    return () => clearInterval(interval);
  }, [token]);

  return count;
}

/**
 * Polls the unread notification count (Alerts tab badge) on the same
 * cadence, and mirrors it onto the app icon badge.
 */
export function useNotificationUnreadCount(): number {
  const { token } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!token) {
      setCount(0);
      return;
    }
    function refresh() {
      api
        .get<{ unreadCount: number }>("/api/notifications/unread-count", token)
        .then((res) => {
          setCount(res.unreadCount);
          syncAppBadge(res.unreadCount);
        })
        .catch(() => {});
    }
    refresh();
    const interval = setInterval(refresh, 15000);
    return () => clearInterval(interval);
  }, [token]);

  return count;
}
