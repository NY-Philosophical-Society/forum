"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { DateFormatPreference } from "@nyps-forum/shared";

type Theme = "light" | "dark";

interface SettingsContextValue {
  dateFormat: DateFormatPreference;
  setDateFormat: (pref: DateFormatPreference) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

const DATE_FORMAT_KEY = "nyps-forum:date-format";
const THEME_KEY = "nyps-forum:theme";

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [dateFormat, setDateFormatState] = useState<DateFormatPreference>("MDY");
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    const storedDateFormat = localStorage.getItem(DATE_FORMAT_KEY);
    if (storedDateFormat === "MDY" || storedDateFormat === "DMY") {
      setDateFormatState(storedDateFormat);
    }

    const storedTheme = localStorage.getItem(THEME_KEY);
    if (storedTheme === "light" || storedTheme === "dark") {
      setThemeState(storedTheme);
    } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      setThemeState("dark");
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const setDateFormat = useCallback((pref: DateFormatPreference) => {
    localStorage.setItem(DATE_FORMAT_KEY, pref);
    setDateFormatState(pref);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    localStorage.setItem(THEME_KEY, next);
    setThemeState(next);
  }, []);

  const value = useMemo<SettingsContextValue>(
    () => ({ dateFormat, setDateFormat, theme, setTheme }),
    [dateFormat, setDateFormat, theme, setTheme],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
