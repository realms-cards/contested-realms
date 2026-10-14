import { useMemo } from "react";
import { STACK_LAYER_LIFT } from "@/lib/game/boardShared";
import { CARD_SHORT, TILE_SIZE } from "@/lib/game/constants";
import { useCpuBoardPicker } from "@/lib/game/cpu/boardPicker";
import { unitPickState } from "@/lib/game/cpu/unitTokens";
import type { PickerView, UnitPickState } from "@/lib/game/cpu/unitTokens";
import { requestCosmeticFrame } from "@/lib/game/render/cosmeticFrame";

export {
  avatarUnitToken,
  permanentUnitToken,
  tileUnitTokens,
  unitPickState,
} from "@/lib/game/cpu/unitTokens";
export type { UnitPickState } from "@/lib/game/cpu/unitTokens";

export const isPickable = (state: UnitPickState): boolean => state === "candidate" || state === "selected";

/** A primitive per-tile snapshot, so a picker update re-renders only the stacks whose cards change tone. */
export function unitPickSignature(picker: PickerView, tokens: readonly string[]): string {
  if (!picker.tiles.length && !picker.glow.length && !picker.sources.length) return "";
  const states = tokens.map(token => unitPickState(picker,token) ?? "");
  return states.some(Boolean) ? states.join("|") : "";
}

export function parseUnitPickSignature(signature: string, tokens: readonly string[]): Map<string, UnitPickState> {
  const picks = new Map<string, UnitPickState>();
  if (!signature) return picks;
  const states = signature.split("|");
  tokens.forEach((token,index) => {
    const state = states[index];
    if (state === "candidate" || state === "selected" || state === "target" || state === "source") picks.set(token,state);
  });
  return picks;
}

/** Subscribes a stack (or avatar) to the picker for its tile's cards only. */
export function useUnitPicks(tokens: readonly string[]): Map<string, UnitPickState> {
  const signature = useCpuBoardPicker(picker => unitPickSignature(picker,tokens));
  // Tokens never contain spaces; the joined key keeps the memo stable across renders that rebuild the list.
  const key = tokens.join(" ");
  return useMemo(() => parseUnitPickSignature(signature,key ? key.split(" ") : []),[signature,key]);
}

export interface UnitPickOffset { x: number; lift: number }
const SPREAD_STEP = CARD_SHORT*0.7;
// Leaves a small margin inside the tile for the outermost cards.
const SPREAD_ROOM = TILE_SIZE*0.92-CARD_SHORT;

/** Where each clickable card moves while a pick is open. Two or more candidates on a tile fan out along x (centred, at most
 * 70% of a card apart and within the tile) and rise above the other cards there; a lone candidate stays put and only rises
 * when other cards share its tile. Cards that are not candidates keep their place. */
export function unitPickLayout(tokens: readonly string[], picks: ReadonlyMap<string, UnitPickState>): Map<string, UnitPickOffset> {
  const layout = new Map<string, UnitPickOffset>();
  const pickable = tokens.filter(token => isPickable(picks.get(token) ?? null));
  if (!pickable.length || tokens.length < 2) return layout;
  const step = pickable.length > 1 ? Math.min(SPREAD_STEP,SPREAD_ROOM/(pickable.length-1)) : 0;
  pickable.forEach((token,index) => layout.set(token,{
    x:(index-(pickable.length-1)/2)*step,
    lift:STACK_LAYER_LIFT*(tokens.length+1+index),
  }));
  return layout;
}

/** Above CpuFieldTargets' clickable tile planes (lifted 0.3), so a candidate card wins the raycast over a candidate tile. */
export const UNIT_PICK_PRIORITY_HEIGHT = 0.5;
/** The ray distance a candidate card reports: as if it lay UNIT_PICK_PRIORITY_HEIGHT closer along the (downward) ray.
 * The shift is the same for every card on one ray, so overlapping candidates keep their real order. */
export function unitPickDistance(distance: number, rayDirectionY: number): number {
  if (rayDirectionY > -0.05) return distance;
  return Math.max(0,distance-UNIT_PICK_PRIORITY_HEIGHT/-rayDirectionY);
}

export const pickUnit = (token: string): void => useCpuBoardPicker.getState().select(token);

/** One shared, throttled pulse for every candidate card: a single timer (not a useFrame per card) that eases the
 * registered fills and asks for cosmetic frames only; it stops when the last candidate unmounts, so an idle board renders nothing. */
export const UNIT_PICK_FILL = {opacity:0.1,pulse:0.06};
const pulsing = new Set<{ opacity: number }>();
let pulseTimer: ReturnType<typeof setInterval> | null = null;
export function registerUnitPickPulse(fill: { opacity: number }, requestFrame: () => void = requestCosmeticFrame): () => void {
  pulsing.add(fill);
  if (!pulseTimer) pulseTimer = setInterval(() => {
    const wave = Math.sin(Date.now()/1000*3);
    for (const target of pulsing) target.opacity = UNIT_PICK_FILL.opacity+wave*UNIT_PICK_FILL.pulse;
    requestFrame();
  },80);
  return () => {
    pulsing.delete(fill);
    if (!pulsing.size && pulseTimer) { clearInterval(pulseTimer); pulseTimer = null; }
  };
}
export const unitPickPulseActive = (): boolean => pulseTimer !== null;
