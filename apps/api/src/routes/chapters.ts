import { Router } from "express";
import {
  addChapterMemberSchema,
  createChapterSchema,
  type ChapterMemberItem,
  type ChapterSummary,
  type ThreadSummary,
} from "@nyps-forum/shared";
import { prisma } from "../db";
import { requireAdmin, requireAuth, requireMember } from "../middleware/auth";
import { toPublicUser } from "../lib/serialize";
import { adminLimiter, writeLimiter } from "../lib/rate-limit";
import { logModeration } from "../lib/moderation-log";
import { isActiveChapterMember } from "../lib/chapter-access";

export const chaptersRouter = Router();

const DEFAULT_FEED_LIMIT = 20;

/**
 * Everything here sits behind requireMember: chapters are a member perk, and
 * non-members get the membership pitch in the UI rather than data from the
 * API. Admins pass requireMember without isSupporter. Within a chapter,
 * *content* additionally requires an active membership — being a member of
 * the Society lets you see that chapters exist and request to join; only an
 * approved chapter membership (or the admin bypass) opens the chapter itself.
 */

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function loadChapter(slug: string) {
  return prisma.chapter.findUnique({ where: { slug } });
}

function toChapterSummary(
  chapter: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    location: string | null;
    createdAt: Date;
  },
  memberCount: number,
  myMembership: "none" | "pending" | "active",
  pendingCount?: number,
): ChapterSummary {
  return {
    id: chapter.id,
    slug: chapter.slug,
    name: chapter.name,
    description: chapter.description,
    location: chapter.location,
    createdAt: chapter.createdAt.toISOString(),
    memberCount,
    myMembership,
    ...(pendingCount !== undefined ? { pendingCount } : {}),
  };
}

/** The chapter directory: every chapter, with the viewer's join state. */
chaptersRouter.get("/", requireAuth, requireMember, async (req, res) => {
  const isAdmin = req.user!.role === "admin";
  const chapters = await prisma.chapter.findMany({
    orderBy: { name: "asc" },
    include: {
      memberships: { where: { userId: req.user!.id } },
      _count: { select: { memberships: { where: { state: "active" } } } },
    },
  });
  // Pending counts are admin-only detail; one grouped query covers all rows.
  const pendingByChapter = isAdmin
    ? await prisma.chapterMembership.groupBy({
        by: ["chapterId"],
        where: { state: "pending" },
        _count: true,
      })
    : [];

  res.json({
    chapters: chapters.map((c) =>
      toChapterSummary(
        c,
        c._count.memberships,
        (c.memberships[0]?.state as "pending" | "active" | undefined) ?? "none",
        isAdmin
          ? pendingByChapter.find((p) => p.chapterId === c.id)?._count ?? 0
          : undefined,
      ),
    ),
  });
});

/** Create a chapter (admin). Chapters are admin-created, never self-serve. */
chaptersRouter.post("/", requireAuth, requireAdmin, adminLimiter, async (req, res) => {
  const parsed = createChapterSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { name, description, location } = parsed.data;
  const slug = parsed.data.slug ?? slugify(name);
  if (!slug) {
    return res.status(400).json({ error: "Could not derive a slug from that name — provide one" });
  }

  const existing = await prisma.chapter.findUnique({ where: { slug } });
  if (existing) {
    return res.status(409).json({ error: `A chapter with the slug "${slug}" already exists` });
  }

  const chapter = await prisma.chapter.create({
    data: { name: name.trim(), slug, description: description.trim(), location: location?.trim() || null },
  });
  await logModeration({
    actorId: req.user!.id,
    action: "chapter_created",
    targetType: "chapter",
    targetId: chapter.id,
    targetLabel: chapter.name,
  });

  res.status(201).json({ chapter: toChapterSummary(chapter, 0, "none", 0) });
});

chaptersRouter.get("/:slug", requireAuth, requireMember, async (req, res) => {
  const chapter = await loadChapter(req.params.slug);
  if (!chapter) return res.status(404).json({ error: "Chapter not found" });

  const [memberCount, myMembership, pendingCount] = await Promise.all([
    prisma.chapterMembership.count({ where: { chapterId: chapter.id, state: "active" } }),
    prisma.chapterMembership.findFirst({
      where: { chapterId: chapter.id, userId: req.user!.id },
    }),
    req.user!.role === "admin"
      ? prisma.chapterMembership.count({ where: { chapterId: chapter.id, state: "pending" } })
      : Promise.resolve(undefined),
  ]);

  res.json({
    chapter: toChapterSummary(
      chapter,
      memberCount,
      (myMembership?.state as "pending" | "active" | undefined) ?? "none",
      pendingCount,
    ),
  });
});

/**
 * The chapter's feed. Same shape as GET /api/threads so both clients reuse
 * their feed components unchanged. Requires an *active* membership (or
 * admin) — a pending request or plain Society membership shows the chapter's
 * door, not its contents.
 */
chaptersRouter.get("/:slug/threads", requireAuth, requireMember, async (req, res) => {
  const chapter = await loadChapter(req.params.slug);
  if (!chapter) return res.status(404).json({ error: "Chapter not found" });

  const isAdmin = req.user!.role === "admin";
  if (!isAdmin && !(await isActiveChapterMember(req.user!.id, chapter.id))) {
    return res.status(403).json({ error: "You're not a member of this chapter yet" });
  }

  const sort = req.query.sort === "new" ? "new" : "hot";
  const viewerId = req.user!.id;
  const limit = Math.min(Number(req.query.limit) || DEFAULT_FEED_LIMIT, 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const where = { deletedAt: null, chapterId: chapter.id };

  const [threads, total] = await Promise.all([
    prisma.thread.findMany({
      where,
      orderBy: [
        // nulls: "last" is required on Postgres — see routes/threads.ts.
        { pinnedAt: { sort: "desc", nulls: "last" } },
        sort === "new" ? { createdAt: "desc" } : { hotScore: "desc" },
      ],
      skip: offset,
      take: limit,
      include: {
        author: true,
        tags: true,
        likes: { where: { userId: viewerId } },
        bookmarks: { where: { userId: viewerId } },
        _count: { select: { posts: { where: { deletedAt: null } }, likes: true } },
      },
    }),
    prisma.thread.count({ where }),
  ]);

  const items: ThreadSummary[] = threads.map((t) => ({
    id: t.id,
    title: t.title,
    author: toPublicUser(t.author),
    createdAt: t.createdAt.toISOString(),
    chapter: { id: chapter.id, slug: chapter.slug, name: chapter.name },
    kind: t.kind as "discussion" | "event",
    eventDate: t.eventDate?.toISOString() ?? null,
    tags: t.tags.map((tag) => ({ id: tag.id, slug: tag.slug, name: tag.name, description: tag.description })),
    likeCount: t._count.likes,
    myLiked: t.likes.length > 0,
    postCount: t._count.posts,
    locked: t.locked,
    pinnedAt: t.pinnedAt?.toISOString() ?? null,
    myBookmarked: t.bookmarks.length > 0,
  }));

  res.json({ threads: items, total, limit, offset, hasMore: offset + threads.length < total });
});

/**
 * Request to join (member self-serve → pending, an admin approves).
 * Idempotent: an existing request or membership is returned as-is.
 */
chaptersRouter.post("/:slug/join", requireAuth, requireMember, writeLimiter, async (req, res) => {
  const chapter = await loadChapter(req.params.slug);
  if (!chapter) return res.status(404).json({ error: "Chapter not found" });

  const existing = await prisma.chapterMembership.findUnique({
    where: { chapterId_userId: { chapterId: chapter.id, userId: req.user!.id } },
  });
  if (existing) {
    return res.json({ state: existing.state });
  }

  const membership = await prisma.chapterMembership.create({
    data: { chapterId: chapter.id, userId: req.user!.id, state: "pending" },
  });
  res.status(201).json({ state: membership.state });
});

/** Active members can see who else is in the room; pending list is admin-only. */
chaptersRouter.get("/:slug/members", requireAuth, requireMember, async (req, res) => {
  const chapter = await loadChapter(req.params.slug);
  if (!chapter) return res.status(404).json({ error: "Chapter not found" });

  const isAdmin = req.user!.role === "admin";
  if (!isAdmin && !(await isActiveChapterMember(req.user!.id, chapter.id))) {
    return res.status(403).json({ error: "You're not a member of this chapter yet" });
  }

  const rows = await prisma.chapterMembership.findMany({
    where: { chapterId: chapter.id, ...(isAdmin ? {} : { state: "active" }) },
    orderBy: { createdAt: "asc" },
    include: { user: true },
  });

  const toItem = (m: (typeof rows)[number]): ChapterMemberItem => ({
    user: toPublicUser(m.user),
    state: m.state as "pending" | "active",
    createdAt: m.createdAt.toISOString(),
  });
  const members = rows.filter((m) => m.state === "active" && !m.user.deletedAt).map(toItem);

  res.json({
    members,
    ...(isAdmin
      ? { pending: rows.filter((m) => m.state === "pending" && !m.user.deletedAt).map(toItem) }
      : {}),
  });
});

/** Admin adds someone directly — lands active, no request step. */
chaptersRouter.post("/:slug/members", requireAuth, requireAdmin, adminLimiter, async (req, res) => {
  const parsed = addChapterMemberSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const chapter = await loadChapter(req.params.slug);
  if (!chapter) return res.status(404).json({ error: "Chapter not found" });

  const target = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
  if (!target || target.deletedAt) return res.status(404).json({ error: "User not found" });

  await prisma.chapterMembership.upsert({
    where: { chapterId_userId: { chapterId: chapter.id, userId: target.id } },
    update: { state: "active", approvedAt: new Date() },
    create: { chapterId: chapter.id, userId: target.id, state: "active", approvedAt: new Date() },
  });
  await logModeration({
    actorId: req.user!.id,
    action: "chapter_member_added",
    targetType: "user",
    targetId: target.id,
    targetLabel: target.displayName,
    detail: { chapterId: chapter.id, chapterSlug: chapter.slug },
  });

  res.status(201).json({ state: "active" });
});

/** Admin approves a pending request. */
chaptersRouter.post(
  "/:slug/members/:userId/approve",
  requireAuth,
  requireAdmin,
  adminLimiter,
  async (req, res) => {
    const chapter = await loadChapter(req.params.slug);
    if (!chapter) return res.status(404).json({ error: "Chapter not found" });

    const membership = await prisma.chapterMembership.findUnique({
      where: { chapterId_userId: { chapterId: chapter.id, userId: req.params.userId } },
      include: { user: true },
    });
    if (!membership) return res.status(404).json({ error: "No join request from that user" });
    if (membership.state === "active") return res.json({ state: "active" });

    await prisma.chapterMembership.update({
      where: { id: membership.id },
      data: { state: "active", approvedAt: new Date() },
    });
    await logModeration({
      actorId: req.user!.id,
      action: "chapter_member_approved",
      targetType: "user",
      targetId: membership.userId,
      targetLabel: membership.user.displayName,
      detail: { chapterId: chapter.id, chapterSlug: chapter.slug },
    });

    res.json({ state: "active" });
  },
);

/**
 * Remove a membership (or reject a pending request). Admins may remove
 * anyone; a member may remove only themself (leave / withdraw a request).
 * Removal also purges the leaver's notifications about this chapter's
 * threads, so the unread badge can't keep pointing at content they can no
 * longer open.
 */
chaptersRouter.delete("/:slug/members/:userId", requireAuth, writeLimiter, async (req, res) => {
  const chapter = await loadChapter(req.params.slug);
  if (!chapter) return res.status(404).json({ error: "Chapter not found" });

  const targetUserId = req.params.userId;
  const isAdmin = req.user!.role === "admin";
  const isSelf = targetUserId === req.user!.id;
  if (!isAdmin && !isSelf) {
    return res.status(403).json({ error: "Only admins can remove other members" });
  }

  const membership = await prisma.chapterMembership.findUnique({
    where: { chapterId_userId: { chapterId: chapter.id, userId: targetUserId } },
    include: { user: true },
  });
  if (!membership) return res.json({ removed: false });

  await prisma.chapterMembership.delete({ where: { id: membership.id } });
  await prisma.notification.deleteMany({
    where: { recipientId: targetUserId, thread: { chapterId: chapter.id } },
  });
  if (isAdmin && !isSelf) {
    await logModeration({
      actorId: req.user!.id,
      action: "chapter_member_removed",
      targetType: "user",
      targetId: targetUserId,
      targetLabel: membership.user.displayName,
      detail: { chapterId: chapter.id, chapterSlug: chapter.slug, wasState: membership.state },
    });
  }

  res.json({ removed: true });
});
