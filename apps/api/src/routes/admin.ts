import { Router } from "express";
import {
  MAX_PINNED_THREADS,
  type AdminThreadSummary,
  type AdminUserSummary,
  type ModerationAction,
  type ModerationLogEntry,
  type PublicUser,
} from "@nyps-forum/shared";
import { prisma } from "../db";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { toPublicUser } from "../lib/serialize";

/**
 * Read side of the admin dashboard. Every route here sits behind requireAuth +
 * requireAdmin — the same gate the mutations use, because a hidden nav link is
 * not access control. Mutations live with the resources they change
 * (routes/users.ts, routes/threads.ts, routes/reports.ts) so there's one place
 * per resource enforcing its rules.
 */
export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

const DEFAULT_LIMIT = 25;

adminRouter.get("/users", async (req, res) => {
  const search = (req.query.search as string | undefined)?.trim();
  const role = req.query.role === "admin" || req.query.role === "user" ? req.query.role : undefined;
  const verification = ["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED"].includes(
    String(req.query.verification),
  )
    ? String(req.query.verification)
    : undefined;
  const banned = req.query.banned === "1";
  const supporter = req.query.supporter === "1";
  const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  const where = {
    ...(search
      ? {
          OR: [
            { displayName: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(role ? { role } : {}),
    ...(verification ? { verificationStatus: verification } : {}),
    ...(banned ? { bannedAt: { not: null } } : {}),
    ...(supporter ? { isSupporter: true } : {}),
  };

  const [rows, total, adminCount] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
      include: {
        _count: {
          select: {
            threads: { where: { deletedAt: null } },
            posts: { where: { deletedAt: null } },
          },
        },
      },
    }),
    prisma.user.count({ where }),
    // Drives the last-admin guard's UI affordance; the guard itself is enforced
    // in POST /api/users/:id/role.
    prisma.user.count({ where: { role: "admin", deletedAt: null } }),
  ]);

  // Open reports filed directly against these members. Reports about their
  // content are counted in the queue, not here — one groupBy beats N joins.
  const reportCounts = await prisma.report.groupBy({
    by: ["targetId"],
    where: { status: "open", targetType: "user", targetId: { in: rows.map((u) => u.id) } },
    _count: { _all: true },
  });
  const reportsByUser = new Map(reportCounts.map((r) => [r.targetId, r._count._all]));

  const users: AdminUserSummary[] = rows.map((u) => ({
    id: u.id,
    displayName: u.displayName,
    email: u.email,
    avatarUrl: u.avatarUrl,
    verificationStatus: u.verificationStatus as AdminUserSummary["verificationStatus"],
    role: u.role as AdminUserSummary["role"],
    isSupporter: u.isSupporter,
    bannedAt: u.bannedAt?.toISOString() ?? null,
    deletedAt: u.deletedAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
    threadCount: u._count.threads,
    replyCount: u._count.posts,
    openReportCount: reportsByUser.get(u.id) ?? 0,
  }));

  res.json({ users, total, limit, offset, hasMore: offset + rows.length < total, adminCount });
});

adminRouter.get("/threads", async (req, res) => {
  const search = (req.query.search as string | undefined)?.trim();
  const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  const where = {
    ...(search ? { title: { contains: search, mode: "insensitive" as const } } : {}),
    ...(req.query.pinned === "1" ? { pinnedAt: { not: null } } : {}),
    ...(req.query.locked === "1" ? { locked: true } : {}),
    // Deleted threads are hidden by default but reachable, since an admin may
    // need to confirm a removal actually happened.
    ...(req.query.deleted === "1" ? { deletedAt: { not: null } } : { deletedAt: null }),
  };

  const [rows, total, pinnedCount] = await Promise.all([
    prisma.thread.findMany({
      where,
      orderBy: [{ pinnedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      skip: offset,
      take: limit,
      include: {
        author: true,
        _count: { select: { likes: true, posts: { where: { deletedAt: null } } } },
      },
    }),
    prisma.thread.count({ where }),
    prisma.thread.count({ where: { pinnedAt: { not: null }, deletedAt: null } }),
  ]);

  const threads: AdminThreadSummary[] = rows.map((t) => ({
    id: t.id,
    title: t.title,
    author: toPublicUser(t.author),
    createdAt: t.createdAt.toISOString(),
    locked: t.locked,
    pinnedAt: t.pinnedAt?.toISOString() ?? null,
    deleted: Boolean(t.deletedAt),
    likeCount: t._count.likes,
    postCount: t._count.posts,
  }));

  res.json({
    threads,
    total,
    limit,
    offset,
    hasMore: offset + rows.length < total,
    pinnedCount,
    pinLimit: MAX_PINNED_THREADS,
  });
});

/**
 * The moderation log, newest first. Read-only by design: there is no POST,
 * PATCH, or DELETE for this resource anywhere in the API. It's the record a
 * nonprofit board relies on to reconstruct what happened, so it can't be
 * editable by the same people it holds accountable.
 */
adminRouter.get("/log", async (req, res) => {
  const action = req.query.action as string | undefined;
  const targetId = req.query.targetId as string | undefined;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  const where = {
    ...(action ? { action } : {}),
    ...(targetId ? { targetId } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.moderationLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
      include: { actor: true },
    }),
    prisma.moderationLog.count({ where }),
  ]);

  const entries: ModerationLogEntry[] = rows.map((e) => ({
    id: e.id,
    // A deleted admin account is anonymized, but the action still happened.
    actor: e.actor.deletedAt ? (null as PublicUser | null) : toPublicUser(e.actor),
    action: e.action as ModerationAction,
    targetType: e.targetType,
    targetId: e.targetId,
    targetLabel: e.targetLabel,
    reason: e.reason,
    createdAt: e.createdAt.toISOString(),
  }));

  res.json({ entries, total, limit, offset, hasMore: offset + rows.length < total });
});
