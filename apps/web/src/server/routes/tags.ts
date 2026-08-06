import { Router } from "../router";
import { prisma } from "../db";

export const tagsRouter = Router();

tagsRouter.get("/", async (_req, res) => {
  // Counts cover the shared feed only: chapter threads must not register
  // anywhere public, and deleted threads shouldn't inflate the number either.
  const tags = await prisma.tag.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { threads: { where: { deletedAt: null, chapterId: null } } } },
    },
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
