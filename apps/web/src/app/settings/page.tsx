"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { DataExport, PublicUser } from "@nyps-forum/shared";
import { api } from "~/lib/api";
import { useAuth } from "~/lib/auth-context";
import { useSettings } from "~/lib/settings-context";

export default function SettingsPage() {
  const { dateFormat, setDateFormat, theme, setTheme } = useSettings();
  const { user, token, refreshUser } = useAuth();
  const [code, setCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [redeemed, setRedeemed] = useState(false);

  async function redeemCode(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setRedeemError(null);
    setRedeeming(true);
    try {
      await api.post<{ user: PublicUser }>("/api/auth/redeem-code", { code }, token);
      setRedeemed(true);
      setCode("");
      await refreshUser();
    } catch (err: any) {
      setRedeemError(err.message ?? "Could not redeem that code");
    } finally {
      setRedeeming(false);
    }
  }

  return (
    <div>
      <h1 className="page-title">Settings</h1>

      <div className="card settings-section" style={{ marginTop: "1.5rem" }}>
        <h3>Date format</h3>
        <p className="meta">Applies to every date and time shown across the forum.</p>
        <div className="segmented">
          <button
            type="button"
            className={dateFormat === "MDY" ? "segmented-active" : ""}
            onClick={() => setDateFormat("MDY")}
          >
            MM/DD/YYYY
          </button>
          <button
            type="button"
            className={dateFormat === "DMY" ? "segmented-active" : ""}
            onClick={() => setDateFormat("DMY")}
          >
            DD/MM/YYYY
          </button>
        </div>
      </div>

      <div className="card settings-section">
        <h3>Appearance</h3>
        <p className="meta">The dark theme is provisional while the official palette is drawn up.</p>
        <div className="segmented">
          <button
            type="button"
            className={theme === "light" ? "segmented-active" : ""}
            onClick={() => setTheme("light")}
          >
            Light
          </button>
          <button
            type="button"
            className={theme === "dark" ? "segmented-active" : ""}
            onClick={() => setTheme("dark")}
          >
            Dark
          </button>
        </div>
      </div>

      {user && <AccountSections />}

      {user && (
        <div className="card settings-section">
          <h3>Supporter access</h3>
          {user.isSupporter || redeemed ? (
            <p className="toast" style={{ marginBottom: 0 }}>
              You have supporter access — thank you for sustaining the Society&apos;s events and
              journal.
            </p>
          ) : (
            <>
              <p className="meta">
                Have an access code from a donation or journal subscription? Redeem it here.
              </p>
              <form onSubmit={redeemCode}>
                <label>
                  Access code
                  <input value={code} onChange={(e) => setCode(e.target.value)} required />
                </label>
                {redeemError && <p className="error">{redeemError}</p>}
                <button type="submit" disabled={redeeming}>
                  {redeeming ? "Redeeming..." : "Redeem code"}
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Account management: profile link, password, email, data export, deletion.
 * Only rendered for signed-in users; hasPassword (from /api/auth/account)
 * switches the password card between "change" and "set a first password"
 * for Google/Apple-created accounts.
 */
function AccountSections() {
  const { user, token, logout } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);

  useEffect(() => {
    if (!token) return;
    api
      .get<{ email: string; hasPassword: boolean }>("/api/auth/account", token)
      .then((res) => {
        setEmail(res.email);
        setHasPassword(res.hasPassword);
      })
      .catch(() => {});
  }, [token]);

  // Change password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setPasswordMsg(null);
    setPasswordBusy(true);
    try {
      await api.post(
        "/api/auth/change-password",
        hasPassword ? { currentPassword, newPassword } : { newPassword },
        token,
      );
      setCurrentPassword("");
      setNewPassword("");
      setHasPassword(true);
      setPasswordMsg({ ok: true, text: hasPassword ? "Password changed." : "Password set." });
    } catch (err: any) {
      setPasswordMsg({ ok: false, text: err.message ?? "Could not change the password" });
    } finally {
      setPasswordBusy(false);
    }
  }

  // Change email
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailMsg, setEmailMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);

  async function changeEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setEmailMsg(null);
    setEmailBusy(true);
    try {
      const res = await api.post<{ ok: boolean; email: string }>(
        "/api/auth/change-email",
        hasPassword ? { email: newEmail, password: emailPassword } : { email: newEmail },
        token,
      );
      setEmail(res.email);
      setNewEmail("");
      setEmailPassword("");
      setEmailMsg({ ok: true, text: "Email changed." });
    } catch (err: any) {
      setEmailMsg({ ok: false, text: err.message ?? "Could not change the email" });
    } finally {
      setEmailBusy(false);
    }
  }

  // Export
  const [exporting, setExporting] = useState(false);

  async function exportData() {
    if (!token) return;
    setExporting(true);
    try {
      const data = await api.get<DataExport>("/api/users/me/export", token);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "nyps-forum-export.json";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  // Delete account
  const [confirmText, setConfirmText] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function deleteAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setDeleteMsg(null);
    setDeleting(true);
    try {
      await api.deleteWithBody(
        "/api/users/me",
        hasPassword ? { confirm: confirmText, password: deletePassword } : { confirm: confirmText },
        token,
      );
      logout();
      router.push("/");
    } catch (err: any) {
      setDeleteMsg(err.message ?? "Could not delete the account");
      setDeleting(false);
    }
  }

  if (!user) return null;

  return (
    <>
      <div className="card settings-section">
        <h3>Profile</h3>
        <p className="meta">Your photo, bio, and display name.</p>
        <Link href="/settings/profile">
          <button className="secondary btn-sm">Edit profile</button>
        </Link>
      </div>

      <div className="card settings-section">
        <h3>{hasPassword === false ? "Set a password" : "Change password"}</h3>
        {hasPassword === false && (
          <p className="meta">
            Your account signs in with Google or Apple. Setting a password also lets you log in
            with your email address.
          </p>
        )}
        <form onSubmit={changePassword}>
          {hasPassword !== false && (
            <label>
              Current password
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
          )}
          <label>
            New password
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          {passwordMsg && (
            <p className={passwordMsg.ok ? "toast" : "error"} style={{ marginBottom: 0 }}>
              {passwordMsg.text}
            </p>
          )}
          <button type="submit" disabled={passwordBusy}>
            {passwordBusy ? "Saving..." : hasPassword === false ? "Set password" : "Change password"}
          </button>
        </form>
      </div>

      <div className="card settings-section">
        <h3>Change email</h3>
        {email && (
          <p className="meta">
            Current email: <strong>{email}</strong>
          </p>
        )}
        <form onSubmit={changeEmail}>
          <label>
            New email
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
            />
          </label>
          {hasPassword !== false && (
            <label>
              Password
              <input
                type="password"
                value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
          )}
          {emailMsg && (
            <p className={emailMsg.ok ? "toast" : "error"} style={{ marginBottom: 0 }}>
              {emailMsg.text}
            </p>
          )}
          <button type="submit" disabled={emailBusy}>
            {emailBusy ? "Saving..." : "Change email"}
          </button>
        </form>
      </div>

      <div className="card settings-section">
        <h3>Export my data</h3>
        <p className="meta">
          Download a JSON copy of your account details, threads, replies, and messages.
        </p>
        <button className="secondary btn-sm" onClick={exportData} disabled={exporting}>
          {exporting ? "Preparing..." : "Download my data"}
        </button>
      </div>

      <div className="card settings-section danger-card">
        <h3>Delete account</h3>
        <p className="meta">
          Deleting your account is permanent. Your threads and replies stay in place, attributed to
          &ldquo;[deleted]&rdquo;, so other members&apos; discussions aren&apos;t torn up — but your
          name, photo, bio, and sign-in are removed and can&apos;t be restored.
        </p>
        {!deleteArmed ? (
          <button className="danger-button btn-sm" onClick={() => setDeleteArmed(true)}>
            Delete my account...
          </button>
        ) : (
          <form onSubmit={deleteAccount}>
            <label>
              Type DELETE to confirm
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE"
                required
              />
            </label>
            {hasPassword !== false && (
              <label>
                Password
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>
            )}
            {deleteMsg && <p className="error">{deleteMsg}</p>}
            <div className="row">
              <button
                type="submit"
                className="danger-button"
                disabled={deleting || confirmText !== "DELETE"}
              >
                {deleting ? "Deleting..." : "Permanently delete"}
              </button>
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setDeleteArmed(false);
                  setConfirmText("");
                  setDeletePassword("");
                  setDeleteMsg(null);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
