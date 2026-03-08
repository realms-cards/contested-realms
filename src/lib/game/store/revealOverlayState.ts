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
> = (set, get) => ({
  revealOverlay: {
    isOpen: false,
    title: "",
    cards: [],
    revealedBy: undefined,
    minimizeToSelector: undefined,
  },

  openRevealOverlay: (
    title: string,
    cards: CardRef[],
    revealedBy?: PlayerKey,
    minimizeToSelector?: string,
  ) => {
    set({
      revealOverlay: {
        isOpen: true,
        title,
        cards,
        revealedBy,
        minimizeToSelector,
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
        minimizeToSelector: undefined,
      },
    } as Partial<GameState> as GameState);

    // If the turn effect queue is active and waiting, advance it.
    // This is used by Omphalos draw to block the queue until the player
    // dismisses the card reveal overlay.
    if (get().turnEffectQueueActive) {
      get().resolveCurrentTurnEffect();
    }
  },
});
