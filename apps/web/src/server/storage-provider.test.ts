import { describe, expect, it, vi } from "vitest";
import { SupabaseStorageProvider } from "./storage-provider";

function createStorageBucket() {
  return {
    upload: vi.fn().mockResolvedValue({ error: null }),
    remove: vi.fn().mockResolvedValue({ error: null }),
    getPublicUrl: vi.fn((key: string) => ({
      data: {
        publicUrl: `https://project.supabase.co/storage/v1/object/public/forum-images/${key}`,
      },
    })),
  };
}

describe("SupabaseStorageProvider", () => {
  it("uploads sanitized bytes without overwriting and returns the public URL", async () => {
    const bucket = createStorageBucket();
    const provider = new SupabaseStorageProvider("forum-images", () => bucket);
    const body = Buffer.from("jpeg");

    await expect(
      provider.put({ key: "avatars/user.jpg", body, contentType: "image/jpeg" }),
    ).resolves.toEqual({
      url: "https://project.supabase.co/storage/v1/object/public/forum-images/avatars/user.jpg",
    });
    expect(bucket.upload).toHaveBeenCalledWith("avatars/user.jpg", body, {
      contentType: "image/jpeg",
      upsert: false,
    });
  });

  it("removes an object by key", async () => {
    const bucket = createStorageBucket();
    const provider = new SupabaseStorageProvider("forum-images", () => bucket);

    await expect(provider.remove("avatars/user.jpg")).resolves.toBeUndefined();
    expect(bucket.remove).toHaveBeenCalledWith(["avatars/user.jpg"]);
  });

  it("extracts keys only from its own public bucket URLs", () => {
    const provider = new SupabaseStorageProvider("forum-images", createStorageBucket);

    expect(
      provider.keyForUrl(
        "https://project.supabase.co/storage/v1/object/public/forum-images/post-images/a%20b.jpg",
      ),
    ).toBe("post-images/a b.jpg");
    expect(
      provider.keyForUrl(
        "https://project.supabase.co/storage/v1/object/public/another-bucket/avatar.jpg",
      ),
    ).toBeNull();
    expect(provider.keyForUrl("not a URL")).toBeNull();
  });

  it("surfaces upload and delete failures", async () => {
    const bucket = createStorageBucket();
    const provider = new SupabaseStorageProvider("forum-images", () => bucket);
    bucket.upload.mockResolvedValueOnce({ error: { message: "upload denied" } });
    bucket.remove.mockResolvedValueOnce({ error: { message: "delete denied" } });

    await expect(
      provider.put({ key: "avatars/user.jpg", body: Buffer.from("jpeg"), contentType: "image/jpeg" }),
    ).rejects.toThrow("Supabase Storage upload failed: upload denied");
    await expect(provider.remove("avatars/user.jpg")).rejects.toThrow(
      "Supabase Storage delete failed: delete denied",
    );
  });
});
