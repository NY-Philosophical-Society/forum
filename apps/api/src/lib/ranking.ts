/**
 * Reddit-style "hot" ranking, adapted for a likes-only (no downvotes) feed.
 * Engagement (likes + a smaller weight for replies, since a reply is a
 * heavier signal to produce than a like but shouldn't dominate) sets the
 * order of magnitude; recency shifts it — an old, heavily-liked thread still
 * eventually sinks below a fresh one. Same shape as Reddit's original
 * algorithm (log10(score) + seconds-since-epoch/45000), just without the
 * sign term since scores can't go negative here.
 */
export function hotScore(likeCount: number, replyCount: number, createdAt: Date): number {
  const engagement = likeCount + replyCount * 0.5;
  const order = Math.log10(Math.max(engagement, 1));
  const seconds = createdAt.getTime() / 1000 - 1134028003; // Reddit's original epoch offset (2005-12-08)
  return order + seconds / 45000;
}
