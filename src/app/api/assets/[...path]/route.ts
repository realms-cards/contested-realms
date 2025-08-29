import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const ROOT = path.join(process.cwd(), "data");
const ALLOWED_EXTS = new Set(["png", "jpg", "jpeg", "webp", "ktx2"]);

function contentTypeFor(ext: string): string {
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "ktx2":
      return "image/ktx2";
    default:
      return "application/octet-stream";
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const { path: pathSegments } = await params;
    const segments = (pathSegments ?? []).filter(Boolean);
    if (!segments.length) return new Response("Missing path", { status: 400 });

    // Prevent traversal
    if (segments.some((s) => s.includes("..") || s.includes(":") || s.startsWith("."))) {
      return new Response("Bad path", { status: 400 });
    }

    const filePath = path.join(ROOT, ...segments);
    const ext = path.extname(filePath).slice(1).toLowerCase();
    if (!ALLOWED_EXTS.has(ext)) {
      return new Response("Unsupported type", { status: 415 });
    }

    await fs.promises.access(filePath, fs.constants.R_OK);
    const buf = await fs.promises.readFile(filePath);
    const body = new Uint8Array(buf);

    return new Response(body, {
      headers: {
        "Content-Type": contentTypeFor(ext),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
