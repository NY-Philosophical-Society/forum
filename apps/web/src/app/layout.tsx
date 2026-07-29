import type { Metadata } from "next";
import { AuthProvider } from "~/lib/auth-context";
import { SettingsProvider } from "~/lib/settings-context";
import { Nav } from "./nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "NYPS Forum",
  description: "Verified-identity philosophical discussion forum.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SettingsProvider>
          <AuthProvider>
            <Nav />
            <div className="container">{children}</div>
          </AuthProvider>
        </SettingsProvider>
      </body>
    </html>
  );
}
