import type { NextRequest } from "next/server";
export const dynamic = "force-dynamic";

const SETS_WITH_SUFFIX_DIRS = new Set(["alpha", "beta", "arthurian_legends"]);

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

    // If a CDN origin is configured, permanently redirect there instead of streaming from disk.
    const cdn = (process.env.ASSET_CDN_ORIGIN || process.env.NEXT_PUBLIC_TEXTURE_ORIGIN)?.trim();
    const forceCdn = (process.env.FORCE_TEXTURE_CDN || "").toLowerCase();
    const shouldRedirectToCdn =
      !!cdn && (process.env.NODE_ENV === "production" || forceCdn === "1" || forceCdn === "true");
    if (shouldRedirectToCdn) {
      // Build CDN path using the same set/slug logic
      const setDir = setDirFromSlug(slug);
      if (!setDir) return new Response("Unknown set", { status: 404 });
      const base = imageBasenameFromSlug(slug);
      const suffix = suffixDirFromBasename(base);
      const normalizedSetDir = setDir.toLowerCase();
      const cdnSuffix = suffix && SETS_WITH_SUFFIX_DIRS.has(normalizedSetDir) ? suffix : null;
      // Prefer .ktx2 when requested, otherwise default to .webp for better raster compression
      const name = wantKtx2 ? `${base}.ktx2` : `${base}.webp`;
      const baseDir = wantKtx2 ? "data-ktx2" : "data-webp";
      const pathParts = cdnSuffix
        ? [baseDir, normalizedSetDir, cdnSuffix, name]
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
    if (process.env.NODE_ENV !== "development") {
      console.error(
        "[api/images] Missing ASSET_CDN_ORIGIN or NEXT_PUBLIC_TEXTURE_ORIGIN in production; set one to serve textures without bundling local assets."
      );
      return new Response("Texture CDN not configured", { status: 502 });
    }

    const { serveLocalAsset } = await import("./serve-local");
    return serveLocalAsset({
      base,
      suffix,
      wantKtx2,
      primarySetDir: setDir,
    });
  } catch (e) {
    console.error("/api/images error", e);
    return new Response("Server error", { status: 500 });
  }
}
