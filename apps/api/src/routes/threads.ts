import { Router } from "express";
import { createThreadSchema, updateThreadSchema } from "@nyps-forum/shared";
import { prisma } from "../db";
import { optionalAuth, requireAdmin, requireAuth, requireVerified } from "../middleware/auth";
import { DELETED_AUTHOR, toPublicUser } from "../lib/serialize";
import { hotScore, recomputeThreadHotScore } from "../lib/ranking";
import { writeLimiter } from "../lib/rate-limit";
import { syncMentions } from "../lib/mentions";

export const threadsRouter = Router();

const DEFAULT_FEED_LIMIT = 20;
const DEFAULT_REPLIES_LIMIT = 20;

threadsRouter.get("/", optionalAuth, async (req, res) => {
  const sort = req.query.sort === "new" ? "new" : "hot";
  const tagSlug = req.query.tag as string | undefined;
  const viewerId = req.user?.id;
  const limit = Math.min(Number(req.query.limit) || DEFAULT_FEED_LIMIT, 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  const where = {
    deletedAt: null,
    ...(tagSlug ? { tags: { some: { slug: tagSlug } } } : {}),
  };

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
        _count: { select: { posts: { where: { deletedAt: null } }, likes: true } },
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
      posts: {
        orderBy: { createdAt: "asc" },
        include: { author: true, likes: true, _count: { select: { likes: true } } },
      },
    },
  });
  if (!thread) return res.status(404).json({ error: "Thread not found" });

  const viewerId = req.user?.id;
  // A soft-deleted thread keeps its page so surviving replies stay readable,
  // but its own content and author are tombstoned.
  const threadDeleted = Boolean(thread.deletedAt);

  // Anyone with an account (even unverified) reads in full — only truly
  // anonymous visitors, who by construction only exist on the web (the
  // mobile app requires an account before it lets you in at all), get a
  // truncated preview instead of the real content.
  const isAnonymous = !viewerId;
  const PREVIEW_LENGTH = 220;
  let body = isAnonymous && thread.body.length > PREVIEW_LENGTH
    ? `${thread.body.slice(0, PREVIEW_LENGTH)}…`
    : thread.body;
  if (threadDeleted) body = "";

  const allPosts = thread.posts;
  const byParentId = new Map<string, typeof allPosts>();
  for (const p of allPosts) {
    if (p.parentId) {
      const siblings = byParentId.get(p.parentId);
      if (siblings) siblings.push(p);
      else byParentId.set(p.parentId, [p]);
    }
  }

  // A deleted post is dropped entirely unless something visible survives
  // below it, in which case it stays as a tombstone so the tree doesn't
  // orphan (flattenPostTree on the client needs every parent present).
  const keepMemo = new Map<string, boolean>();
  function keepPost(p: (typeof allPosts)[number]): boolean {
    const memo = keepMemo.get(p.id);
    if (memo !== undefined) return memo;
    const kept =
      !p.deletedAt || (byParentId.get(p.id) ?? []).some((child) => keepPost(child));
    keepMemo.set(p.id, kept);
    return kept;
  }
  const visiblePosts = allPosts.filter((p) => keepPost(p));
  const liveReplyCount = allPosts.filter((p) => !p.deletedAt).length;

  // Paginate by top-level reply, but always include a paginated top-level
  // reply's full descendant tree — cutting a page mid-tree would orphan
  // nested replies whose parent didn't make the page.
  const topLevel = visiblePosts.filter((p) => !p.parentId);
  const repliesTotal = topLevel.length;
  const pageTopLevel = topLevel.slice(repliesOffset, repliesOffset + repliesLimit);

  const includedIds = new Set<string>();
  function includeWithDescendants(postId: string) {
    includedIds.add(postId);
    for (const child of byParentId.get(postId) ?? []) {
      includeWithDescendants(child.id);
    }
  }
  for (const p of pageTopLevel) includeWithDescendants(p.id);

  const pagePosts = isAnonymous
    ? []
    : visiblePosts.filter((p) => includedIds.has(p.id));

  res.json({
    thread: {
      id: thread.id,
      title: threadDeleted ? "[deleted]" : thread.title,
      body,
      previewOnly: isAnonymous,
      deleted: threadDeleted,
      locked: thread.locked,
      author: threadDeleted ? DELETED_AUTHOR : toPublicUser(thread.author),
      createdAt: thread.createdAt.toISOString(),
      editedAt: threadDeleted ? null : thread.editedAt?.toISOString() ?? null,
      tags: thread.tags.map((tag) => ({
        id: tag.id,
        slug: tag.slug,
        name: tag.name,
        description: tag.description,
      })),
      likeCount: thread.likes.length,
      myLiked: viewerId ? thread.likes.some((l) => l.userId === viewerId) : false,
      postCount: liveReplyCount,
      repliesTotal,
      repliesLimit,
      repliesOffset,
      hasMoreReplies: repliesOffset + pageTopLevel.length < repliesTotal,
      posts: pagePosts.map((p) =>
        p.deletedAt
          ? {
              id: p.id,
              threadId: p.threadId,
              parentId: p.parentId,
              body: "",
              author: DELETED_AUTHOR,
              createdAt: p.createdAt.toISOString(),
              editedAt: null,
              deleted: true,
              likeCount: 0,
              myLiked: false,
            }
          : {
              id: p.id,
              threadId: p.threadId,
              parentId: p.parentId,
              body: p.body,
              author: toPublicUser(p.author),
              createdAt: p.createdAt.toISOString(),
              editedAt: p.editedAt?.toISOString() ?? null,
              deleted: false,
              likeCount: p._count.likes,
              myLiked: viewerId ? p.likes.some((l) => l.userId === viewerId) : false,
            },
      ),
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
  await syncMentions({ authorId: req.user!.id, body, threadId: thread.id });

  res.status(201).json({ thread: { id: thread.id } });
});

threadsRouter.patch("/:id", requireAuth, writeLimiter, async (req, res) => {
  const parsed = updateThreadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const thread = await prisma.thread.findUnique({ where: { id: req.params.id } });
  if (!thread || thread.deletedAt) return res.status(404).json({ error: "Thread not found" });

  const isAdmin = req.user!.role === "admin";
  const isAuthor = thread.authorId === req.user!.id;
  // Only the author (still verified) or an admin — the UI hiding the button
  // is not the enforcement.
  if (!isAdmin && !(isAuthor && req.user!.verificationStatus === "VERIFIED")) {
    return res.status(403).json({ error: "You can only edit your own threads" });
  }
  // Locked means the discussion is frozen, edits included; admins can
  // unlock first if they truly need to change something.
  if (thread.locked && !isAdmin) {
    return res.status(403).json({ error: "This thread is locked" });
  }

  const { title, body, tagIds } = parsed.data;
  if (tagIds && tagIds.length > 0) {
    const count = await prisma.tag.count({ where: { id: { in: tagIds } } });
    if (count !== tagIds.length) {
      return res.status(400).json({ error: "One or more tags are invalid" });
    }
  }

  await prisma.thread.update({
    where: { id: thread.id },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(body !== undefined ? { body } : {}),
      ...(tagIds !== undefined ? { tags: { set: tagIds.map((id) => ({ id })) } } : {}),
      editedAt: new Date(),
    },
  });
  if (body !== undefined) {
    await syncMentions({ authorId: thread.authorId, body, threadId: thread.id });
  }

  res.json({ ok: true });
});

threadsRouter.delete("/:id", requireAuth, writeLimiter, async (req, res) => {
  const thread = await prisma.thread.findUnique({ where: { id: req.params.id } });
  if (!thread || thread.deletedAt) return res.status(404).json({ error: "Thread not found" });

  const isAdmin = req.user!.role === "admin";
  if (!isAdmin && thread.authorId !== req.user!.id) {
    return res.status(403).json({ error: "You can only delete your own threads" });
  }

  // Soft delete: replies under it survive (see GET /:id); the opening post's
  // mentions are cleared so they can't become notifications later.
  await prisma.thread.update({ where: { id: thread.id }, data: { deletedAt: new Date() } });
  await syncMentions({ authorId: thread.authorId, body: "", threadId: thread.id });

  res.json({ deleted: true });
});

threadsRouter.post("/:id/like", requireAuth, requireVerified, writeLimiter, async (req, res) => {
  const threadId = req.params.id;
  const thread = await prisma.thread.findUnique({ where: { id: threadId } });
  if (!thread || thread.deletedAt) return res.status(404).json({ error: "Thread not found" });

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
