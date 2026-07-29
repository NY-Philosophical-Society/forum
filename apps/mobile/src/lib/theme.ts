export interface ThemeColors {
  ink: string;
  paper: string;
  surface: string;
  accent: string;
  border: string;
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
}

export const lightColors: ThemeColors = {
  ink: "#1d2b33",
  paper: "#fbfaf6",
  surface: "#ffffff",
  accent: "#7a5c2e",
  border: "#ddd6c5",
  danger: "#a3342a",
  muted: "#6b675e",
  solid: "#1d2b33",
  solidText: "#ffffff",
  verifiedBg: "#e7f1e6",
  verifiedText: "#2f5c2a",
  pendingBg: "#fbf1de",
  pendingText: "#8a5f10",
  rejectedBg: "#f6e6e4",
  rejectedBorder: "#e0a89f",
};

export const darkColors: ThemeColors = {
  ink: "#e9e6dd",
  paper: "#1b1f22",
  surface: "#262b2f",
  accent: "#dcb877",
  border: "#3a3f44",
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
};
