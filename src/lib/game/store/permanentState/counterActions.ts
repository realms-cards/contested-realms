import type { StateCreator } from "zustand";
import type { CellKey, GameState, PermanentItem, Permanents } from "../types";
import {
  createPermanentDeltaPatch,
  createPermanentsPatch,
} from "../utils/patchHelpers";
import { bumpPermanentVersion } from "../utils/permanentHelpers";

export type CounterActionsSlice = Pick<
  GameState,
  | "addCounterOnPermanent"
  | "incrementPermanentCounter"
  | "decrementPermanentCounter"
  | "clearPermanentCounter"
>;

const logCell = (get: () => GameState, at: CellKey) => {
  const [x, y] = at.split(",").map(Number);
  return y * get().board.size.w + x + 1;
};

export const createCounterActionsSlice: StateCreator<
  GameState,
  [],
  [],
  CounterActionsSlice
> = (set, get) => ({
  addCounterOnPermanent: (at, index) =>
    set((state) => {
      const per: Permanents = { ...state.permanents };
      const arr = [...(per[at] || [])];
      const cur = arr[index];
      if (!cur) return state;
      const nextCount = Math.max(1, Number(cur.counters || 0) + 1);
      const next = bumpPermanentVersion({ ...cur, counters: nextCount });
      arr[index] = next;
      per[at] = arr;
      const cellNo = logCell(get, at);
      get().log(
        `${cur.counters ? "Incremented" : "Added"} counter on '${cur.card.name}' at #${cellNo} (now ${nextCount})`
      );
      const deltaPatch = createPermanentDeltaPatch([
        {
          at,
          entry: {
            instanceId: next.instanceId ?? undefined,
            counters: next.counters,
            version: next.version,
          },
        },
      ]);
      if (deltaPatch) get().trySendPatch(deltaPatch);
      else get().trySendPatch(createPermanentsPatch(per, at));
      return { permanents: per } as Partial<GameState> as GameState;
    }),

  incrementPermanentCounter: (at, index) =>
    set((state) => {
      const per: Permanents = { ...state.permanents };
      const arr = [...(per[at] || [])];
      const cur = arr[index];
      if (!cur) return state;
      const nextCount = Math.max(1, Number(cur.counters || 0) + 1);
      const updated = bumpPermanentVersion({
        ...cur,
        counters: nextCount,
      });
      arr[index] = updated;
      per[at] = arr;
      const cellNo = logCell(get, at);
      get().log(
        `Incremented counter on '${cur.card.name}' at #${cellNo} (now ${nextCount})`
      );
      const deltaPatch = createPermanentDeltaPatch([
        {
          at,
          entry: {
            instanceId: updated.instanceId ?? undefined,
            counters: updated.counters,
            version: updated.version,
          },
        },
      ]);
      if (deltaPatch) get().trySendPatch(deltaPatch);
      else get().trySendPatch(createPermanentsPatch(per, at));
      return { permanents: per } as Partial<GameState> as GameState;
    }),

  decrementPermanentCounter: (at, index) =>
    set((state) => {
      const per: Permanents = { ...state.permanents };
      const arr = [...(per[at] || [])];
      const cur = arr[index];
      if (!cur) return state;
      const curCount = Number(cur.counters || 0);
      const cellNo = logCell(get, at);
      if (curCount <= 1) {
        const cleared = { ...cur } as PermanentItem;
        delete (cleared as { counters?: number }).counters;
        const next = bumpPermanentVersion(cleared);
        arr[index] = next;
        per[at] = arr;
        get().log(`Removed counter from '${cur.card.name}' at #${cellNo}`);
        const deltaPatch = createPermanentDeltaPatch([
          {
            at,
            entry: {
              instanceId: next.instanceId ?? undefined,
              counters: null,
              version: next.version,
            },
          },
          ]);
        if (deltaPatch) get().trySendPatch(deltaPatch);
        else get().trySendPatch(createPermanentsPatch(per, at));
      } else {
        const nextCount = curCount - 1;
        const next = bumpPermanentVersion({ ...cur, counters: nextCount });
        arr[index] = next;
        per[at] = arr;
        get().log(
          `Decremented counter on '${cur.card.name}' at #${cellNo} (now ${nextCount})`
        );
        const deltaPatch = createPermanentDeltaPatch([
          {
            at,
            entry: {
              instanceId: next.instanceId ?? undefined,
              counters: nextCount,
              version: next.version,
            },
          },
        ]);
        if (deltaPatch) get().trySendPatch(deltaPatch);
        else get().trySendPatch(createPermanentsPatch(per, at));
      }
      return { permanents: per } as Partial<GameState> as GameState;
    }),

  clearPermanentCounter: (at, index) =>
    set((state) => {
      const per: Permanents = { ...state.permanents };
      const arr = [...(per[at] || [])];
      const cur = arr[index];
      if (!cur || cur.counters == null) return state;
      const cleared = { ...cur } as PermanentItem;
      delete (cleared as { counters?: number }).counters;
      const next = bumpPermanentVersion(cleared);
      arr[index] = next;
      per[at] = arr;
      const cellNo = logCell(get, at);
      get().log(`Removed counter from '${cur.card.name}' at #${cellNo}`);
      const deltaPatch = createPermanentDeltaPatch([
        {
          at,
          entry: {
            instanceId: next.instanceId ?? undefined,
            counters: null,
            version: next.version,
          },
        },
      ]);
      if (deltaPatch) get().trySendPatch(deltaPatch);
      else get().trySendPatch(createPermanentsPatch(per, at));
      return { permanents: per } as Partial<GameState> as GameState;
    }),
});
