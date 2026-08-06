import { randomUUID } from "crypto";
import { rawBody, Router } from "../router";
import sharp from "sharp";
import { requireAuth, requireVerified } from "../guards";
import { storageProvider } from "../storage-provider";
import { writeLimiter } from "../rate-limit";

export const uploadsRouter = Router();

// Same enforcement posture as avatars (routes/users.ts): the MIME allowlist
// is on the raw parser AND re-checked against the sniffed format, so a
// mislabeled Content-Type can't smuggle another file type through.
const IMAGE_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
// 4MB, not the 8MB this used to be: Vercel caps a serverless function's whole
// request at 4.5MB, and that ceiling is enforced by the platform before our
// handler runs — an over-limit upload would fail with a platform error page
// instead of our 413. The margin below 4.5 leaves room for headers.
const IMAGE_MAX_BYTES = 4 * 1024 * 1024;
const IMAGE_MIN_DIMENSION = 10;
const IMAGE_MAX_DIMENSION = 10_000;
// Wide enough for any reading column at 2x; anything larger is downscaled.
const IMAGE_MAX_EDGE = 1600;

/**
 * Post/reply image embeds. Same storage provider as avatars — this is the
 * second consumer of the interface, not a second upload path. The final
 * pixel size is baked into the object key (…-WxH.jpg) so clients can
 * reserve layout space from the URL alone, with no layout shift and no
 * extra round trip.
 */
uploadsRouter.post(
  "/image",
  requireAuth,
  requireVerified,
  writeLimiter,
  rawBody({ type: IMAGE_ALLOWED_TYPES, limit: IMAGE_MAX_BYTES }),
  async (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(415).json({
        error: "Send the image bytes directly with a Content-Type of image/jpeg, image/png, or image/webp",
      });
    }

    let processed: Buffer;
    let width: number;
    let height: number;
    try {
      const image = sharp(req.body);
      const meta = await image.metadata();
      if (!meta.format || !["jpeg", "png", "webp"].includes(meta.format)) {
        return res.status(415).json({ error: "Only JPEG, PNG, or WebP images are accepted" });
      }
      if ((meta.width ?? 0) < IMAGE_MIN_DIMENSION || (meta.height ?? 0) < IMAGE_MIN_DIMENSION) {
        return res.status(400).json({ error: "That image is too small to embed" });
      }
      if ((meta.width ?? 0) > IMAGE_MAX_DIMENSION || (meta.height ?? 0) > IMAGE_MAX_DIMENSION) {
        return res.status(400).json({ error: "That image's dimensions are too large" });
      }
      // rotate() bakes the EXIF orientation into the pixels, then the
      // re-encode drops all metadata (EXIF, GPS, ICC) — same privacy
      // rationale as avatars, and it matters more here since post images
      // are often straight off a phone camera.
      const out = await sharp(req.body)
        .rotate()
        .resize(IMAGE_MAX_EDGE, IMAGE_MAX_EDGE, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer({ resolveWithObject: true });
      processed = out.data;
      width = out.info.width;
      height = out.info.height;
    } catch {
      return res.status(400).json({ error: "That file doesn't look like a valid image" });
    }

    const key = `post-images/${req.user!.id}-${randomUUID().slice(0, 8)}-${width}x${height}.jpg`;
    const { url } = await storageProvider.put({ key, body: processed, contentType: "image/jpeg" });

    res.status(201).json({ url, width, height });
  },
);
