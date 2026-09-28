/**
 * Client-side avatar preparation: user-positioned square crop, resize, and
 * re-encode as JPEG so multi-megabyte originals never leave the browser.
 * This is a courtesy pass — the server independently validates format,
 * dimensions, and size, and strips metadata (canvas re-encoding already
 * drops EXIF here).
 */

const OUTPUT_SIZE = 512;
const OUTPUT_QUALITY = 0.85;

export type AvatarCrop = { zoom: number; x: number; y: number };

export function avatarCropRect(width: number, height: number, crop: AvatarCrop) {
  const zoom = Math.min(3, Math.max(1, crop.zoom));
  const side = Math.min(width, height) / zoom;
  return {
    side,
    x: (width - side) * Math.min(1, Math.max(0, crop.x)),
    y: (height - side) * Math.min(1, Math.max(0, crop.y)),
  };
}

export async function prepareAvatar(file: File, crop: AvatarCrop = { zoom: 1, x: 0.5, y: 0.5 }): Promise<Blob> {
  const bitmap = await loadImage(file);
  const { side, x, y } = avatarCropRect(bitmap.width, bitmap.height, crop);

  const canvas = document.createElement("canvas");
  const target = Math.min(side, OUTPUT_SIZE);
  canvas.width = target;
  canvas.height = target;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process the image in this browser");
  ctx.drawImage(bitmap, x, y, side, side, 0, 0, target, target);

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
