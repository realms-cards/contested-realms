import type { SpanEntity } from "@/lib/engine-mode/boardOverlays";
import { clampToTile, type Arrangement } from "@/lib/engine-mode/projection";
import { PLAYER_COLORS } from "@/lib/game/constants";
import type { FieldTone } from "@/lib/game/cpu/fieldTargets";
import { avatarUnitToken, permanentUnitToken, unitPickState } from "@/lib/game/cpu/unitTokens";
import type {
  AvatarState,
  CardRef,
  CellKey,
  GameState as StoreState,
  PermanentItem,
  Permanents,
  PlayerKey,
} from "@/lib/game/store/types";
import { BOARD_COLS, BOARD_ROWS, tileMin, type TileSize } from "./picks2d";

/**
 * Where every card sits on the flat 2D board, in board pixels. Pure: the 2D board renders this
 * list, and the tests pin it. Cards live in board coordinates rather than inside tile elements
 * so an aura or an oversized body can straddle the tiles it covers without being clipped.
 *
 * Sizes are the 2D board's own. The projection's world-unit `offset`/`scale` are tuned for a 3D
 * card a little over half a tile tall and are deliberately not reused.
 */

/** Card width over height (CARD_SHORT / CARD_LONG). */
export const CARD_ASPECT = 0.71;
/** A lone card on a tile, as a fraction of the tile's smaller edge (a tile need not be square). */
const CARD_CAP = 0.66;
/** Never smaller than this; a crowded row overlaps instead. */
const CARD_MIN = 0.36;
const ROW_WIDTH = 0.94;
const ROW_GAP = 0.04;
/** A single owner's row: most of the tile, nudged toward that owner's edge. */
const SOLO_ROW_H = 0.84;
const SOLO_ROW_BIAS = 0.04;
/** Both owners on a tile: theirs along the far half, ours along the near half. */
const SHARED_ROW_H = 0.47;
const SHARED_ROW_CENTRE = { p2: 0.26, p1: 0.74 } as const;
/** An aura sits on the crossing of the squares it covers; a lone-square aura a little smaller. */
const AURA_H = 0.6;
const AURA_SOLO_H = 0.5;
/** An oversized body fills this share of its footprint (about 1.2 tiles tall for a 2x2). */
const BODY_FILL = 0.62;

/**
 * Stacking: auras go UNDER the tile cards so a unit next to the crossing stays tappable (an
 * aura's middle is still uncovered); bodies go over them, as the 3D board lifts a pinned card.
 * A pickable card rises above everything (Z_PICK) so a candidate is never buried.
 */
const Z_FADED = 4;
const Z_AURA = 6;
const Z_CARD = 10;
/** cards the player arranged sit over the laid-out rows, the latest arranged highest */
const Z_ARRANGED = 20;
const Z_BODY = 40;
export const Z_PICK = 60;

export type StatusKind = "stealth" | "ward" | "disabled" | "silenced";
const STATUS = /:(stealth|ward|disabled|silenced)$/;
const TILE_MARK = /:(rubble|flooded)$/;

export type CardRef2D = { kind: "permanent"; at: CellKey; index: number } | { kind: "avatar"; who: PlayerKey };

/** A card attached to a host: a carried artifact, or a status token drawn as a badge. */
export interface Attachment {
  key: string;
  token: string;
  card: CardRef;
  ref: { kind: "permanent"; at: CellKey; index: number };
  status: StatusKind | null;
}

export interface Badges {
  damage: number;
  /** current power/life, only when an effect has changed them */
  stats: { atk: number; def: number } | null;
  counters: number;
  /** a unit on the other layer, shown faded */
  layerState: "burrowed" | "submerged" | null;
  carried: boolean;
}

export interface Placed {
  key: string;
  token: string;
  ref: CardRef2D;
  card: CardRef;
  owner: PlayerKey;
  /** the tile the store files this card under (for a span, its anchor) */
  cell: CellKey;
  span: SpanEntity["kind"] | null;
  /** card centre and its UNROTATED (portrait) size, in board px */
  x: number;
  y: number;
  w: number;
  h: number;
  /** the tap quarter-turn, from the owner's seat; cardTurn adds the owner's facing */
  rotate: 0 | 90;
  z: number;
  /** carried artifacts, drawn as chips under the card */
  attachments: Attachment[];
  /** status tokens, drawn as icon badges on the card */
  statuses: Attachment[];
  badges: Badges;
  faded: boolean;
  /** the engine id the player can arrange this card by (null: a span, it keeps its place) */
  arrangeId: string | null;
}

/**
 * Which way a card faces on screen, in degrees clockwise. The board is seen from p1's seat, so
 * the opponent's cards lie as if played from across the table — upside down (180°) — and a
 * tapped card turns a quarter clockwise from its OWNER's view: ours to 90°, theirs to 270°.
 * Owner reads from the facing alone, which needs no hue (monochrome, colour blindness). The
 * on-screen box only depends on whether the turn is odd (`rotate`), so hit areas, pick frames
 * and span taps keep using `rotate`.
 */
export function cardTurn(p: Pick<Placed, "owner" | "rotate">): 0 | 90 | 180 | 270 {
  if (p.owner === "p2") return p.rotate === 90 ? 270 : 180;
  return p.rotate;
}

/**
 * The owner cue around a card: none on ours (the board is seen from our side, so every upright
 * card is ours, and a glow on every card would only compete with the pick frames), and a faint
 * soft glow in the opponent's colour on theirs. Soft on purpose: a pick frame is a crisp line
 * with corner brackets, so the two never read alike. Blur grows with the card, alpha stays low.
 */
export function ownerGlow(owner: PlayerKey, cardH: number): string | undefined {
  if (owner !== "p2") return undefined;
  const blur = Math.round(Math.max(4, Math.min(10, cardH * 0.12)));
  return `0 0 ${blur}px 1px ${PLAYER_COLORS.p2}80`;
}

/** The opponent's site, in the same voice as their cards: a faint glow inside the tile's rim (`edge`: the tile's smaller edge). */
export function siteOwnerGlow(owner: PlayerKey | null, edge: number): string | undefined {
  if (owner !== "p2") return undefined;
  return `inset 0 0 ${Math.round(Math.max(6, Math.min(16, edge * 0.12)))}px ${PLAYER_COLORS.p2}66`;
}

export interface Layout2DInput {
  permanents: Permanents;
  avatars: Record<PlayerKey, AvatarState>;
  spans: readonly SpanEntity[];
  positions?: StoreState["permanentPositions"];
  tile: TileSize;
  /** where the player slid cards within their tiles (the session's, display only) */
  arrangement?: Arrangement;
  /** each avatar's engine unit id, which its arrangement is keyed by */
  avatarIds?: Partial<Record<PlayerKey, string>>;
}

interface Occupant {
  key: string;
  token: string;
  ref: CardRef2D;
  card: CardRef;
  owner: PlayerKey;
  tapped: boolean;
  faded: boolean;
  item: PermanentItem | null;
  arrangeId: string | null;
}

const seatOf = (owner: 1 | 2 | undefined): PlayerKey => (owner === 2 ? "p2" : "p1");
const hostKey = (at: string, index: number) => `${at}#${index}`;
const footprint = (tapped: boolean) => (tapped ? 1 : CARD_ASPECT);

function badgesOf(item: PermanentItem | null, positions: Layout2DInput["positions"]): Badges {
  const id = item?.instanceId ?? "";
  const state = id ? positions?.[id]?.state : undefined;
  return {
    damage: item?.damage ?? 0,
    stats: item?.stats ?? null,
    counters: item?.counters ?? 0,
    layerState: state === "burrowed" || state === "submerged" ? state : null,
    carried: Boolean(item?.isCarried),
  };
}

/** Cells holding a Rubble or Flooded token: the 2D tile draws an icon instead of a card. */
export function tileMarks(permanents: Permanents): Record<CellKey, { rubble: boolean; flooded: boolean }> {
  const out: Record<CellKey, { rubble: boolean; flooded: boolean }> = {};
  for (const [at, items] of Object.entries(permanents)) {
    for (const item of items) {
      const mark = item.attachedTo ? null : TILE_MARK.exec(item.instanceId ?? "")?.[1];
      if (!mark) continue;
      const entry = (out[at] ??= { rubble: false, flooded: false });
      if (mark === "rubble") entry.rubble = true;
      else entry.flooded = true;
    }
  }
  return out;
}

/** Lay one owner's row of cards side by side, shrinking (then overlapping) to fit the tile. */
function placeRow(
  row: Occupant[],
  cellX: number,
  rowCentre: number,
  rowH: number,
  tile: TileSize,
  out: Placed[],
  positions: Layout2DInput["positions"],
  at: CellKey,
): void {
  const n = row.length;
  if (!n) return;
  // cards keep their shape and size to the tile's smaller edge; the row spans its width
  const edge = tileMin(tile);
  const width = ROW_WIDTH * tile.w;
  const gap = ROW_GAP * edge;
  const factors = row.map((o) => footprint(o.tapped));
  const sum = factors.reduce((a, b) => a + b, 0);
  let h = Math.min(CARD_CAP * edge, rowH * tile.h, (width - gap * (n - 1)) / sum);
  let step = gap;
  if (h < CARD_MIN * edge) {
    h = CARD_MIN * edge;
    step = n > 1 ? (width - sum * h) / (n - 1) : 0; // negative: the row overlaps
  }
  const total = sum * h + step * (n - 1);
  let cursor = cellX + (tile.w - total) / 2;
  row.forEach((o, i) => {
    const span = factors[i] * h;
    out.push({
      key: o.key,
      token: o.token,
      ref: o.ref,
      card: o.card,
      owner: o.owner,
      cell: at,
      span: null,
      x: cursor + span / 2,
      y: rowCentre,
      w: h * CARD_ASPECT,
      h,
      rotate: o.tapped ? 90 : 0,
      z: (o.faded ? Z_FADED : Z_CARD) + i,
      attachments: [],
      statuses: [],
      badges: badgesOf(o.item, positions),
      faded: o.faded,
      arrangeId: o.arrangeId,
    });
    cursor += span + step;
  });
}

function cellOrigin(at: string, tile: TileSize): { x: number; y: number } {
  const [x, y] = at.split(",").map(Number);
  return { x: x * tile.w, y: y * tile.h };
}

/** Size of a span card: an aura on its crossing, a body sized to its footprint's bounding box. */
function spanSize(span: SpanEntity, tile: TileSize): number {
  if (span.kind === "aura") return (span.cells.length > 1 ? AURA_H : AURA_SOLO_H) * tileMin(tile);
  const xs = span.cells.map((c) => Number(c.split(",")[0]));
  const ys = span.cells.map((c) => Number(c.split(",")[1]));
  const bw = Math.max(...xs) - Math.min(...xs) + 1;
  const bh = Math.max(...ys) - Math.min(...ys) + 1;
  return Math.min(BODY_FILL * bh * tile.h, (BODY_FILL * bw * tile.w) / CARD_ASPECT);
}

/** A card's centre for an arrangement, clamped so the whole card (as turned) stays on its tile. */
export function arrangedCentre(
  cell: CellKey,
  offset: { x: number; y: number },
  card: { w: number; h: number; rotate: 0 | 90 },
  tile: TileSize,
): { x: number; y: number } {
  const origin = cellOrigin(cell, tile);
  const [fw, fh] = card.rotate === 90 ? [card.h, card.w] : [card.w, card.h];
  return {
    x: origin.x + tile.w / 2 + clampToTile(offset.x * tile.w, fw / 2, tile.w / 2),
    y: origin.y + tile.h / 2 + clampToTile(offset.y * tile.h, fh / 2, tile.h / 2),
  };
}

/**
 * Where an arranging drag of `dx`/`dy` px puts a card: its centre, clamped to its own tile, and
 * that centre as the session's arrangement offset (tiles from the tile's centre).
 */
export function arrangeDrop(
  placed: Pick<Placed, "cell" | "x" | "y" | "w" | "h" | "rotate">,
  dx: number,
  dy: number,
  tile: TileSize,
): { x: number; y: number; offset: [number, number] } {
  const origin = cellOrigin(placed.cell, tile);
  const cx = origin.x + tile.w / 2;
  const cy = origin.y + tile.h / 2;
  const centre = arrangedCentre(placed.cell, { x: (placed.x + dx - cx) / tile.w, y: (placed.y + dy - cy) / tile.h }, placed, tile);
  return { ...centre, offset: [(centre.x - cx) / tile.w, (centre.y - cy) / tile.h] };
}

/**
 * Put the player's arranged cards where they left them. They keep their slot in the row, so
 * nothing else on the tile shifts, and rise over it in arrangement order (latest on top).
 */
function applyArrangement(out: Placed[], arrangement: Arrangement, tile: TileSize): void {
  const arranged = out
    .map((placed) => ({ placed, entry: placed.arrangeId ? arrangement[placed.arrangeId] : undefined }))
    .filter((a): a is { placed: Placed; entry: Arrangement[string] } => Boolean(a.entry) && a.entry?.at === a.placed.cell)
    .sort((a, b) => a.entry.seq - b.entry.seq);
  arranged.forEach(({ placed, entry }, rank) => {
    const centre = arrangedCentre(placed.cell, entry, placed, tile);
    placed.x = centre.x;
    placed.y = centre.y;
    if (!placed.faded) placed.z = Z_ARRANGED + rank;
  });
}

export function layoutBoard2D({ permanents, avatars, spans, positions, tile, arrangement, avatarIds }: Layout2DInput): Placed[] {
  const spanById = new Map(spans.map((s) => [s.instanceId, s]));
  const loose = new Map<CellKey, Occupant[]>();
  const spanned: { span: SpanEntity; occupant: Occupant; at: CellKey }[] = [];
  const attached = new Map<string, Attachment[]>();
  const push = (at: CellKey, occupant: Occupant) => {
    const here = loose.get(at);
    if (here) here.push(occupant);
    else loose.set(at, [occupant]);
  };

  // avatars first, so they lead their owner's row
  for (const who of ["p1", "p2"] as const) {
    const avatar = avatars[who];
    if (!avatar?.card || !avatar.pos) continue;
    const at = `${avatar.pos[0]},${avatar.pos[1]}`;
    push(at, {
      key: `avatar:${who}`,
      token: avatarUnitToken(who),
      ref: { kind: "avatar", who },
      card: avatar.card,
      owner: who,
      tapped: Boolean(avatar.tapped),
      faded: false,
      item: null,
      arrangeId: avatarIds?.[who] ?? null,
    });
  }

  for (const [at, items] of Object.entries(permanents)) {
    items.forEach((item, index) => {
      const id = item.instanceId ?? item.card?.instanceId ?? "";
      const token = permanentUnitToken(at, index, item);
      const ref = { kind: "permanent" as const, at, index };
      if (item.attachedTo) {
        const host = item.attachedTo;
        // index -1 is the avatar standing on that tile; tell two avatars apart by owner
        const key = host.index < 0 ? `${hostKey(host.at, -1)}:${seatOf(item.owner)}` : hostKey(host.at, host.index);
        const status = (STATUS.exec(id)?.[1] as StatusKind | undefined) ?? null;
        const list = attached.get(key) ?? [];
        list.push({ key: `${at}:${index}:${id}`, token, card: item.card, ref, status });
        attached.set(key, list);
        return;
      }
      if (TILE_MARK.test(id)) return; // Rubble / Flooded: a tile icon, not a card
      const occupant: Occupant = {
        key: id ? `perm:${id}` : `slot:${at}:${index}`,
        token,
        ref,
        card: item.card,
        owner: seatOf(item.owner),
        tapped: Boolean(item.tapped),
        faded: Boolean(item.faded),
        item,
        // tile markers stay put; a pinned card is drawn as a span below and keeps its place
        arrangeId: id || null,
      };
      const span = id ? spanById.get(id) : undefined;
      if (span) spanned.push({ span, occupant, at });
      else push(at, occupant);
    });
  }

  const out: Placed[] = [];
  for (const [at, occupants] of loose) {
    const origin = cellOrigin(at, tile);
    const rows = (["p2", "p1"] as const)
      .map((owner) => ({ owner, row: occupants.filter((o) => o.owner === owner) }))
      .filter((r) => r.row.length > 0);
    for (const { owner, row } of rows) {
      const shared = rows.length > 1;
      const centre = shared
        ? SHARED_ROW_CENTRE[owner]
        : 0.5 + (owner === "p1" ? SOLO_ROW_BIAS : -SOLO_ROW_BIAS);
      placeRow(row, origin.x, origin.y + centre * tile.h, shared ? SHARED_ROW_H : SOLO_ROW_H, tile, out, positions, at);
    }
  }
  if (arrangement) applyArrangement(out, arrangement, tile);

  for (const { span, occupant, at } of spanned) {
    const h = spanSize(span, tile);
    out.push({
      key: occupant.key,
      token: occupant.token,
      ref: occupant.ref,
      card: occupant.card,
      owner: occupant.owner,
      cell: at,
      span: span.kind,
      x: (span.centre.x + 0.5) * tile.w,
      y: (span.centre.y + 0.5) * tile.h,
      w: h * CARD_ASPECT,
      h,
      rotate: occupant.tapped ? 90 : 0,
      z: span.kind === "aura" ? Z_AURA : Z_BODY,
      attachments: [],
      statuses: [],
      badges: badgesOf(occupant.item, positions),
      faded: occupant.faded,
      arrangeId: null,
    });
  }

  // hang each host's attachments on it: status tokens as badges, artifacts as chips
  for (const placed of out) {
    const key =
      placed.ref.kind === "avatar"
        ? `${hostKey(placed.cell, -1)}:${placed.ref.who}`
        : hostKey(placed.ref.at, placed.ref.index);
    for (const a of attached.get(key) ?? []) (a.status ? placed.statuses : placed.attachments).push(a);
    attached.delete(key);
  }
  // an avatar-attachment whose owner differs from the avatar (a stolen artifact) still finds a host
  for (const [key, list] of attached) {
    const [host] = key.split(":");
    const at = host.split("#")[0];
    const avatar = out.find((p) => p.ref.kind === "avatar" && p.cell === at);
    if (!avatar || !key.includes("#-1")) continue;
    for (const a of list) (a.status ? avatar.statuses : avatar.attachments).push(a);
  }
  return out;
}

/** What a tap does. Ordered candidates: the card's own token, then its status tokens, then the tile under it. */
export type TapOutcome =
  | { kind: "select"; token: string }
  | { kind: "hover"; token: string }
  | { kind: "preview" }
  | { kind: "none" };

export interface TapInput {
  /** tokens to try in order: card, statuses, then the tile */
  tokens: readonly (string | null | undefined)[];
  tiles: readonly string[];
  areas: Readonly<Record<string, readonly string[]>>;
  hovered: string | null;
  /** the tap came from a finger or pen, not a mouse */
  coarse: boolean;
  /** there is a card to preview when nothing is pickable */
  previewable: boolean;
}

/**
 * The touch rules: a pickable token is picked; a card that is not pickable on a tile that is
 * picks the tile; otherwise the card is previewed. An area anchor needs two taps on a coarse
 * pointer — the first shows the footprint (there is no hover to do it), the second places.
 */
export function resolveTap({ tokens, tiles, areas, hovered, coarse, previewable }: TapInput): TapOutcome {
  for (const token of tokens) {
    if (!token || !tiles.includes(token)) continue;
    if (coarse && areas[token] && hovered !== token) return { kind: "hover", token };
    return { kind: "select", token };
  }
  return previewable ? { kind: "preview" } : { kind: "none" };
}

/** How a board card is lit: the 3D cards' rule, with a mid-sequence candidate in the `continue` tone like the tiles. */
export function cardTone(
  picker: { tiles: readonly string[]; glow: readonly string[]; sources: readonly string[]; selected: string | null; sequence: boolean },
  token: string,
): FieldTone | null {
  const state = unitPickState(picker, token);
  return state === "candidate" && picker.sequence ? "continue" : state;
}

export const isClickableTone = (tone: FieldTone | null): boolean =>
  tone === "candidate" || tone === "continue" || tone === "selected";

/**
 * The tile under a tap on a card that spans several squares (an aura, an oversized body). Such
 * a card is filed under one anchor cell but drawn over the crossing of its squares, so it
 * catches taps meant for the tiles beneath it: the tile is the one under the finger, not the
 * anchor. A tap that did not land on the card's own rectangle (a keyboard click reports no
 * point) keeps the anchor.
 */
export function spanTapCell(
  target: Pick<Placed, "cell" | "x" | "y" | "w" | "h" | "rotate">,
  point: { x: number; y: number },
  tile: TileSize,
): CellKey {
  const halfW = (target.rotate === 90 ? target.h : target.w) / 2;
  const halfH = (target.rotate === 90 ? target.w : target.h) / 2;
  if (Math.abs(point.x - target.x) > halfW + 1 || Math.abs(point.y - target.y) > halfH + 1) return target.cell;
  const cx = Math.min(BOARD_COLS - 1, Math.max(0, Math.floor(point.x / tile.w)));
  const cy = Math.min(BOARD_ROWS - 1, Math.max(0, Math.floor(point.y / tile.h)));
  return `${cx},${cy}`;
}
