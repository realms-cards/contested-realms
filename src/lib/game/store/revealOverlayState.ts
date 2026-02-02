import type { StateCreator } from "zustand";
import type { GameState, CardRef, PlayerKey } from "./types";

export type RevealOverlaySlice = Pick<
  GameState,
  | "revealOverlay"
  | "openRevealOverlay"
  | "closeRevealOverlay"
>;

export const createRevealOverlaySlice: StateCreator<
  GameState,
  [],
  [],
  RevealOverlaySlice
> = (set) => ({
  revealOverlay: {
    isOpen: false,
    title: "",
    cards: [],
    revealedBy: undefined,
  },

  openRevealOverlay: (title: string, cards: CardRef[], revealedBy?: PlayerKey) => {
    set({
      revealOverlay: {
        isOpen: true,
        title,
        cards,
        revealedBy,
      },
    } as Partial<GameState> as GameState);
  },

  closeRevealOverlay: () => {
    set({
      revealOverlay: {
        isOpen: false,
        title: "",
        cards: [],
        revealedBy: undefined,
      },
    } as Partial<GameState> as GameState);
  },
});
