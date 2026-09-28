import type { Metadata } from "next";
import "./showcase.css";

export const metadata: Metadata = {
  title: "Community — New York Philosophy Club",
  description: "Events, conversations, and member connections for the New York Philosophy Club.",
};

export default function ShowcaseLayout({ children }: { children: React.ReactNode }) {
  return children;
}
