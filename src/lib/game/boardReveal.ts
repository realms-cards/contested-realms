/**
 * Tracks when a match board is fully loaded, so the online match page can keep
 * its loading curtain up until the table, lighting, playmat and the player's
 * own hand are all on screen, and then reveal them together.
 *
 * The loaders report from inside the 3D canvas while the page reads outside
 * it. Deliberately has no "use client" directive (see userBadgePresence.ts):
 * the directive gives each importing client boundary its own copy of the
 * module state, which would break that hand-off.
 */
export type BoardAsset = "lighting" | "table" | "playmat" | "grid";

const BOARD_ASSETS: readonly BoardAsset[] = [
  "lighting",
  "table",
  "playmat",
  "grid",
];

const readyAssets = new Set<BoardAsset>();
// Card slugs whose texture finished loading or gave up after its retries.
const settledTextures = new Set<string>();
let version = 0;
const listeners = new Set<() => void>();

function emit() {
  version += 1;
  for (const listener of listeners) listener();
}

export function markBoardAssetReady(asset: BoardAsset): void {
  if (readyAssets.has(asset)) return;
  readyAssets.add(asset);
  emit();
}

export function markCardTextureSettled(slug: string): void {
  if (!slug || settledTextures.has(slug)) return;
  settledTextures.add(slug);
  emit();
}

/**
 * Forget the board assets for a new match; the next board re-reports on mount.
 * Settled card textures stay, because the texture cache keeps them loaded.
 */
export function resetBoardAssets(): void {
  if (readyAssets.size === 0) return;
  readyAssets.clear();
  emit();
}

export function getBoardAssetStatus(): Record<BoardAsset, boolean> {
  return {
    lighting: readyAssets.has("lighting"),
    table: readyAssets.has("table"),
    playmat: readyAssets.has("playmat"),
    grid: readyAssets.has("grid"),
  };
}

export function isBoardEnvironmentReady(): boolean {
  return BOARD_ASSETS.every((asset) => readyAssets.has(asset));
}

export function countSettledTextures(slugs: readonly string[]): number {
  return slugs.filter((slug) => settledTextures.has(slug)).length;
}

export function subscribeToBoardAssets(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getBoardAssetsVersion(): number {
  return version;
}

export function getBoardAssetsServerVersion(): number {
  return 0;
}
