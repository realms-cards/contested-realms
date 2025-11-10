import type { StateCreator } from "zustand";
import type { CustomMessage } from "@/lib/net/transport";
import type { CellKey, GameState, PlayerKey } from "./types";
import { extractMagicTargetingHintsSync } from "@/lib/game/cardAbilities";

function newMagicId() {
  return `mag_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export type MagicSlice = Pick<
  GameState,
  | "pendingMagic"
  | "beginMagicCast"
  | "setMagicCasterChoice"
  | "setMagicTargetChoice"
  | "confirmMagic"
  | "resolveMagic"
  | "cancelMagic"
>;

export const createMagicSlice: StateCreator<GameState, [], [], MagicSlice> = (
  set,
  get
) => ({
  pendingMagic: null,

  beginMagicCast: (input) => {
    const id = newMagicId();
    const spell = input.spell;
    const tile = input.tile;
    const createdAt = Date.now();
    const ownerSeat = (spell.owner === 1 ? "p1" : "p2") as PlayerKey;
    const autoCaster = input.presetCaster ?? ({ kind: "avatar", seat: ownerSeat } as const);
    const hints = extractMagicTargetingHintsSync(spell.card?.name || "", null);
    set({
      pendingMagic: {
        id,
        tile,
        spell,
        caster: autoCaster,
        target: null,
        status: "choosingTarget",
        hints,
        createdAt,
      },
    } as Partial<GameState> as GameState);
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        // Broadcast magic begin for sync
        transport.sendMessage({
          type: "magicBegin",
          id,
          tile,
          spell,
          playerKey: get().actorKey ?? null,
          ts: Date.now(),
        } as unknown as CustomMessage);
        // Also show a toast for UX feedback
        const cardName = spell.card?.name || "Magic";
        const cellNo = tile.y * get().board.size.w + tile.x + 1;
        transport.sendMessage({ type: "toast", text: `Casting '${cardName}' at #${cellNo}` } as unknown as CustomMessage);
        // Immediately broadcast chosen caster (avatar by default)
        transport.sendMessage({ type: "magicSetCaster", id, caster: autoCaster, ts: Date.now() } as unknown as CustomMessage);
      } catch {}
    }
  },

  setMagicCasterChoice: (caster) => {
    const id = get().pendingMagic?.id || null;
    set((state) => {
      if (!state.pendingMagic) return state as GameState;
      return {
        pendingMagic: {
          ...state.pendingMagic,
          caster: caster ?? null,
          status: caster ? "choosingTarget" : "choosingCaster",
        },
      } as Partial<GameState> as GameState;
    });
    const transport = get().transport;
    if (transport?.sendMessage && id) {
      try {
        transport.sendMessage({ type: "magicSetCaster", id, caster: caster ?? null, ts: Date.now() } as unknown as CustomMessage);
      } catch {}
    }
  },

  setMagicTargetChoice: (target) => {
    const id = get().pendingMagic?.id || null;
    set((state) => {
      if (!state.pendingMagic) return state as GameState;
      return {
        pendingMagic: {
          ...state.pendingMagic,
          target: target ?? null,
          status: target ? "confirm" : "choosingTarget",
        },
      } as Partial<GameState> as GameState;
    });
    const transport = get().transport;
    if (transport?.sendMessage && id) {
      try {
        transport.sendMessage({ type: "magicSetTarget", id, target: target ?? null, ts: Date.now() } as unknown as CustomMessage);
      } catch {}
    }
  },

  confirmMagic: () => {
    set((state) => {
      if (!state.pendingMagic) return state as GameState;
      return {
        pendingMagic: {
          ...state.pendingMagic,
          status: "confirm",
        },
      } as Partial<GameState> as GameState;
    });
  },

  resolveMagic: () => {
    const pending = get().pendingMagic;
    if (!pending) return;
    const at = pending.spell.at as CellKey;
    const index = Number(pending.spell.index);
    try {
      get().movePermanentToZone(at, index, "graveyard");
    } catch {}
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({ type: "magicResolve", id: pending.id, spell: pending.spell, tile: pending.tile, ts: Date.now() } as unknown as CustomMessage);
        const nm = pending.spell.card?.name || "Magic";
        const cellNo = pending.tile.y * get().board.size.w + pending.tile.x + 1;
        transport.sendMessage({ type: "magicSummary", id: pending.id, text: `'${nm}' resolved @#${cellNo}` } as unknown as CustomMessage);
      } catch {}
    }
    set({ pendingMagic: null } as Partial<GameState> as GameState);
  },

  cancelMagic: () => {
    const pending = get().pendingMagic;
    if (!pending) return;
    try {
      get().movePermanentToZone(pending.spell.at as CellKey, Number(pending.spell.index), "hand");
    } catch {}
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({ type: "magicCancel", id: pending.id, spell: pending.spell, tile: pending.tile, ts: Date.now() } as unknown as CustomMessage);
      } catch {}
    }
    set({ pendingMagic: null } as Partial<GameState> as GameState);
  },
});
