import { getPermanentOwnerBaseZ } from "@/lib/game/boardShared";
import { TILE_SIZE } from "@/lib/game/constants";
import type {
  AvatarState,
  BoardState,
  CardRef,
  GameState as StoreState,
  Permanents,
  PermanentItem,
  Phase,
  PlayerKey,
  SiteTile,
  Zones,
} from "@/lib/game/store/types";
import { computeAvailableMana } from "@/lib/game/store/utils/resourceHelpers";
import { TOKEN_BY_NAME, tokenCardId, tokenSlug } from "@/lib/game/tokens";
import type { PlayerId, PlayerView, Region } from "@sorcery/shared";
import { cardRefFor } from "./cardIndex";
import { engineCellKey, engineToBoard } from "./coords";

/** The fields of PlayerView.players[i] we read (the engine types the array loosely). */
interface ViewPlayer {
  id: PlayerId;
  avatarUnitId: string;
  mana: number;
  hand: string[];
  cemetery: string[];
  banished: string[];
  atlasCount: number;
  spellbookCount: number;
  /** the deck's fetch pool: card name -> remaining copies (owner-only in the view) */
  collection?: Record<string, number>;
}

/** The store slice the engine owns while an engine match is running. */
export type ProjectedState = Pick<
  StoreState,
  | "board"
  | "permanents"
  | "avatars"
  | "zones"
  | "players"
  | "phase"
  | "currentPlayer"
  | "turn"
  | "hasDrawnThisTurn"
  | "matchEnded"
  | "winner"
  | "portalState"
>;

/**
 * Which layer of the realm the board shows, like Untested Realm's subsurface view: the surface
 * (and the void), or what is burrowed underground / submerged underwater beneath the sites.
 */
export type BoardLayer = "surface" | "subsurface";

export const layerOf = (region: Region): BoardLayer =>
  region === "underground" || region === "underwater" ? "subsurface" : "surface";

/** Units on the layer the board is not showing, per board cell. */
export interface HiddenCounts {
  underground: number;
  underwater: number;
  surface: number;
}

/**
 * The engine's event animation for one resolved action, already in board space.
 *
 * Upstream builds this for us in `state.flow.areaReveal` (effects.ts, "a numbered grid shown
 * to BOTH players after a multi-location damage spell resolves, then fades … the client
 * animates it when `seq` changes") and it covers spells, activated abilities AND triggers.
 * It is also fingerprint-gated upstream (turn.ts `turnFingerprint`) so a trigger that did
 * nothing never flashes.
 */
export interface BoardReveal {
  /** monotonic; a new value means a new event to animate */
  seq: number;
  /** damage that landed, per board cell */
  hits: { at: string; dmg: number }[];
  /** cells the action affected without damaging them */
  sites: string[];
  /** the acting card's cell */
  caster: string | null;
  /** the caption the engine wrote: a spell name, "<card> shoots!", or "<card>'s ability" */
  name: string;
  element: string;
}

/** The `flow.areaReveal` shape; the engine types `flow` as `any`. */
interface RawAreaReveal {
  seq?: number;
  cells?: { x: number; y: number; dmg: number }[];
  redSites?: { x: number; y: number }[];
  casterId?: string;
  name?: string;
  element?: string;
}

/**
 * Read the engine's pending reveal, or null when there is nothing new since `sinceSeq`.
 * Damage on the same square is summed so a volley reads as one number, not a pile-up.
 */
export function boardReveal(view: PlayerView, sinceSeq: number): BoardReveal | null {
  const flow = (view as unknown as { flow?: { areaReveal?: RawAreaReveal } }).flow;
  const raw = flow?.areaReveal;
  const seq = raw?.seq ?? 0;
  if (!raw || seq <= sinceSeq) return null;
  const totals = new Map<string, number>();
  for (const cell of raw.cells ?? []) {
    if (!cell || typeof cell.dmg !== "number" || cell.dmg <= 0) continue;
    const at = engineCellKey(cell.x, cell.y);
    totals.set(at, (totals.get(at) ?? 0) + cell.dmg);
  }
  const hits = [...totals].map(([at, dmg]) => ({ at, dmg }));
  const damaged = new Set(totals.keys());
  // a square that took damage already says so with its number; don't also glow it
  const sites = [...new Set((raw.redSites ?? []).map((s) => engineCellKey(s.x, s.y)))].filter((at) => !damaged.has(at));
  const source = raw.casterId ? (view.units[raw.casterId] ?? view.sites?.[raw.casterId]) : null;
  const caster =
    source && typeof source.x === "number" && typeof source.y === "number" ? engineCellKey(source.x, source.y) : null;
  // nothing to draw: an empty reveal must not blank a still-running animation
  if (!hits.length && !sites.length && !caster) return null;
  return { seq, hits, sites, caster, name: raw.name ?? "", element: raw.element ?? "none" };
}

export function hiddenLayerCounts(view: PlayerView, layer: BoardLayer): Record<string, HiddenCounts> {
  const out: Record<string, HiddenCounts> = {};
  for (const unit of Object.values(view.units)) {
    if (unit.isAvatar || unit.carriedBy || layerOf(unit.region) === layer) continue;
    const counts = (out[engineCellKey(unit.x, unit.y)] ??= { underground: 0, underwater: 0, surface: 0 });
    if (unit.region === "underground") counts.underground++;
    else if (unit.region === "underwater") counts.underwater++;
    else counts.surface++;
  }
  return out;
}

/**
 * Auras cover an area (usually 2×2) but our board keeps each card on one tile: anchor it on the
 * covered square nearest the area's centre and shift the card onto that centre (where a 2×2
 * aura's four squares meet), cancelling the usual nudge toward the owner. The covered squares
 * themselves are tinted by EngineLayerOverlay.
 */
export function auraPlacement(
  squares: { x: number; y: number }[],
  owner: 1 | 2,
): { at: string; offset: [number, number] } | null {
  const cells = squares.map((sq) => engineToBoard(sq.x, sq.y));
  if (cells.length === 0) return null;
  const cx = cells.reduce((sum, c) => sum + c.x, 0) / cells.length;
  const cy = cells.reduce((sum, c) => sum + c.y, 0) / cells.length;
  const anchor = cells.reduce((a, b) => (Math.hypot(b.x - cx, b.y - cy) < Math.hypot(a.x - cx, a.y - cy) ? b : a));
  return {
    at: `${anchor.x},${anchor.y}`,
    offset: [(cx - anchor.x) * TILE_SIZE, (cy - anchor.y) * TILE_SIZE - getPermanentOwnerBaseZ(owner)],
  };
}

/** The human is engine seat 0 = our P1 (bottom of the board). */
export const seatKey = (seat: PlayerId): PlayerKey => (seat === 0 ? "p1" : "p2");
const seatOwner = (seat: PlayerId): 1 | 2 => (seat === 0 ? 1 : 2);

const PHASES: Record<PlayerView["phase"], Phase> = {
  mulligan: "Setup",
  start: "Start",
  main: "Main",
  end: "End",
  over: "End",
};

/** One of our token cards (Frog, Lance, Stealth, Ward, Rubble…), drawn the way the board draws tokens. */
function tokenCard(name: string, instanceId: string, owner: PlayerKey): CardRef | null {
  const def = TOKEN_BY_NAME[name.toLowerCase()];
  if (!def) return null;
  return { cardId: tokenCardId(def), name: def.name, type: "Token", subTypes: def.subTypes ?? null, slug: tokenSlug(def), instanceId, owner };
}

function cardOf(view: PlayerView, instanceId: string, owner: PlayerKey): CardRef {
  const inst = view.cards[instanceId];
  if (!inst) return hiddenCard(instanceId, owner, "Unknown");
  // the engine's token minions and the Lance artifact use our token art, like the rest of the board
  if (inst.isToken || inst.name === "Lance") {
    const token = tokenCard(inst.name, instanceId, owner);
    if (token && !TOKEN_BY_NAME[inst.name.toLowerCase()]?.siteReplacement) return token;
  }
  return { ...cardRefFor(inst.name), instanceId, owner };
}

/** Engine unit statuses shown as our status tokens attached to the unit. */
const STATUS_TOKENS: { flag: "stealth" | "ward" | "disabled" | "silenced"; token: string }[] = [
  { flag: "stealth", token: "Stealth" },
  { flag: "ward", token: "Ward" },
  { flag: "disabled", token: "Disabled" },
  { flag: "silenced", token: "Silenced" },
];

function hiddenCard(instanceId: string, owner: PlayerKey, name: string): CardRef {
  return { cardId: 0, name, type: null, instanceId, owner };
}

/** The fetch pool, expanded to one card per remaining copy so it browses like any other zone. */
function collectionCards(pool: Record<string, number> | undefined, owner: PlayerKey): CardRef[] {
  if (!pool) return [];
  const out: CardRef[] = [];
  for (const [name, copies] of Object.entries(pool)) {
    for (let i = 0; i < Math.max(0, copies); i++) {
      out.push({ ...cardRefFor(name), instanceId: `${owner}-collection-${name}-${i}` });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function pile(count: number, owner: PlayerKey, kind: "atlas" | "spellbook"): CardRef[] {
  return Array.from({ length: count }, (_, i) =>
    hiddenCard(`${owner}-${kind}-${i}`, owner, kind === "atlas" ? "Unknown Site" : "Unknown Spell"),
  );
}

function pushTo(permanents: Permanents, key: string, item: PermanentItem): number {
  (permanents[key] ??= []).push(item);
  return permanents[key].length - 1;
}

/** Project the engine's view for the human seat onto our store's board model. */
/** Board tile numbers (1–20, left→right, top→bottom) of each Harbinger's portents, after rotation. */
export function harbingerTiles(view: PlayerView): Partial<Record<PlayerKey, number[]>> {
  const portents = (view.flow as { harbinger?: Partial<Record<PlayerId, { x: number; y: number }[]>> } | undefined)?.harbinger;
  const out: Partial<Record<PlayerKey, number[]>> = {};
  for (const seat of [0, 1] as PlayerId[]) {
    const squares = portents?.[seat];
    if (!squares?.length) continue;
    out[seatKey(seat)] = squares.map((sq) => {
      const b = engineToBoard(sq.x, sq.y);
      return b.y * 5 + b.x + 1;
    });
  }
  return out;
}

/** Our portal overlay state for the engine's portents; portals appear once the setup step revealed them. */
function portalStateFor(view: PlayerView, revealed: boolean): ProjectedState["portalState"] {
  const tiles = harbingerTiles(view);
  const seats = (["p1", "p2"] as const).filter((seat) => tiles[seat]);
  if (!seats.length) return null;
  const player = (seat: PlayerKey) =>
    tiles[seat] ? { rolls: tiles[seat], tileNumbers: tiles[seat], rollPhase: "complete" as const } : null;
  return { harbingerSeats: [...seats], p1: player("p1"), p2: player("p2"), currentRoller: null, setupComplete: revealed };
}

export function projectView(view: PlayerView, layer: BoardLayer = "surface", portalsRevealed = true): ProjectedState {
  const players = view.players as ViewPlayer[];

  const sites: Record<string, SiteTile> = {};
  // sites become rubble when destroyed; flooded sites carry a Flooded token (both added below)
  const rubble: typeof view.sites[string][] = [];
  const flooded: typeof view.sites[string][] = [];
  for (const site of Object.values(view.sites)) {
    if (site.isRubble) {
      rubble.push(site);
      continue;
    }
    if (site.flooded) flooded.push(site);
    const owner = site.controller ?? site.owner;
    sites[engineCellKey(site.x, site.y)] = {
      owner: seatOwner(owner),
      tapped: site.tapped,
      card: { ...cardRefFor(site.name), instanceId: site.id, owner: seatKey(site.owner) },
    };
  }
  const board: BoardState = { size: { w: 5, h: 4 }, sites };

  const permanents: Permanents = {};
  const unitSlot = new Map<string, { at: string; index: number }>();
  const avatars: Record<PlayerKey, AvatarState> = {
    p1: { card: null, pos: null, tapped: false, offset: null },
    p2: { card: null, pos: null, tapped: false, offset: null },
  };

  for (const unit of Object.values(view.units)) {
    const owner = seatKey(unit.controller);
    if (unit.isAvatar) {
      const p = engineToBoard(unit.x, unit.y);
      avatars[seatKey(unit.owner)] = {
        card: cardOf(view, unit.cardId, seatKey(unit.owner)),
        pos: [p.x, p.y],
        tapped: unit.tapped,
        offset: null,
      };
      unitSlot.set(unit.id, { at: `${p.x},${p.y}`, index: -1 });
      continue;
    }
    // Avatars always show (they anchor the HUD); minions only on the layer being viewed.
    if (layerOf(unit.region) !== layer) continue;
    const at = engineCellKey(unit.x, unit.y);
    const index = pushTo(permanents, at, {
      card: cardOf(view, unit.cardId, owner),
      owner: seatOwner(unit.controller),
      instanceId: unit.id,
      tapped: unit.tapped,
      damage: unit.damage || null,
      offset: null,
      isCarried: Boolean(unit.carriedBy),
      enteredOnTurn: unit.enteredTurn,
      summonedThisTurn: unit.enteredTurn === view.turn,
    });
    unitSlot.set(unit.id, { at, index });
  }

  for (const artifact of Object.values(view.artifacts)) {
    const carrier = artifact.carriedBy ? unitSlot.get(artifact.carriedBy) : undefined;
    const carrierUnit = artifact.carriedBy ? view.units[artifact.carriedBy] : undefined;
    // carried artifacts travel with their bearer; loose ones sit on their own layer
    if (artifact.carriedBy ? !carrier : layerOf(artifact.region) !== layer) continue;
    const controller = carrierUnit?.controller ?? artifact.conjuredBy;
    const at = carrier?.at ?? engineCellKey(artifact.x, artifact.y);
    pushTo(permanents, at, {
      card: cardOf(view, artifact.cardId, seatKey(controller)),
      owner: seatOwner(controller),
      instanceId: artifact.id,
      tapped: artifact.tapped,
      offset: null,
      // index -1 attaches to the avatar standing on that tile (AvatarCard draws it)
      attachedTo: carrier ? { at: carrier.at, index: carrier.index } : null,
    });
  }

  for (const unit of Object.values(view.units)) {
    const slot = unitSlot.get(unit.id);
    if (!slot) continue;
    const owner = seatKey(unit.controller);
    for (const { flag, token } of STATUS_TOKENS) {
      if (!unit[flag]) continue;
      const card = tokenCard(token, `${unit.id}:${flag}`, owner);
      if (!card) continue;
      pushTo(permanents, slot.at, {
        card,
        owner: seatOwner(unit.controller),
        instanceId: card.instanceId,
        tapped: false,
        offset: null,
        attachedTo: { at: slot.at, index: slot.index },
      });
    }
  }

  if (layer === "surface") {
    for (const site of rubble) {
      const card = tokenCard("Rubble", `${site.id}:rubble`, seatKey(site.owner));
      if (card) pushTo(permanents, engineCellKey(site.x, site.y), { card, owner: seatOwner(site.owner), instanceId: card.instanceId, tapped: false, offset: null });
    }
    for (const site of flooded) {
      const controller = site.controller ?? site.owner;
      const card = tokenCard("Flooded", `${site.id}:flooded`, seatKey(controller));
      if (card) pushTo(permanents, engineCellKey(site.x, site.y), { card, owner: seatOwner(controller), instanceId: card.instanceId, tapped: false, offset: null });
    }
  }

  for (const aura of layer === "surface" ? Object.values(view.auras) : []) {
    const placed = auraPlacement(aura.squares, seatOwner(aura.controller));
    if (!placed) continue;
    pushTo(permanents, placed.at, {
      card: cardOf(view, aura.cardId, seatKey(aura.controller)),
      owner: seatOwner(aura.controller),
      instanceId: aura.id,
      tapped: false,
      offset: placed.offset,
    });
  }

  const zones = {} as Record<PlayerKey, Zones>;
  for (const p of players) {
    const key = seatKey(p.id);
    zones[key] = {
      hand: p.hand.map((id, i) =>
        id === "hidden" ? hiddenCard(`${key}-hand-${i}`, key, "Unknown") : cardOf(view, id, key),
      ),
      spellbook: pile(p.spellbookCount, key, "spellbook"),
      atlas: pile(p.atlasCount, key, "atlas"),
      graveyard: p.cemetery.map((id) => cardOf(view, id, key)),
      battlefield: [],
      // The deck's fetch pool ("from your collection" effects draw on it). The engine keeps it
      // as name -> remaining copies and shows it to its owner only (view.ts: `mine ? p.collection : {}`),
      // so an opponent's pool simply projects empty.
      collection: collectionCards(p.collection, key),
      banished: p.banished.map((id) => cardOf(view, id, key)),
    };
  }

  // Our store shows mana as (mana-providing sites) + offset; solve the offset for the engine's pool.
  const manaOffset = (seat: PlayerId): number => {
    const key = seatKey(seat);
    const fromSites = computeAvailableMana({ board, permanents, who: key, avatars, zones });
    return players[seat].mana - fromSites;
  };
  const lifeOf = (seat: PlayerId) => {
    const avatar = view.units[players[seat].avatarUnitId];
    const life = avatar?.life ?? 0;
    const lifeState: "alive" | "dd" | "dead" =
      view.phase === "over" && view.winner !== seat && !view.draw ? "dead" : avatar?.deathsDoor ? "dd" : "alive";
    return { life, lifeState, mana: manaOffset(seat) };
  };

  return {
    board,
    permanents,
    avatars,
    zones,
    players: { p1: lifeOf(0), p2: lifeOf(1) },
    phase: PHASES[view.phase],
    currentPlayer: seatOwner(view.activePlayer),
    turn: Math.max(1, view.turn),
    // The engine runs the draw (drawDeck prompt); keep our draw-phase helpers quiet.
    hasDrawnThisTurn: true,
    portalState: portalStateFor(view, portalsRevealed),
    matchEnded: view.phase === "over",
    winner: view.phase === "over" && view.winner !== null ? seatKey(view.winner) : null,
  };
}
