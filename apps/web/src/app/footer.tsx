import Link from "next/link";

/**
 * Site footer. Exists mainly to make the legal pages reachable from
 * everywhere — the App Store requires a working privacy policy link, and a
 * page nothing links to is not really reachable.
 */
export function Footer() {
  return (
    <footer className="site-footer">
      <span>
        © {new Date().getFullYear()} The New York Philosophy Club — a 501(c)(3)
        non-profit
      </span>
      <Link href="/privacy">Privacy</Link>
      <Link href="/terms">Terms</Link>
      <a href="mailto:info@nyphilosophy.org">Contact</a>
    </footer>
  );
}
