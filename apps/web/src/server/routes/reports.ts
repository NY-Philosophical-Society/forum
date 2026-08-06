import { Router } from "../router";
import {
  createReportSchema,
  dismissReportSchema,
  resolveReportSchema,
  type ReportAction,
  type ReportCategory,
  type ReportStatus,
  type ReportSummary,
  type ReportTargetType,
} from "@nyps-forum/shared";
import { prisma } from "../db";
import { requireAdmin, requireAuth, requireVerified } from "../guards";
import { adminLimiter, writeLimiter } from "../rate-limit";
import { contentLabel, logModeration } from "../moderation-log";
import {
  loadReportTarget,
  reportTargetAuthorId,
  softDeletePost,
  softDeleteThread,
} from "../moderation";
import { notify } from "../notifications";
import { toPublicUser } from "../serialize";

export const reportsRouter = Router();

const DEFAULT_LIMIT = 20;
const VALID_STATUSES: ReportStatus[] = ["open", "resolved", "dismissed"];
const VALID_CATEGORIES: ReportCategory[] = [
  "harassment",
  "spam",
  "off_topic",
  "misinformation",
  "impersonation",
  "other",
];

reportsRouter.post("/", requireAuth, requireVerified, writeLimiter, async (req, res) => {
  const parsed = createReportSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { targetType, targetId, category, note } = parsed.data;

  const report = await prisma.report.create({
    data: {
      reporterId: req.user!.id,
      targetType,
      targetId,
      category,
      reason: note?.trim() || null,
    },
  });

  res.status(201).json({ report: { id: report.id } });
});

/**
 * The admin reports queue. Filterable by status and category, with the
 * reported content inlined so a report can be judged in place. Read-only —
 * every mutation is a separate, logged route below.
 */
reportsRouter.get("/", requireAuth, requireAdmin, async (req, res) => {
  const statusParam = req.query.status as string | undefined;
  const categoryParam = req.query.category as string | undefined;
  const status = VALID_STATUSES.includes(statusParam as ReportStatus)
    ? (statusParam as ReportStatus)
    : "open";
  const category = VALID_CATEGORIES.includes(categoryParam as ReportCategory)
    ? (categoryParam as ReportCategory)
    : undefined;
  const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  const where = { status, ...(category ? { category } : {}) };

  const [rows, total, openCount] = await Promise.all([
    prisma.report.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
      include: { reporter: true, resolvedBy: true },
    }),
    prisma.report.count({ where }),
    prisma.report.count({ where: { status: "open" } }),
  ]);

  const reports: ReportSummary[] = await Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      reporter: r.reporter.deletedAt ? null : toPublicUser(r.reporter),
      targetType: r.targetType as ReportTargetType,
      targetId: r.targetId,
      category: r.category as ReportCategory,
      note: r.reason,
      status: r.status as ReportStatus,
      createdAt: r.createdAt.toISOString(),
      resolvedBy: r.resolvedBy ? toPublicUser(r.resolvedBy) : null,
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
      resolutionAction: (r.resolutionAction as ReportAction | null) ?? null,
      resolutionNote: r.resolutionNote,
      target: await loadReportTarget(r.targetType as ReportTargetType, r.targetId),
    })),
  );

  res.json({ reports, total, limit, offset, hasMore: offset + rows.length < total, openCount });
});

/**
 * Resolve a report by carrying out one action and closing it in the same call.
 * Deliberately not two endpoints: a report that says "banned the author" must
 * not be able to exist without the ban having run. Every branch writes a
 * moderation-log entry naming the admin, the target, and the reason.
 */
reportsRouter.post("/:id/resolve", requireAuth, requireAdmin, adminLimiter, async (req, res) => {
  const parsed = resolveReportSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { action, reason } = parsed.data;

  const report = await prisma.report.findUnique({ where: { id: req.params.id } });
  if (!report) return res.status(404).json({ error: "Report not found" });
  if (report.status !== "open") {
    return res.status(409).json({ error: "That report has already been closed" });
  }

  const targetType = report.targetType as ReportTargetType;
  const adminId = req.user!.id;

  if (action === "delete_content") {
    if (targetType === "thread") {
      const thread = await prisma.thread.findUnique({ where: { id: report.targetId } });
      if (!thread) return res.status(404).json({ error: "The reported thread no longer exists" });
      // Already gone: close the report, but don't log a deletion that didn't
      // happen — the log must never claim an action that wasn't taken.
      if (!thread.deletedAt) {
        await softDeleteThread(thread.id, thread.authorId);
        await logModeration({
          actorId: adminId,
          action: "content_deleted",
          targetType: "thread",
          targetId: thread.id,
          targetLabel: contentLabel(thread.title),
          reason,
          detail: { reportId: report.id, authorId: thread.authorId },
        });
      }
    } else if (targetType === "post") {
      const post = await prisma.post.findUnique({ where: { id: report.targetId } });
      if (!post) return res.status(404).json({ error: "The reported reply no longer exists" });
      if (!post.deletedAt) {
        await softDeletePost(post.id, post.authorId, post.threadId);
        await logModeration({
          actorId: adminId,
          action: "content_deleted",
          targetType: "post",
          targetId: post.id,
          targetLabel: contentLabel(post.body),
          reason,
          detail: { reportId: report.id, authorId: post.authorId },
        });
      }
    } else {
      return res.status(400).json({
        error:
          targetType === "message"
            ? "Direct messages can't be deleted by an admin — warn or ban the sender instead."
            : "There's no content to delete on a member report — warn or ban them instead.",
      });
    }
  } else if (action === "warn_author" || action === "ban_author") {
    const authorId = await reportTargetAuthorId(targetType, report.targetId);
    if (!authorId) {
      return res.status(404).json({ error: "The reported member no longer exists" });
    }
    const author = await prisma.user.findUnique({ where: { id: authorId } });
    if (!author || author.deletedAt) {
      return res.status(404).json({ error: "The reported member no longer exists" });
    }

    if (action === "warn_author") {
      // The reason doubles as the message the member reads.
      await notify({ type: "warning", recipientId: author.id, actorId: adminId, snippet: reason });
      await logModeration({
        actorId: adminId,
        action: "user_warned",
        targetType: "user",
        targetId: author.id,
        targetLabel: author.displayName,
        reason,
        detail: { reportId: report.id },
      });
    } else {
      if (author.id === adminId) {
        return res.status(400).json({ error: "You can't ban yourself" });
      }
      if (!author.bannedAt) {
        await prisma.user.update({ where: { id: author.id }, data: { bannedAt: new Date() } });
      }
      await logModeration({
        actorId: adminId,
        action: "user_banned",
        targetType: "user",
        targetId: author.id,
        targetLabel: author.displayName,
        reason,
        detail: { reportId: report.id },
      });
    }
  } else if (action === "lock_thread") {
    const threadId =
      targetType === "thread"
        ? report.targetId
        : targetType === "post"
          ? (await prisma.post.findUnique({ where: { id: report.targetId } }))?.threadId ?? null
          : null;
    if (!threadId) {
      return res.status(400).json({ error: "That report doesn't point at a thread to lock" });
    }
    const thread = await prisma.thread.findUnique({ where: { id: threadId } });
    if (!thread) return res.status(404).json({ error: "The thread no longer exists" });
    if (!thread.locked) {
      await prisma.thread.update({ where: { id: thread.id }, data: { locked: true } });
      await logModeration({
        actorId: adminId,
        action: "thread_locked",
        targetType: "thread",
        targetId: thread.id,
        targetLabel: contentLabel(thread.title),
        reason,
        detail: { reportId: report.id },
      });
    }
  }

  const updated = await prisma.report.update({
    where: { id: report.id },
    data: {
      status: "resolved",
      resolvedById: adminId,
      resolvedAt: new Date(),
      resolutionAction: action,
      resolutionNote: reason,
    },
  });
  await logModeration({
    actorId: adminId,
    action: "report_resolved",
    targetType: "report",
    targetId: report.id,
    targetLabel: `${report.category} report on a ${report.targetType}`,
    reason,
    detail: { action, targetType: report.targetType, targetId: report.targetId },
  });

  res.json({ report: { id: updated.id, status: updated.status } });
});

reportsRouter.post("/:id/dismiss", requireAuth, requireAdmin, adminLimiter, async (req, res) => {
  const parsed = dismissReportSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const report = await prisma.report.findUnique({ where: { id: req.params.id } });
  if (!report) return res.status(404).json({ error: "Report not found" });
  if (report.status !== "open") {
    return res.status(409).json({ error: "That report has already been closed" });
  }

  const reason = parsed.data.reason?.trim() || null;
  await prisma.report.update({
    where: { id: report.id },
    data: {
      status: "dismissed",
      resolvedById: req.user!.id,
      resolvedAt: new Date(),
      resolutionNote: reason,
    },
  });
  await logModeration({
    actorId: req.user!.id,
    action: "report_dismissed",
    targetType: "report",
    targetId: report.id,
    targetLabel: `${report.category} report on a ${report.targetType}`,
    reason,
    detail: { targetType: report.targetType, targetId: report.targetId },
  });

  res.json({ report: { id: report.id, status: "dismissed" } });
});
