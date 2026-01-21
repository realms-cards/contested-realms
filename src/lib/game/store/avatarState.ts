import type { StateCreator } from "zustand";
import type { AvatarState, CellKey, GameState, ServerPatchT } from "./types";
import { buildAvatarUpdate, createDefaultAvatars } from "./utils/avatarHelpers";
import { moveAvatarAttachedArtifacts } from "./utils/permanentHelpers";

type AvatarSlice = Pick<
  GameState,
  | "avatars"
  | "setAvatarCard"
  | "setAvatarChampion"
  | "placeAvatarAtStart"
  | "moveAvatarTo"
  | "moveAvatarToWithOffset"
  | "setAvatarOffset"
  | "toggleTapAvatar"
  | "addCounterOnAvatar"
  | "incrementAvatarCounter"
  | "decrementAvatarCounter"
  | "clearAvatarCounter"
>;

export const createAvatarSlice: StateCreator<GameState, [], [], AvatarSlice> = (
  set,
  get
) => ({
  avatars: createDefaultAvatars(),

  setAvatarCard: (who, card) =>
    set((state) => {
      const playerNum = who === "p1" ? "1" : "2";
      get().log(
        `[p${playerNum}:PLAYER] sets Avatar to [p${playerNum}card:${card.name}]`
      );
      const avatarsNext = {
        ...state.avatars,
        [who]: { ...state.avatars[who], card },
      } as GameState["avatars"];
      const tr = get().transport;
      if (tr) {
        const patch: ServerPatchT = {
          avatars: { [who]: { card } } as GameState["avatars"],
        };
        get().trySendPatch(patch);
      }
      return { avatars: avatarsNext } as Partial<GameState> as GameState;
    }),

  setAvatarChampion: (who, champion) =>
    set((state) => {
      if (champion) {
        const playerNum = who === "p1" ? "1" : "2";
        get().log(
          `[p${playerNum}:PLAYER] sets Dragonlord Champion to [p${playerNum}card:${champion.name}]`
        );
      }
      const avatarsNext = {
        ...state.avatars,
        [who]: { ...state.avatars[who], champion },
      } as GameState["avatars"];
      const tr = get().transport;
      if (tr) {
        const patch: ServerPatchT = {
          avatars: { [who]: { champion } } as GameState["avatars"],
        };
        get().trySendPatch(patch);
      }
      return { avatars: avatarsNext } as Partial<GameState> as GameState;
    }),

  placeAvatarAtStart: (who) =>
    set((state) => {
      const w = state.board.size.w;
      const h = state.board.size.h;
      const x = Math.floor(w / 2);
      const y = who === "p1" ? h - 1 : 0;
      const cellNo = y * w + x + 1;
      const playerNum = who === "p1" ? "1" : "2";
      get().log(`[p${playerNum}:PLAYER] places Avatar at #${cellNo}`);
      const avatarsNext = {
        ...state.avatars,
        [who]: { ...state.avatars[who], pos: [x, y], offset: null },
      } as GameState["avatars"];
      const tr = get().transport;
      if (tr) {
        const patch: ServerPatchT = {
          avatars: {
            [who]: { pos: [x, y] as [number, number], offset: null },
          } as GameState["avatars"],
        };
        get().trySendPatch(patch);
      }
      return { avatars: avatarsNext } as Partial<GameState> as GameState;
    }),

  moveAvatarTo: (who, x, y) =>
    set((state) => {
      get().pushHistory();
      const w = state.board.size.w;
      const cellNo = y * w + x + 1;
      const oldPos = state.avatars[who]?.pos;
      const oldKey = oldPos ? (`${oldPos[0]},${oldPos[1]}` as CellKey) : null;
      const newKey = `${x},${y}` as CellKey;
      const isCrossTileMove = oldKey && oldKey !== newKey;
      const currentAvatar = state.avatars[who];
      const shouldTap = Boolean(isCrossTileMove && !currentAvatar?.tapped);
      let avatars = buildAvatarUpdate(state, who, [x, y], null);
      if (shouldTap) {
        avatars = { ...avatars, [who]: { ...avatars[who], tapped: true } };
      }
      let permanents = state.permanents;
      let movedArtifactIds: string[] = [];
      if (isCrossTileMove) {
        const avatarOwner = who === "p1" ? 1 : 2;
        const result = moveAvatarAttachedArtifacts(
          state.permanents,
          oldKey as CellKey,
          newKey,
          avatarOwner as 1 | 2
        );
        permanents = result.permanents;
        // Track moved artifact instanceIds for removal markers in patch
        movedArtifactIds = result.movedArtifacts
          .map((a) => a.instanceId || a.card?.instanceId)
          .filter((id): id is string => typeof id === "string" && id.length > 0);
        if (result.movedArtifacts.length > 0) {
          get().log(
            `Moved ${result.movedArtifacts.length} attached artifact(s) with avatar`
          );
        }
      }
      const playerNum = who === "p1" ? "1" : "2";
      if (shouldTap) {
        get().log(`[p${playerNum}:PLAYER] moves Avatar to #${cellNo} (tapped)`);
      } else {
        get().log(`[p${playerNum}:PLAYER] moves Avatar to #${cellNo}`);
      }
      const tr = get().transport;
      if (tr) {
        const patch: ServerPatchT = {
          avatars: {
            [who]: {
              pos: [x, y] as [number, number],
              offset: null,
              ...(shouldTap && { tapped: true }),
            },
          } as GameState["avatars"],
        };
        if (isCrossTileMove) {
          // Build patch with __remove markers for artifacts moved FROM oldKey
          // This ensures receiving clients properly remove artifacts from old tile
          const oldTilePatch = [
            // Keep remaining permanents at old tile
            ...(permanents[oldKey as CellKey] || []),
            // Add __remove markers for moved artifacts
            ...movedArtifactIds.map((instanceId) => ({
              instanceId,
              __remove: true,
            })),
          ];
          patch.permanents = {
            [oldKey as CellKey]: oldTilePatch,
            [newKey]: permanents[newKey] || [],
          } as GameState["permanents"];
        }
        get().trySendPatch(patch);
      }
      return {
        avatars,
        permanents,
      } as Partial<GameState> as GameState;
    }),

  moveAvatarToWithOffset: (who, x, y, offset) =>
    set((state) => {
      get().pushHistory();
      const w = state.board.size.w;
      const cellNo = y * w + x + 1;
      const oldPos = state.avatars[who]?.pos;
      const oldKey = oldPos ? (`${oldPos[0]},${oldPos[1]}` as CellKey) : null;
      const newKey = `${x},${y}` as CellKey;
      const isCrossTileMove = oldKey && oldKey !== newKey;
      const currentAvatar = state.avatars[who];
      const shouldTap = Boolean(isCrossTileMove && !currentAvatar?.tapped);
      let avatars = buildAvatarUpdate(state, who, [x, y], offset);
      if (shouldTap) {
        avatars = { ...avatars, [who]: { ...avatars[who], tapped: true } };
      }
      let permanents = state.permanents;
      let movedArtifactIds: string[] = [];
      if (isCrossTileMove) {
        const avatarOwner = who === "p1" ? 1 : 2;
        const result = moveAvatarAttachedArtifacts(
          state.permanents,
          oldKey as CellKey,
          newKey,
          avatarOwner as 1 | 2
        );
        permanents = result.permanents;
        // Track moved artifact instanceIds for removal markers in patch
        movedArtifactIds = result.movedArtifacts
          .map((a) => a.instanceId || a.card?.instanceId)
          .filter((id): id is string => typeof id === "string" && id.length > 0);
        if (result.movedArtifacts.length > 0) {
          get().log(
            `Moved ${result.movedArtifacts.length} attached artifact(s) with avatar`
          );
        }
      }
      const playerNum = who === "p1" ? "1" : "2";
      if (shouldTap) {
        get().log(`[p${playerNum}:PLAYER] moves Avatar to #${cellNo} (tapped)`);
      } else {
        get().log(`[p${playerNum}:PLAYER] moves Avatar to #${cellNo}`);
      }
      const tr = get().transport;
      if (tr) {
        const patch: ServerPatchT = {
          avatars: {
            [who]: {
              pos: [x, y] as [number, number],
              offset,
              ...(shouldTap && { tapped: true }),
            },
          } as GameState["avatars"],
        };
        if (isCrossTileMove) {
          // Build patch with __remove markers for artifacts moved FROM oldKey
          // This ensures receiving clients properly remove artifacts from old tile
          const oldTilePatch = [
            // Keep remaining permanents at old tile
            ...(permanents[oldKey as CellKey] || []),
            // Add __remove markers for moved artifacts
            ...movedArtifactIds.map((instanceId) => ({
              instanceId,
              __remove: true,
            })),
          ];
          patch.permanents = {
            [oldKey as CellKey]: oldTilePatch,
            [newKey]: permanents[newKey] || [],
          } as GameState["permanents"];
        }
        get().trySendPatch(patch);
      }
      return {
        avatars,
        permanents,
      } as Partial<GameState> as GameState;
    }),

  setAvatarOffset: (who, offset) =>
    set((state) => {
      const cur = state.avatars[who];
      if (!cur) return state;
      const avatarsNext = {
        ...state.avatars,
        [who]: { ...cur, offset },
      } as GameState["avatars"];
      const updates: Partial<GameState> = {
        avatars: avatarsNext,
      };
      const actorSeat = state.actorKey;
      const patch: ServerPatchT = {
        avatars: { [who]: { offset } } as GameState["avatars"],
      };
      if (!actorSeat) {
        const pending = Array.isArray(state.pendingPatches)
          ? state.pendingPatches
          : [];
        updates.pendingPatches = [...pending, patch];
      } else if (actorSeat !== who) {
        get().log("Cannot adjust opponent avatar offset");
        return state as GameState;
      } else {
        get().trySendPatch(patch);
      }
      return updates as Partial<GameState> as GameState;
    }),

  toggleTapAvatar: (who) =>
    set((state) => {
      get().pushHistory();
      const actorSeat = state.actorKey;
      if (actorSeat && actorSeat !== who) {
        get().log("Cannot change tap on opponent avatar");
        return state as GameState;
      }
      const cur = state.avatars[who];
      const next: AvatarState = { ...cur, tapped: !cur.tapped };
      get().log(
        `${who.toUpperCase()} ${next.tapped ? "taps" : "untaps"} Avatar`
      );
      const avatarsNext = {
        ...state.avatars,
        [who]: next,
      } as GameState["avatars"];
      const patch: ServerPatchT = {
        avatars: { [who]: { tapped: next.tapped } } as GameState["avatars"],
      };
      const updates: Partial<GameState> = {
        avatars: avatarsNext,
      };
      if (!actorSeat) {
        const pending = Array.isArray(state.pendingPatches)
          ? state.pendingPatches
          : [];
        updates.pendingPatches = [...pending, patch];
      } else {
        get().trySendPatch(patch);
      }
      return updates as Partial<GameState> as GameState;
    }),

  addCounterOnAvatar: (who) =>
    set((state) => {
      const cur = state.avatars[who];
      const nextCount = Math.max(1, Number(cur?.counters || 0) + 1);
      const next = { ...cur, counters: nextCount } as AvatarState;
      const avatarsNext = {
        ...state.avatars,
        [who]: next,
      } as GameState["avatars"];
      get().log(
        `${who.toUpperCase()} ${
          cur?.counters ? "increments" : "adds"
        } avatar counter (now ${nextCount})`
      );
      const patch: ServerPatchT = {
        avatars: { [who]: { counters: nextCount } } as GameState["avatars"],
      };
      get().trySendPatch(patch);
      return { avatars: avatarsNext } as Partial<GameState> as GameState;
    }),

  incrementAvatarCounter: (who) =>
    set((state) => {
      const cur = state.avatars[who];
      const nextCount = Math.max(1, Number(cur?.counters || 0) + 1);
      const next = { ...cur, counters: nextCount } as AvatarState;
      const avatarsNext = {
        ...state.avatars,
        [who]: next,
      } as GameState["avatars"];
      get().log(
        `${who.toUpperCase()} increments avatar counter (now ${nextCount})`
      );
      const patch: ServerPatchT = {
        avatars: { [who]: { counters: nextCount } } as GameState["avatars"],
      };
      get().trySendPatch(patch);
      return { avatars: avatarsNext } as Partial<GameState> as GameState;
    }),

  decrementAvatarCounter: (who) =>
    set((state) => {
      const cur = state.avatars[who];
      const curCount = Math.max(0, Number(cur?.counters || 0));
      if (curCount <= 1) {
        const cleared = { ...cur } as AvatarState;
        delete (cleared as { counters?: number | null }).counters;
        const avatarsNext = {
          ...state.avatars,
          [who]: cleared,
        } as GameState["avatars"];
        const playerNum = who === "p1" ? "1" : "2";
        get().log(`[p${playerNum}:PLAYER] removes avatar counter`);
        const patch: ServerPatchT = {
          avatars: { [who]: { counters: null } } as GameState["avatars"],
        };
        get().trySendPatch(patch);
        return { avatars: avatarsNext } as Partial<GameState> as GameState;
      } else {
        const nextCount = curCount - 1;
        const next = { ...cur, counters: nextCount } as AvatarState;
        const avatarsNext = {
          ...state.avatars,
          [who]: next,
        } as GameState["avatars"];
        const playerNum2 = who === "p1" ? "1" : "2";
        get().log(
          `[p${playerNum2}:PLAYER] decrements avatar counter (now ${nextCount})`
        );
        const patch: ServerPatchT = {
          avatars: { [who]: { counters: nextCount } } as GameState["avatars"],
        };
        get().trySendPatch(patch);
        return { avatars: avatarsNext } as Partial<GameState> as GameState;
      }
    }),

  clearAvatarCounter: (who) =>
    set((state) => {
      const cur = state.avatars[who];
      if (!cur || cur.counters == null) return state as GameState;
      const cleared = { ...cur } as AvatarState;
      delete (cleared as { counters?: number | null }).counters;
      const avatarsNext = {
        ...state.avatars,
        [who]: cleared,
      } as GameState["avatars"];
      const playerNum = who === "p1" ? "1" : "2";
      get().log(`[p${playerNum}:PLAYER] removes avatar counter`);
      const patch: ServerPatchT = {
        avatars: { [who]: { counters: null } } as GameState["avatars"],
      };
      get().trySendPatch(patch);
      return { avatars: avatarsNext } as Partial<GameState> as GameState;
    }),
});
