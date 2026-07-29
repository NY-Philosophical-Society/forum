import { Router } from "express";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";
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
