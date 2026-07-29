import { Router } from "express";
import { createPostSchema, updatePostSchema } from "@nyps-forum/shared";
import { prisma } from "../db";
import { requireAuth, requireVerified } from "../middleware/auth";
import { recomputeThreadHotScore } from "../lib/ranking";
import { writeLimiter } from "../lib/rate-limit";
import { syncMentions } from "../lib/mentions";

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

  if (parentId) {
    const parent = await prisma.post.findUnique({ where: { id: parentId } });
    if (!parent || parent.threadId !== threadId) {
      return res.status(400).json({ error: "Invalid parent post" });
    }
  }

  const post = await prisma.post.create({
    data: { threadId, body, parentId: parentId ?? null, authorId: req.user!.id },
  });
  await syncMentions({ authorId: req.user!.id, body, postId: post.id });
  await recomputeThreadHotScore(threadId);

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
  await syncMentions({ authorId: post.authorId, body: parsed.data.body, postId: post.id });

  res.json({ ok: true });
});

postsRouter.delete("/:id", requireAuth, writeLimiter, async (req, res) => {
  const post = await prisma.post.findUnique({ where: { id: req.params.id } });
  if (!post || post.deletedAt) return res.status(404).json({ error: "Post not found" });

  const isAdmin = req.user!.role === "admin";
  if (!isAdmin && post.authorId !== req.user!.id) {
    return res.status(403).json({ error: "You can only delete your own replies" });
  }

  // Soft delete: if replies exist below it, GET /threads/:id serializes this
  // post as a "[deleted]" tombstone instead of orphaning them.
  await prisma.post.update({ where: { id: post.id }, data: { deletedAt: new Date() } });
  await syncMentions({ authorId: post.authorId, body: "", postId: post.id });
  await recomputeThreadHotScore(post.threadId);

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
  res.json({ liked: true });
});
