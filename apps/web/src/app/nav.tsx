"use client";

import Link from "next/link";
import { useAuth } from "~/lib/auth-context";
import { ProfileMenu } from "./profile-menu";

export function Nav() {
  const { user, loading } = useAuth();

  return (
    <div className="nav">
      <div className="nav-inner">
        <Link href="/" className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/nypc-icon.png" alt="The New York Philosophy Club" className="brand-logo" />
          <span>New York Philosophy Club</span>
        </Link>
        <div className="nav-links">
          {!loading && user && <ProfileMenu />}
          {!loading && !user && (
            <>
              <Link className="nav-link" href="/settings">
                Settings
              </Link>
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
