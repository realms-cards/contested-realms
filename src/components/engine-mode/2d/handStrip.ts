import type { HandSortOrder } from "@/hooks/useGraphicsSettings";
import type { FieldTone } from "@/lib/game/cpu/fieldTargets";
import { handCardTone, pileGlow, pilePicks, type DeckPile, type HandPick, type PilePickSlice } from "@/lib/game/cpu/handPilePicks";
import { handToken, pileToken } from "@/lib/game/cpu/pickTokens";
import type { CardRef, LifeState } from "@/lib/game/store/types";

/** Printed card proportions (63 x 88 mm). */
export const CARD_ASPECT = 63 / 88;
/** Site art is stored portrait; rotated a quarter turn it must grow by this much to fill a landscape box. */
export const SITE_ART_SCALE = 88 / 63;

export const isSiteCard = (card: Pick<CardRef, "type">) => (card.type || "").toLowerCase().includes("site");

/** The on-screen box of one hand card: spells stand upright, sites lie on their side at the same size. */
export function handCardBox(cardHeight: number, landscape: boolean): { w: number; h: number } {
  const short = Math.round(cardHeight * CARD_ASPECT);
  return landscape ? { w: Math.round(cardHeight), h: short } : { w: short, h: Math.round(cardHeight) };
}

/** Readability floor for a fitted hand card's height: below it the strip overlaps cards instead. */
export const HAND_FLOOR_PHONE = 56;
export const HAND_FLOOR_DESKTOP = 72;
/** Viewport width under which the phone floor applies. */
const PHONE_MAX_WIDTH = 640;
/** How much of each covered card stays visible when the strip overlaps, at the least. */
export const HAND_MIN_SLICE = 14;

export const handFloor = (viewportWidth: number) => (viewportWidth < PHONE_MAX_WIDTH ? HAND_FLOOR_PHONE : HAND_FLOOR_DESKTOP);

export interface HandFitInput {
  /** fallback card height, used only while the strip's cross size is unknown (`cross` unset) */
  cardHeight: number;
  /**
   * the strip's measured room ACROSS its axis (its height for a row): the hand never grows past
   * it, and when set it — not `cardHeight` — is the size the cards aim for
   */
  cross?: number;
  /** one flag per card in display order: true for a site (lying on its side) */
  landscape: readonly boolean[];
  /** room along the strip's axis for the cards (px) */
  available: number;
  /** spacing between cards when they do not overlap */
  gap: number;
  /** readability floor for the fitted height (clamped to `cardHeight`) */
  floor: number;
  /** "row" lays cards side by side (widths add up), "column" stacks them (heights add up) */
  axis?: "row" | "column";
  /**
   * When set, size beats spacing: rather than shrinking a big hand until it fits side by side,
   * the cards stay as large as the row allows and overlap, as long as every covered card still
   * shows at least this fraction of its length (0–1). See HAND_MIN_VISIBLE.
   */
  minVisible?: number;
}

/**
 * How much of a covered card must stay in view when the strip prefers large, overlapping cards
 * to small separate ones: a spell's cost, the start of its name and some art.
 */
export const HAND_MIN_VISIBLE = 0.45;
/**
 * The same for a phone held upright, where the hand box is tall and the cards can usually lie
 * side by side: when they do overlap, each covered card keeps two thirds of itself, so its name
 * and its middle (a tap target) stay in view even under a raised neighbour.
 */
export const HAND_MIN_VISIBLE_GROUPED = 0.66;

export interface HandFit {
  /** fitted card height (upright card), never above the nominal (cross-bound) height */
  cardHeight: number;
  /** distance from one card's start to the previous card's end: a gap when >= 0, an overlap when < 0 */
  spacing: number;
  overlapping: boolean;
}

/** One card's length along the strip at a given height. */
const mainLength = (h: number, landscape: boolean, axis: "row" | "column") => {
  const box = handCardBox(h, landscape);
  return axis === "row" ? box.w : box.h;
};

const totalLength = (h: number, landscape: readonly boolean[], axis: "row" | "column") =>
  landscape.reduce((sum, l) => sum + mainLength(h, l, axis), 0);

/** One card's size across the strip at a given height. */
const crossLength = (h: number, landscape: boolean, axis: "row" | "column") => {
  const box = handCardBox(h, landscape);
  return axis === "row" ? box.h : box.w;
};

/**
 * The tallest upright-card height at which every card of the hand fits `cross` px across the
 * strip. A row strip is bound by its spells (they stand upright); a hand of only sites lies on
 * its side and may grow until the sites' short edge fills the row.
 */
export function crossBoundHeight(landscape: readonly boolean[], cross: number, axis: "row" | "column" = "row"): number {
  const room = Math.max(0, Math.floor(cross));
  if (room < 1) return 1;
  const kinds = landscape.length > 0 ? landscape : [false];
  // across a row a spell costs its full height and a site its short edge; down a column the reverse
  const perPx = Math.max(...kinds.map((l) => (axis === "row" ? (l ? CARD_ASPECT : 1) : l ? 1 : CARD_ASPECT)));
  let h = Math.max(1, Math.floor(room / perPx));
  const fits = (height: number) => kinds.every((l) => crossLength(height, l, axis) <= room);
  while (h > 1 && !fits(h)) h -= 1;
  while (fits(h + 1)) h += 1;
  return h;
}

/**
 * Fit the hand into its strip without scrolling, as big as the strip allows. With `cross` the
 * cards aim for the full row height (crossBoundHeight), so a small hand is a row of big cards;
 * they shrink together only as much as the strip's length demands, so a big hand fills the row
 * end to end. Cards first shrink together (sites keep their
 * landscape box, so a site costs more width than a spell); once that would drop them under the
 * readability floor they stay at the floor and overlap instead, each card still showing at least
 * HAND_MIN_SLICE px. Only a hand too big even for that shrinks further below the floor.
 */
export function fitHand({ cardHeight, cross, landscape, available, gap, floor, axis = "row", minVisible }: HandFitInput): HandFit {
  const n = landscape.length;
  const nominal = cross !== undefined && cross > 0 ? crossBoundHeight(landscape, cross, axis) : Math.max(1, Math.floor(cardHeight));
  if (n === 0 || !(available > 0)) return { cardHeight: nominal, spacing: gap, overlapping: false };
  const gaps = gap * (n - 1);
  // length per pixel of card height, summed over the hand (box lengths are linear in height up to rounding)
  const unit = landscape.reduce((sum, l) => sum + (axis === "row" ? (l ? 1 : CARD_ASPECT) : l ? CARD_ASPECT : 1), 0);
  let h = Math.min(nominal, Math.floor((available - gaps) / unit));
  // rounding of individual boxes can add a pixel or two: step down until it truly fits
  while (h > 1 && totalLength(h, landscape, axis) + gaps > available) h -= 1;
  while (h < nominal && totalLength(h + 1, landscape, axis) + gaps <= available) h += 1;
  const minH = Math.min(nominal, Math.max(1, Math.floor(floor)));
  if (n === 1) return { cardHeight: Math.max(1, h), spacing: gap, overlapping: false };

  // Every card but the last is partly covered by its successor, so an overlapping strip spans
  // (all lengths) - (n-1) * overlap; the covered card keeps a slice of length - overlap.
  const overlapAt = (height: number) => Math.ceil((totalLength(height, landscape, axis) - available) / (n - 1));
  const shortestCovered = (height: number) => Math.min(...landscape.slice(0, -1).map((l) => mainLength(height, l, axis)));

  // Size first: the largest height (up to the full row) at which the overlap still leaves every
  // covered card `minVisible` of its length. Beats the separate cards whenever it is larger.
  if (minVisible !== undefined && h < nominal) {
    const keep = Math.min(1, Math.max(0, minVisible));
    for (let big = nominal; big > h; big -= 1) {
      const overlap = overlapAt(big);
      if (overlap > Math.floor((1 - keep) * shortestCovered(big))) continue;
      if (big < minH) break;
      const spacing = Math.min(gap, -overlap) || 0;
      return { cardHeight: big, spacing, overlapping: spacing < 0 };
    }
  }
  if (h >= minH) return { cardHeight: h, spacing: gap, overlapping: false };

  // Overlap at the floor, each covered card keeping at least HAND_MIN_SLICE.
  const maxOverlapAt = (height: number) => Math.max(0, shortestCovered(height) - HAND_MIN_SLICE);
  let fh = minH;
  while (fh > 1 && overlapAt(fh) > maxOverlapAt(fh)) fh -= 1;
  // a hand that only just misses the floor closes its gaps before any card covers another
  const spacing = Math.min(gap, -overlapAt(fh)) || 0;
  return { cardHeight: fh, spacing, overlapping: spacing < 0 };
}

/** One line of a hand laid out on more than one row: which cards (display indices) and their fit. */
export interface HandRowFit {
  indices: number[];
  fit: HandFit;
}

/**
 * A row's worth of cards readable enough that a second row is not worth it: a two-row layout
 * must reach this share of the one-row height (when the one row overlaps) to be chosen.
 */
const TWO_ROWS_MIN_SHARE = 0.8;

/**
 * The hand on one row or, when the strip is tall enough for it to pay, on two: as big as
 * possible while still filling the row. A tall strip (a phone held upright) with a big hand
 * would otherwise squeeze a single row of slivers into half of its height. Two rows split the
 * hand by kind when it holds both (sites on one line, spells on the other, each line as large
 * as its own cards allow), otherwise into two halves in display order.
 *
 * Two rows win when their smaller cards are larger than the single row's, or nearly as large
 * (TWO_ROWS_MIN_SHARE) while the single row would have to overlap them. Otherwise one row.
 */
export function fitHandRows(input: HandFitInput & { maxRows?: number }): HandRowFit[] {
  const { landscape, cross, maxRows = 1, gap } = input;
  const all = landscape.map((_, i) => i);
  const one: HandRowFit[] = [{ indices: all, fit: fitHand(input) }];
  if (maxRows < 2 || landscape.length < 4 || (input.axis ?? "row") !== "row" || !cross || cross <= 0) return one;
  const sites = all.filter((i) => landscape[i]);
  const spells = all.filter((i) => !landscape[i]);
  const halves: number[][] =
    sites.length > 0 && spells.length > 0
      ? landscape[0]
        ? [sites, spells]
        : [spells, sites]
      : [all.slice(0, Math.ceil(all.length / 2)), all.slice(Math.ceil(all.length / 2))];
  const rowCross = Math.floor((cross - gap) / 2);
  if (rowCross < 1) return one;
  const two: HandRowFit[] = halves.map((indices) => ({
    indices,
    fit: fitHand({ ...input, cross: rowCross, landscape: indices.map((i) => landscape[i]) }),
  }));
  const single = one[0].fit;
  // compare like with like: the upright-card height each layout gives its smallest cards
  const twoH = Math.min(...two.map((r) => r.fit.cardHeight));
  const twoOverlaps = two.some((r) => r.fit.overlapping);
  if (twoH > single.cardHeight && !twoOverlaps) return two;
  if (single.overlapping && !twoOverlaps && twoH >= single.cardHeight * TWO_ROWS_MIN_SHARE) return two;
  return one;
}

export interface HandEntry {
  card: CardRef;
  /** position in the unsorted zone, which the context menu's handCard target addresses */
  index: number;
  /** stable React key: instance id, else card id plus an occurrence count */
  key: string;
}

/** The hand in the player's chosen order (sites first or spells first), keeping each card's zone index. */
export function sortHand(hand: readonly CardRef[], order: HandSortOrder): HandEntry[] {
  const sitesFirst = order !== "spellsFirst";
  const seen = new Map<string, number>();
  const entries = hand.map((card, index) => {
    const base = card.instanceId ? `i:${card.instanceId}` : `c:${card.cardId}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return { card, index, key: `${base}#${n}` };
  });
  const rank = (card: CardRef) => (isSiteCard(card) === sitesFirst ? 0 : 1);
  // Array.prototype.sort is stable, so cards keep their draw order within each group
  return entries.sort((a, b) => rank(a.card) - rank(b.card));
}

export interface HandCardState {
  tone: FieldTone | null;
  /** the token a tap selects, or null when the card is not clickable */
  token: string | null;
  /** clickable AND already chosen (a mulligan mark): drawn green, and the same tap takes the mark off */
  marked: boolean;
}

const NO_STATE: HandCardState = { tone: null, token: null, marked: false };

/**
 * How one hand card is lit and whether it can be tapped. Mirrors Hand3D: a card that is both a
 * candidate and in the glow reads as chosen (green) yet stays clickable — that is what lets a
 * mulligan mark be toggled on the card itself. A candidate part-way through an action uses the
 * board's "continue" tone, so the hand speaks the same colour language as the tiles.
 */
export function handCardState(pick: HandPick, seat: string, instanceId: string | null | undefined, sequence: boolean): HandCardState {
  const raw = handCardTone(pick, instanceId);
  if (!raw || !instanceId) return NO_STATE;
  const marked = raw === "candidate" && pick.glow.has(instanceId);
  const clickable = raw === "candidate" || raw === "selected";
  const tone: FieldTone = marked ? "target" : raw === "candidate" ? (sequence ? "continue" : "candidate") : raw;
  return { tone, token: clickable ? handToken(seat, instanceId) : null, marked };
}

export interface PileChipState {
  tone: FieldTone | null;
  token: string | null;
}

/** A deck pile chip's highlight: clicked > clickable candidate > chosen (lit only). */
export function pileChipState(slice: PilePickSlice, seat: string, pile: DeckPile, sequence: boolean): PileChipState {
  const token = pileToken(seat, pile);
  if (slice.selected === token) return { tone: "selected", token };
  if (pilePicks(slice).includes(pile)) return { tone: sequence ? "continue" : "candidate", token };
  if (pileGlow(slice).includes(pile)) return { tone: "target", token: null };
  return { tone: null, token: null };
}

/** Life readout: the number, or Death's Door / Defeated once the avatar is past it. */
export function lifeText(life: number, state: LifeState): string {
  if (state === "dead") return "Defeated";
  if (state === "dd") return "Death's Door";
  return String(life);
}

/** How many sites and spells a hand holds; `mixed` when only the total is public (a Magician's shared deck). */
export interface HandSplit {
  spells: number;
  sites: number;
  mixed: boolean;
}

/** Your own hand's split, from the cards you can see. */
export function handSplitOf(hand: readonly Pick<CardRef, "type">[]): HandSplit {
  const sites = hand.filter(isSiteCard).length;
  return { spells: hand.length - sites, sites, mixed: false };
}

const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

/**
 * The split the engine publishes for a seat (`viewFor(...).players[i].handCounts`: card backs
 * differ, so the opponent may know it). The vendored view types players as `any[]`, so the
 * record is read as unknown and checked. Against a Magician the engine sends the total only.
 */
export function readHandCounts(player: unknown): HandSplit | null {
  if (!player || typeof player !== "object" || !("handCounts" in player)) return null;
  const counts: unknown = player.handCounts;
  if (!counts || typeof counts !== "object" || !("spells" in counts) || !("sites" in counts)) return null;
  const { spells, sites } = counts;
  if (!isCount(spells) || !isCount(sites)) return null;
  return { spells, sites, mixed: "mixed" in counts && counts.mixed === true };
}

/** The split in words, for titles and screen readers. */
export function handSplitText({ spells, sites, mixed }: HandSplit): string {
  if (mixed) return `${spells} cards in hand (sites and spells share one deck)`;
  return `${spells} ${spells === 1 ? "spell" : "spells"}, ${sites} ${sites === 1 ? "site" : "sites"} in hand`;
}

/**
 * What tapping a pickable deck pile does, for its tooltip and the hand's draw button: the
 * picker's own label when the action carries one, else the drawDeck prompt's choice (a prompt
 * request) or the avatar's "draw a site" ability (a main-phase pick of the atlas). The avatar's
 * ability taps the avatar, so its label says so, naming the avatar when `avatar` is given.
 */
export function pileActionLabel(
  pile: DeckPile,
  request: string,
  labels: Readonly<Record<string, string>>,
  seat = "p1",
  avatar?: string | null,
): string {
  const prompt = request.startsWith("engine-prompt:") || request.startsWith("engine-mulligan:");
  const own = labels[pileToken(seat, pile)]?.trim();
  // the engine's hint for the avatar's own ability is a bare "Draw a site": say what it costs
  const avatarDraw = !prompt && pile === "atlas" && (!own || /^draw a site\.?$/i.test(own));
  // a pile of the seat we pilot under Courtesan Thaïs is theirs, not ours
  const whose = seat === "p1" ? "your" : "their";
  if (avatarDraw) return `Draw a site: avatar ability, taps ${avatar?.trim() || `${whose} avatar`}`;
  if (own) return own;
  if (prompt) return pile === "atlas" ? `Draw a site from ${whose} atlas` : `Draw a spell from ${whose} spellbook`;
  return pile === "atlas" ? "Draw a site" : `Draw from ${whose} spellbook`;
}
