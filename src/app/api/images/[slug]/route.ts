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
      return "dragonlord";
    case "drl":
      return "dragonlord";
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

function dirVariants(name: string): string[] {
  const lower = name.toLowerCase();
  const upperFirst = name.charAt(0).toUpperCase() + name.slice(1);
  return Array.from(new Set([name, lower, upperFirst].filter(Boolean)));
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
    const setDirVariants = dirVariants(setDir);

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

    // If a CDN origin is configured, permanently redirect there instead of streaming from disk.
    const cdn = (process.env.ASSET_CDN_ORIGIN || process.env.NEXT_PUBLIC_TEXTURE_ORIGIN)?.trim();
    if (cdn) {
      // Build CDN path using the same set/slug logic
      const setDir = setDirFromSlug(slug);
      if (!setDir) return new Response("Unknown set", { status: 404 });
      const base = imageBasenameFromSlug(slug);
      const suffix = suffixDirFromBasename(base);
      // Prefer .ktx2 when requested, otherwise default to .webp for better raster compression
      const name = wantKtx2 ? `${base}.ktx2` : `${base}.webp`;
      const baseDir = wantKtx2 ? "data-ktx2" : "data-webp";
      const normalizedSetDir = setDir.toLowerCase();
      const pathParts = suffix
        ? [baseDir, normalizedSetDir, suffix, name]
        : [baseDir, normalizedSetDir, name];
      const cdnUrl = `${cdn.replace(/\/$/, '')}/${pathParts.join('/')}`;
      return new Response(null, {
        status: 308,
        headers: {
          Location: cdnUrl,
          // Allow the redirect to be cached by the browser/CDN
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }
    // Roots to search.
    // - For KTX2, prefer data-ktx2 output dir then fallback to data (original rasters).
    // - For raster, prefer WebP under data-webp first, then fallback to original data.
    const roots = (() => {
      const preferredBases = wantKtx2
        ? ["data-ktx2", "data"]
        : ["data-webp", "data"];
      const seen = new Set<string>();
      const result: string[] = [];
      for (const baseDir of preferredBases) {
        for (const variant of setDirVariants) {
          const candidate = path.join(process.cwd(), baseDir, variant);
          if (!seen.has(candidate)) {
            seen.add(candidate);
            result.push(candidate);
          }
        }
      }
      return result;
    })();

    // Prefer WebP for raster when available, then PNG/JPEG as fallback
    const exts = wantKtx2 ? ["ktx2"] : ["webp", "png", "jpg", "jpeg"];
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
        "dragonlord",
      ];
      // Ensure we don't duplicate the already-checked setDir, and keep order preference
      const searchSets = allSetsPreferredOrder.filter((s) => s !== setDir);
      const crossSetCandidates: string[] = [];
      for (const setName of searchSets) {
        const altVariants = dirVariants(setName);
        const altRoots = wantKtx2
          ? altVariants.flatMap((variant) => [
              path.join(process.cwd(), "data-ktx2", variant),
              path.join(process.cwd(), "data", variant),
            ])
          : altVariants.flatMap((variant) => [
              path.join(process.cwd(), "data-webp", variant),
              path.join(process.cwd(), "data", variant),
            ]);
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
