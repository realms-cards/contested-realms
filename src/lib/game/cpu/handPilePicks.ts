import { useCallback, useState } from "react";
import { parsePickToken } from "@/lib/game/cpu/pickTokens";

/** The picker fields the hand and pile renderers read (see boardPicker.ts). */
export interface PickerFields {
  request: string;
  tiles: string[];
  selected: string | null;
  glow: string[];
  sources: string[];
}

export type DeckPile = "spellbook" | "atlas";
export type PickTone = "candidate" | "selected" | "target" | "source";

/** Board tones shared with CpuFieldTargets: candidate amber, selected/target green, source cyan. */
export const PICK_TONE_COLORS: Record<PickTone, string> = {
  candidate: "#f59e0b",
  selected: "#22c55e",
  target: "#22c55e",
  source: "#22d3ee",
};

// Selector slices hold only strings, so a shallow-compared subscription re-renders only when this seat's picks change.
const SEP = "\n";
const split = (joined: string) => (joined ? joined.split(SEP) : []);

function handIds(tokens: readonly string[], seat: string): string[] {
  const ids: string[] = [];
  for (const token of tokens) {
    const parsed = parsePickToken(token);
    if (parsed?.kind === "hand" && parsed.seat === seat && parsed.instanceId) ids.push(parsed.instanceId);
  }
  return ids;
}

function pileNames(tokens: readonly string[], seat: string): DeckPile[] {
  const piles: DeckPile[] = [];
  for (const token of tokens) {
    const parsed = parsePickToken(token);
    if (parsed?.kind === "pile" && parsed.seat === seat && (parsed.pile === "spellbook" || parsed.pile === "atlas") && !piles.includes(parsed.pile)) piles.push(parsed.pile);
  }
  return piles;
}

export interface HandPickSlice {
  candidates: string;
  selected: string;
  glow: string;
  sources: string;
}

/** Hand-card picks of one seat; tokens of other seats and other kinds are ignored. */
export const selectHandPick = (seat: string) => (picker: PickerFields): HandPickSlice => ({
  candidates: handIds(picker.tiles, seat).join(SEP),
  selected: picker.selected ? (handIds([picker.selected], seat)[0] ?? "") : "",
  glow: handIds(picker.glow, seat).join(SEP),
  sources: handIds(picker.sources, seat).join(SEP),
});

export interface HandPick {
  /** A hand card must be clicked: candidates light up, every other card is dimmed and inert. */
  active: boolean;
  candidates: ReadonlySet<string>;
  selected: string | null;
  glow: ReadonlySet<string>;
  sources: ReadonlySet<string>;
}

export const NO_HAND_PICK: HandPick = { active: false, candidates: new Set(), selected: null, glow: new Set(), sources: new Set() };

export function handPickFrom(slice: HandPickSlice): HandPick {
  if (!slice.candidates && !slice.selected && !slice.glow && !slice.sources) return NO_HAND_PICK;
  const candidates = new Set(split(slice.candidates));
  return { active: candidates.size > 0, candidates, selected: slice.selected || null, glow: new Set(split(slice.glow)), sources: new Set(split(slice.sources)) };
}

/** One highlight per card: the clicked card outranks a candidate, which outranks a chosen target, which outranks a source. */
export function handCardTone(pick: HandPick, instanceId: string | null | undefined): PickTone | null {
  if (!instanceId) return null;
  if (pick.selected === instanceId) return "selected";
  if (pick.candidates.has(instanceId)) return "candidate";
  if (pick.glow.has(instanceId)) return "target";
  if (pick.sources.has(instanceId)) return "source";
  return null;
}

export interface PilePickSlice {
  /** Only set while draw splits are offered, so unrelated request changes do not re-render the piles. */
  request: string;
  piles: string;
  draws: string;
  selected: string;
  glow: string;
}

/** Pile and draw-split picks of one seat. */
export const selectPilePick = (seat: string) => (picker: PickerFields): PilePickSlice => {
  const draws = parseDrawSplits(picker.tiles, seat).map(entry => entry.token).join(SEP);
  const selected = picker.selected ? parsePickToken(picker.selected) : null;
  return {
    request: draws ? picker.request : "",
    piles: pileNames(picker.tiles, seat).join(SEP),
    draws,
    selected: selected && (selected.kind === "pile" || selected.kind === "draw") && selected.seat === seat && picker.selected ? picker.selected : "",
    glow: pileNames(picker.glow, seat).join(SEP),
  };
};

export interface DrawSplit {
  token: string;
  spells: number;
  sites: number;
}

const count = (value: number) => Number.isInteger(value) && value >= 0;

/** Well-formed `draw:<seat>:<spells>-<sites>` tokens of one seat, from a token list or a joined slice. */
export function parseDrawSplits(tokens: readonly string[] | string, seat: string): DrawSplit[] {
  const list = typeof tokens === "string" ? split(tokens) : tokens;
  const splits: DrawSplit[] = [];
  for (const token of list) {
    const parsed = parsePickToken(token);
    if (parsed?.kind === "draw" && parsed.seat === seat && count(parsed.spells) && count(parsed.sites) && !splits.some(entry => entry.token === token)) splits.push({ token, spells: parsed.spells, sites: parsed.sites });
  }
  return splits;
}

export const pilePicks = (slice: PilePickSlice): DeckPile[] => split(slice.piles).filter((pile): pile is DeckPile => pile === "spellbook" || pile === "atlas");
export const pileGlow = (slice: PilePickSlice): DeckPile[] => split(slice.glow).filter((pile): pile is DeckPile => pile === "spellbook" || pile === "atlas");

export interface DrawTally {
  request: string;
  spells: number;
  sites: number;
}

export const EMPTY_TALLY: DrawTally = { request: "", spells: 0, sites: 0 };

/** Cards to draw in total, taken from the candidates (the largest split). */
export const drawTotal = (splits: readonly DrawSplit[]) => splits.reduce((max, entry) => Math.max(max, entry.spells + entry.sites), 0);

const reachable = (splits: readonly DrawSplit[], spells: number, sites: number) => splits.some(entry => entry.spells >= spells && entry.sites >= sites);

/** The tally that applies to this request: a tally left from another request, or one no candidate can still reach, reads as empty. */
export function tallyFor(state: DrawTally, request: string, splits: readonly DrawSplit[]): DrawTally {
  if (state.request !== request || !reachable(splits, state.spells, state.sites)) return { request, spells: 0, sites: 0 };
  return state;
}

export function matchDraw(splits: readonly DrawSplit[], tally: Pick<DrawTally, "spells" | "sites">): DrawSplit | null {
  if (tally.spells + tally.sites === 0) return null;
  return splits.find(entry => entry.spells === tally.spells && entry.sites === tally.sites) ?? null;
}

/** Whether one more draw from this pile still leads to a candidate (a finished tally starts over). */
export function pileCanTake(splits: readonly DrawSplit[], tally: DrawTally, pile: DeckPile): boolean {
  const base = matchDraw(splits, tally) ? { spells: 0, sites: 0 } : tally;
  return pile === "spellbook" ? reachable(splits, base.spells + 1, base.sites) : reachable(splits, base.spells, base.sites + 1);
}

/** One click on a pile adds one draw from it. A finished tally starts over; a click no candidate allows is ignored. */
export function addDraw(state: DrawTally, request: string, splits: readonly DrawSplit[], pile: DeckPile): DrawTally {
  const current = tallyFor(state, request, splits);
  if (!pileCanTake(splits, current, pile)) return current;
  const base = matchDraw(splits, current) ? { spells: 0, sites: 0 } : current;
  return pile === "spellbook" ? { request, spells: base.spells + 1, sites: base.sites } : { request, spells: base.spells, sites: base.sites + 1 };
}

export const resetTally = (request: string): DrawTally => ({ request, spells: 0, sites: 0 });

/** Local draw tally for one picker request; `onMatch` receives the draw token as soon as the tally equals a candidate split. */
export function useDrawTally(request: string, splits: readonly DrawSplit[], onMatch: (token: string) => void) {
  const [state, setState] = useState<DrawTally>(EMPTY_TALLY);
  const tally = tallyFor(state, request, splits);
  const add = useCallback((pile: DeckPile) => {
    const next = addDraw(state, request, splits, pile);
    setState(next);
    const hit = matchDraw(splits, next);
    if (hit && (next.spells !== tally.spells || next.sites !== tally.sites)) onMatch(hit.token);
  }, [state, request, splits, tally.spells, tally.sites, onMatch]);
  const reset = useCallback(() => setState(resetTally(request)), [request]);
  return { tally, total: drawTotal(splits), matched: matchDraw(splits, tally), add, reset };
}
