"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ConversationSummary } from "@nyps-forum/shared";
import { api } from "~/lib/api";
import { useAuth } from "~/lib/auth-context";
import { Avatar, StatusBadge } from "./ui";

export function ProfileMenu() {
  const { user, token, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token) return;
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

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  if (!user) return null;

  return (
    <div className="profile-menu" ref={menuRef}>
      <button className="profile-trigger" onClick={() => setOpen((v) => !v)}>
        <Avatar name={user.displayName} src={user.avatarUrl} size={32} />
        {unreadCount > 0 && <span className="unread-count">{unreadCount}</span>}
      </button>

      {open && (
        <div className="profile-dropdown">
          <div className="profile-dropdown-header">
            <div className="profile-dropdown-name">{user.displayName}</div>
            <div className="row wrap" style={{ marginTop: "0.35rem" }}>
              <StatusBadge status={user.verificationStatus} />
              {user.isSupporter && <span className="badge badge-supporter">supporter</span>}
            </div>
          </div>
          <Link href={`/u/${user.id}`} onClick={() => setOpen(false)}>
            My profile
          </Link>
          <Link href="/verify" onClick={() => setOpen(false)}>
            Verification
          </Link>
          <Link href="/messages" onClick={() => setOpen(false)}>
            Messages
            {unreadCount > 0 && (
              <span className="unread-count" style={{ marginLeft: "0.4rem" }}>
                {unreadCount}
              </span>
            )}
          </Link>
          <Link href="/saved" onClick={() => setOpen(false)}>
            Saved threads
          </Link>
          <Link href="/formatting" onClick={() => setOpen(false)}>
            Formatting guide
          </Link>
          <Link href="/settings" onClick={() => setOpen(false)}>
            Settings
          </Link>
          {user.role === "admin" && (
            <Link href="/admin/reports" onClick={() => setOpen(false)}>
              Reports (admin)
            </Link>
          )}
          <button className="danger" onClick={logout}>
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
