import { describe, expect, it } from "vitest";
import request from "supertest";
import sharp from "sharp";
import { app } from "../app";
import { signup } from "../test/helpers";

/** A real encoded image, generated in-process so no fixture files are needed. */
async function testImage(
  width: number,
  height: number,
  format: "jpeg" | "png" = "jpeg",
  withGps = false,
): Promise<Buffer> {
  let img = sharp({
    create: { width, height, channels: 3, background: { r: 150, g: 66, b: 31 } },
  });
  img = format === "png" ? img.png() : img.jpeg();
  if (withGps) {
    img = img.withMetadata({
      exif: { IFD0: { Copyright: "test" }, IFD3: { GPSLatitudeRef: "N" } },
    });
  }
  return img.toBuffer();
}

async function uploadAvatar(token: string, body: Buffer, contentType = "image/jpeg") {
  return request(app)
    .post("/api/users/me/avatar")
    .set("Authorization", `Bearer ${token}`)
    .set("Content-Type", contentType)
    .send(body);
}

describe("POST /api/users/me/avatar", () => {
  it("stores a processed avatar and returns the user with avatarUrl set", async () => {
    const user = await signup("avatar");
    const res = await uploadAvatar(user.token, await testImage(800, 600));

    expect(res.status).toBe(200);
    expect(res.body.user.avatarUrl).toMatch(/\/uploads\/avatars\/.+\.jpg$/);

    // The stored file is served, square-cropped to 512, and re-encoded.
    const path = new URL(res.body.user.avatarUrl).pathname;
    const file = await request(app).get(path).buffer(true).parse(binaryParser);
    expect(file.status).toBe(200);
    const meta = await sharp(file.body as Buffer).metadata();
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(512);
    expect(meta.format).toBe("jpeg");
  });

  it("strips EXIF metadata (GPS coordinates are a privacy leak)", async () => {
    const user = await signup("exif");
    const original = await testImage(400, 400, "jpeg", true);
    expect((await sharp(original).metadata()).exif).toBeTruthy();

    const res = await uploadAvatar(user.token, original);
    expect(res.status).toBe(200);

    const path = new URL(res.body.user.avatarUrl).pathname;
    const file = await request(app).get(path).buffer(true).parse(binaryParser);
    const meta = await sharp(file.body as Buffer).metadata();
    expect(meta.exif).toBeUndefined();
  });

  it("replaces the previous avatar file on re-upload", async () => {
    const user = await signup("replace");
    const first = await uploadAvatar(user.token, await testImage(300, 300));
    const second = await uploadAvatar(user.token, await testImage(300, 300, "png"), "image/png");
    expect(second.status).toBe(200);
    expect(second.body.user.avatarUrl).not.toBe(first.body.user.avatarUrl);

    const oldPath = new URL(first.body.user.avatarUrl).pathname;
    const gone = await request(app).get(oldPath);
    expect(gone.status).toBe(404);
  });

  it("rejects bytes that aren't a decodable image", async () => {
    const user = await signup("garbage");
    const res = await uploadAvatar(user.token, Buffer.from("not an image at all"));
    expect(res.status).toBe(400);
  });

  it("rejects disallowed content types", async () => {
    const user = await signup("gif");
    const res = await uploadAvatar(user.token, await testImage(300, 300), "image/gif");
    expect(res.status).toBe(415);
  });

  it("rejects a mislabeled content type by sniffing the real format", async () => {
    const user = await signup("sniff");
    // A GIF header sent as image/jpeg must not get through on the header's word.
    const fakeJpeg = Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(600)]);
    const res = await uploadAvatar(user.token, fakeJpeg);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it("rejects images below the minimum dimensions", async () => {
    const user = await signup("tiny");
    const res = await uploadAvatar(user.token, await testImage(50, 50));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/too small/i);
  });

  it("requires auth", async () => {
    const res = await request(app)
      .post("/api/users/me/avatar")
      .set("Content-Type", "image/jpeg")
      .send(await testImage(300, 300));
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/users/me/avatar", () => {
  it("removes the photo and the stored file, falling back to initials", async () => {
    const user = await signup("remove");
    const uploaded = await uploadAvatar(user.token, await testImage(300, 300));
    const path = new URL(uploaded.body.user.avatarUrl).pathname;

    const res = await request(app)
      .delete("/api/users/me/avatar")
      .set("Authorization", `Bearer ${user.token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.avatarUrl).toBeNull();

    const gone = await request(app).get(path);
    expect(gone.status).toBe(404);
  });
});

/** supertest binary response collector. */
function binaryParser(res: request.Response, callback: (err: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  const stream = res as unknown as NodeJS.ReadableStream;
  stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  stream.on("end", () => callback(null, Buffer.concat(chunks)));
}
