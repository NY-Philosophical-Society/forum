import { Router } from "express";
import { sendMessageSchema } from "@nyps-forum/shared";
import { prisma } from "../db";
import { requireAuth, requireVerified } from "../middleware/auth";
import { toPublicUser } from "../lib/serialize";
import { writeLimiter } from "../lib/rate-limit";

export const messagesRouter = Router();

const DEFAULT_MESSAGES_LIMIT = 30;

function serializeMessage(m: {
  id: string;
  senderId: string;
  recipientId: string;
  body: string;
  createdAt: Date;
  readAt: Date | null;
}) {
  return {
    id: m.id,
    senderId: m.senderId,
    recipientId: m.recipientId,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
    readAt: m.readAt ? m.readAt.toISOString() : null,
  };
}

/** One row per person you've exchanged messages with, most recent first. */
messagesRouter.get("/conversations", requireAuth, async (req, res) => {
  const myId = req.user!.id;

  const messages = await prisma.message.findMany({
    where: { OR: [{ senderId: myId }, { recipientId: myId }] },
    orderBy: { createdAt: "desc" },
    include: { sender: true, recipient: true },
  });

  const byOtherUser = new Map<
    string,
    { otherUser: (typeof messages)[number]["sender"]; lastMessage: (typeof messages)[number]; unreadCount: number }
  >();

  for (const m of messages) {
    const otherUser = m.senderId === myId ? m.recipient : m.sender;
    const existing = byOtherUser.get(otherUser.id);
    const isUnreadIncoming = m.recipientId === myId && !m.readAt;

    if (!existing) {
      byOtherUser.set(otherUser.id, {
        otherUser,
        lastMessage: m,
        unreadCount: isUnreadIncoming ? 1 : 0,
      });
    } else if (isUnreadIncoming) {
      existing.unreadCount += 1;
    }
  }

  res.json({
    conversations: Array.from(byOtherUser.values()).map((c) => ({
      otherUser: toPublicUser(c.otherUser),
      lastMessage: serializeMessage(c.lastMessage),
      unreadCount: c.unreadCount,
    })),
  });
});

/**
 * Message thread with one other user, most recent page first; marks their
 * messages to you as read. `offset` pages further back into history —
 * `offset=0` (the default) is the most recent `limit` messages.
 */
messagesRouter.get("/:userId", requireAuth, async (req, res) => {
  const myId = req.user!.id;
  const otherId = req.params.userId;
  const limit = Math.min(Number(req.query.limit) || DEFAULT_MESSAGES_LIMIT, 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  const otherUser = await prisma.user.findUnique({ where: { id: otherId } });
  if (!otherUser) return res.status(404).json({ error: "User not found" });

  await prisma.message.updateMany({
    where: { senderId: otherId, recipientId: myId, readAt: null },
    data: { readAt: new Date() },
  });

  const where = {
    OR: [
      { senderId: myId, recipientId: otherId },
      { senderId: otherId, recipientId: myId },
    ],
  };

  const [messages, total] = await Promise.all([
    prisma.message.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
    }),
    prisma.message.count({ where }),
  ]);
  messages.reverse(); // oldest-first for display, having fetched newest-first for pagination

  res.json({
    otherUser: toPublicUser(otherUser),
    messages: messages.map(serializeMessage),
    total,
    limit,
    offset,
    hasMore: offset + messages.length < total,
  });
});

messagesRouter.post("/", requireAuth, requireVerified, writeLimiter, async (req, res) => {
  const parsed = sendMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { recipientId, body } = parsed.data;

  if (recipientId === req.user!.id) {
    return res.status(400).json({ error: "You can't message yourself" });
  }

  const recipient = await prisma.user.findUnique({ where: { id: recipientId } });
  if (!recipient) return res.status(404).json({ error: "Recipient not found" });

  const block = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: req.user!.id, blockedId: recipientId },
        { blockerId: recipientId, blockedId: req.user!.id },
      ],
    },
  });
  if (block) {
    return res.status(403).json({ error: "You can't message this user" });
  }

  const message = await prisma.message.create({
    data: { senderId: req.user!.id, recipientId, body },
  });

  res.status(201).json({ message: serializeMessage(message) });
});
