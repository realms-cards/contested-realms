import { create } from "zustand";
import type { CellKey } from "@/lib/game/store/types";

/**
 * "Look here": a short-lived request to flash some board tiles, raised when the player taps an
 * entry in the action feed (ActionFeed2D) so the tiles that action touched light up on the
 * board. Any board layer can read it; `seq` advances on every request so the same tiles asked
 * for twice flash twice.
 */
export interface Board2DFocus {
  /** the tiles to flash, in our board's "x,y" cell keys */
  cells: CellKey[];
  /** bumps on every `set`, even with the same cells */
  seq: number;
  set: (cells: readonly CellKey[]) => void;
  clear: () => void;
}

export const useBoard2DFocus = create<Board2DFocus>((set) => ({
  cells: [],
  seq: 0,
  set: (cells) => set((s) => ({ cells: [...cells], seq: s.seq + 1 })),
  clear: () => set({ cells: [] }),
}));
