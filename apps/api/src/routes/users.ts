import { randomUUID } from "crypto";
import express, { Router } from "express";
import sharp from "sharp";
import { prisma } from "../db";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { toPublicUser } from "../lib/serialize";
import { storageProvider } from "../lib/storage-provider";
import { writeLimiter } from "../lib/rate-limit";

export const usersRouter = Router();

/* ---- Avatar upload ------------------------------------------------------ */

// Server-side limits — the client-side crop/resize is a courtesy, this is
// the enforcement. The MIME allowlist is on the raw parser AND re-checked
// against the sniffed format below, so a mislabeled Content-Type can't
// smuggle another file type through.
const AVATAR_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const AVATAR_MAX_BYTES = 8 * 1024 * 1024;
const AVATAR_MIN_DIMENSION = 100;
const AVATAR_MAX_DIMENSION = 10_000;
const AVATAR_SIZE = 512;

usersRouter.post(
  "/me/avatar",
  requireAuth,
  writeLimiter,
  express.raw({ type: AVATAR_ALLOWED_TYPES, limit: AVATAR_MAX_BYTES }),
  async (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(415).json({
        error: "Send the image bytes directly with a Content-Type of image/jpeg, image/png, or image/webp",
      });
    }

    let processed: Buffer;
    try {
      const image = sharp(req.body);
      const meta = await image.metadata();
      if (!meta.format || !["jpeg", "png", "webp"].includes(meta.format)) {
        return res.status(415).json({ error: "Only JPEG, PNG, or WebP images are accepted" });
      }
      const { width = 0, height = 0 } = meta;
      if (width < AVATAR_MIN_DIMENSION || height < AVATAR_MIN_DIMENSION) {
        return res.status(400).json({
          error: `That image is too small — avatars need to be at least ${AVATAR_MIN_DIMENSION}×${AVATAR_MIN_DIMENSION}px`,
        });
      }
      if (width > AVATAR_MAX_DIMENSION || height > AVATAR_MAX_DIMENSION) {
        return res.status(400).json({ error: "That image's dimensions are too large" });
      }
      // rotate() bakes the EXIF orientation into the pixels, then the
      // re-encode drops all metadata (EXIF, GPS, ICC) — embedded location
      // data is a real privacy leak on a real-name forum.
      processed = await image
        .rotate()
        .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover" })
        .jpeg({ quality: 85 })
        .toBuffer();
    } catch {
      return res.status(400).json({ error: "That file doesn't look like a valid image" });
    }

    const key = `avatars/${req.user!.id}-${randomUUID().slice(0, 8)}.jpg`;
    const { url } = await storageProvider.put({ key, body: processed, contentType: "image/jpeg" });

    const previousKey = req.user!.avatarUrl ? storageProvider.keyForUrl(req.user!.avatarUrl) : null;
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { avatarUrl: url },
    });
    if (previousKey) await storageProvider.remove(previousKey);

    res.json({ user: toPublicUser(user) });
  },
);

usersRouter.delete("/me/avatar", requireAuth, writeLimiter, async (req, res) => {
  const previousKey = req.user!.avatarUrl ? storageProvider.keyForUrl(req.user!.avatarUrl) : null;
  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: { avatarUrl: null },
  });
  if (previousKey) await storageProvider.remove(previousKey);

  res.json({ user: toPublicUser(user) });
});

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
