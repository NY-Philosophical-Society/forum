import { Router } from "express";
import { createThreadSchema } from "@nyps-forum/shared";
import { prisma } from "../db";
import { optionalAuth, requireAuth, requireVerified } from "../middleware/auth";
import { toPublicUser } from "../lib/serialize";
import { hotScore } from "../lib/ranking";

export const threadsRouter = Router();

threadsRouter.get("/", optionalAuth, async (req, res) => {
  const sort = req.query.sort === "new" ? "new" : "hot";
  const tagSlug = req.query.tag as string | undefined;
  const viewerId = req.user?.id;

  const threads = await prisma.thread.findMany({
    where: tagSlug ? { tags: { some: { slug: tagSlug } } } : undefined,
    orderBy: sort === "new" ? { createdAt: "desc" } : undefined,
    include: {
      author: true,
      tags: true,
      likes: viewerId ? { where: { userId: viewerId } } : false,
      _count: { select: { posts: true, likes: true } },
    },
  });

  const summaries = threads.map((t) => ({
    id: t.id,
    title: t.title,
    author: toPublicUser(t.author),
    createdAt: t.createdAt,
    tags: t.tags.map((tag) => ({ id: tag.id, slug: tag.slug, name: tag.name, description: tag.description })),
    likeCount: t._count.likes,
    myLiked: viewerId ? t.likes.length > 0 : false,
    postCount: t._count.posts,
    _hot: hotScore(t._count.likes, t._count.posts, t.createdAt),
  }));

  if (sort === "hot") {
    summaries.sort((a, b) => b._hot - a._hot);
  }

  res.json({
    threads: summaries.map(({ _hot, ...rest }) => ({
      ...rest,
      createdAt: rest.createdAt.toISOString(),
    })),
  });
});

threadsRouter.get("/:id", optionalAuth, async (req, res) => {
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

  res.json({
    thread: {
      id: thread.id,
      title: thread.title,
      body,
      previewOnly: isAnonymous,
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
      posts: isAnonymous
        ? []
        : thread.posts.map((p) => ({
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

threadsRouter.post("/", requireAuth, requireVerified, async (req, res) => {
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

  const thread = await prisma.thread.create({
    data: {
      title,
      body,
      authorId: req.user!.id,
      tags: { connect: tagIds.map((id) => ({ id })) },
    },
  });

  res.status(201).json({ thread: { id: thread.id } });
});

threadsRouter.post("/:id/like", requireAuth, requireVerified, async (req, res) => {
  const threadId = req.params.id;
  const thread = await prisma.thread.findUnique({ where: { id: threadId } });
  if (!thread) return res.status(404).json({ error: "Thread not found" });

  const existing = await prisma.threadLike.findUnique({
    where: { threadId_userId: { threadId, userId: req.user!.id } },
  });

  if (existing) {
    await prisma.threadLike.delete({ where: { id: existing.id } });
    return res.json({ liked: false });
  }

  await prisma.threadLike.create({ data: { threadId, userId: req.user!.id } });
  res.json({ liked: true });
});
