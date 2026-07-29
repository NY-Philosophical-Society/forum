/**
 * @mentions travel inside post bodies as ordinary markdown links to a
 * profile page — `[@Ada Lovelace](/u/ck...)` — so every renderer shows them
 * as links for free and no second syntax needs parsing. These helpers are
 * the single definition of that convention: composers insert with
 * mentionMarkdown(), the API re-parses with extractMentionUserIds() to keep
 * the structural Mention table in sync (see apps/api/src/lib/mentions.ts).
 */

const MENTION_LINK_RE = /\]\(\/u\/([A-Za-z0-9]+)\)/g;

export function mentionMarkdown(displayName: string, userId: string): string {
  // Brackets/parens in a display name would break out of the link syntax.
  const safe = displayName.replace(/[[\]()]/g, "").trim();
  return `[@${safe}](/u/${userId})`;
}

/** Unique user ids linked as /u/<id> anywhere in the markdown, in order. */
export function extractMentionUserIds(markdown: string): string[] {
  const ids = new Set<string>();
  for (const match of markdown.matchAll(MENTION_LINK_RE)) {
    ids.add(match[1]);
  }
  return [...ids];
}
