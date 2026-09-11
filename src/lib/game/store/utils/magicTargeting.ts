import {
  isSpellcasterCard,
  isSpellcasterGrantingArtifact,
  isSpellcasterGrantingSite,
  type MagicTargetRange,
} from "@/lib/game/cardAbilities";
import type {
  BoardState,
  CellKey,
  GameState,
  MagicTarget,
  PendingMagic,
  PlayerKey,
  SiteTile,
} from "@/lib/game/store/types";
import { seatFromOwner } from "@/lib/game/store/utils/boardHelpers";

export type ProjectileDirection = "N" | "E" | "S" | "W";

export type ProjectileHit = {
  kind: "permanent" | "avatar";
  at: CellKey;
  index?: number;
};

export type ProjectileHits = Record<
  ProjectileDirection,
  ProjectileHit | null | undefined
>;

export type TilePos = { x: number; y: number };

/**
 * Where a spell is cast from: the chosen caster (avatar or spellcaster
 * permanent), falling back to the owner's avatar and finally the tile the
 * spell card was dropped on. Ranges and projectile lines are measured from
 * here.
 */
export function getMagicOrigin(
  pendingMagic: PendingMagic,
  avatars: GameState["avatars"],
): TilePos {
  const fallback = { x: pendingMagic.tile.x, y: pendingMagic.tile.y };
  const caster = pendingMagic.caster;
  const avatarPos = (seat: "p1" | "p2"): TilePos | null => {
    const pos = avatars?.[seat]?.pos as [number, number] | null | undefined;
    if (
      Array.isArray(pos) &&
      Number.isFinite(pos[0]) &&
      Number.isFinite(pos[1])
    ) {
      return { x: Number(pos[0]), y: Number(pos[1]) };
    }
    return null;
  };
  if (caster?.kind === "avatar") return avatarPos(caster.seat) ?? fallback;
  if (caster?.kind === "permanent") {
    const [cx, cy] = String(caster.at).split(",").map(Number);
    if (Number.isFinite(cx) && Number.isFinite(cy)) return { x: cx, y: cy };
  }
  return avatarPos(seatFromOwner(pendingMagic.spell.owner)) ?? fallback;
}

/**
 * Sorcery distances: "adjacent" shares an edge, "nearby" is the location
 * itself plus all eight surrounding locations, "steps" are orthogonal moves.
 */
export function isTileInMagicRange(
  range: MagicTargetRange | null | undefined,
  origin: TilePos,
  tile: TilePos,
): boolean {
  const dx = Math.abs(tile.x - origin.x);
  const dy = Math.abs(tile.y - origin.y);
  switch (range) {
    case "here":
      return dx === 0 && dy === 0;
    case "adjacent":
      return dx + dy === 1;
    case "nearby":
      return Math.max(dx, dy) <= 1;
    case "two-steps":
      return dx + dy <= 2;
    default:
      return true;
  }
}

/** Cardinal direction from origin to tile, or null when not in a straight line. */
export function projectileDirection(
  origin: TilePos,
  tile: TilePos,
): ProjectileDirection | null {
  if (origin.x === tile.x && origin.y === tile.y) return null;
  if (origin.x === tile.x) return tile.y < origin.y ? "N" : "S";
  if (origin.y === tile.y) return tile.x > origin.x ? "E" : "W";
  return null;
}

/** Tiles from origin (exclusive) towards `dir` up to and including `until`. */
export function isTileOnProjectilePath(
  origin: TilePos,
  dir: ProjectileDirection,
  tile: TilePos,
  until?: TilePos | null,
): boolean {
  const d = projectileDirection(origin, tile);
  if (d !== dir) return false;
  if (!until) return true;
  const dist = Math.abs(tile.x - origin.x) + Math.abs(tile.y - origin.y);
  const stop = Math.abs(until.x - origin.x) + Math.abs(until.y - origin.y);
  return dist <= stop;
}

export function cellToPos(at: CellKey | string): TilePos | null {
  const [x, y] = String(at).split(",").map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

/**
 * Build a projectile target for a click on `tile`. Returns null when the
 * tile is not in a straight line from the caster. `intended` is what the
 * caster clicked; `firstHit` is what the projectile will actually reach.
 */
export function buildProjectileTarget(
  pendingMagic: PendingMagic,
  avatars: GameState["avatars"],
  tile: TilePos,
  intended:
    | { kind: "permanent"; at: CellKey; index: number }
    | { kind: "avatar"; seat: "p1" | "p2" }
    | null,
  computeHits: () => ProjectileHits,
): MagicTarget | null {
  const origin = getMagicOrigin(pendingMagic, avatars);
  const direction = projectileDirection(origin, tile);
  if (!direction) return null;
  let firstHit: ProjectileHit | undefined;
  try {
    firstHit = computeHits()[direction] ?? undefined;
  } catch {
    firstHit = undefined;
  }
  return {
    kind: "projectile",
    direction,
    firstHit,
    intended: intended ?? undefined,
  };
}

/** Glow colour for things the caster may click next (casters, then targets). */
export const MAGIC_CANDIDATE_COLOR = "#f59e0b";

/** Board context needed to decide who may cast. */
export type MagicCasterContext = {
  permanents: GameState["permanents"];
  sites: BoardState["sites"];
};

/** A thing the player might click while choosing who casts. */
export type MagicCasterCandidate =
  | { kind: "avatar"; seat: PlayerKey }
  | { kind: "permanent"; at: CellKey; index: number }
  | { kind: "site"; at: CellKey };

/**
 * True when a permanent counts as a Spellcaster: it carries the keyword
 * itself (a wizard, an Omphalos, the Wicker Manikin), it bears an artifact
 * that grants Spellcaster (Merlin's Staff, Hand of Glory, ...), or it stands
 * on a site that grants it (Standing Stones).
 */
export function isSpellcasterPermanent(
  ctx: MagicCasterContext,
  at: CellKey,
  index: number,
): boolean {
  const list = ctx.permanents[at] || [];
  const item = list[index];
  if (!item || item.attachedTo) return false;
  if (isSpellcasterCard(item.card?.name, item.card?.text ?? null)) return true;
  // An artifact carried by this permanent may grant the keyword.
  const bearsGrantingArtifact = list.some(
    (p) =>
      p?.attachedTo &&
      p.attachedTo.at === at &&
      p.attachedTo.index === index &&
      isSpellcasterGrantingArtifact(p.card?.name),
  );
  if (bearsGrantingArtifact) return true;
  // Standing Stones and friends turn the minions standing on them into
  // Spellcasters.
  return isSpellcasterGrantingSite(ctx.sites[at]?.card?.name);
}

/**
 * True when a site the player controls casts on its own and so may be picked
 * as the spellcaster (River of Flame, Merlin's Tower).
 */
export function isMagicSiteCasterCandidate(
  pendingMagic: PendingMagic,
  site: SiteTile | undefined | null,
): boolean {
  if (pendingMagic.status !== "choosingCaster") return false;
  if (!site || site.owner !== pendingMagic.spell.owner) return false;
  return isSpellcasterCard(site.card?.name, site.card?.text ?? null);
}

/**
 * True when this card may be picked as the spellcaster for the pending spell:
 * the spell owner's avatar, one of their Spellcaster permanents, or a site
 * they control that casts on its own (River of Flame, Merlin's Tower).
 */
export function isMagicCasterCandidate(
  pendingMagic: PendingMagic,
  candidate: MagicCasterCandidate,
  ctx: MagicCasterContext,
): boolean {
  if (pendingMagic.status !== "choosingCaster") return false;
  const owner = pendingMagic.spell.owner;
  const ownerSeat = seatFromOwner(owner);
  if (candidate.kind === "avatar") return candidate.seat === ownerSeat;
  if (candidate.kind === "site")
    return isMagicSiteCasterCandidate(pendingMagic, ctx.sites[candidate.at]);
  const item = ctx.permanents[candidate.at]?.[candidate.index];
  if (!item || item.owner !== owner) return false;
  return isSpellcasterPermanent(ctx, candidate.at, candidate.index);
}

/**
 * True when a unit / avatar on `tile` may be clicked as the spell's target
 * given the spell's mode and range from the chosen caster.
 */
export function isMagicTargetCandidate(
  pendingMagic: PendingMagic,
  avatars: GameState["avatars"],
  tile: TilePos,
  kind: "permanent" | "avatar",
): boolean {
  if (pendingMagic.status !== "choosingTarget" || pendingMagic.target)
    return false;
  const hints = pendingMagic.hints;
  const mode = hints?.mode ?? "single";
  const origin = getMagicOrigin(pendingMagic, avatars);
  if (mode === "projectile") return projectileDirection(origin, tile) !== null;
  if (mode !== "single") return false;
  const allowed =
    kind === "permanent"
      ? hints?.allow?.permanent !== false
      : hints?.allow?.avatar !== false;
  return allowed && isTileInMagicRange(hints?.range ?? "global", origin, tile);
}

/** Short label for the HUD describing what kind of target the spell wants. */
export function describeMagicMode(
  hints: PendingMagic["hints"] | null | undefined,
): string {
  switch (hints?.mode) {
    case "projectile":
      return "Projectile";
    case "site":
      return "Site";
    case "area":
      return "Area";
    case "none":
      return "No target";
    case "single":
      return "Single target";
    default:
      return "Target";
  }
}

export function describeMagicRange(
  hints: PendingMagic["hints"] | null | undefined,
): string | null {
  switch (hints?.range) {
    case "here":
      return "here";
    case "adjacent":
      return "adjacent";
    case "nearby":
      return "nearby";
    case "two-steps":
      return "up to two steps away";
    default:
      return null;
  }
}
