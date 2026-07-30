import type { ModerationAction } from "@nyps-forum/shared";
import { prisma } from "../db";

/**
 * The single write path into the moderation log. Every admin mutation in the
 * API routes through here — one helper rather than an inline prisma.create per
 * endpoint, so adding a new moderation route and forgetting the audit record
 * takes a deliberate omission rather than an oversight.
 *
 * Unlike notify(), this deliberately does NOT swallow errors: a moderation
 * action whose audit record failed to write must fail loudly. "We banned
 * someone and nobody knows who or why" is the exact failure this table exists
 * to prevent, so the mutation should surface a 500 rather than complete
 * unrecorded.
 *
 * There is no update or delete counterpart, here or anywhere else in the API.
 */
export async function logModeration(entry: {
  actorId: string;
  action: ModerationAction;
  targetType: "user" | "thread" | "post" | "report" | "chapter";
  targetId: string;
  /** Captured at action time so the entry survives the target being deleted. */
  targetLabel?: string | null;
  reason?: string | null;
  /** Action-specific extras, serialized to JSON (e.g. the originating report). */
  detail?: Record<string, unknown> | null;
}): Promise<void> {
  await prisma.moderationLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      targetLabel: entry.targetLabel ?? null,
      reason: entry.reason?.trim() || null,
      detail: entry.detail ? JSON.stringify(entry.detail) : null,
    },
  });
}

/** Short one-line label for a thread/post in the log and the reports queue. */
export function contentLabel(text: string, max = 80): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}
