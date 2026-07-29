import {
  prefKeyForNotificationType,
  stripMarkdown,
  type NotificationPrefKey,
  type NotificationType,
} from "@nyps-forum/shared";
import { prisma } from "../db";
import { pushProvider } from "./push-provider";

const SNIPPET_LENGTH = 140;
// Backstop on the per-row JSON actor list; `count` keeps counting past it.
const MAX_TRACKED_ACTORS = 50;

/** Plain-text excerpt of a markdown body, for notification rows and pushes. */
export function toSnippet(body: string): string {
  const text = stripMarkdown(body).replace(/\s+/g, " ").trim();
  return text.length > SNIPPET_LENGTH ? `${text.slice(0, SNIPPET_LENGTH)}…` : text;
}

export interface NotifyEvent {
  type: NotificationType;
  recipientId: string;
  actorId: string;
  threadId?: string;
  postId?: string;
  snippet?: string;
}

/**
 * Whether the recipient is allowed to see the content the notification is
 * about. Today everything a notification can point at is readable by any
 * account, so this is constant — it exists so brief 04's chapter-visibility
 * rules have exactly one place to land for notifications: never emit about
 * content the recipient can't open.
 */
async function canRecipientSee(_recipientId: string, _threadId?: string): Promise<boolean> {
  return true;
}

async function prefsAllow(userId: string, key: NotificationPrefKey): Promise<boolean> {
  const rows = await prisma.notificationPreference.findMany({
    where: { userId, key: { in: ["master", key] } },
  });
  // Absent row = enabled.
  return rows.every((r) => r.enabled);
}

/**
 * The single entry point for every notification in the app. Owns the rules
 * the brief cares about — never notify someone about their own action, never
 * across a block in either direction, respect per-type preferences — plus
 * collapsing (likes per target, DMs per sender) and push fan-out. Never
 * throws: a notification failure must not fail the write that caused it.
 */
export async function notify(event: NotifyEvent): Promise<void> {
  try {
    const { type, recipientId, actorId, threadId, postId } = event;
    if (recipientId === actorId) return;

    // A moderation warning is the one notification the recipient has no say
    // over: it is not suppressed by preferences, by a block against the admin
    // who sent it, or by the recipient already being banned — they need to be
    // able to read why once they're back.
    const isModeration = type === "warning";

    const recipient = await prisma.user.findUnique({
      where: { id: recipientId },
      include: {
        blocking: { where: { blockedId: actorId } },
        blockedBy: { where: { blockerId: actorId } },
      },
    });
    if (!recipient || recipient.deletedAt) return;
    if (!isModeration) {
      if (recipient.bannedAt) return;
      if (recipient.blocking.length > 0 || recipient.blockedBy.length > 0) return;
      const prefKey = prefKeyForNotificationType(type);
      if (prefKey && !(await prefsAllow(recipientId, prefKey))) return;
      if (!(await canRecipientSee(recipientId, threadId))) return;
    }

    if (type === "like_thread" || type === "like_post") {
      // Collapse onto an existing unread row for the same target.
      const existing = await prisma.notification.findFirst({
        where: {
          recipientId,
          type,
          readAt: null,
          ...(type === "like_thread" ? { threadId } : { postId }),
        },
      });
      if (existing) {
        const actorIds = JSON.parse(existing.actorIds) as string[];
        // A like → unlike → like toggle must not inflate the count or
        // resurface the row.
        if (actorIds.includes(actorId)) return;
        await prisma.notification.update({
          where: { id: existing.id },
          data: {
            actorId,
            count: existing.count + 1,
            actorIds: JSON.stringify([...actorIds.slice(-MAX_TRACKED_ACTORS), actorId]),
            createdAt: new Date(),
          },
        });
        await sendPush(event);
        return;
      }
    }

    if (type === "message") {
      // Collapse onto the unread row for this sender: "3 new messages".
      const existing = await prisma.notification.findFirst({
        where: { recipientId, actorId, type: "message", readAt: null },
      });
      if (existing) {
        await prisma.notification.update({
          where: { id: existing.id },
          data: {
            count: existing.count + 1,
            snippet: event.snippet ?? existing.snippet,
            createdAt: new Date(),
          },
        });
        await sendPush(event);
        return;
      }
    }

    await prisma.notification.create({
      data: {
        recipientId,
        actorId,
        type,
        threadId: threadId ?? null,
        postId: postId ?? null,
        actorIds: JSON.stringify([actorId]),
        snippet: event.snippet ?? null,
      },
    });
    await sendPush(event);
  } catch (err) {
    console.error("notify() failed:", err);
  }
}

/** Push wording — the actor's name is the headline, the snippet the body. */
function pushTitle(type: NotificationType, actorName: string): string {
  switch (type) {
    case "reply_thread":
      return `${actorName} replied to your thread`;
    case "reply_post":
      return `${actorName} replied to your reply`;
    case "like_thread":
      return `${actorName} liked your thread`;
    case "like_post":
      return `${actorName} liked your reply`;
    case "mention":
      return `${actorName} mentioned you`;
    case "message":
      return `New message from ${actorName}`;
    case "warning":
      return "A moderation warning from the Society";
  }
}

async function sendPush(event: NotifyEvent): Promise<void> {
  const tokens = await prisma.pushToken.findMany({ where: { userId: event.recipientId } });
  if (tokens.length === 0) return;

  const [actor, badge] = await Promise.all([
    prisma.user.findUnique({ where: { id: event.actorId } }),
    prisma.notification.count({ where: { recipientId: event.recipientId, readAt: null } }),
  ]);
  if (!actor) return;

  const { staleTokens } = await pushProvider.send(
    tokens.map((t) => ({
      to: t.token,
      title: pushTitle(event.type, actor.displayName),
      body: event.snippet ?? "",
      data: {
        type: event.type,
        ...(event.threadId ? { threadId: event.threadId } : {}),
        ...(event.postId ? { postId: event.postId } : {}),
        actorId: event.actorId,
      },
      badge,
    })),
  );
  if (staleTokens.length > 0) {
    await prisma.pushToken.deleteMany({ where: { token: { in: staleTokens } } });
  }
}
