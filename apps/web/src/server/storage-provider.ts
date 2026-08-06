/**
 * Object storage for user-uploaded images (avatars now; post image embeds in
 * brief 03 reuse this same interface). Follows the same provider pattern as
 * verification-provider.ts: the rest of the app only ever calls put/remove
 * and stores the returned public URL — it never knows whether bytes live on
 * local disk or in a cloud bucket.
 *
 * Production uses the same hosted Supabase project as Auth and Postgres:
 *
 *   1. Create a public Files bucket named `forum-images` (5 MB maximum,
 *      `image/jpeg` only).
 *   2. Set STORAGE_PROVIDER=supabase and
 *      SUPABASE_STORAGE_BUCKET=forum-images.
 *   3. Set SUPABASE_URL and the server-only SUPABASE_SECRET_KEY. The secret
 *      client performs writes and deletes; browsers receive only public URLs.
 */

import "server-only";

import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { supabaseAdmin } from "./supabase";

export interface StorageProvider {
  readonly name: string;
  /** Store an object under `key` and return the public URL it can be read at. */
  put(input: { key: string; body: Buffer; contentType: string }): Promise<{ url: string }>;
  /** Delete by key. Missing objects are not an error (idempotent). */
  remove(key: string): Promise<void>;
  /** Reverse of put(): the key a public URL of ours refers to, or null if it isn't ours. */
  keyForUrl(url: string): string | null;
}

interface TSupabaseStorageBucket {
  upload(
    key: string,
    body: Buffer,
    options: { contentType: string; upsert: boolean },
  ): PromiseLike<{ error: { message: string } | null }>;
  remove(keys: string[]): PromiseLike<{ error: { message: string } | null }>;
  getPublicUrl(key: string): { data: { publicUrl: string } };
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

export class SupabaseStorageProvider implements StorageProvider {
  readonly name = "supabase";

  constructor(
    private readonly bucket: string,
    private readonly getStorageBucket: () => TSupabaseStorageBucket = () =>
      supabaseAdmin().storage.from(bucket),
  ) {}

  async put({
    key,
    body,
    contentType,
  }: {
    key: string;
    body: Buffer;
    contentType: string;
  }): Promise<{ url: string }> {
    const storageBucket = this.getStorageBucket();
    const { error } = await storageBucket.upload(key, body, { contentType, upsert: false });
    if (error) throw new Error(`Supabase Storage upload failed: ${error.message}`);

    return { url: storageBucket.getPublicUrl(key).data.publicUrl };
  }

  async remove(key: string): Promise<void> {
    const { error } = await this.getStorageBucket().remove([key]);
    if (error) throw new Error(`Supabase Storage delete failed: ${error.message}`);
  }

  keyForUrl(url: string): string | null {
    try {
      const pathname = new URL(url).pathname;
      const prefix = `/storage/v1/object/public/${this.bucket}/`;
      if (!pathname.startsWith(prefix)) return null;
      return decodeURIComponent(pathname.slice(prefix.length));
    } catch {
      return null;
    }
  }
}

function loadProvider(): StorageProvider {
  const configured = process.env.STORAGE_PROVIDER ?? "local";
  const storageBucket = process.env.SUPABASE_STORAGE_BUCKET;
  if (configured === "local") {
    if (process.env.VERCEL) {
      throw new Error(
        "STORAGE_PROVIDER=local is development-only. Configure durable object storage before deploying to Vercel.",
      );
    }
    if (storageBucket) {
      throw new Error(
        "SUPABASE_STORAGE_BUCKET is set but STORAGE_PROVIDER is 'local'. " +
          "Set STORAGE_PROVIDER=supabase or remove SUPABASE_STORAGE_BUCKET.",
      );
    }
    return new LocalStorageProvider();
  }
  if (configured === "supabase") {
    if (!storageBucket) {
      throw new Error(
        "SUPABASE_STORAGE_BUCKET is required when STORAGE_PROVIDER=supabase.",
      );
    }
    return new SupabaseStorageProvider(storageBucket);
  }
  throw new Error(
    `STORAGE_PROVIDER="${configured}" is not implemented in this prototype. ` +
      `Use "local" for development or "supabase" for durable storage.`,
  );
}

export const storageProvider = loadProvider();
