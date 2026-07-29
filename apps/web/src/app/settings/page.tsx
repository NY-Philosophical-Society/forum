"use client";

import { useState } from "react";
import type { PublicUser } from "@nyps-forum/shared";
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
