"use client";

import { useSettings } from "~/lib/settings-context";

export default function SettingsPage() {
  const { dateFormat, setDateFormat, theme, setTheme } = useSettings();

  return (
    <div>
      <h1>Settings</h1>

      <h3>Date format</h3>
      <p className="meta">Applies to every date and time shown across the app.</p>
      <div className="settings-row">
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

      <h3>Appearance</h3>
      <div className="settings-row">
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
    </div>
  );
}
