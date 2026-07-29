import { Router } from "express";
import { prisma } from "../db";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { toPublicUser } from "../lib/serialize";

export const usersRouter = Router();

/** Search users by display name, to start a new DM. Excludes the caller. */
usersRouter.get("/", requireAuth, async (req, res) => {
  const search = (req.query.search as string | undefined)?.trim();
  if (!search) {
    return res.json({ users: [] });
  }

  const users = await prisma.user.findMany({
    where: {
      displayName: { contains: search },
      id: { not: req.user!.id },
    },
    take: 20,
  });

  res.json({ users: users.map(toPublicUser) });
});

/** Blocking prevents new DMs in either direction; it doesn't hide existing history or forum posts. */
usersRouter.post("/:id/block", requireAuth, async (req, res) => {
  const blockedId = req.params.id;
  if (blockedId === req.user!.id) {
    return res.status(400).json({ error: "You can't block yourself" });
  }

  const target = await prisma.user.findUnique({ where: { id: blockedId } });
  if (!target) return res.status(404).json({ error: "User not found" });

  await prisma.block.upsert({
    where: { blockerId_blockedId: { blockerId: req.user!.id, blockedId } },
    update: {},
    create: { blockerId: req.user!.id, blockedId },
  });

  res.status(201).json({ blocked: true });
});

usersRouter.delete("/:id/block", requireAuth, async (req, res) => {
  const blockedId = req.params.id;
  await prisma.block
    .delete({ where: { blockerId_blockedId: { blockerId: req.user!.id, blockedId } } })
    .catch(() => {});

  res.json({ blocked: false });
});

usersRouter.get("/:id/block", requireAuth, async (req, res) => {
  const block = await prisma.block.findUnique({
    where: { blockerId_blockedId: { blockerId: req.user!.id, blockedId: req.params.id } },
  });
  res.json({ blocked: Boolean(block) });
});

/** Admin-only. No admin dashboard yet — promote an account via direct DB access (see README). */
usersRouter.post("/:id/ban", requireAuth, requireAdmin, async (req, res) => {
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { bannedAt: new Date() },
  });
  res.json({ user: toPublicUser(user) });
});

usersRouter.post("/:id/unban", requireAuth, requireAdmin, async (req, res) => {
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { bannedAt: null },
  });
  res.json({ user: toPublicUser(user) });
});
