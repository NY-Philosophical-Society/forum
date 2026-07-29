import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Appearance } from "react-native";
import type { DateFormatPreference } from "@nyps-forum/shared";
import { darkColors, lightColors, type ThemeColors } from "./theme";

export type ThemeName = "light" | "dark";

interface SettingsContextValue {
  dateFormat: DateFormatPreference;
  setDateFormat: (pref: DateFormatPreference) => void;
  themeName: ThemeName;
  setThemeName: (theme: ThemeName) => void;
  colors: ThemeColors;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);
const DATE_FORMAT_KEY = "nyps-forum:date-format";
const THEME_KEY = "nyps-forum:theme";

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [dateFormat, setDateFormatState] = useState<DateFormatPreference>("MDY");
  const [themeName, setThemeNameState] = useState<ThemeName>("light");

  useEffect(() => {
    AsyncStorage.getItem(DATE_FORMAT_KEY).then((v) => {
      if (v === "MDY" || v === "DMY") setDateFormatState(v);
    });
    AsyncStorage.getItem(THEME_KEY).then((v) => {
      if (v === "light" || v === "dark") {
        setThemeNameState(v);
      } else if (Appearance.getColorScheme() === "dark") {
        setThemeNameState("dark");
      }
    });
  }, []);

  const setDateFormat = useCallback((pref: DateFormatPreference) => {
    AsyncStorage.setItem(DATE_FORMAT_KEY, pref);
    setDateFormatState(pref);
  }, []);

  const setThemeName = useCallback((theme: ThemeName) => {
    AsyncStorage.setItem(THEME_KEY, theme);
    setThemeNameState(theme);
  }, []);

  const colors = themeName === "dark" ? darkColors : lightColors;

  const value = useMemo<SettingsContextValue>(
    () => ({ dateFormat, setDateFormat, themeName, setThemeName, colors }),
    [dateFormat, setDateFormat, themeName, setThemeName, colors],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
