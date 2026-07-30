"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReportsResponse } from "@nyps-forum/shared";
import { api } from "~/lib/api";
import { useAuth } from "~/lib/auth-context";
import { AdminGate } from "./admin-ui";

const TABS = [
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/users", label: "Members" },
  { href: "/admin/content", label: "Content" },
  { href: "/admin/chapters", label: "Chapters" },
  { href: "/admin/log", label: "Moderation log" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, token } = useAuth();
  const [openCount, setOpenCount] = useState<number | null>(null);

  useEffect(() => {
    if (!token || user?.role !== "admin") return;
    api
      .get<ReportsResponse>("/api/reports?status=open&limit=1", token)
      .then((res) => setOpenCount(res.openCount))
      .catch(() => {});
  }, [token, user?.role, pathname]);

  return (
    <div>
      <h1 className="page-title">Moderation</h1>
      <p className="meta" style={{ marginBottom: "1rem" }}>
        Internal tooling. Every action here is recorded in the moderation log with your name.
      </p>
      <nav className="admin-nav">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`admin-tab ${pathname === tab.href ? "admin-tab-active" : ""}`}
          >
            {tab.label}
            {tab.href === "/admin/reports" && openCount !== null && openCount > 0 && (
              <span className="admin-count">{openCount}</span>
            )}
          </Link>
        ))}
      </nav>
      <AdminGate>{children}</AdminGate>
    </div>
  );
}
