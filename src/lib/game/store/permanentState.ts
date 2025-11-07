import type { StateCreator } from "zustand";
import type {
  CellKey,
  GameState,
  PermanentItem,
  Permanents,
  PlayerKey,
} from "./types";
import {
  bumpPermanentVersion,
  ensurePermanentInstanceId,
} from "./utils/permanentHelpers";
import {
  createPermanentDeltaPatch,
  createPermanentsPatch,
  type PermanentDeltaUpdate,
} from "./utils/patchHelpers";

type PermanentSlice = Pick<
  GameState,
  | "permanents"
  | "setTapPermanent"
  | "attachTokenToTopPermanent"
  | "applyDamageToPermanent"
  | "clearAllDamageForSeat"
  | "attachTokenToPermanent"
  | "attachPermanentToAvatar"
  | "addCounterOnPermanent"
  | "incrementPermanentCounter"
  | "decrementPermanentCounter"
  | "clearPermanentCounter"
  | "detachToken"
  | "setPermanentOffset"
  | "toggleTapPermanent"
>;

export const createPermanentSlice: StateCreator<
  GameState,
  [],
  [],
  PermanentSlice
> = (set, get) => ({
  permanents: {},

  setTapPermanent: (at, index, tapped) =>
    set((state) => {
      get().pushHistory();
      const per: Permanents = { ...state.permanents };
      const arr = [...(per[at] || [])];
      if (!arr[index]) return state as GameState;
      const cur = arr[index];
      if (state.transport && state.actorKey) {
        const ownerKey = (cur.owner === 1 ? "p1" : "p2") as PlayerKey;
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

  attachTokenToTopPermanent: (at, index) =>
    set((state) => {
      const arr = state.permanents[at] || [];
      const token = arr[index];
      if (!token) return state;
      const nonTokenIndices = arr
        .map((it, i) => ({ it, i }))
        .filter(
          ({ it }) => !(it.card.type || "").toLowerCase().includes("token")
        );
      if (nonTokenIndices.length === 0) return state;
      const last = nonTokenIndices[nonTokenIndices.length - 1];
      const targetIdx = last ? last.i : 0;
      const per: Permanents = { ...state.permanents };
      const list = [...(per[at] || [])];
      const updatedToken = bumpPermanentVersion({
        ...token,
        attachedTo: { at, index: targetIdx },
      });
      list[index] = updatedToken;
      per[at] = list;
      get().log(`Attached token '${token.card.name}' to permanent at ${at}`);
      const deltaPatch = createPermanentDeltaPatch([
        {
          at,
          entry: {
            instanceId: list[index].instanceId ?? undefined,
            attachedTo: { at, index: targetIdx },
            version: list[index].version,
          },
        },
      ]);
      if (deltaPatch) get().trySendPatch(deltaPatch);
      else get().trySendPatch(createPermanentsPatch(per, at));
      return { permanents: per } as Partial<GameState> as GameState;
    }),

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

  attachTokenToPermanent: (at, tokenIndex, targetIndex) =>
    set((state) => {
      const arr = state.permanents[at] || [];
      const token = arr[tokenIndex];
      const target = arr[targetIndex];
      if (!token || !target) return state;

      const itemType = (token.card.type || "").toLowerCase();
      const itemSubTypes = (token.card.subTypes || "").toLowerCase();
      const isToken = itemType.includes("token");
      const isArtifact = itemType.includes("artifact");
      const isMonument = itemSubTypes.includes("monument");
      const isAutomaton = itemSubTypes.includes("automaton");
      const isCarryableArtifact = isArtifact && !isMonument && !isAutomaton;
      if (!isToken && !isCarryableArtifact) return state;

      const targetType = (target.card.type || "").toLowerCase();
      const targetSubTypes = (target.card.subTypes || "").toLowerCase();
      const targetIsToken = targetType.includes("token");
      const targetIsArtifact = targetType.includes("artifact");
      const targetIsMonument = targetSubTypes.includes("monument");
      const targetIsAutomaton = targetSubTypes.includes("automaton");
      const targetIsCarryableArtifact =
        targetIsArtifact && !targetIsMonument && !targetIsAutomaton;
      if (targetIsToken || targetIsCarryableArtifact) return state;

      const per: Permanents = { ...state.permanents };
      const list = [...(per[at] || [])];
      const updatedToken = bumpPermanentVersion({
        ...token,
        attachedTo: { at, index: targetIndex },
      });
      list[tokenIndex] = updatedToken;
      per[at] = list;
      const itemLabel = isCarryableArtifact ? "artifact" : "token";
      get().log(
        `Attached ${itemLabel} '${token.card.name}' to permanent '${target.card.name}' at ${at}`
      );
      const deltaPatch = createPermanentDeltaPatch([
        {
          at,
          entry: {
            instanceId: list[tokenIndex].instanceId ?? undefined,
            attachedTo: { at, index: targetIndex },
            version: list[tokenIndex].version,
          },
        },
      ]);
      if (deltaPatch) get().trySendPatch(deltaPatch);
      else get().trySendPatch(createPermanentsPatch(per, at));
      return { permanents: per } as Partial<GameState> as GameState;
    }),

  attachPermanentToAvatar: (at, permanentIndex, avatarKey) =>
    set((state) => {
      const arr = state.permanents[at] || [];
      const permanent = arr[permanentIndex];
      if (!permanent) return state;
      const avatar = state.avatars[avatarKey as PlayerKey];
      if (!avatar || !avatar.pos) return state;
      const [avatarX, avatarY] = avatar.pos;
      const [permX, permY] = at.split(",").map(Number);
      if (avatarX !== permX || avatarY !== permY) {
        get().log("Cannot attach to avatar: not on same tile");
        return state;
      }
      const per: Permanents = { ...state.permanents };
      const list = [...(per[at] || [])];
      const updatedPermanent = bumpPermanentVersion({
        ...permanent,
        attachedTo: { at, index: -1 },
      });
      list[permanentIndex] = updatedPermanent;
      per[at] = list;
      get().log(
        `Attached '${permanent.card.name}' to ${avatarKey.toUpperCase()} Avatar`
      );
      const deltaPatch = createPermanentDeltaPatch([
        {
          at,
          entry: {
            instanceId: list[permanentIndex].instanceId ?? undefined,
            attachedTo: { at, index: -1 },
            version: list[permanentIndex].version,
          },
        },
      ]);
      if (deltaPatch) get().trySendPatch(deltaPatch);
      else get().trySendPatch(createPermanentsPatch(per, at));
      return { permanents: per } as Partial<GameState> as GameState;
    }),

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
      const cell = at.split(",");
      const x = Number(cell[0] || 0);
      const y = Number(cell[1] || 0);
      const cellNo = y * state.board.size.w + x + 1;
      get().log(
        `${cur.counters ? "Incremented" : "Added"} counter on '${
          cur.card.name
        }' at #${cellNo} (now ${nextCount})`
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
      const cell = at.split(",");
      const x = Number(cell[0] || 0);
      const y = Number(cell[1] || 0);
      const cellNo = y * state.board.size.w + x + 1;
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
      if (curCount <= 1) {
        const cleared = { ...cur } as PermanentItem;
        delete (cleared as { counters?: number }).counters;
        const next = bumpPermanentVersion(cleared);
        arr[index] = next;
        per[at] = arr;
        const cell = at.split(",");
        const x = Number(cell[0] || 0);
        const y = Number(cell[1] || 0);
        const cellNo = y * state.board.size.w + x + 1;
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
        const cell = at.split(",");
        const x = Number(cell[0] || 0);
        const y = Number(cell[1] || 0);
        const cellNo = y * state.board.size.w + x + 1;
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
      const cell = at.split(",");
      const x = Number(cell[0] || 0);
      const y = Number(cell[1] || 0);
      const cellNo = y * state.board.size.w + x + 1;
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

  detachToken: (at, index) =>
    set((state) => {
      const token = (state.permanents[at] || [])[index];
      if (!token) return state;
      const per: Permanents = { ...state.permanents };
      const list = [...(per[at] || [])];
      const updated = bumpPermanentVersion({ ...token, attachedTo: null });
      list[index] = updated;
      per[at] = list;
      get().log(`Detached token '${token.card.name}'`);
      const deltaPatch = createPermanentDeltaPatch([
        {
          at,
          entry: {
            instanceId: list[index].instanceId ?? undefined,
            attachedTo: null,
            version: list[index].version,
          },
        },
      ]);
      if (deltaPatch) get().trySendPatch(deltaPatch);
      else get().trySendPatch(createPermanentsPatch(per, at));
      return { permanents: per } as Partial<GameState> as GameState;
    }),

  setPermanentOffset: (at, index, offset) =>
    set((state) => {
      const per: Permanents = { ...state.permanents };
      const arr = [...(per[at] || [])];
      if (!arr[index]) return state;
      const next = bumpPermanentVersion({ ...arr[index], offset });
      arr[index] = next;
      per[at] = arr;
      const deltaPatch = createPermanentDeltaPatch([
        {
          at,
          entry: {
            instanceId: next.instanceId ?? undefined,
            offset: next.offset ?? offset ?? null,
            version: next.version,
          },
        },
      ]);
      if (deltaPatch) get().trySendPatch(deltaPatch);
      else get().trySendPatch(createPermanentsPatch(per, at));
      return { permanents: per } as Partial<GameState> as GameState;
    }),

  toggleTapPermanent: (at, index) =>
    set((state) => {
      get().pushHistory();
      const per: Permanents = { ...state.permanents };
      const arr = [...(per[at] || [])];
      if (!arr[index]) return state;
      const cur = arr[index];
      if (state.transport && state.actorKey) {
        const ownerKey = (cur.owner === 1 ? "p1" : "p2") as PlayerKey;
        if (state.actorKey !== ownerKey) {
          get().log(`Cannot change tap on opponent permanent`);
          return state as GameState;
        }
      }
      const nextTapVersion = Number(cur.tapVersion ?? 0) + 1;
      const next = bumpPermanentVersion({
        ...cur,
        tapped: !cur.tapped,
        tapVersion: nextTapVersion,
      });
      arr[index] = next;
      per[at] = arr;
      const cell = at.split(",");
      const x = Number(cell[0] || 0);
      const y = Number(cell[1] || 0);
      const cellNo = y * state.board.size.w + x + 1;
      get().log(
        `${next.tapped ? "Tapped" : "Untapped"} '${
          cur.card.name
        }' at #${cellNo}`
      );
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
});
