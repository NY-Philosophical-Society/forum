import { Router } from "express";
import { createBookmarkSchema, type ThreadSummary } from "@nyps-forum/shared";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";
import { toPublicUser } from "../lib/serialize";

export const bookmarksRouter = Router();

const DEFAULT_LIMIT = 20;

/**
 * Saved threads, most recently saved first. Deleted threads are filtered at
 * read time rather than unsaved — and this `where` is where the brief-04
 * chapter-visibility filter must land, so a saved thread the user has since
 * lost access to never leaks back through their saved list.
 */
bookmarksRouter.get("/", requireAuth, async (req, res) => {
  const myId = req.user!.id;
  const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  const where = { userId: myId, thread: { deletedAt: null } };
  const [bookmarks, total] = await Promise.all([
    prisma.bookmark.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
      include: {
        thread: {
          include: {
            author: true,
            tags: true,
            likes: { where: { userId: myId } },
            _count: { select: { posts: { where: { deletedAt: null } }, likes: true } },
          },
        },
      },
    }),
    prisma.bookmark.count({ where }),
  ]);

  const threads: ThreadSummary[] = bookmarks.map(({ thread: t }) => ({
    id: t.id,
    title: t.title,
    author: toPublicUser(t.author),
    createdAt: t.createdAt.toISOString(),
    tags: t.tags.map((tag) => ({ id: tag.id, slug: tag.slug, name: tag.name, description: tag.description })),
    likeCount: t._count.likes,
    myLiked: t.likes.length > 0,
    postCount: t._count.posts,
    locked: t.locked,
    pinnedAt: t.pinnedAt?.toISOString() ?? null,
    myBookmarked: true,
  }));

  res.json({ threads, total, limit, offset, hasMore: offset + bookmarks.length < total });
});

bookmarksRouter.post("/", requireAuth, async (req, res) => {
  const parsed = createBookmarkSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { threadId } = parsed.data;
  const thread = await prisma.thread.findUnique({ where: { id: threadId } });
  if (!thread || thread.deletedAt) return res.status(404).json({ error: "Thread not found" });

  await prisma.bookmark.upsert({
    where: { userId_threadId: { userId: req.user!.id, threadId } },
    update: {},
    create: { userId: req.user!.id, threadId },
  });
  res.status(201).json({ bookmarked: true });
});

bookmarksRouter.delete("/:threadId", requireAuth, async (req, res) => {
  await prisma.bookmark.deleteMany({
    where: { userId: req.user!.id, threadId: req.params.threadId },
  });
  res.json({ bookmarked: false });
});
