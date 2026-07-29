export interface ThemeColors {
  ink: string;
  inkSoft: string;
  paper: string;
  stone2: string;
  surface: string;
  accent: string;
  accentBg: string;
  border: string;
  borderStrong: string;
  danger: string;
  muted: string;
  solid: string;
  solidText: string;
  verifiedBg: string;
  verifiedText: string;
  pendingBg: string;
  pendingText: string;
  rejectedBg: string;
  rejectedBorder: string;
  supporterBg: string;
  supporterBorder: string;
  supporterText: string;
}

/** Editorial palette v1 — shared with nyphilosophy.org. */
export const lightColors: ThemeColors = {
  ink: "#152b42",
  inkSoft: "#2a4050",
  paper: "#fffdf2",
  stone2: "#faf6e3",
  surface: "#ffffff",
  accent: "#96421f",
  accentBg: "#f6ece2",
  border: "rgba(21, 43, 66, 0.14)",
  borderStrong: "rgba(21, 43, 66, 0.32)",
  danger: "#9e2b2b",
  muted: "#5a6b76",
  solid: "#152b42",
  solidText: "#fffdf2",
  verifiedBg: "#e9f1e4",
  verifiedText: "#2f5c2a",
  pendingBg: "#faf1da",
  pendingText: "#8a5f10",
  rejectedBg: "#f8e9e6",
  rejectedBorder: "#e0b3a8",
  supporterBg: "#f6ece2",
  supporterBorder: "#d9b79a",
  supporterText: "#96421f",
};

/** Provisional — mechanical inversion pending an official dark palette. */
export const darkColors: ThemeColors = {
  ink: "#e9e6dd",
  inkSoft: "#d6d2c6",
  paper: "#1b1f22",
  stone2: "#22282c",
  surface: "#262b2f",
  accent: "#dcb877",
  accentBg: "#332a17",
  border: "rgba(233, 230, 221, 0.14)",
  borderStrong: "rgba(233, 230, 221, 0.32)",
  danger: "#e0796b",
  muted: "#9b988e",
  solid: "#e9e6dd",
  solidText: "#1b1f22",
  verifiedBg: "#1e2f1c",
  verifiedText: "#8fce86",
  pendingBg: "#33290f",
  pendingText: "#e0b96a",
  rejectedBg: "#33201d",
  rejectedBorder: "#6b3b34",
  supporterBg: "#332a17",
  supporterBorder: "#6b5424",
  supporterText: "#e0c078",
};

/* Non-color tokens are identical in both themes, so plain constants suffice —
   colors stay behind useSettings() because they change with the toggle. */

export const fonts = {
  serif: "LibreBaskerville_400Regular",
  serifItalic: "LibreBaskerville_400Regular_Italic",
  serifBold: "LibreBaskerville_700Bold",
  display: "Newsreader_400Regular",
  displayMedium: "Newsreader_500Medium",
  displaySemi: "Newsreader_600SemiBold",
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 6, md: 10, lg: 16, full: 999 } as const;

export const type = { xs: 11, sm: 13, base: 15, md: 17, lg: 20, xl: 24 } as const;
