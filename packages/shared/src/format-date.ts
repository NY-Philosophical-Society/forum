export const DateFormat = {
  MDY: "MDY",
  DMY: "DMY",
} as const;
export type DateFormatPreference = (typeof DateFormat)[keyof typeof DateFormat];

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

/** "07/28/2026" (MDY) or "28/07/2026" (DMY) — numeric, per user preference. */
export function formatDate(iso: string, pref: DateFormatPreference): string {
  const d = new Date(iso);
  const day = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  const year = d.getFullYear();
  return pref === "DMY" ? `${day}/${month}/${year}` : `${month}/${day}/${year}`;
}

/**
 * Compact "how long ago" for activity feeds (notifications). Minutes at the
 * finest — never seconds, per the product rule — and falls back to the
 * user's numeric date format beyond a week.
 */
export function formatRelativeTime(iso: string, pref: DateFormatPreference): string {
  const then = new Date(iso).getTime();
  const minutes = Math.floor((Date.now() - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(iso, pref);
}

/** Same as formatDate, plus a time — hours:minutes only, never seconds. */
export function formatDateTime(iso: string, pref: DateFormatPreference): string {
  const d = new Date(iso);
  let hours = d.getHours();
  const minutes = pad(d.getMinutes());
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${formatDate(iso, pref)}, ${hours}:${minutes} ${ampm}`;
}
