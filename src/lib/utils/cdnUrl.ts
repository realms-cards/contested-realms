/**
 * CDN URL utilities for direct image/asset loading.
 *
 * These functions allow clients to resolve CDN URLs directly,
 * bypassing the /api/images and /api/assets routes to reduce
 * serverless function invocations.
 */

import artFallbackTable from "../../../data/registry/art-fallback.json";

const CDN_ORIGIN =
  process.env.NEXT_PUBLIC_TEXTURE_ORIGIN || "https://cdn.realms.cards";

// Set directory mapping (matches /api/images logic)
const SET_DIR_MAP: Record<string, string> = {
  alp: "alpha",
  bet: "beta",
  art: "arthurian_legends",
  dra: "dragonlord",
  drl: "dragonlord",
  got: "gothic",
  gth: "gothic",
  pro: "promo",
};

// Sets that use suffix subdirectories (e.g., alpha/b_s/cardname.webp)
const SETS_WITH_SUFFIX_DIRS = new Set(["alpha", "beta", "arthurian_legends"]);

// Printings that exist upstream but that we hold no art for. Each falls back to
// another printing of the same card, or to generic token art. Generated from
// sorcery-registry by scripts/registry/sync-registry.js - do not hand-edit.
type ArtFallback = { slug?: string; token?: string; reason?: string };
const ART_FALLBACKS = artFallbackTable as Record<string, ArtFallback>;

/**
 * Returns the substitute art for a printing we hold no assets for, or null when
 * the printing's own art is available.
 */
function getArtFallback(normalizedSlug: string): ArtFallback | null {
  const direct = ART_FALLBACKS[normalizedSlug];
  if (direct) return direct;
  // Predates the generated table: any City of Glass promo finish, not just the
  // one printing the registry lists
  if (
    normalizedSlug.startsWith("pro_") &&
    normalizedSlug.includes("city_of_glass")
  ) {
    return { slug: "got_city_of_glass_b_s", reason: "promo-variant" };
  }
  return null;
}

/**
 * Check if CDN direct loading is enabled.
 * Returns true if NEXT_PUBLIC_TEXTURE_ORIGIN is set.
 */
export function isCdnEnabled(): boolean {
  return !!CDN_ORIGIN && CDN_ORIGIN !== "";
}

/**
 * Get the CDN origin URL.
 */
export function getCdnOrigin(): string {
  return CDN_ORIGIN.replace(/\/$/, "");
}

/**
 * Convert a slug to CDN URL for card images.
 *
 * @param slug - Card variant slug (e.g., "bet_cardname_b_s" or "bet-cardname-b-s")
 * @param preferKtx2 - Request KTX2 format (for 3D rendering)
 * @returns CDN URL or null if CDN is not configured
 */
export function getCardImageCdnUrl(
  slug: string,
  preferKtx2 = false,
): string | null {
  if (!isCdnEnabled()) return null;

  // Normalize slug: convert hyphens to underscores
  let normalizedSlug = slug.toLowerCase();
  // Convert set prefix separator: bet-card -> bet_card
  normalizedSlug = normalizedSlug.replace(/^([a-z]{3})-/, "$1_");
  // Convert finish suffix separators: card-b-s -> card_b_s
  normalizedSlug = normalizedSlug.replace(/-([a-z]{1,2})-([sfea])$/, "_$1_$2");

  // Substitute art for printings we don't hold assets for (e.g. the promo
  // City of Glass foil -> the Gothic standard printing of the same card)
  const fallback = getArtFallback(normalizedSlug);
  if (fallback?.slug) {
    normalizedSlug = fallback.slug;
  } else if (fallback?.token) {
    // Generic token art is stored by card name, outside the per-set directories
    const ext = preferKtx2 ? "ktx2" : "webp";
    const baseDir = preferKtx2 ? "data-ktx2" : "data-webp";
    return `${getCdnOrigin()}/${baseDir}/tokens/${fallback.token}.${ext}`;
  }

  // Extract set code (first 3 chars)
  const setCode = normalizedSlug.slice(0, 3);
  const setDir = SET_DIR_MAP[setCode];
  if (!setDir) return null;

  // Extract base filename (remove set prefix)
  const base = normalizedSlug.replace(/^[a-z]{3}_/, "");

  // Determine suffix directory (e.g., "b_s" from "cardname_b_s")
  const parts = base.split("_");
  let suffixDir: string | null = null;
  if (parts.length >= 3 && SETS_WITH_SUFFIX_DIRS.has(setDir)) {
    suffixDir = `${parts[parts.length - 2]}_${parts[parts.length - 1]}`;
  }

  // Build CDN path
  const ext = preferKtx2 ? "ktx2" : "webp";
  const baseDir = preferKtx2 ? "data-ktx2" : "data-webp";
  const filename = `${base}.${ext}`;

  const pathParts = suffixDir
    ? [baseDir, setDir, suffixDir, filename]
    : [baseDir, setDir, filename];

  return `${getCdnOrigin()}/${pathParts.join("/")}`;
}

/**
 * Get fallback API URL for card images (used when CDN fails or is disabled).
 */
export function getCardImageApiUrl(slug: string, preferKtx2 = false): string {
  const params = preferKtx2 ? "?ktx2=1" : "";
  return `/api/images/${encodeURIComponent(slug)}${params}`;
}

/**
 * Get card image URL - prefers CDN, falls back to API.
 *
 * @param slug - Card variant slug
 * @param preferKtx2 - Request KTX2 format
 * @returns URL string (CDN if available, otherwise API)
 */
export function getCardImageUrl(slug: string, preferKtx2 = false): string {
  return (
    getCardImageCdnUrl(slug, preferKtx2) || getCardImageApiUrl(slug, preferKtx2)
  );
}

/**
 * Get static asset CDN URL (elements, cardbacks, boosters, etc.)
 *
 * @param assetPath - Asset path (e.g., "fire.png", "cardback_spellbook.png")
 * @returns CDN URL or API fallback
 */
export function getAssetUrl(assetPath: string): string {
  if (!isCdnEnabled()) {
    return `/api/assets/${assetPath}`;
  }

  const cdn = getCdnOrigin();
  const filename = assetPath.split("/").pop() || assetPath;
  const baseName = filename.replace(/\.[^.]+$/, "");

  // Root assets (elements, cardbacks, boosters)
  const rootAssets = new Set([
    "playmat.jpg",
    "fire",
    "air",
    "water",
    "earth",
    "cardback_spellbook",
    "cardback_atlas_landscape",
    "alphabeta-booster",
    "arthurian-booster",
    "dragonlord-booster",
    "gothic-booster",
  ]);

  // Check if this is a root asset (strip extension for comparison)
  if (rootAssets.has(baseName) || rootAssets.has(filename)) {
    // Boosters and playmat stay as-is, elements/cardbacks prefer webp
    if (filename.includes("booster") || filename.includes("playmat")) {
      return `${cdn}/${filename}`;
    }
    return `${cdn}/${baseName}.webp`;
  }

  // Token images
  if (assetPath.toLowerCase().startsWith("tokens/")) {
    const tokenName = baseName + ".webp";
    return `${cdn}/data-webp/tokens/${tokenName}`;
  }

  // Other assets - prefer webp in data-webp folder
  return `${cdn}/data-webp/${baseName}.webp`;
}

/**
 * Preload an image URL (for prefetching/caching).
 * Returns a promise that resolves when loaded or rejects on error.
 */
export function preloadImage(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to load: ${url}`));
    img.src = url;
  });
}
