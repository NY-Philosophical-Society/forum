/**
 * Object storage for user-uploaded images (avatars now; post image embeds in
 * brief 03 reuse this same interface). Follows the same provider pattern as
 * verification-provider.ts: the rest of the app only ever calls put/remove
 * and stores the returned public URL — it never knows whether bytes live on
 * local disk or in a cloud bucket.
 *
 * To go to production with S3 or Cloudflare R2:
 *
 *   1. Create a bucket with public read access (or a CDN in front of it).
 *      For R2: Cloudflare dashboard → R2 → Create bucket → enable the
 *      public bucket URL (or connect a custom domain).
 *   2. Create an access key. S3: IAM user with PutObject/DeleteObject on the
 *      bucket. R2: R2 → Manage API tokens → Object Read & Write.
 *   3. Set in apps/web/.env.local:
 *        STORAGE_PROVIDER=s3
 *        STORAGE_S3_BUCKET=...
 *        STORAGE_S3_REGION=...            (R2: "auto")
 *        STORAGE_S3_ENDPOINT=...          (R2: https://<account-id>.r2.cloudflarestorage.com; unset for AWS)
 *        STORAGE_S3_ACCESS_KEY_ID=...
 *        STORAGE_S3_SECRET_ACCESS_KEY=...
 *        STORAGE_S3_PUBLIC_URL=...        (the bucket/CDN base URL objects are readable at)
 *   4. `npm install @aws-sdk/client-s3` and implement S3StorageProvider
 *      below with PutObjectCommand / DeleteObjectCommand (R2 is S3-compatible;
 *      the same client works with the endpoint override).
 *
 * Cloudinary is a reasonable alternative if you'd rather have the vendor do
 * the resizing, but the server-side sharp pipeline in routes/users.ts already
 * covers what avatars need.
 */

import "server-only";

import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";

export interface StorageProvider {
  readonly name: string;
  /** Store an object under `key` and return the public URL it can be read at. */
  put(input: { key: string; body: Buffer; contentType: string }): Promise<{ url: string }>;
  /** Delete by key. Missing objects are not an error (idempotent). */
  remove(key: string): Promise<void>;
  /** Reverse of put(): the key a public URL of ours refers to, or null if it isn't ours. */
  keyForUrl(url: string): string | null;
}

/** Absolute path the local provider writes under; app.ts serves it at /uploads.
 * UPLOADS_DIR override exists so the test suite can point writes at a
 * throwaway temp directory (see src/server/test/global-setup.ts). */
export const LOCAL_UPLOADS_DIR =
  process.env.UPLOADS_DIR ?? path.join(process.cwd(), "uploads");

/**
 * Local-disk stand-in so the whole product works with zero credentials:
 * files land in apps/web/uploads/ (gitignored) and are served by the API
 * itself under /uploads. Fine for one dev machine; NEVER for production —
 * no redundancy, no CDN, and files die with the host.
 */
class LocalStorageProvider implements StorageProvider {
  readonly name = "local";

  private baseUrl(): string {
    // The URL clients (including phones on the LAN) will fetch images from —
    // must be the API's own address, since the API serves /uploads.
    return process.env.API_PUBLIC_URL ?? process.env.WEB_APP_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
  }

  async put({ key, body }: { key: string; body: Buffer; contentType: string }): Promise<{ url: string }> {
    const filePath = path.join(LOCAL_UPLOADS_DIR, key);
    // Keys are server-generated (never user input), but normalize and check
    // anyway so a future caller can't write outside the uploads dir.
    if (!path.normalize(filePath).startsWith(LOCAL_UPLOADS_DIR + path.sep)) {
      throw new Error(`Refusing to write outside the uploads directory: ${key}`);
    }
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, body);
    return { url: `${this.baseUrl()}/uploads/${key}` };
  }

  async remove(key: string): Promise<void> {
    const filePath = path.join(LOCAL_UPLOADS_DIR, key);
    if (!path.normalize(filePath).startsWith(LOCAL_UPLOADS_DIR + path.sep)) return;
    await unlink(filePath).catch(() => {});
  }

  keyForUrl(url: string): string | null {
    const marker = "/uploads/";
    const idx = url.indexOf(marker);
    return idx === -1 ? null : url.slice(idx + marker.length);
  }
}

function loadProvider(): StorageProvider {
  const configured = process.env.STORAGE_PROVIDER ?? "local";
  // The local stub must never quietly shadow a configured real bucket — if
  // cloud credentials exist, refuse to fall back to disk (same rule as the
  // dev-mock OAuth route).
  const hasCloudCredentials = Boolean(
    process.env.STORAGE_S3_BUCKET || process.env.STORAGE_S3_ACCESS_KEY_ID,
  );
  if (configured === "local") {
    if (process.env.VERCEL) {
      throw new Error(
        "STORAGE_PROVIDER=local is development-only. Configure durable object storage before deploying to Vercel.",
      );
    }
    if (hasCloudCredentials) {
      throw new Error(
        "S3/R2 storage credentials are set but STORAGE_PROVIDER is 'local'. " +
          "Set STORAGE_PROVIDER=s3 (and implement S3StorageProvider) or remove the " +
          "STORAGE_S3_* variables — the local disk stub refuses to run alongside real credentials.",
      );
    }
    return new LocalStorageProvider();
  }
  throw new Error(
    `STORAGE_PROVIDER="${configured}" is not implemented in this prototype. ` +
      `Implement an S3StorageProvider in src/server/storage-provider.ts ` +
      `(see the file's top comment) before switching this on.`,
  );
}

export const storageProvider = loadProvider();
