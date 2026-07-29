import { prisma } from "../db";

/**
 * Reddit-style "hot" ranking, adapted for a likes-only (no downvotes) feed.
 * Engagement (likes + a smaller weight for replies, since a reply is a
 * heavier signal to produce than a like but shouldn't dominate) sets the
 * order of magnitude; a thread's creation time sets a fixed bonus relative to
 * other threads. Same shape as Reddit's original algorithm
 * (log10(score) + seconds-since-epoch/45000), just without the sign term
 * since scores can't go negative here.
 *
 * Crucially, `createdAt` is the thread's own creation time, not "now" — so
 * this score is NOT a function of the current moment. It only ever changes
 * when likeCount/replyCount change, which is exactly what makes it safe to
 * compute once and store (see recomputeThreadHotScore below) instead of
 * recomputing for every thread on every feed request.
 */
export function hotScore(likeCount: number, replyCount: number, createdAt: Date): number {
  const engagement = likeCount + replyCount * 0.5;
  const order = Math.log10(Math.max(engagement, 1));
  const seconds = createdAt.getTime() / 1000 - 1134028003; // Reddit's original epoch offset (2005-12-08)
  return order + seconds / 45000;
}

/** Call after any like/unlike or new reply on a thread to keep its stored hotScore current. */
export async function recomputeThreadHotScore(threadId: string): Promise<void> {
  const thread = await prisma.thread.findUnique({
    where: { id: threadId },
    select: {
      createdAt: true,
      _count: { select: { likes: true, posts: true } },
    },
  });
  if (!thread) return;

  const score = hotScore(thread._count.likes, thread._count.posts, thread.createdAt);
  await prisma.thread.update({ where: { id: threadId }, data: { hotScore: score } });
}
