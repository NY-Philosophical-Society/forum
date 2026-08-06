import { prisma } from "./db";

/**
 * Every chapter-visibility rule in the API goes through this module. The
 * invariant: chapter content is readable only by that chapter's *active*
 * members and admins — a pending request grants nothing, and losing the
 * membership loses the access. Enforced server-side on every route that can
 * return thread content (feed, detail, replies, likes, search, bookmarks,
 * notifications, profiles), never by UI hiding alone.
 */

interface Viewer {
  id: string;
  role: string;
}

export async function isActiveChapterMember(userId: string, chapterId: string): Promise<boolean> {
  const membership = await prisma.chapterMembership.findFirst({
    where: { userId, chapterId, state: "active" },
    select: { id: true },
  });
  return Boolean(membership);
}

/** May this viewer read the given thread at all? Main-feed threads: always. */
export async function canViewThread(
  viewer: Viewer | undefined,
  thread: { chapterId: string | null },
): Promise<boolean> {
  if (!thread.chapterId) return true;
  if (!viewer) return false;
  // Admins bypass member gating — moderating must not require donating.
  if (viewer.role === "admin") return true;
  return isActiveChapterMember(viewer.id, thread.chapterId);
}

/**
 * Prisma `where` fragment restricting a Thread query to what the viewer may
 * see. Used where saved/notified chapter threads may legitimately surface
 * (bookmarks, notifications). The main feed, search, and public profiles
 * exclude chapter threads outright instead — a chapter's feed is the only
 * listing that shows them.
 */
export function visibleThreadWhere(viewer: Viewer | undefined) {
  if (viewer?.role === "admin") return {};
  if (!viewer) return { chapterId: null };
  return {
    OR: [
      { chapterId: null },
      { chapter: { memberships: { some: { userId: viewer.id, state: "active" } } } },
    ],
  };
}
