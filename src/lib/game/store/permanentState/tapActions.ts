import type { StateCreator } from "zustand";
import type { GameState, Permanents } from "../types";
import { seatFromOwner } from "../utils/boardHelpers";
import {
  createPermanentDeltaPatch,
  createPermanentsPatch,
} from "../utils/patchHelpers";
import { bumpPermanentVersion } from "../utils/permanentHelpers";

export type TapActionsSlice = Pick<
  GameState,
  | "setTapPermanent"
  | "toggleTapPermanent"
  | "toggleFaceDown"
  | "setPermanentOffset"
>;

export const createTapActionsSlice: StateCreator<
  GameState,
  [],
  [],
  TapActionsSlice
> = (set, get) => ({
  setTapPermanent: (at, index, tapped) =>
    set((state) => {
      get().pushHistory();
      const per: Permanents = { ...state.permanents };
      const arr = [...(per[at] || [])];
      if (!arr[index]) return state as GameState;
      const cur = arr[index];
      if (state.transport && state.actorKey) {
        const ownerKey = seatFromOwner(cur.owner);
        if (state.actorKey !== ownerKey) return state as GameState;
      }
      const nextTapVersion =
        Number(cur.tapVersion ?? 0) + (cur.tapped === tapped ? 0 : 1);
      const next = bumpPermanentVersion({
        ...cur,
        tapped,
        tapVersion: nextTapVersion,
      });
      arr[index] = next;
      per[at] = arr;
      const deltaPatch = createPermanentDeltaPatch([
        {
          at,
          entry: {
            instanceId: next.instanceId ?? undefined,
            tapped: next.tapped,
            tapVersion: next.tapVersion,
            version: next.version,
          },
        },
      ]);
      if (deltaPatch) get().trySendPatch(deltaPatch);
      else get().trySendPatch(createPermanentsPatch(per, at));
      return { permanents: per } as Partial<GameState> as GameState;
    }),

  toggleTapPermanent: (at, index) =>
    get().setTapPermanent(at, index, !get().permanents[at]?.[index]?.tapped),

  toggleFaceDown: (at, index) =>
    set((state) => {
      get().pushHistory();
      const per: Permanents = { ...state.permanents };
      const arr = [...(per[at] || [])];
      if (!arr[index]) return state as GameState;
      const cur = arr[index];
      if (state.transport && state.actorKey) {
        const ownerKey = seatFromOwner(cur.owner);
        if (state.actorKey !== ownerKey) return state as GameState;
      }
      const newFaceDown = !cur.faceDown;
      const next = bumpPermanentVersion({
        ...cur,
        faceDown: newFaceDown,
      });
      arr[index] = next;
      per[at] = arr;
      const deltaPatch = createPermanentDeltaPatch([
        {
          at,
          entry: {
            instanceId: next.instanceId ?? undefined,
            faceDown: next.faceDown,
            version: next.version,
          },
        },
      ]);
      if (deltaPatch) get().trySendPatch(deltaPatch);
      else get().trySendPatch(createPermanentsPatch(per, at));
      return { permanents: per } as Partial<GameState> as GameState;
    }),

  setPermanentOffset: (at, index, offset) =>
    set((state) => {
      const per = { ...state.permanents };
      const arr = [...(per[at] || [])];
      if (!arr[index]) return state as GameState;
      const next = bumpPermanentVersion({ ...arr[index], offset });
      arr[index] = next;
      per[at] = arr;
      const deltaPatch = createPermanentDeltaPatch([
        {
          at,
          entry: {
            instanceId: next.instanceId ?? undefined,
            offset: next.offset,
            version: next.version,
          },
        },
      ]);
      if (deltaPatch) get().trySendPatch(deltaPatch);
      else get().trySendPatch(createPermanentsPatch(per, at));
      return { permanents: per } as Partial<GameState> as GameState;
    }),
});
