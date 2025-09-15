import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
export const dynamic = "force-dynamic";

function setDirFromSlug(slug: string): string | null {
  const code = slug.slice(0, 3);
  switch (code) {
    case "alp":
      return "alpha";
    case "bet":
      return "beta";
    case "art":
      return "arthurian_legends";
    case "dra":
      // Some data sources use 'dra' for Dragonlord; accept both 'dra' and 'drl'.
      return "Dragonlord";
    case "drl":
      return "Dragonlord";
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

    // If a CDN origin is configured, 302-redirect there instead of streaming from disk.
    const cdn = process.env.ASSET_CDN_ORIGIN?.trim();
    if (cdn) {
      // Build CDN path using the same set/slug logic
      const setDir = setDirFromSlug(slug);
      if (!setDir) return new Response("Unknown set", { status: 404 });
      const base = imageBasenameFromSlug(slug);
      const suffix = suffixDirFromBasename(base);
      const name = wantKtx2 ? `${base}.ktx2` : `${base}.png`;
      const pathParts = suffix ? [setDir, suffix, name] : [setDir, name];
      const cdnUrl = `${cdn.replace(/\/$/, '')}/${pathParts.join('/')}`;
      return Response.redirect(cdnUrl, 302);
    }
    // Roots to search. For KTX2, prefer data-ktx2 output dir then fallback to data.
    const roots = wantKtx2
      ? [
          path.join(process.cwd(), "data-ktx2", setDir),
          path.join(process.cwd(), "data", setDir),
        ]
      : [path.join(process.cwd(), "data", setDir)];

    const exts = wantKtx2 ? ["ktx2"] : ["png", "jpg", "jpeg", "webp"];
    const candidates: string[] = [];

    // 1) Try within the resolved set directory first (strict match)
    for (const root of roots) {
      if (suffix) {
        for (const ext of exts) candidates.push(path.join(root, suffix, `${base}.${ext}`));
      }
      for (const ext of exts) candidates.push(path.join(root, `${base}.${ext}`));
    }

    let found: string | null = null;
    for (const p of candidates) {
      try {
        await fs.promises.access(p, fs.constants.R_OK);
        found = p;
        break;
      } catch {}
    }

    // 2) Cross-set fallback: if not found in the primary set, look in other set directories
    if (!found) {
      const allSetsPreferredOrder = [
        // Prefer Beta assets when available, then Alpha, then Arthurian/Dragonlord
        "beta",
        "alpha",
        "arthurian_legends",
        "Dragonlord",
      ];
      // Ensure we don't duplicate the already-checked setDir, and keep order preference
      const searchSets = allSetsPreferredOrder.filter((s) => s !== setDir);
      const crossSetCandidates: string[] = [];
      for (const setName of searchSets) {
        const altRoots = wantKtx2
          ? [
              path.join(process.cwd(), "data-ktx2", setName),
              path.join(process.cwd(), "data", setName),
            ]
          : [path.join(process.cwd(), "data", setName)];
        for (const root of altRoots) {
          if (suffix) {
            for (const ext of exts)
              crossSetCandidates.push(path.join(root, suffix, `${base}.${ext}`));
          }
          for (const ext of exts) crossSetCandidates.push(path.join(root, `${base}.${ext}`));
        }
      }
      for (const p of crossSetCandidates) {
        try {
          await fs.promises.access(p, fs.constants.R_OK);
          found = p;
          break;
        } catch {}
      }
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
