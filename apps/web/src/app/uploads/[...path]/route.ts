import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { LOCAL_UPLOADS_DIR, storageProvider } from "~/server/storage-provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const contentTypes: Record<string, string> = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

type TRouteContext = { params: { path: string[] } };

async function serveUpload(
  request: NextRequest,
  { params }: TRouteContext,
): Promise<NextResponse> {
  if (storageProvider.name !== "local") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const relativePath = params.path.join("/");
  const filePath = path.resolve(LOCAL_UPLOADS_DIR, relativePath);
  const root = path.resolve(LOCAL_UPLOADS_DIR) + path.sep;
  if (!filePath.startsWith(root)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const body = await readFile(filePath);
    const headers = new Headers({
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": contentTypes[path.extname(filePath).toLowerCase()] ?? "application/octet-stream",
    });
    return new NextResponse(request.method === "HEAD" ? null : body, { headers });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

export const GET = serveUpload;
export const HEAD = serveUpload;
