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
          <span className="brand-mark" aria-hidden>
            Φ
          </span>
          NYPS Forum
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
