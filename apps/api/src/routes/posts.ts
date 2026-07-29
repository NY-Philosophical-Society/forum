import { Router } from "express";
import { adminDeleteSchema, createPostSchema, updatePostSchema } from "@nyps-forum/shared";
import { prisma } from "../db";
import { requireAuth, requireVerified } from "../middleware/auth";
import { recomputeThreadHotScore } from "../lib/ranking";
import { writeLimiter } from "../lib/rate-limit";
import { syncMentions } from "../lib/mentions";
import { contentLabel, logModeration } from "../lib/moderation-log";
import { softDeletePost } from "../lib/moderation";
import { notify, toSnippet } from "../lib/notifications";

export const postsRouter = Router();

postsRouter.post("/", requireAuth, requireVerified, writeLimiter, async (req, res) => {
  const parsed = createPostSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { threadId, body, parentId } = parsed.data;

  const thread = await prisma.thread.findUnique({ where: { id: threadId } });
  if (!thread || thread.deletedAt) return res.status(404).json({ error: "Thread not found" });
  if (thread.locked) return res.status(403).json({ error: "This thread is locked" });

  let parent: { authorId: string; deletedAt: Date | null } | null = null;
  if (parentId) {
    const found = await prisma.post.findUnique({ where: { id: parentId } });
    if (!found || found.threadId !== threadId) {
      return res.status(400).json({ error: "Invalid parent post" });
    }
    parent = found;
  }

  const post = await prisma.post.create({
    data: { threadId, body, parentId: parentId ?? null, authorId: req.user!.id },
  });
  const newMentions = await syncMentions({ authorId: req.user!.id, body, postId: post.id });
  await recomputeThreadHotScore(threadId);

  // A nested reply notifies the parent's author; a top-level one (or a reply
  // whose parent is a tombstone) notifies the thread author. Whoever that is
  // gets the reply notification, not a second one for being @mentioned too.
  const snippet = toSnippet(body);
  const replyRecipientId = parent && !parent.deletedAt ? parent.authorId : thread.authorId;
  await notify({
    type: parent && !parent.deletedAt ? "reply_post" : "reply_thread",
    recipientId: replyRecipientId,
    actorId: req.user!.id,
    threadId,
    postId: post.id,
    snippet,
  });
  for (const userId of newMentions) {
    if (userId === replyRecipientId) continue;
    await notify({
      type: "mention",
      recipientId: userId,
      actorId: req.user!.id,
      threadId,
      postId: post.id,
      snippet,
    });
  }

  res.status(201).json({ post: { id: post.id } });
});

postsRouter.patch("/:id", requireAuth, writeLimiter, async (req, res) => {
  const parsed = updatePostSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const post = await prisma.post.findUnique({
    where: { id: req.params.id },
    include: { thread: { select: { locked: true, deletedAt: true } } },
  });
  if (!post || post.deletedAt) return res.status(404).json({ error: "Post not found" });

  const isAdmin = req.user!.role === "admin";
  const isAuthor = post.authorId === req.user!.id;
  // Ownership is enforced here, not by the UI hiding the button.
  if (!isAdmin && !(isAuthor && req.user!.verificationStatus === "VERIFIED")) {
    return res.status(403).json({ error: "You can only edit your own replies" });
  }
  // A locked thread freezes its replies too; a deleted thread's surviving
  // replies stay readable but no longer editable.
  if ((post.thread.locked || post.thread.deletedAt) && !isAdmin) {
    return res.status(403).json({ error: "This thread is locked" });
  }

  await prisma.post.update({
    where: { id: post.id },
    data: { body: parsed.data.body, editedAt: new Date() },
  });
  // People newly @mentioned by the edit get notified; existing mentions don't
  // re-notify (syncMentions only returns the additions).
  const newMentions = await syncMentions({
    authorId: post.authorId,
    body: parsed.data.body,
    postId: post.id,
  });
  for (const userId of newMentions) {
    await notify({
      type: "mention",
      recipientId: userId,
      actorId: post.authorId,
      threadId: post.threadId,
      postId: post.id,
      snippet: toSnippet(parsed.data.body),
    });
  }

  res.json({ ok: true });
});

postsRouter.delete("/:id", requireAuth, writeLimiter, async (req, res) => {
  const post = await prisma.post.findUnique({ where: { id: req.params.id } });
  if (!post || post.deletedAt) return res.status(404).json({ error: "Post not found" });

  const isAdmin = req.user!.role === "admin";
  const isAuthor = post.authorId === req.user!.id;
  if (!isAdmin && !isAuthor) {
    return res.status(403).json({ error: "You can only delete your own replies" });
  }

  // An admin removing someone else's reply owes the log a reason; an author
  // deleting their own doesn't.
  const moderating = isAdmin && !isAuthor;
  let reason: string | null = null;
  if (moderating) {
    const parsed = adminDeleteSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }
    reason = parsed.data.reason;
  }

  // Soft delete: if replies exist below it, GET /threads/:id serializes this
  // post as a "[deleted]" tombstone instead of orphaning them.
  await softDeletePost(post.id, post.authorId, post.threadId);
  if (moderating) {
    await logModeration({
      actorId: req.user!.id,
      action: "content_deleted",
      targetType: "post",
      targetId: post.id,
      targetLabel: contentLabel(post.body),
      reason,
      detail: { authorId: post.authorId, threadId: post.threadId },
    });
  }

  res.json({ deleted: true });
});

postsRouter.post("/:id/like", requireAuth, requireVerified, writeLimiter, async (req, res) => {
  const postId = req.params.id;
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post || post.deletedAt) return res.status(404).json({ error: "Post not found" });

  const existing = await prisma.postLike.findUnique({
    where: { postId_userId: { postId, userId: req.user!.id } },
  });

  if (existing) {
    await prisma.postLike.delete({ where: { id: existing.id } });
    return res.json({ liked: false });
  }

  await prisma.postLike.create({ data: { postId, userId: req.user!.id } });
  await notify({
    type: "like_post",
    recipientId: post.authorId,
    actorId: req.user!.id,
    threadId: post.threadId,
    postId,
    snippet: toSnippet(post.body),
  });
  res.json({ liked: true });
});
