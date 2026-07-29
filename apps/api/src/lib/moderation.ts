import type { ReportTargetPreview, ReportTargetType } from "@nyps-forum/shared";
import { prisma } from "../db";
import { syncMentions } from "./mentions";
import { recomputeThreadHotScore } from "./ranking";
import { DELETED_AUTHOR, toPublicUser } from "./serialize";

/** A target that no longer exists, or never did — reports carry a bare id, not an FK. */
const MISSING: Omit<ReportTargetPreview, "kind"> = {
  threadId: null,
  postId: null,
  title: null,
  body: null,
  author: null,
  createdAt: null,
  deleted: false,
  locked: false,
  missing: true,
};

/**
 * The reported content, resolved for inlining into the admin queue — an admin
 * shouldn't have to navigate away to judge a report. Soft-deleted content is
 * still returned (marked `deleted`) because the record of what was reported
 * matters even after it's gone; the *author* of deleted content is tombstoned
 * exactly as it is for readers.
 */
export async function loadReportTarget(
  targetType: ReportTargetType,
  targetId: string,
): Promise<ReportTargetPreview> {
  if (targetType === "thread") {
    const thread = await prisma.thread.findUnique({
      where: { id: targetId },
      include: { author: true },
    });
    if (!thread) return { kind: targetType, ...MISSING };
    return {
      kind: targetType,
      threadId: thread.id,
      postId: null,
      title: thread.deletedAt ? "[deleted]" : thread.title,
      body: thread.deletedAt ? null : thread.body,
      author: thread.deletedAt ? DELETED_AUTHOR : toPublicUser(thread.author),
      createdAt: thread.createdAt.toISOString(),
      deleted: Boolean(thread.deletedAt),
      locked: thread.locked,
      missing: false,
    };
  }

  if (targetType === "post") {
    const post = await prisma.post.findUnique({
      where: { id: targetId },
      include: { author: true, thread: { select: { id: true, title: true, locked: true } } },
    });
    if (!post) return { kind: targetType, ...MISSING };
    return {
      kind: targetType,
      threadId: post.thread.id,
      postId: post.id,
      title: post.thread.title,
      body: post.deletedAt ? null : post.body,
      author: post.deletedAt ? DELETED_AUTHOR : toPublicUser(post.author),
      createdAt: post.createdAt.toISOString(),
      deleted: Boolean(post.deletedAt),
      locked: post.thread.locked,
      missing: false,
    };
  }

  if (targetType === "message") {
    const message = await prisma.message.findUnique({
      where: { id: targetId },
      include: { sender: true },
    });
    if (!message) return { kind: targetType, ...MISSING };
    return {
      kind: targetType,
      threadId: null,
      postId: null,
      title: "Direct message",
      body: message.body,
      author: toPublicUser(message.sender),
      createdAt: message.createdAt.toISOString(),
      deleted: false,
      locked: false,
      missing: false,
    };
  }

  const user = await prisma.user.findUnique({ where: { id: targetId } });
  if (!user) return { kind: targetType, ...MISSING };
  return {
    kind: targetType,
    threadId: null,
    postId: null,
    title: user.deletedAt ? "[deleted]" : user.displayName,
    body: user.bio,
    author: user.deletedAt ? DELETED_AUTHOR : toPublicUser(user),
    createdAt: user.createdAt.toISOString(),
    deleted: Boolean(user.deletedAt),
    locked: false,
    missing: false,
  };
}

/** The author whose conduct a report is about, for warn/ban actions. */
export async function reportTargetAuthorId(
  targetType: ReportTargetType,
  targetId: string,
): Promise<string | null> {
  switch (targetType) {
    case "thread": {
      const t = await prisma.thread.findUnique({ where: { id: targetId } });
      return t?.authorId ?? null;
    }
    case "post": {
      const p = await prisma.post.findUnique({ where: { id: targetId } });
      return p?.authorId ?? null;
    }
    case "message": {
      const m = await prisma.message.findUnique({ where: { id: targetId } });
      return m?.senderId ?? null;
    }
    case "user":
      return targetId;
  }
}

/**
 * Soft-delete a thread. Extracted so admin deletion (from the dashboard or a
 * report) and author deletion are literally the same code path — the brief is
 * explicit that admin removal reuses the brief-03 tombstone rather than
 * inventing a second deletion semantics.
 */
export async function softDeleteThread(threadId: string, authorId: string): Promise<void> {
  await prisma.thread.update({ where: { id: threadId }, data: { deletedAt: new Date() } });
  // Clear the opening post's mentions so they can't become notifications later.
  await syncMentions({ authorId, body: "", threadId });
}

export async function softDeletePost(postId: string, authorId: string, threadId: string) {
  await prisma.post.update({ where: { id: postId }, data: { deletedAt: new Date() } });
  await syncMentions({ authorId, body: "", postId });
  await recomputeThreadHotScore(threadId);
}
