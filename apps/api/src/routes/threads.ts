import { Router } from "express";
import { createThreadSchema } from "@nyps-forum/shared";
import { prisma } from "../db";
import { optionalAuth, requireAdmin, requireAuth, requireVerified } from "../middleware/auth";
import { toPublicUser } from "../lib/serialize";
import { hotScore, recomputeThreadHotScore } from "../lib/ranking";
import { writeLimiter } from "../lib/rate-limit";

export const threadsRouter = Router();

const DEFAULT_FEED_LIMIT = 20;
const DEFAULT_REPLIES_LIMIT = 20;

threadsRouter.get("/", optionalAuth, async (req, res) => {
  const sort = req.query.sort === "new" ? "new" : "hot";
  const tagSlug = req.query.tag as string | undefined;
  const viewerId = req.user?.id;
  const limit = Math.min(Number(req.query.limit) || DEFAULT_FEED_LIMIT, 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  const where = tagSlug ? { tags: { some: { slug: tagSlug } } } : undefined;

  const [threads, total] = await Promise.all([
    prisma.thread.findMany({
      where,
      // Both sorts are plain DB-level ORDER BYs now — hotScore is kept
      // current by recomputeThreadHotScore() on every like/reply instead of
      // being recomputed by fetching and sorting every thread per request.
      orderBy: sort === "new" ? { createdAt: "desc" } : { hotScore: "desc" },
      skip: offset,
      take: limit,
      include: {
        author: true,
        tags: true,
        likes: viewerId ? { where: { userId: viewerId } } : false,
        _count: { select: { posts: true, likes: true } },
      },
    }),
    prisma.thread.count({ where }),
  ]);

  res.json({
    threads: threads.map((t) => ({
      id: t.id,
      title: t.title,
      author: toPublicUser(t.author),
      createdAt: t.createdAt.toISOString(),
      tags: t.tags.map((tag) => ({ id: tag.id, slug: tag.slug, name: tag.name, description: tag.description })),
      likeCount: t._count.likes,
      myLiked: viewerId ? t.likes.length > 0 : false,
      postCount: t._count.posts,
      locked: t.locked,
    })),
    total,
    limit,
    offset,
    hasMore: offset + threads.length < total,
  });
});

threadsRouter.get("/:id", optionalAuth, async (req, res) => {
  const repliesLimit = Math.min(Number(req.query.repliesLimit) || DEFAULT_REPLIES_LIMIT, 100);
  const repliesOffset = Math.max(Number(req.query.repliesOffset) || 0, 0);

  const thread = await prisma.thread.findUnique({
    where: { id: req.params.id },
    include: {
      author: true,
      tags: true,
      likes: true,
      _count: { select: { posts: true, likes: true } },
      posts: {
        orderBy: { createdAt: "asc" },
        include: { author: true, likes: true, _count: { select: { likes: true } } },
      },
    },
  });
  if (!thread) return res.status(404).json({ error: "Thread not found" });

  const viewerId = req.user?.id;
  // Anyone with an account (even unverified) reads in full — only truly
  // anonymous visitors, who by construction only exist on the web (the
  // mobile app requires an account before it lets you in at all), get a
  // truncated preview instead of the real content.
  const isAnonymous = !viewerId;
  const PREVIEW_LENGTH = 220;
  const body = isAnonymous && thread.body.length > PREVIEW_LENGTH
    ? `${thread.body.slice(0, PREVIEW_LENGTH)}…`
    : thread.body;

  // Paginate by top-level reply, but always include a paginated top-level
  // reply's full descendant tree — cutting a page mid-tree would orphan
  // nested replies whose parent didn't make the page.
  const topLevel = thread.posts.filter((p) => !p.parentId);
  const repliesTotal = topLevel.length;
  const pageTopLevel = topLevel.slice(repliesOffset, repliesOffset + repliesLimit);

  const includedIds = new Set<string>();
  const byParentId = new Map<string, typeof thread.posts>();
  for (const p of thread.posts) {
    if (p.parentId) {
      const siblings = byParentId.get(p.parentId);
      if (siblings) siblings.push(p);
      else byParentId.set(p.parentId, [p]);
    }
  }
  function includeWithDescendants(postId: string) {
    includedIds.add(postId);
    for (const child of byParentId.get(postId) ?? []) {
      includeWithDescendants(child.id);
    }
  }
  for (const p of pageTopLevel) includeWithDescendants(p.id);

  const pagePosts = isAnonymous ? [] : thread.posts.filter((p) => includedIds.has(p.id));

  res.json({
    thread: {
      id: thread.id,
      title: thread.title,
      body,
      previewOnly: isAnonymous,
      locked: thread.locked,
      author: toPublicUser(thread.author),
      createdAt: thread.createdAt.toISOString(),
      tags: thread.tags.map((tag) => ({
        id: tag.id,
        slug: tag.slug,
        name: tag.name,
        description: tag.description,
      })),
      likeCount: thread._count.likes,
      myLiked: viewerId ? thread.likes.some((l) => l.userId === viewerId) : false,
      postCount: thread.posts.length,
      repliesTotal,
      repliesLimit,
      repliesOffset,
      hasMoreReplies: repliesOffset + pageTopLevel.length < repliesTotal,
      posts: pagePosts.map((p) => ({
        id: p.id,
        threadId: p.threadId,
        parentId: p.parentId,
        body: p.body,
        author: toPublicUser(p.author),
        createdAt: p.createdAt.toISOString(),
        likeCount: p._count.likes,
        myLiked: viewerId ? p.likes.some((l) => l.userId === viewerId) : false,
      })),
    },
  });
});

threadsRouter.post("/", requireAuth, requireVerified, writeLimiter, async (req, res) => {
  const parsed = createThreadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { title, body, tagIds } = parsed.data;

  if (tagIds.length > 0) {
    const count = await prisma.tag.count({ where: { id: { in: tagIds } } });
    if (count !== tagIds.length) {
      return res.status(400).json({ error: "One or more tags are invalid" });
    }
  }

  const createdAt = new Date();
  const thread = await prisma.thread.create({
    data: {
      title,
      body,
      authorId: req.user!.id,
      createdAt,
      hotScore: hotScore(0, 0, createdAt),
      tags: { connect: tagIds.map((id) => ({ id })) },
    },
  });

  res.status(201).json({ thread: { id: thread.id } });
});

threadsRouter.post("/:id/like", requireAuth, requireVerified, writeLimiter, async (req, res) => {
  const threadId = req.params.id;
  const thread = await prisma.thread.findUnique({ where: { id: threadId } });
  if (!thread) return res.status(404).json({ error: "Thread not found" });

  const existing = await prisma.threadLike.findUnique({
    where: { threadId_userId: { threadId, userId: req.user!.id } },
  });

  if (existing) {
    await prisma.threadLike.delete({ where: { id: existing.id } });
  } else {
    await prisma.threadLike.create({ data: { threadId, userId: req.user!.id } });
  }
  await recomputeThreadHotScore(threadId);

  res.json({ liked: !existing });
});

threadsRouter.post("/:id/lock", requireAuth, requireAdmin, async (req, res) => {
  const thread = await prisma.thread.findUnique({ where: { id: req.params.id } });
  if (!thread) return res.status(404).json({ error: "Thread not found" });

  const updated = await prisma.thread.update({
    where: { id: thread.id },
    data: { locked: !thread.locked },
  });

  res.json({ locked: updated.locked });
});
