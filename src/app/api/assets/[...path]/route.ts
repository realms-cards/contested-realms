import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const ROOT_DATA = path.join(process.cwd(), "data");
const ROOT_KTX2 = path.join(process.cwd(), "data-ktx2");
const ROOT_WEBP = path.join(process.cwd(), "data-webp");
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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathSegments } = await params;
    const segments = (pathSegments ?? []).filter(Boolean);
    if (!segments.length) return new Response("Missing path", { status: 400 });

    // Prevent traversal
    if (
      segments.some(
        (s) => s.includes("..") || s.includes(":") || s.startsWith(".")
      )
    ) {
      return new Response("Bad path", { status: 400 });
    }

    // Determine requested extension from the last segment
    const last = segments[segments.length - 1];
    const requestedExt = path.extname(last).slice(1).toLowerCase();
    if (!ALLOWED_EXTS.has(requestedExt)) {
      return new Response("Unsupported type", { status: 415 });
    }

    // Optional flag to prefer ktx2 variants (mirrors /api/images behavior)
    const wantKtx2 = (() => {
      try {
        const u = new URL(_req.url);
        const v = u.searchParams.get("ktx2");
        return v === "1" || v === "true" || requestedExt === "ktx2";
      } catch {
        return requestedExt === "ktx2";
      }
    })();

    // If a CDN origin is configured, permanently redirect there instead of streaming from disk.
    const cdn = (process.env.ASSET_CDN_ORIGIN || process.env.NEXT_PUBLIC_TEXTURE_ORIGIN)?.trim();
    if (cdn) {
      const last = segments[segments.length - 1];
      const baseName = last.replace(/\.[^.]+$/, ""); // filename without extension

      // Assets that should be at CDN root (elements, card backs, playmat)
      const rootAssets = new Set([
        "playmat.jpg",
        "fire.png", "fire.webp",
        "air.png", "air.webp",
        "water.png", "water.webp",
        "earth.png", "earth.webp",
        "cardback_spellbook.png", "cardback_spellbook.webp",
        "cardback_atlas.png", "cardback_atlas.webp"
      ]);

      // Check if this is a root asset
      if (rootAssets.has(last)) {
        // First try .webp version for elements and cardbacks (except playmat which is .jpg)
        let cdnFile = last;
        if (!last.includes("playmat") && (last.endsWith(".png") || last.endsWith(".jpg"))) {
          // For elements and cardbacks, prefer .webp at root
          cdnFile = baseName + ".webp";
        }
        const cdnUrl = `${cdn.replace(/\/$/, "")}/${cdnFile}`;
        console.log(`[API assets] Redirecting ${last} to CDN root as ${cdnFile}: ${cdnUrl}`);
        return new Response(null, {
          status: 308,
          headers: {
            Location: cdnUrl,
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      }

      // Booster pack images live as PNGs under data/; do not try webp/ktx2
      const boosterBases = new Set([
        "alphabeta-booster",
        "arthurian-booster",
        // historical/alternate names
        "alpha-booster",
        "beta-booster",
        "arthurian-legends-booster",
      ]);
      if (boosterBases.has(baseName)) {
        // Do not redirect boosters to CDN; serve from local data below to avoid 404s
        // Fall through to local file resolution
      } else {

        // For card images and other assets
        // Determine the CDN directory based on format preference
        let cdnPath = "";

        // Check if this is a subdirectory request (like Dragonlord/cardname.png)
        const hasSubdir = segments.length > 1;
        const subdir = hasSubdir ? segments.slice(0, -1).join("/") : "";

        if (segments[0] === "tokens") {
          // Token images - map into data-* folders on the CDN
          if (wantKtx2 || requestedExt === "ktx2") {
            const ktx2Name = baseName + ".ktx2";
            cdnPath = `data-ktx2/tokens/${ktx2Name}`;
          } else if (requestedExt === "webp") {
            cdnPath = `data-webp/tokens/${last}`;
          } else if (requestedExt === "png" || requestedExt === "jpg" || requestedExt === "jpeg") {
            const webpName = baseName + ".webp";
            cdnPath = `data-webp/tokens/${webpName}`;
          } else {
            cdnPath = `data/tokens/${last}`;
          }
        } else if (segments[0] === "Dragonlord") {
          // Dragonlord assets - special handling since they're webp in both folders
          // For CDN, they should be in /data-webp/Dragonlord/
          const webpName = baseName + ".webp";
          cdnPath = `data-webp/Dragonlord/${webpName}`;
        } else if (hasSubdir) {
          // Other subdirectory assets - preserve path structure within data-* folders
          if (wantKtx2 || requestedExt === "ktx2") {
            const ktx2Name = baseName + ".ktx2";
            cdnPath = `data-ktx2/${subdir}/${ktx2Name}`;
          } else if (requestedExt === "webp") {
            cdnPath = `data-webp/${subdir}/${last}`;
          } else if (requestedExt === "png" || requestedExt === "jpg" || requestedExt === "jpeg") {
            const webpName = baseName + ".webp";
            cdnPath = `data-webp/${subdir}/${webpName}`;
          } else {
            cdnPath = `data/${subdir}/${last}`;
          }
        } else if (wantKtx2 || requestedExt === "ktx2") {
          // Prefer ktx2 format for cards at CDN
          const ktx2Name = baseName + ".ktx2";
          cdnPath = `data-ktx2/${ktx2Name}`;
        } else if (requestedExt === "webp") {
          // Already requesting webp
          cdnPath = `data-webp/${last}`;
        } else if (requestedExt === "png" || requestedExt === "jpg" || requestedExt === "jpeg") {
          // For raster images, try webp first
          const webpName = baseName + ".webp";
          cdnPath = `data-webp/${webpName}`;
        } else {
          // Default fallback to data directory
          cdnPath = `data/${last}`;
        }

        const cdnUrl = `${cdn.replace(/\/$/, "")}/${cdnPath}`;

        // Enhanced logging for texture usage tracking
        const logDetails = {
          requested: segments.join("/"),
          redirectTo: cdnUrl,
          format: requestedExt,
          wantKtx2,
          hasSubdir,
          subdir
        };
        console.log(`[API assets] Texture request:`, JSON.stringify(logDetails, null, 2));

        return new Response(null, {
          status: 308,
          headers: {
            Location: cdnUrl,
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      }
    }

    // Force specific assets to only use data directory (not ktx2)
    const dataOnlyAssets = new Set([
      "fire.png",
      "air.png",
      "water.png",
      "earth.png",
      // Booster pack images
      "beta-booster.png",
      "alpha-booster.png",
      "arthurian-legends-booster.png",
      // Our current filenames used by UI
      "alphabeta-booster.png",
      "arthurian-booster.png",
    ]);

    const shouldForceDataOnly = segments.some(
      (segment) =>
        dataOnlyAssets.has(segment) ||
        dataOnlyAssets.has(segment.replace(/\.[^.]+$/, ".png"))
    );

    const roots = wantKtx2 && !shouldForceDataOnly
      ? [ROOT_KTX2, ROOT_WEBP, ROOT_DATA]
      : [ROOT_WEBP, ROOT_DATA];

    // Build candidate paths.
    // If ?ktx2 was requested for a raster path, first try swapping extension to .ktx2.
    // For raster fallback, prefer a .webp variant before the originally requested file.
    const candidates: string[] = [];
    for (const root of roots) {
      if (wantKtx2 && requestedExt !== "ktx2" && !shouldForceDataOnly) {
        const ktx2Name = last.replace(/\.[^.]+$/, ".ktx2");
        const ktx2Path = path.join(root, ...segments.slice(0, -1), ktx2Name);
        candidates.push(ktx2Path);
      }
      if (requestedExt !== "ktx2") {
        const ext = requestedExt;
        if (["png", "jpg", "jpeg"].includes(ext)) {
          const webpName = last.replace(/\.[^.]+$/, ".webp");
          const webpPath = path.join(root, ...segments.slice(0, -1), webpName);
          candidates.push(webpPath);
        }
      }
      candidates.push(path.join(root, ...segments));
    }
    
    // Debug logging for cardback files
    if (last.includes("cardback")) {
      console.log("[API assets] Debug for", last, {
        wantKtx2,
        shouldForceDataOnly,
        roots: roots.map(r => path.basename(r)),
        candidates,
        requestedExt,
        segments
      });
    }

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
    const body = new Uint8Array(buf);
    const outExt = path.extname(found).slice(1).toLowerCase();

    return new Response(body, {
      headers: {
        "Content-Type": contentTypeFor(outExt),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
