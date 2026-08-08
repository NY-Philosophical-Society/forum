"use client";

import Link from "next/link";
import { useAuth } from "~/lib/auth-context";
import { NotificationBell } from "./notification-bell";
import { ProfileMenu } from "./profile-menu";

export function Nav() {
  const { user, loading } = useAuth();

  return (
    <div className="nav">
      <div className="nav-inner">
        <Link href="/" className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/nypc-icon.png" alt="The New York Philosophy Club" className="brand-logo" />
          <span>Philosophy Club</span>
        </Link>
        <div className="nav-links">
          {!loading && user && (
            <>
              <Link className="nav-link" href="/search">
                Search
              </Link>
              <NotificationBell />
              <ProfileMenu />
            </>
          )}
          {!loading && !user && (
            <>
              {/* Settings is intentionally not linked here — it belongs to an
                  account, and a signed-out visitor has nothing to configure
                  yet. Signed-in members reach it from the profile menu. */}
              <Link className="nav-link" href="/login">
                Log in
              </Link>
              <Link href="/signup">
                <button className="btn-sm">Sign up</button>
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
