import { extractMentionUserIds } from "@nyps-forum/shared";
import { prisma } from "./db";

// Backstop against someone pasting hundreds of profile links into one post —
// each row is a future notification (brief 05).
const MAX_MENTIONS = 20;

/**
 * Re-derives the Mention rows for one thread or post from its current body,
 * called on create, edit, and delete (with body "" to clear). Mentions of
 * yourself, of deleted accounts, and across a block in either direction are
 * skipped — a blocked pair must never generate a notification. The rows are
 * synced (add new, drop stale) rather than recreated so an edit doesn't
 * reset createdAt on mentions that were already there.
 *
 * Returns the user ids of *newly created* mentions only — the ones that
 * should produce a notification — so an edit never re-notifies people who
 * were already mentioned.
 */
export async function syncMentions(source: {
  authorId: string;
  body: string;
  threadId?: string;
  postId?: string;
}): Promise<string[]> {
  const { authorId, body } = source;
  const where = source.postId
    ? { postId: source.postId }
    : { threadId: source.threadId, postId: null };

  const candidateIds = extractMentionUserIds(body)
    .filter((id) => id !== authorId)
    .slice(0, MAX_MENTIONS);

  let validIds: string[] = [];
  if (candidateIds.length > 0) {
    const users = await prisma.user.findMany({
      where: {
        id: { in: candidateIds },
        deletedAt: null,
        // No mention survives a block in either direction.
        blocking: { none: { blockedId: authorId } },
        blockedBy: { none: { blockerId: authorId } },
      },
      select: { id: true },
    });
    validIds = users.map((u) => u.id);
  }

  const existing = await prisma.mention.findMany({ where, select: { id: true, userId: true } });
  const existingByUser = new Map(existing.map((m) => [m.userId, m.id]));
  const wanted = new Set(validIds);

  const staleIds = existing.filter((m) => !wanted.has(m.userId)).map((m) => m.id);
  const newUserIds = validIds.filter((id) => !existingByUser.has(id));

  await prisma.$transaction([
    ...(staleIds.length > 0
      ? [prisma.mention.deleteMany({ where: { id: { in: staleIds } } })]
      : []),
    ...newUserIds.map((userId) =>
      prisma.mention.create({
        data: {
          userId,
          authorId,
          threadId: source.threadId ?? null,
          postId: source.postId ?? null,
        },
      }),
    ),
  ]);

  return newUserIds;
}
