import { Router } from "../router";
import type { DirectoryEntry } from "@nyps-forum/shared";
import { containsInsensitive, prisma } from "../db";
import { requireAuth, requireMember } from "../guards";
import { toPublicUser } from "../serialize";

export const directoryRouter = Router();

const DEFAULT_LIMIT = 30;

/**
 * The member directory: opt-in, member-only, server-enforced. An entry
 * appears only while BOTH hold — the user opted in (directoryVisible) and is
 * a current member (isSupporter) — so lapsed members drop out automatically
 * without their settings being erased. Searchable by name and interests;
 * `partners=1` narrows to people open to a reading partner / study group
 * (the whole matching feature — members take it from there by DM).
 */
directoryRouter.get("/", requireAuth, requireMember, async (req, res) => {
  const q = (req.query.q as string | undefined)?.trim();
  const partners = req.query.partners === "1" || req.query.partners === "true";
  const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  const where = {
    deletedAt: null,
    bannedAt: null,
    isSupporter: true,
    directoryVisible: true,
    ...(partners ? { openToPartners: true } : {}),
    ...(q
      ? { OR: [{ displayName: containsInsensitive(q) }, { directoryBio: containsInsensitive(q) }] }
      : {}),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { displayName: "asc" },
      skip: offset,
      take: limit,
      include: {
        chapterMemberships: {
          where: { state: "active" },
          include: { chapter: { select: { id: true, slug: true, name: true } } },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  const entries: DirectoryEntry[] = users.map((u) => ({
    user: toPublicUser(u),
    directoryBio: u.directoryBio,
    openToPartners: u.openToPartners,
    chapters: u.chapterMemberships.map((m) => m.chapter),
  }));

  res.json({ entries, total, limit, offset, hasMore: offset + users.length < total });
});
