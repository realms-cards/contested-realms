import { NextRequest } from "next/server";
export const dynamic = "force-dynamic";
import fs from "fs";
import path from "path";

function setDirFromSlug(slug: string): string | null {
  const code = slug.slice(0, 3);
  switch (code) {
    case "alp":
      return "alpha";
    case "bet":
      return "beta";
    case "art":
      return "arthurian_legends";
    default:
      return null;
  }
}

function imageBasenameFromSlug(slug: string): string {
  return slug.replace(/^[a-z]{3}_/, "");
}

function suffixDirFromBasename(base: string): string | null {
  const parts = base.split("_");
  if (parts.length < 3) return null;
  const a = parts[parts.length - 2];
  const b = parts[parts.length - 1];
  return `${a}_${b}`;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug: slugRaw } = await params;
    const slug = decodeURIComponent(slugRaw || "").toLowerCase();
    if (!slug || !/^[a-z]{3}_[a-z0-9_]+$/.test(slug)) {
      return new Response("Bad slug", { status: 400 });
    }

    const setDir = setDirFromSlug(slug);
    if (!setDir) {
      return new Response("Unknown set", { status: 404 });
    }

    const base = imageBasenameFromSlug(slug);
    const suffix = suffixDirFromBasename(base);

    const root = path.join(process.cwd(), "data", setDir);
    // If explicitly requesting KTX2, only check for .ktx2 and return 404 if missing.
    const wantKtx2 = (() => {
      try {
        const u = new URL(_req.url);
        const v = u.searchParams.get("ktx2");
        return v === "1" || v === "true";
      } catch {
        return false;
      }
    })();
    const exts = wantKtx2 ? ["ktx2"] : ["png", "jpg", "jpeg", "webp"];
    const candidates: string[] = [];

    if (suffix) {
      for (const ext of exts) candidates.push(path.join(root, suffix, `${base}.${ext}`));
    }
    // Fallback: try directly under set dir
    for (const ext of exts) candidates.push(path.join(root, `${base}.${ext}`));

    let found: string | null = null;
    for (const p of candidates) {
      try {
        await fs.promises.access(p, fs.constants.R_OK);
        found = p;
        break;
      } catch {}
    }

    if (!found) {
      return new Response("Not found", { status: 404 });
    }

    const buf = await fs.promises.readFile(found);
    const ext = path.extname(found).slice(1).toLowerCase();
    const contentType =
      ext === "png"
        ? "image/png"
        : ext === "jpg" || ext === "jpeg"
        ? "image/jpeg"
        : ext === "webp"
        ? "image/webp"
        : ext === "ktx2"
        ? "image/ktx2"
        : "application/octet-stream";

    const body = new Uint8Array(buf);
    return new Response(body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (e) {
    console.error("/api/images error", e);
    return new Response("Server error", { status: 500 });
  }
}
