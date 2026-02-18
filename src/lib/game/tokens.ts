export type TokenSize = "small" | "normal";

export type TokenDef = {
  key: string; // stable identifier (file base)
  name: string;
  fileBase: string; // without extension; assets live under /api/assets/tokens/{fileBase}.ktx2
  size: TokenSize;
  siteReplacement?: boolean; // true for tokens meant to replace sites (rotate like sites)
  textureRotation?: number;
  isMinion?: boolean; // true for minion tokens that can carry artifacts (Skeleton, Frog, etc.)
  markerOnly?: boolean; // true for tokens that are only used as markers (not shown in token pile)
};

// Registry of known tokens. Extend this list as new tokens are added.
export const TOKEN_DEFS: TokenDef[] = [
  {
    key: "Bruin",
    name: "Bruin",
    fileBase: "Bruin",
    size: "normal",
    isMinion: true,
  },
  { key: "Disabled", name: "Disabled", fileBase: "Disabled", size: "small" },
  {
    key: "Foot_Soldier",
    name: "Foot Soldier",
    fileBase: "Foot_Soldier",
    size: "small",
    isMinion: true,
  },
  { key: "Flooded", name: "Flooded", fileBase: "Flooded", size: "small" },
  { key: "Lance", name: "Lance", fileBase: "Lance", size: "small" },
  {
    key: "Frog",
    name: "Frog",
    fileBase: "Frog",
    size: "small",
    isMinion: true,
  },
  {
    key: "Skeleton",
    name: "Skeleton",
    fileBase: "Skeleton",
    size: "small",
    isMinion: true,
  },
  { key: "Stealth", name: "Stealth", fileBase: "Stealth", size: "small" },
  {
    key: "Tawny",
    name: "Tawny",
    fileBase: "Tawny",
    size: "small",
    isMinion: true,
  },
  { key: "Ward", name: "Ward", fileBase: "ward", size: "small" },
  {
    key: "Rubble",
    name: "Rubble",
    fileBase: "Rubble",
    size: "normal",
    siteReplacement: true,
    textureRotation: -Math.PI / 2,
  },
  { key: "Burned", name: "Burned", fileBase: "burned", size: "small" },
  { key: "Silenced", name: "Silenced", fileBase: "Silenced", size: "small", markerOnly: true },
];

export const TOKEN_BY_KEY = Object.fromEntries(
  TOKEN_DEFS.map((t) => [t.key.toLowerCase(), t]),
) as Record<string, TokenDef>;

export const TOKEN_BY_NAME = Object.fromEntries(
  TOKEN_DEFS.map((t) => [t.name.toLowerCase(), t]),
) as Record<string, TokenDef>;

export function tokenTextureUrl(def: TokenDef): string {
  // Return canonical PNG path; useCardTexture decides whether to upgrade to KTX2.
  return `/api/assets/tokens/${def.fileBase}.png`;
}

// Simple deterministic id base for tokens (negative ids to avoid clashing with real cards)
export function tokenCardId(def: TokenDef): number {
  // 32-bit FNV-1a hash of key, then make negative
  let hash = 0x811c9dc5;
  const s = def.key;
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  const asSigned = hash | 0 || 1;
  return -Math.abs(asSigned);
}

export function tokenSlug(def: TokenDef): string {
  return `token:${def.fileBase}`;
}

// Generate a unique cardId for each token instance to avoid collisions
// with other tokens of the same type (used for React keys and physics IDs).
let TOKEN_SEQ = 1;
export function newTokenInstanceId(def: TokenDef): number {
  const base = tokenCardId(def); // negative and type-specific
  // Mix in a small sequence and time component to ensure uniqueness per session
  const salt = ((Date.now() & 0xffff) << 8) | (TOKEN_SEQ++ & 0xff);
  // Keep result negative to avoid clashing with real ids
  const out = base * 1000 - (salt & 0x7fffffff);
  return out | 0;
}

// Minion token names that can carry artifacts (like regular minions)
const MINION_TOKEN_NAMES = new Set(
  TOKEN_DEFS.filter((t) => t.isMinion).map((t) => t.name.toLowerCase()),
);

/**
 * Check if a token name represents a minion token (can carry artifacts).
 * Minion tokens: Skeleton, Frog, Foot Soldier, Bruin, Tawny
 * Non-minion tokens: Lance, Ward, Disabled, Flooded, Rubble, Burned, Silenced, Stealth
 */
export function isMinionToken(tokenName: string | undefined | null): boolean {
  if (!tokenName) return false;
  return MINION_TOKEN_NAMES.has(tokenName.toLowerCase());
}
