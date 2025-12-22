import type { StateCreator } from "zustand";
import type { GameState } from "./types";

type CardMetaSlice = Pick<GameState, "metaByCardId" | "fetchCardMeta">;

type CardMetaEntry = {
  attack: number | null;
  defence: number | null;
  cost: number | null;
  rarity: string | null;
};

export const createCardMetaSlice: StateCreator<
  GameState,
  [],
  [],
  CardMetaSlice
> = (set, get) => ({
  metaByCardId: {},
  fetchCardMeta: async (ids) => {
    try {
      const uniq = Array.from(
        new Set(
          (Array.isArray(ids) ? ids : [])
            .map((n) => Number(n))
            .filter((n) => Number.isFinite(n) && n > 0)
        )
      );
      const need = uniq.filter((id) => !get().metaByCardId[id]);
      if (!need.length) return;
      const res = await fetch(
        `/api/cards/meta?ids=${encodeURIComponent(need.join(","))}`,
        { credentials: "include" }
      );
      if (!res.ok) return;
      const rows = (await res.json()) as Array<{
        cardId: number;
        cost: number | null;
        thresholds?: unknown;
        attack: number | null;
        defence: number | null;
        rarity: string | null;
      }>;
      const next = { ...(get().metaByCardId as Record<number, CardMetaEntry>) };
      for (const r of rows) {
        next[r.cardId] = {
          attack: r.attack ?? null,
          defence: r.defence ?? null,
          cost: r.cost ?? null,
          rarity: r.rarity ?? null,
        };
      }
      set({ metaByCardId: next } as Partial<GameState> as GameState);
    } catch {}
  },
});
