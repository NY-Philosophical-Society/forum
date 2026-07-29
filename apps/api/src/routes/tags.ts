import { Router } from "express";
import { prisma } from "../db";

export const tagsRouter = Router();

tagsRouter.get("/", async (_req, res) => {
  const tags = await prisma.tag.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { threads: true } } },
  });

  res.json({
    tags: tags.map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      description: t.description,
      threadCount: t._count.threads,
    })),
  });
});
