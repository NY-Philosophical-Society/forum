import { Router } from "express";
import {
  adminDeleteSchema,
  createThreadSchema,
  MAX_PINNED_THREADS,
  pinThreadSchema,
  toggleLockSchema,
  updateThreadSchema,
} from "@nyps-forum/shared";
import { prisma } from "../db";
import { optionalAuth, requireAdmin, requireAuth, requireVerified } from "../middleware/auth";
import { DELETED_AUTHOR, toPublicUser } from "../lib/serialize";
import { hotScore, recomputeThreadHotScore } from "../lib/ranking";
import { adminLimiter, writeLimiter } from "../lib/rate-limit";
import { syncMentions } from "../lib/mentions";
import { contentLabel, logModeration } from "../lib/moderation-log";
import { softDeleteThread } from "../lib/moderation";
import { notify, toSnippet } from "../lib/notifications";
import { canViewThread, isActiveChapterMember } from "../lib/chapter-access";

export const threadsRouter = Router();

const DEFAULT_FEED_LIMIT = 20;
const DEFAULT_REPLIES_LIMIT = 20;

threadsRouter.get("/", optionalAuth, async (req, res) => {
  const sort = req.query.sort === "new" ? "new" : "hot";
  const tagSlug = req.query.tag as string | undefined;
  const viewerId = req.user?.id;
  const limit = Math.min(Number(req.query.limit) || DEFAULT_FEED_LIMIT, 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  // The main feed is main-feed threads only: chapter threads appear solely in
  // their chapter's own feed (GET /api/chapters/:slug/threads), for anyone.
  const where = {
    deletedAt: null,
    chapterId: null,
    ...(tagSlug ? { tags: { some: { slug: tagSlug } } } : {}),
  };

  const [threads, total] = await Promise.all([
    prisma.thread.findMany({
      where,
      // Both sorts are plain DB-level ORDER BYs now — hotScore is kept
      // current by recomputeThreadHotScore() on every like/reply instead of
      // being recomputed by fetching and sorting every thread per request.
      // Pins ride in front of either sort as a separate column: SQLite puts
      // NULLs last on DESC, so unpinned threads fall through to their real
      // order and hotScore is never touched by a pin.
      orderBy: [
        { pinnedAt: "desc" },
        sort === "new" ? { createdAt: "desc" } : { hotScore: "desc" },
      ],
      skip: offset,
      take: limit,
      include: {
        author: true,
        tags: true,
        likes: viewerId ? { where: { userId: viewerId } } : false,
        bookmarks: viewerId ? { where: { userId: viewerId } } : false,
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
      pinnedAt: t.pinnedAt?.toISOString() ?? null,
      myBookmarked: viewerId ? t.bookmarks.length > 0 : false,
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
      chapter: { select: { id: true, slug: true, name: true } },
      bookmarks: req.user ? { where: { userId: req.user.id } } : false,
      posts: {
        orderBy: { createdAt: "asc" },
        include: { author: true, likes: true, _count: { select: { likes: true } } },
      },
    },
  });
  if (!thread) return res.status(404).json({ error: "Thread not found" });
  // Chapter threads are invisible to anyone who isn't an active member of
  // that chapter (admins excepted) — 404, not 403, so a probed id doesn't
  // even confirm the thread exists.
  if (!(await canViewThread(req.user, thread))) {
    return res.status(404).json({ error: "Thread not found" });
  }

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
      pinnedAt: thread.pinnedAt?.toISOString() ?? null,
      chapter: thread.chapter,
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
      myBookmarked: viewerId ? thread.bookmarks.length > 0 : false,
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
  const { title, body, tagIds, chapterId } = parsed.data;

  if (tagIds.length > 0) {
    const count = await prisma.tag.count({ where: { id: { in: tagIds } } });
    if (count !== tagIds.length) {
      return res.status(400).json({ error: "One or more tags are invalid" });
    }
  }

  // Starting a thread inside a chapter needs an active membership there
  // (admins excepted) — same 404-over-403 policy as reading, so an outsider
  // can't use this route to probe which chapter ids exist.
  if (chapterId) {
    const chapter = await prisma.chapter.findUnique({ where: { id: chapterId } });
    if (!chapter) return res.status(404).json({ error: "Chapter not found" });
    const isAdmin = req.user!.role === "admin";
    if (!isAdmin && !(await isActiveChapterMember(req.user!.id, chapterId))) {
      return res.status(404).json({ error: "Chapter not found" });
    }
  }

  const createdAt = new Date();
  const thread = await prisma.thread.create({
    data: {
      title,
      body,
      authorId: req.user!.id,
      createdAt,
      chapterId: chapterId ?? null,
      hotScore: hotScore(0, 0, createdAt),
      tags: { connect: tagIds.map((id) => ({ id })) },
    },
  });
  const newMentions = await syncMentions({ authorId: req.user!.id, body, threadId: thread.id });
  for (const userId of newMentions) {
    await notify({
      type: "mention",
      recipientId: userId,
      actorId: req.user!.id,
      threadId: thread.id,
      snippet: toSnippet(body),
    });
  }

  res.status(201).json({ thread: { id: thread.id } });
});

threadsRouter.patch("/:id", requireAuth, writeLimiter, async (req, res) => {
  const parsed = updateThreadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const thread = await prisma.thread.findUnique({ where: { id: req.params.id } });
  if (!thread || thread.deletedAt) return res.status(404).json({ error: "Thread not found" });
  // Same invisibility rule as reading: an outsider probing a chapter thread's
  // id through the edit route must not learn it exists.
  if (!(await canViewThread(req.user, thread))) {
    return res.status(404).json({ error: "Thread not found" });
  }

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
    const newMentions = await syncMentions({ authorId: thread.authorId, body, threadId: thread.id });
    for (const userId of newMentions) {
      await notify({
        type: "mention",
        recipientId: userId,
        actorId: thread.authorId,
        threadId: thread.id,
        snippet: toSnippet(body),
      });
    }
  }

  res.json({ ok: true });
});

threadsRouter.delete("/:id", requireAuth, writeLimiter, async (req, res) => {
  const thread = await prisma.thread.findUnique({ where: { id: req.params.id } });
  if (!thread || thread.deletedAt) return res.status(404).json({ error: "Thread not found" });
  if (!(await canViewThread(req.user, thread))) {
    return res.status(404).json({ error: "Thread not found" });
  }

  const isAdmin = req.user!.role === "admin";
  const isAuthor = thread.authorId === req.user!.id;
  if (!isAdmin && !isAuthor) {
    return res.status(403).json({ error: "You can only delete your own threads" });
  }

  // An admin removing someone else's thread owes the log a reason; authors
  // deleting their own work don't (it isn't a moderation action).
  const moderating = isAdmin && !isAuthor;
  let reason: string | null = null;
  if (moderating) {
    const parsed = adminDeleteSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }
    reason = parsed.data.reason;
  }

  // Soft delete — the same tombstone an author's own deletion produces, so
  // replies under it survive and there's only one deletion semantics.
  await softDeleteThread(thread.id, thread.authorId);
  if (moderating) {
    await logModeration({
      actorId: req.user!.id,
      action: "content_deleted",
      targetType: "thread",
      targetId: thread.id,
      targetLabel: contentLabel(thread.title),
      reason,
      detail: { authorId: thread.authorId },
    });
  }

  res.json({ deleted: true });
});

threadsRouter.post("/:id/like", requireAuth, requireVerified, writeLimiter, async (req, res) => {
  const threadId = req.params.id;
  const thread = await prisma.thread.findUnique({ where: { id: threadId } });
  if (!thread || thread.deletedAt) return res.status(404).json({ error: "Thread not found" });
  if (!(await canViewThread(req.user, thread))) {
    return res.status(404).json({ error: "Thread not found" });
  }

  const existing = await prisma.threadLike.findUnique({
    where: { threadId_userId: { threadId, userId: req.user!.id } },
  });

  if (existing) {
    await prisma.threadLike.delete({ where: { id: existing.id } });
  } else {
    await prisma.threadLike.create({ data: { threadId, userId: req.user!.id } });
    await notify({
      type: "like_thread",
      recipientId: thread.authorId,
      actorId: req.user!.id,
      threadId,
      snippet: toSnippet(thread.title),
    });
  }
  await recomputeThreadHotScore(threadId);

  res.json({ liked: !existing });
});

threadsRouter.post("/:id/lock", requireAuth, requireAdmin, adminLimiter, async (req, res) => {
  const parsed = toggleLockSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const thread = await prisma.thread.findUnique({ where: { id: req.params.id } });
  if (!thread) return res.status(404).json({ error: "Thread not found" });

  const updated = await prisma.thread.update({
    where: { id: thread.id },
    data: { locked: !thread.locked },
  });
  await logModeration({
    actorId: req.user!.id,
    action: updated.locked ? "thread_locked" : "thread_unlocked",
    targetType: "thread",
    targetId: thread.id,
    targetLabel: contentLabel(thread.title),
    reason: parsed.data.reason ?? null,
  });

  res.json({ locked: updated.locked });
});

/**
 * Pin a thread above the feed. Capped at MAX_PINNED_THREADS and enforced here,
 * not in the UI — the whole point of the cap is that the feed can't be buried,
 * and a client that skips the check shouldn't be able to bury it.
 */
threadsRouter.post("/:id/pin", requireAuth, requireAdmin, adminLimiter, async (req, res) => {
  const parsed = pinThreadSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const thread = await prisma.thread.findUnique({ where: { id: req.params.id } });
  if (!thread || thread.deletedAt) return res.status(404).json({ error: "Thread not found" });
  if (thread.pinnedAt) {
    return res.json({ pinnedAt: thread.pinnedAt.toISOString() });
  }

  const pinned = await prisma.thread.count({ where: { pinnedAt: { not: null }, deletedAt: null } });
  if (pinned >= MAX_PINNED_THREADS) {
    return res.status(409).json({
      error: `${MAX_PINNED_THREADS} threads are already pinned — unpin one first so the feed stays readable.`,
    });
  }

  const updated = await prisma.thread.update({
    where: { id: thread.id },
    data: { pinnedAt: new Date() },
  });
  await logModeration({
    actorId: req.user!.id,
    action: "thread_pinned",
    targetType: "thread",
    targetId: thread.id,
    targetLabel: contentLabel(thread.title),
    reason: parsed.data.reason ?? null,
  });

  res.json({ pinnedAt: updated.pinnedAt!.toISOString() });
});

threadsRouter.delete("/:id/pin", requireAuth, requireAdmin, adminLimiter, async (req, res) => {
  const thread = await prisma.thread.findUnique({ where: { id: req.params.id } });
  if (!thread) return res.status(404).json({ error: "Thread not found" });
  if (!thread.pinnedAt) return res.json({ pinnedAt: null });

  await prisma.thread.update({ where: { id: thread.id }, data: { pinnedAt: null } });
  await logModeration({
    actorId: req.user!.id,
    action: "thread_unpinned",
    targetType: "thread",
    targetId: thread.id,
    targetLabel: contentLabel(thread.title),
  });

  res.json({ pinnedAt: null });
});
