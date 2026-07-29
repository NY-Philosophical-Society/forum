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
          NYPS Forum
        </Link>
        <div className="nav-links">
          {!loading && user && <ProfileMenu />}
          {!loading && !user && (
            <>
              <Link href="/settings">Settings</Link>
              <Link href="/login">Log in</Link>
              <Link href="/signup">Sign up</Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
