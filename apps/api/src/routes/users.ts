import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import express, { Router } from "express";
import sharp from "sharp";
import { deleteAccountSchema, updateProfileSchema } from "@nyps-forum/shared";
import { prisma } from "../db";
import { optionalAuth, requireAdmin, requireAuth } from "../middleware/auth";
import { toPublicUser } from "../lib/serialize";
import { storageProvider } from "../lib/storage-provider";
import { authLimiter, writeLimiter } from "../lib/rate-limit";

export const usersRouter = Router();

const PROFILE_PAGE_LIMIT = 10;

/**
 * Public profile: header info plus the user's threads and replies, each
 * independently paginated. Mirrors the read-access model of GET /threads/:id:
 * anonymous web visitors get the header only (previewOnly), any account
 * reads the content lists in full.
 */
usersRouter.get("/:id/profile", optionalAuth, async (req, res) => {
  const profileUser = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!profileUser || profileUser.deletedAt) {
    return res.status(404).json({ error: "User not found" });
  }

  const viewerId = req.user?.id;
  const previewOnly = !viewerId;
  const threadsLimit = Math.min(Number(req.query.threadsLimit) || PROFILE_PAGE_LIMIT, 50);
  const threadsOffset = Math.max(Number(req.query.threadsOffset) || 0, 0);
  const repliesLimit = Math.min(Number(req.query.repliesLimit) || PROFILE_PAGE_LIMIT, 50);
  const repliesOffset = Math.max(Number(req.query.repliesOffset) || 0, 0);

  // Soft-deleted content is gone from its author's public record too.
  const [threadCount, replyCount, threads, replies] = await Promise.all([
    prisma.thread.count({ where: { authorId: profileUser.id, deletedAt: null } }),
    prisma.post.count({ where: { authorId: profileUser.id, deletedAt: null } }),
    previewOnly
      ? []
      : prisma.thread.findMany({
          where: { authorId: profileUser.id, deletedAt: null },
          orderBy: { createdAt: "desc" },
          skip: threadsOffset,
          take: threadsLimit,
          include: {
            tags: true,
            likes: { where: { userId: viewerId } },
            _count: { select: { posts: { where: { deletedAt: null } }, likes: true } },
          },
        }),
    previewOnly
      ? []
      : prisma.post.findMany({
          where: { authorId: profileUser.id, deletedAt: null },
          orderBy: { createdAt: "desc" },
          skip: repliesOffset,
          take: repliesLimit,
          include: { thread: { select: { title: true } }, _count: { select: { likes: true } } },
        }),
  ]);

  res.json({
    user: toPublicUser(profileUser),
    threadCount,
    replyCount,
    previewOnly,
    threads: threads.map((t) => ({
      id: t.id,
      title: t.title,
      author: toPublicUser(profileUser),
      createdAt: t.createdAt.toISOString(),
      tags: t.tags.map((tag) => ({ id: tag.id, slug: tag.slug, name: tag.name, description: tag.description })),
      likeCount: t._count.likes,
      myLiked: t.likes.length > 0,
      postCount: t._count.posts,
      locked: t.locked,
    })),
    hasMoreThreads: !previewOnly && threadsOffset + threads.length < threadCount,
    replies: replies.map((p) => ({
      id: p.id,
      threadId: p.threadId,
      threadTitle: p.thread.title,
      body: p.body,
      createdAt: p.createdAt.toISOString(),
      likeCount: p._count.likes,
    })),
    hasMoreReplies: !previewOnly && repliesOffset + replies.length < replyCount,
  });
});

/**
 * Edit your own profile (bio, display name — avatar has its own route).
 * The display name is the legal name tied to ID verification, so a VERIFIED
 * user changing it would invalidate that link; we block the edit with an
 * explanation rather than silently resetting them to UNVERIFIED and
 * stripping posting rights.
 */
usersRouter.patch("/me", requireAuth, writeLimiter, async (req, res) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { bio, displayName } = parsed.data;

  const data: { bio?: string | null; displayName?: string } = {};
  if (bio !== undefined) {
    const trimmed = bio?.trim() ?? "";
    data.bio = trimmed === "" ? null : trimmed;
  }
  if (displayName !== undefined && displayName !== req.user!.displayName) {
    if (req.user!.verificationStatus === "VERIFIED") {
      return res.status(403).json({
        error:
          "Your display name is the legal name your identity was verified against, so it can't be changed while verified. Contact the Society if your legal name has changed.",
      });
    }
    data.displayName = displayName.trim();
  }

  const user = await prisma.user.update({ where: { id: req.user!.id }, data });
  res.json({ user: toPublicUser(user) });
});

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

/**
 * Search users by display name — used to start a new DM and by the
 * composer's @mention autocomplete. Excludes the caller and anyone with a
 * block in either direction: a blocked pair can't DM anyway, and offering
 * them as a mention target would create a link/notification the block is
 * supposed to prevent.
 */
usersRouter.get("/", requireAuth, async (req, res) => {
  const search = (req.query.search as string | undefined)?.trim();
  if (!search) {
    return res.json({ users: [] });
  }

  const users = await prisma.user.findMany({
    where: {
      // Postgres LIKE is case-sensitive; without this, typing "@ali" would
      // not offer "Alice" in the mention autocomplete.
      displayName: { contains: search, mode: "insensitive" },
      id: { not: req.user!.id },
      deletedAt: null,
      blocking: { none: { blockedId: req.user!.id } },
      blockedBy: { none: { blockerId: req.user!.id } },
    },
    take: 20,
  });

  res.json({ users: users.map(toPublicUser) });
});

/**
 * Delete your own account. Content is anonymized, not cascade-deleted:
 * threads, replies, and messages survive under "[deleted]" so nobody else's
 * conversations get holes blown in them. The row itself stays (deletedAt
 * set) but can never sign in again; the email is tombstoned so it's free
 * for a future signup.
 */
usersRouter.delete("/me", requireAuth, authLimiter, async (req, res) => {
  const parsed = deleteAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  if (req.user!.passwordHash) {
    if (!parsed.data.password) {
      return res.status(400).json({ error: "Enter your password to delete your account" });
    }
    const ok = await bcrypt.compare(parsed.data.password, req.user!.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: "Password is incorrect" });
    }
  }

  const avatarKey = req.user!.avatarUrl ? storageProvider.keyForUrl(req.user!.avatarUrl) : null;
  await prisma.user.update({
    where: { id: req.user!.id },
    data: {
      displayName: "[deleted]",
      email: `deleted-${req.user!.id}@deleted.invalid`,
      passwordHash: null,
      googleId: null,
      appleId: null,
      avatarUrl: null,
      bio: null,
      verificationStatus: "UNVERIFIED",
      isSupporter: false,
      role: "user",
      deletedAt: new Date(),
    },
  });
  if (avatarKey) await storageProvider.remove(avatarKey);
  // A deleted account has no devices to push to and no inbox to read.
  await prisma.pushToken.deleteMany({ where: { userId: req.user!.id } });
  await prisma.notification.deleteMany({ where: { recipientId: req.user!.id } });

  res.json({ deleted: true });
});

/**
 * Everything we hold about the caller, as JSON. This forum stores real
 * names, verification status, and private messages — people are entitled to
 * a copy of their own record.
 */
usersRouter.get("/me/export", requireAuth, async (req, res) => {
  const myId = req.user!.id;
  const [threads, posts, messagesSent, messagesReceived] = await Promise.all([
    prisma.thread.findMany({ where: { authorId: myId }, orderBy: { createdAt: "asc" } }),
    prisma.post.findMany({ where: { authorId: myId }, orderBy: { createdAt: "asc" } }),
    prisma.message.findMany({ where: { senderId: myId }, orderBy: { createdAt: "asc" } }),
    prisma.message.findMany({ where: { recipientId: myId }, orderBy: { createdAt: "asc" } }),
  ]);

  res.setHeader("Content-Disposition", 'attachment; filename="nyps-forum-export.json"');
  res.json({
    exportedAt: new Date().toISOString(),
    account: {
      id: myId,
      email: req.user!.email,
      displayName: req.user!.displayName,
      bio: req.user!.bio,
      avatarUrl: req.user!.avatarUrl,
      verificationStatus: req.user!.verificationStatus,
      isSupporter: req.user!.isSupporter,
      createdAt: req.user!.createdAt.toISOString(),
    },
    threads: threads.map((t) => ({
      id: t.id,
      title: t.title,
      body: t.body,
      createdAt: t.createdAt.toISOString(),
    })),
    posts: posts.map((p) => ({
      id: p.id,
      threadId: p.threadId,
      body: p.body,
      createdAt: p.createdAt.toISOString(),
    })),
    messagesSent: messagesSent.map((m) => ({
      id: m.id,
      recipientId: m.recipientId,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
    })),
    messagesReceived: messagesReceived.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
    })),
  });
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
