"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ConversationSummary } from "@nyps-forum/shared";
import { api } from "~/lib/api";
import { useAuth } from "~/lib/auth-context";

const statusBadgeClass: Record<string, string> = {
  VERIFIED: "badge badge-verified",
  PENDING: "badge badge-pending",
  UNVERIFIED: "badge badge-unverified",
  REJECTED: "badge badge-rejected",
};

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
        <span className="profile-avatar">{user.displayName.charAt(0).toUpperCase()}</span>
        {unreadCount > 0 && <span className="unread-count">{unreadCount}</span>}
      </button>

      {open && (
        <div className="profile-dropdown">
          <div className="profile-dropdown-header">
            <div className="profile-dropdown-name">{user.displayName}</div>
            <div style={{ display: "flex", gap: "0.35rem", marginTop: "0.3rem", flexWrap: "wrap" }}>
              <span className={statusBadgeClass[user.verificationStatus]}>
                {user.verificationStatus.toLowerCase()}
              </span>
              {user.isSupporter && <span className="badge badge-supporter">supporter</span>}
            </div>
          </div>
          <Link href="/verify" onClick={() => setOpen(false)}>
            Verification
          </Link>
          <Link href="/messages" onClick={() => setOpen(false)}>
            Messages{unreadCount > 0 && <span className="unread-count" style={{ marginLeft: "0.4rem" }}>{unreadCount}</span>}
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
