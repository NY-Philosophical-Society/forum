import { Router } from "../router";
import {
  markNotificationsReadSchema,
  updateNotificationPrefsSchema,
  type NotificationItem,
  type NotificationPreferences,
  type NotificationType,
} from "@nyps-forum/shared";
import { prisma } from "../db";
import { requireAuth } from "../guards";
import { toPublicUser } from "../serialize";
import { visibleThreadWhere } from "../chapter-access";

export const notificationsRouter = Router();

const DEFAULT_LIMIT = 20;

notificationsRouter.get("/", requireAuth, async (req, res) => {
  const myId = req.user!.id;
  const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  // Defense in depth on top of emission-time gating and removal-time purge:
  // a row about a chapter thread the viewer can no longer open is filtered
  // out here rather than served with its title and snippet.
  const visibility =
    req.user!.role === "admin"
      ? {}
      : { OR: [{ threadId: null }, { thread: visibleThreadWhere(req.user) }] };

  const [notifications, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { recipientId: myId, ...visibility },
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
      include: {
        actor: true,
        thread: { select: { title: true, deletedAt: true } },
      },
    }),
    prisma.notification.count({ where: { recipientId: myId, ...visibility } }),
    prisma.notification.count({ where: { recipientId: myId, readAt: null, ...visibility } }),
  ]);

  const items: NotificationItem[] = notifications.map((n) => ({
    id: n.id,
    type: n.type as NotificationType,
    actor: toPublicUser(n.actor),
    count: n.count,
    threadId: n.threadId,
    postId: n.postId,
    threadTitle: n.thread ? (n.thread.deletedAt ? "[deleted]" : n.thread.title) : null,
    snippet: n.snippet,
    createdAt: n.createdAt.toISOString(),
    readAt: n.readAt ? n.readAt.toISOString() : null,
  }));

  res.json({
    notifications: items,
    total,
    limit,
    offset,
    hasMore: offset + notifications.length < total,
    unreadCount,
  });
});

/**
 * The nav badge poll (every 15s alongside the DM unread poll) — kept to a
 * single COUNT on the (recipientId, readAt) index, nothing else. No chapter
 * filter here on purpose: rows about invisible chapter content are never
 * created (emission gate in lib/notifications.ts) and are purged when a
 * membership is removed (routes/chapters.ts), so this count can't include one.
 */
notificationsRouter.get("/unread-count", requireAuth, async (req, res) => {
  const unreadCount = await prisma.notification.count({
    where: { recipientId: req.user!.id, readAt: null },
  });
  res.json({ unreadCount });
});

notificationsRouter.post("/read", requireAuth, async (req, res) => {
  const parsed = markNotificationsReadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  await prisma.notification.updateMany({
    where: { id: { in: parsed.data.ids }, recipientId: req.user!.id, readAt: null },
    data: { readAt: new Date() },
  });
  res.json({ ok: true });
});

notificationsRouter.post("/read-all", requireAuth, async (req, res) => {
  await prisma.notification.updateMany({
    where: { recipientId: req.user!.id, readAt: null },
    data: { readAt: new Date() },
  });
  res.json({ ok: true });
});

function toPreferences(
  rows: { key: string; enabled: boolean }[],
): NotificationPreferences {
  const byKey = new Map(rows.map((r) => [r.key, r.enabled]));
  return {
    master: byKey.get("master") ?? true,
    replies: byKey.get("replies") ?? true,
    likes: byKey.get("likes") ?? true,
    mentions: byKey.get("mentions") ?? true,
    messages: byKey.get("messages") ?? true,
  };
}

notificationsRouter.get("/preferences", requireAuth, async (req, res) => {
  const rows = await prisma.notificationPreference.findMany({
    where: { userId: req.user!.id },
  });
  res.json({ preferences: toPreferences(rows) });
});

notificationsRouter.put("/preferences", requireAuth, async (req, res) => {
  const parsed = updateNotificationPrefsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const userId = req.user!.id;
  const entries = Object.entries(parsed.data).filter(([, v]) => v !== undefined) as [
    string,
    boolean,
  ][];
  await prisma.$transaction(
    entries.map(([key, enabled]) =>
      prisma.notificationPreference.upsert({
        where: { userId_key: { userId, key } },
        update: { enabled },
        create: { userId, key, enabled },
      }),
    ),
  );
  const rows = await prisma.notificationPreference.findMany({ where: { userId } });
  res.json({ preferences: toPreferences(rows) });
});
