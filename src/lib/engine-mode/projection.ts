import { getPermanentOwnerBaseZ } from "@/lib/game/boardShared";
import { CARD_LONG, CARD_SHORT, TILE_SIZE } from "@/lib/game/constants";
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
import { MAX_EVENTS } from "@/lib/game/store/types";
import { computeAvailableMana } from "@/lib/game/store/utils/resourceHelpers";
import { TOKEN_BY_NAME, tokenCardId, tokenSlug } from "@/lib/game/tokens";
import { effAttack, effDefence, getCard } from "@sorcery/shared";
import type { GameState as EngineState, PlayerId, PlayerView, Region } from "@sorcery/shared";
import { cardRefFor } from "./cardIndex";
import { engineCellKey, engineToBoard, localizeEngineText } from "./coords";

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
  | "events"
  | "permanentPositions"
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
  /**
   * The card to lay on the table while this resolves, when the caption names a real one.
   * A Magic never becomes a permanent, so without this the only trace of a spell on the board
   * is a line of text — both players should see the card itself, as they would on a table.
   */
  card: CardRef | null;
}

/**
 * Per-unit damage/life, kept between projections so we can float a number for ANY damage.
 *
 * `flow.areaReveal` only carries squares that a grid spell or projectile recorded; combat goes
 * to `flow.battleReveal`, which has names and amounts but no coordinates, and some effects
 * damage a unit without touching either. Diffing the units themselves is the one channel that
 * sees all of it, and it reads the same numbers the board already shows.
 */
export interface DamageSnapshot {
  units: Record<string, { damage: number; life: number; x: number; y: number }>;
  /** squares whose site was still standing, so we can spot one being reduced to rubble */
  standing: Record<string, true>;
}

export function damageSnapshot(view: PlayerView): DamageSnapshot {
  const units: DamageSnapshot["units"] = {};
  for (const unit of Object.values(view.units)) {
    units[unit.id] = { damage: unit.damage ?? 0, life: unit.life ?? 0, x: unit.x, y: unit.y };
  }
  const standing: Record<string, true> = {};
  for (const site of Object.values(view.sites ?? {})) {
    if (!site.isRubble) standing[engineCellKey(site.x, site.y)] = true;
  }
  return { units, standing };
}

/**
 * Squares whose site was just destroyed. A site has no damage counter — attacking one razes
 * it to rubble outright — so there is never a number to float for it; without this, a site
 * attack was the one action that produced no feedback at all.
 */
export function sitesLostSince(prev: DamageSnapshot | null, view: PlayerView): string[] {
  if (!prev) return [];
  const now = damageSnapshot(view).standing;
  return Object.keys(prev.standing).filter((at) => !now[at]);
}

/**
 * Damage landed since `prev`, per board cell. A minion's `damage` counter going up and an
 * avatar's `life` coming down are both damage; healing, undo and a unit simply moving are not.
 */
export function damageSince(prev: DamageSnapshot | null, view: PlayerView): { at: string; dmg: number }[] {
  if (!prev) return [];
  const totals = new Map<string, number>();
  for (const unit of Object.values(view.units)) {
    const before = prev.units[unit.id];
    if (!before) continue; // only arrived this step: nothing to compare against
    // avatars track life, everything else tracks a damage counter
    const dealt = unit.isAvatar
      ? before.life - (unit.life ?? 0)
      : (unit.damage ?? 0) - before.damage;
    if (dealt <= 0) continue;
    const at = engineCellKey(unit.x, unit.y);
    totals.set(at, (totals.get(at) ?? 0) + dealt);
  }
  return [...totals].map(([at, dmg]) => ({ at, dmg }));
}

/** The `flow.areaReveal` shape; the engine types `flow` as `any`. */
interface RawAreaReveal {
  seq?: number;
  cells?: { x: number; y: number; dmg: number }[];
  redSites?: { x: number; y: number }[];
  casterId?: string;
  name?: string;
  element?: string;
  /** set only for a Magic cast — an ability's `name` is a sentence, not a card */
  spell?: boolean;
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
  // Damage numbers come from the unit diff (damageSince), never from areaReveal.cells — the
  // same hit appears in both, and the diff is the one that also sees combat. What areaReveal
  // uniquely gives us is the caption, the caster, and the squares an effect TOUCHED without
  // damaging (buffs, summons, taps), which no diff of damage counters can tell us.
  const damaged = new Set((raw.cells ?? []).filter((c) => c && c.dmg > 0).map((c) => engineCellKey(c.x, c.y)));
  const sites = [...new Set((raw.redSites ?? []).map((s) => engineCellKey(s.x, s.y)))].filter((at) => !damaged.has(at));
  const source = raw.casterId ? (view.units[raw.casterId] ?? view.sites?.[raw.casterId]) : null;
  const caster =
    source && typeof source.x === "number" && typeof source.y === "number" ? engineCellKey(source.x, source.y) : null;
  const name = raw.name ?? "";
  if (!sites.length && !caster && !name) return null;
  // `spell` marks a Magic cast, whose `name` IS the card's name; an ability's is a sentence
  // ("Cherubim shoots!"). Only a Magic needs showing — everything else stays on the board as a
  // permanent of its own. No printing, no card: we would render a blank.
  const named = raw.spell && name ? cardRefFor(name) : null;
  const card = named?.slug ? named : null;
  return { seq, hits: [], sites, caster, name, element: raw.element ?? "none", card };
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

/**
 * A numeric cardId that is unique per token INSTANCE and stable across re-projections.
 *
 * `tokenCardId(def)` alone is per-TYPE, so every Skeleton on the board shared one id — and
 * that id is "used for React keys and physics IDs" (tokens.ts), so same-type tokens collided
 * and fought over their textures. `newTokenInstanceId` is unique but salts with `Date.now()`,
 * which would change on every projection and remount each token card continuously. Folding
 * the engine's own stable instance id into the type hash gives us both.
 */
function tokenInstanceCardId(def: Parameters<typeof tokenCardId>[0], instanceId: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < instanceId.length; i++) {
    hash ^= instanceId.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  // keep it negative, like every other token id, so it can never collide with a real cardId
  return -(((Math.abs(tokenCardId(def)) * 31 + (hash % 100000)) >>> 0) % 0x7ffffff) - 1;
}

/** One of our token cards (Frog, Lance, Stealth, Ward, Rubble…), drawn the way the board draws tokens. */
function tokenCard(name: string, instanceId: string, owner: PlayerKey): CardRef | null {
  const def = TOKEN_BY_NAME[name.toLowerCase()];
  if (!def) return null;
  return {
    cardId: tokenInstanceCardId(def, instanceId),
    name: def.name,
    type: "Token",
    subTypes: def.subTypes ?? null,
    slug: tokenSlug(def),
    instanceId,
    owner,
  };
}

/**
 * Lay a tile's cards out side by side instead of in a pile.
 *
 * Everything on a square used to render at the same x/z, separated only by a vertical lift,
 * so a tile with a minion, an artifact and a subsurface hint showed one card with slivers
 * behind it. Cards are CARD_SHORT x CARD_LONG = 0.39 x 0.55 of a tile, so two fit across
 * comfortably and anything more has to shrink. Attached items (status tokens, carried
 * artifacts) are excluded: the board draws those on their host, not as tile occupants.
 */
/**
 * Lay a tile's occupants out so the SITE under them stays readable.
 *
 * Everything on a square belongs to one side or the other, so each side's cards are gathered
 * into a row hugging that side's edge of the tile: ours along the near rim, theirs along the
 * far one. That leaves a clear band across the middle of the site — which is the whole point,
 * because a couple of cards centred on a tile used to bury the site entirely and there was no
 * way to tell what you were standing on.
 *
 * `standing` are the avatars here. They take a slot in their owner's row like anything else;
 * an avatar sitting UNDER the units sharing its square hides them and is hidden by them, and
 * "whose avatar is where" is the most-read fact on the board. Only the cards are scaled —
 * an avatar's root group owns a RigidBody whose collider does not follow a parent scale, so
 * shrinking it would leave its physics body behind.
 *
 * Offsets are returned in TILE space. The board then adds its own per-owner nudge to every
 * permanent (`getPermanentOwnerBaseZ`), so that is subtracted back out here — otherwise the
 * two biases would compound and push the cards off their own tile.
 */
function spreadOnTile(items: PermanentItem[], standing: { owner: 1 | 2; avatar: AvatarState }[] = []): void {
  const loose = items.filter((item) => !item.attachedTo);
  if (loose.length + standing.length < 1) return;

  const sides: Record<1 | 2, { avatars: AvatarState[]; cards: PermanentItem[] }> = {
    1: { avatars: [], cards: [] },
    2: { avatars: [], cards: [] },
  };
  for (const { owner, avatar } of standing) sides[owner].avatars.push(avatar);
  for (const item of loose) sides[item.owner].cards.push(item);

  // One scale for the whole tile, set by whichever side is busiest, so the two rows match.
  const widest = Math.max(sides[1].avatars.length + sides[1].cards.length, sides[2].avatars.length + sides[2].cards.length);
  if (widest < 1) return;
  const perRow = widest <= 3 ? widest : Math.ceil(widest / 2);
  const rows = Math.ceil(widest / perRow);
  const room = TILE_SIZE * 0.94;
  // never full size once a card shares its site with anything: the site has to show through
  const cap = widest > 1 ? 0.78 : 0.88;
  const scale = Math.min(cap, room / (perRow * CARD_SHORT), (TILE_SIZE * 0.46) / (rows * CARD_LONG));
  const stepX = CARD_SHORT * scale * 1.06;
  const stepZ = CARD_LONG * scale * 1.06;
  // the outermost row sits just inside the tile edge; later rows step back toward the middle
  const rim = TILE_SIZE / 2 - (CARD_LONG * scale) / 2 - TILE_SIZE * 0.02;

  for (const owner of [1, 2] as const) {
    const side = sides[owner];
    const occupants = side.avatars.length + side.cards.length;
    if (!occupants) continue;
    const toward = owner === 1 ? 1 : -1; // p1 reads from the near edge, p2 from the far one
    const ownerBase = getPermanentOwnerBaseZ(owner);
    const place = (i: number): [number, number] => {
      const row = Math.floor(i / perRow);
      const inRow = i % perRow;
      const count = Math.min(perRow, occupants - row * perRow);
      return [(inRow - (count - 1) / 2) * stepX, toward * (rim - row * stepZ)];
    };
    // avatars first, so they keep the outermost, least-crowded places
    side.avatars.forEach((avatar, i) => {
      avatar.offset = place(i);
    });
    side.cards.forEach((card, i) => {
      const [x, z] = place(side.avatars.length + i);
      card.offset = [x, z - ownerBase];
      card.scale = scale;
    });
  }
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

/**
 * Every unit's CURRENT power and life, by unit id.
 *
 * `effAttack`/`effDefence` are the engine's own answer, and they need the FULL GameState: the
 * `grantsPower` statics they consult can read `state.players[...]`, which `viewFor` reshapes
 * (spellbook becomes a count, hands are hidden). Engine mode runs the engine in this tab and
 * the session holds that state, so it computes this and hands it to the projection — a
 * PlayerView alone could not produce it correctly.
 */
export function unitPower(game: EngineState): Record<string, { atk: number; def: number }> {
  const out: Record<string, { atk: number; def: number }> = {};
  for (const unit of Object.values(game.units)) {
    const printed = getCard(unit.name);
    const atk = effAttack(game, unit);
    const def = effDefence(game, unit);
    // only when something actually changed — an unmodified card already shows its own numbers
    if (atk !== (printed?.attack ?? 0) || def !== (printed?.defence ?? printed?.attack ?? 0)) {
      out[unit.id] = { atk, def };
    }
  }
  return out;
}

export function projectView(
  view: PlayerView,
  layer: BoardLayer = "surface",
  portalsRevealed = true,
  power: Record<string, { atk: number; def: number }> = {},
): ProjectedState {
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
  /** Drives the shared board's burrowed/submerged placement (it tucks these under the site). */
  const permanentPositions: StoreState["permanentPositions"] = {};
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
    // Avatars always show (they anchor the HUD). A minion on the OTHER layer still appears
    // while we are looking at the surface — tucked under the site, the way the regular modes
    // draw a burrowed or submerged unit — so the board hints at what is lurking rather than
    // hiding it behind a badge. Looking subsurface stays a clean view of that layer alone.
    const below = layerOf(unit.region) !== layer;
    if (below && layer !== "surface") continue;
    const at = engineCellKey(unit.x, unit.y);
    const index = pushTo(permanents, at, {
      card: cardOf(view, unit.cardId, owner),
      owner: seatOwner(unit.controller),
      instanceId: unit.id,
      tapped: unit.tapped,
      damage: unit.damage || null,
      // only present when an effect has moved them off the printed values
      stats: power[unit.id] ?? null,
      offset: null,
      isCarried: Boolean(unit.carriedBy),
      enteredOnTurn: unit.enteredTurn,
      summonedThisTurn: unit.enteredTurn === view.turn,
      // a hint, not a target: the layer overlay is still how you go down to act on it
      faded: below || undefined,
    });
    if (below) {
      permanentPositions[unit.id] = {
        permanentId: unit.id,
        state: unit.region === "underwater" ? "submerged" : "burrowed",
        position: { x: 0, y: 0, z: 0 },
      };
      continue; // it is not on this layer: nothing may attach to it or target it here
    }
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

  const flow = (
    view as unknown as {
      flow?: {
        lockedCards?: { cardId: string; casterName?: string }[];
        stolen?: { cardId: string; unitId: string }[];
      };
    }
  ).flow;
  const locks = new Map<string, string>();
  for (const lock of flow?.lockedCards ?? []) if (lock?.cardId) locks.set(lock.cardId, lock.casterName || "its caster");
  // A stolen card is sealed only while the thief is still in the realm (casting.ts:358).
  const sealed = new Map<string, string>();
  for (const theft of flow?.stolen ?? []) {
    const thief = theft?.unitId ? view.units[theft.unitId] : null;
    if (theft?.cardId && thief) sealed.set(theft.cardId, thief.name);
  }

  // Every occupant of a square is known by now (units, artifacts, auras, status tokens, the
  // other layer's hints — and the avatars), so give each tile a side-by-side layout. The
  // avatars are grouped by square first so a tile they share is laid out as one block.
  const standingAt = new Map<string, { owner: 1 | 2; avatar: AvatarState }[]>();
  for (const [key, avatar] of Object.entries(avatars) as [PlayerKey, AvatarState][]) {
    if (!avatar.pos) continue;
    const at = `${avatar.pos[0]},${avatar.pos[1]}`;
    const entry = { owner: (key === "p1" ? 1 : 2) as 1 | 2, avatar };
    const here = standingAt.get(at);
    if (here) here.push(entry);
    else standingAt.set(at, [entry]);
  }
  for (const [at, avatarsHere] of standingAt) {
    if (!permanents[at]) spreadOnTile([], avatarsHere); // two avatars sharing a bare square
  }
  for (const [at, items] of Object.entries(permanents)) spreadOnTile(items, standingAt.get(at) ?? []);

  const zones = {} as Record<PlayerKey, Zones>;
  for (const p of players) {
    const key = seatKey(p.id);
    zones[key] = {
      hand: p.hand.map((id, i) => {
        if (id === "hidden") return hiddenCard(`${key}-hand-${i}`, key, "Unknown");
        const card = cardOf(view, id, key);
        // Morgana le Fay / the Omphaloi / Archangel Gabriel bond a drawn spell to one caster.
        // The engine keeps the card in the normal hand and records the bond in
        // flow.lockedCards, enforcing it in casting.ts — but a card you cannot cast has to SAY
        // so, or the hand just looks like it has an uncastable card in it.
        const lock = locks.get(id);
        const seal = sealed.get(id);
        if (!lock && !seal) return card;
        return { ...card, ...(lock ? { lockedTo: lock } : {}), ...(seal ? { sealedBy: seal } : {}) };
      }),
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
    permanentPositions,
    matchEnded: view.phase === "over",
    winner: view.phase === "over" && view.winner !== null ? seatKey(view.winner) : null,
    events: engineEvents(view),
  };
}

/**
 * The engine's log as the shared console's event feed, so engine mode uses the same console,
 * in the same place, as the online and replay views instead of a panel of its own.
 * Squares are rewritten to our tile numbers on the way through.
 */
function engineEvents(view: PlayerView): StoreState["events"] {
  const log = view.log.slice(-MAX_EVENTS);
  // The engine's log is an ordered array with no ids of its own; index it from the end so a
  // given line keeps its id as the log grows and the console does not re-key every entry.
  const base = Math.max(0, view.log.length - log.length);
  return log.map((entry, i) => ({
    id: base + i,
    ts: 0,
    text: localizeEngineText(entry.msg),
    turn: entry.turn,
    player: entry.player === null || entry.player === undefined ? undefined : entry.player === 0 ? 1 : 2,
  }));
}
