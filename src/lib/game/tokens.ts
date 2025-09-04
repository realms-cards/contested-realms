export type TokenSize = "small" | "normal";

export type TokenDef = {
  key: string; // stable identifier (file base)
  name: string;
  fileBase: string; // without extension; assets live under /api/assets/tokens/{fileBase}.ktx2
  size: TokenSize;
  siteReplacement?: boolean; // true for tokens meant to replace sites (rotate like sites)
};

// Registry of known tokens. Extend this list as new tokens are added.
export const TOKEN_DEFS: TokenDef[] = [
  { key: "Bruin", name: "Bruin", fileBase: "Bruin", size: "normal" },
  { key: "Disabled", name: "Disabled", fileBase: "Disabled", size: "small" },
  { key: "Foot_Soldier", name: "Foot Soldier", fileBase: "Foot_Soldier", size: "small" },
  { key: "Flooded", name: "Flooded", fileBase: "Flooded", size: "small" },
  { key: "Lance", name: "Lance", fileBase: "Lance", size: "small" },
  { key: "Frog", name: "Frog", fileBase: "Frog", size: "small" },
  { key: "Stealth", name: "Stealth", fileBase: "Stealth", size: "small" },
  { key: "Tawny", name: "Tawny", fileBase: "Tawny", size: "small" },
  { key: "Rubble", name: "Rubble", fileBase: "Rubble", size: "normal", siteReplacement: true },
];

export const TOKEN_BY_KEY = Object.fromEntries(
  TOKEN_DEFS.map((t) => [t.key.toLowerCase(), t])
) as Record<string, TokenDef>;

export const TOKEN_BY_NAME = Object.fromEntries(
  TOKEN_DEFS.map((t) => [t.name.toLowerCase(), t])
) as Record<string, TokenDef>;

export function tokenTextureUrl(def: TokenDef): string {
  // Ask for raster with ?ktx2=1 so the API swaps to KTX2 seamlessly
  return `/api/assets/tokens/${def.fileBase}.png?ktx2=1`;
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
  const asSigned = (hash | 0) || 1;
  return -Math.abs(asSigned);
}

export function tokenSlug(def: TokenDef): string {
  return `token:${def.fileBase}`;
}
