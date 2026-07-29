import { Router } from "express";
import { createPostSchema } from "@nyps-forum/shared";
import { prisma } from "../db";
import { requireAuth, requireVerified } from "../middleware/auth";
import { recomputeThreadHotScore } from "../lib/ranking";
import { writeLimiter } from "../lib/rate-limit";

export const postsRouter = Router();

postsRouter.post("/", requireAuth, requireVerified, writeLimiter, async (req, res) => {
  const parsed = createPostSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { threadId, body, parentId } = parsed.data;

  const thread = await prisma.thread.findUnique({ where: { id: threadId } });
  if (!thread) return res.status(404).json({ error: "Thread not found" });
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
  await recomputeThreadHotScore(threadId);

  res.status(201).json({ post: { id: post.id } });
});

postsRouter.post("/:id/like", requireAuth, requireVerified, writeLimiter, async (req, res) => {
  const postId = req.params.id;
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) return res.status(404).json({ error: "Post not found" });

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
