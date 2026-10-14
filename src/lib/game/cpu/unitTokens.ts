import type { FieldTone } from "@/lib/game/cpu/fieldTargets";
import { unitToken } from "@/lib/game/cpu/pickTokens";
import type { PlayerKey } from "@/lib/game/store/types";

/*
 * The pure half of usePickUnit: which token a board card answers to and how the picker lights
 * it. Kept free of React and @react-three so a DOM-only board (engine mode's phone 2D view)
 * can use it without pulling the WebGL stack into its bundle.
 */

/** How a board card is lit by the CPU board picker, or null when the picker ignores it. */
export type UnitPickState = FieldTone | null;
// Cards take their colours from `toneColors` in fieldTargets.ts, the same table the tiles and
// arrows read, so a visual aid changes all three together and a second copy cannot drift.

export type PickerView = { tiles: readonly string[]; glow: readonly string[]; sources: readonly string[]; selected: string | null };
export type TileAvatars = Partial<Record<PlayerKey, { pos?: readonly [number, number] | number[] | null } | null | undefined>>;
export type TileItem = { instanceId?: string | null; card?: { instanceId?: string | null } | null; attachedTo?: unknown };

/** The token of a permanent's card; matches the rules' unitsInRealm targets (item.instanceId, else the card's, else the slot). */
export const permanentUnitToken = (at: string, index: number, item: TileItem): string =>
  unitToken({kind:"permanent",at,index,instanceId:item.instanceId || item.card?.instanceId || null});
export const avatarUnitToken = (seat: PlayerKey): string => unitToken({kind:"avatar",seat});

/** Cards drawn on a tile, bottom-up: avatars standing there (tucked under the stack), then its unattached permanents. */
export function tileUnitTokens(at: string, items: readonly TileItem[], avatars: TileAvatars): string[] {
  const tokens: string[] = [];
  for (const seat of ["p1","p2"] as const) {
    const pos = avatars[seat]?.pos;
    if (pos && `${pos[0]},${pos[1]}` === at) tokens.push(avatarUnitToken(seat));
  }
  items.forEach((item,index) => { if (!item.attachedTo) tokens.push(permanentUnitToken(at,index,item)); });
  return tokens;
}

/** A clickable candidate outranks a chosen target, which outranks a caster or source (as on tiles). */
export function unitPickState(picker: PickerView, token: string): UnitPickState {
  if (picker.tiles.includes(token)) return token === picker.selected ? "selected" : "candidate";
  if (picker.glow.includes(token)) return "target";
  return picker.sources.includes(token) ? "source" : null;
}
