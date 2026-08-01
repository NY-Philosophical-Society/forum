import type { Metadata } from "next";
import { Libre_Baskerville, Newsreader } from "next/font/google";
import { AuthProvider } from "~/lib/auth-context";
import { SettingsProvider } from "~/lib/settings-context";
import { Footer } from "./footer";
import { Nav } from "./nav";
import "./globals.css";

// Libre Baskerville carries headings and body; Newsreader carries the UI
// voice (buttons, labels, metadata) — same serif family feeling, two registers.
const serif = Libre_Baskerville({
  weight: ["400", "700"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

const display = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
  // Next 14.2 has no fallback-metric data for Newsreader; without this it
  // errors out ("Failed to find font override values") and wedges the build.
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: "Forum — The New York Philosophy Club",
  description: "The New York Philosophy Club's verified-identity discussion forum.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${display.variable}`}>
      <body>
        <SettingsProvider>
          <AuthProvider>
            <Nav />
            <div className="container">{children}</div>
            <Footer />
          </AuthProvider>
        </SettingsProvider>
      </body>
    </html>
  );
}
