/**
 * Client-side avatar preparation: center-crop to square, resize, and
 * re-encode as JPEG so multi-megabyte originals never leave the browser.
 * This is a courtesy pass — the server independently validates format,
 * dimensions, and size, and strips metadata (canvas re-encoding already
 * drops EXIF here).
 */

const OUTPUT_SIZE = 512;
const OUTPUT_QUALITY = 0.85;

export async function prepareAvatar(file: File): Promise<Blob> {
  const bitmap = await loadImage(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const canvas = document.createElement("canvas");
  const target = Math.min(side, OUTPUT_SIZE);
  canvas.width = target;
  canvas.height = target;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process the image in this browser");
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, target, target);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", OUTPUT_QUALITY),
  );
  if (!blob) throw new Error("Could not encode the image");
  return blob;
}

async function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  // createImageBitmap honors EXIF orientation in modern browsers.
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // fall through to the <img> path for formats createImageBitmap rejects
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file doesn't look like an image"));
    };
    img.src = url;
  });
}
