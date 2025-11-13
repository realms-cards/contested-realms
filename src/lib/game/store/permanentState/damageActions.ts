import type { StateCreator } from "zustand";
import type { CellKey, GameState, Permanents } from "../types";
import {
  createPermanentDeltaPatch,
  createPermanentsPatch,
  type PermanentDeltaUpdate,
} from "../utils/patchHelpers";
import { bumpPermanentVersion } from "../utils/permanentHelpers";

export type DamageActionsSlice = Pick<
  GameState,
  | "applyDamageToPermanent"
  | "clearAllDamageForSeat"
>;

export const createDamageActionsSlice: StateCreator<
  GameState,
  [],
  [],
  DamageActionsSlice
> = (set, get) => ({
  applyDamageToPermanent: (at, index, amount) =>
    set((state) => {
      const per: Permanents = { ...state.permanents };
      const arr = [...(per[at] || [])];
      const cur = arr[index];
      if (!cur) return state as GameState;
      const curDmg = Math.max(0, Number(cur.damage || 0));
      const add = Math.max(0, Math.floor(Number(amount || 0)));
      const nextDmg = curDmg + add;
      const next = bumpPermanentVersion({ ...cur, damage: nextDmg });
      arr[index] = next;
      per[at] = arr;
      const deltaPatch = createPermanentDeltaPatch([
        {
          at,
          entry: {
            instanceId: next.instanceId ?? undefined,
            damage: next.damage ?? null,
            version: next.version,
          },
        },
      ]);
      if (deltaPatch) get().trySendPatch(deltaPatch);
      else get().trySendPatch(createPermanentsPatch(per, at));
      return { permanents: per } as Partial<GameState> as GameState;
    }),

  clearAllDamageForSeat: (seat) =>
    set((state) => {
      const owner = seat === "p1" ? 1 : 2;
      const per: Permanents = { ...state.permanents };
      const updates: PermanentDeltaUpdate[] = [];
      for (const [cell, list] of Object.entries(per)) {
        const arr = [...(list || [])];
        let changed = false;
        for (let i = 0; i < arr.length; i++) {
          const cur = arr[i];
          if (!cur || cur.owner !== owner) continue;
          const dmg = Math.max(0, Number(cur.damage || 0));
          if (dmg > 0) {
            const next = bumpPermanentVersion({ ...cur, damage: null });
            arr[i] = next;
            updates.push({
              at: cell as CellKey,
              entry: {
                instanceId: next.instanceId ?? undefined,
                damage: null,
                version: next.version,
              },
            });
            changed = true;
          }
        }
        if (changed) per[cell as CellKey] = arr;
      }
      if (updates.length > 0) {
        const deltaPatch = createPermanentDeltaPatch(updates);
        if (deltaPatch) get().trySendPatch(deltaPatch);
        else get().trySendPatch(createPermanentsPatch(per));
      }
      return { permanents: per } as Partial<GameState> as GameState;
    }),
});
