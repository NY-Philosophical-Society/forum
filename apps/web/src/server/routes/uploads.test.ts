import { describe, expect, it } from "vitest";
import request from "../test/request";
import sharp from "sharp";
import { app } from "../app";
import { signup, signupVerified } from "../test/helpers";

async function testImage(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 21, g: 43, b: 66 } },
  })
    .jpeg()
    .toBuffer();
}

function upload(token: string, body: Buffer, contentType = "image/jpeg") {
  return request(app)
    .post("/api/uploads/image")
    .set("Authorization", `Bearer ${token}`)
    .set("Content-Type", contentType)
    .send(body);
}

describe("POST /api/uploads/image", () => {
  it("stores the image and returns a URL carrying the final dimensions", async () => {
    const user = await signupVerified("img");
    const res = await upload(user.token, await testImage(800, 600));

    expect(res.status).toBe(201);
    expect(res.body.width).toBe(800);
    expect(res.body.height).toBe(600);
    expect(res.body.url).toMatch(/\/uploads\/post-images\/.+-800x600\.jpg$/);
  });

  it("downscales oversized images to fit 1600px and reports the new size", async () => {
    const user = await signupVerified("img-big");
    const res = await upload(user.token, await testImage(3200, 1600));

    expect(res.status).toBe(201);
    expect(res.body.width).toBe(1600);
    expect(res.body.height).toBe(800);
  });

  it("an unverified account can upload by default — the honor system", async () => {
    const user = await signup("img-unverified-honor");
    const res = await upload(user.token, await testImage(400, 300));
    expect(res.status).toBe(201);
  });

  it("requires verification once REQUIRE_ID_VERIFICATION=true, same as any other write", async () => {
    const original = process.env.REQUIRE_ID_VERIFICATION;
    process.env.REQUIRE_ID_VERIFICATION = "true";
    try {
      const user = await signup("img-unverified");
      const res = await upload(user.token, await testImage(400, 300));
      expect(res.status).toBe(403);
    } finally {
      if (original === undefined) delete process.env.REQUIRE_ID_VERIFICATION;
      else process.env.REQUIRE_ID_VERIFICATION = original;
    }
  });

  it("rejects a non-image body claiming to be an image", async () => {
    const user = await signupVerified("img-fake");
    const res = await upload(user.token, Buffer.from("<script>alert(1)</script>"));
    expect(res.status).toBe(400);
  });
});
