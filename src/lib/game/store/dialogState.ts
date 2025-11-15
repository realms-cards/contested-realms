import type { StateCreator } from "zustand";
import type { ContextMenuTarget, GameState } from "./types";

export type DialogSlice = Pick<
  GameState,
  | "contextMenu"
  | "openContextMenu"
  | "closeContextMenu"
  | "placementDialog"
  | "openPlacementDialog"
  | "closePlacementDialog"
  | "searchDialog"
  | "openSearchDialog"
  | "closeSearchDialog"
  | "peekDialog"
  | "openPeekDialog"
  | "closePeekDialog"
>;

type DialogDefaults = Pick<
  GameState,
  "contextMenu" | "placementDialog" | "searchDialog" | "peekDialog"
>;

export const createInitialDialogState = (): DialogDefaults => ({
  contextMenu: null,
  placementDialog: null,
  searchDialog: null,
  peekDialog: null,
});

export const createDialogSlice: StateCreator<
  GameState,
  [],
  [],
  DialogSlice
> = (set, get) => ({
  ...createInitialDialogState(),
  openContextMenu: (target: ContextMenuTarget, screen) =>
    set({ contextMenu: { target, screen } }),
  closeContextMenu: () => set({ contextMenu: null }),

  placementDialog: null,
  openPlacementDialog: (cardName, pileName, onPlace) =>
    set({ placementDialog: { cardName, pileName, onPlace } }),
  closePlacementDialog: () => set({ placementDialog: null }),

  searchDialog: null,
  openSearchDialog: (pileName, cards, onSelectCard) => {
    set({ searchDialog: { pileName, cards, onSelectCard } });
    get().log(`Viewing ${pileName} (${cards.length} cards)`);
  },
  closeSearchDialog: () => set({ searchDialog: null }),

  peekDialog: null,
  openPeekDialog: (title, cards) =>
    set({ peekDialog: { title, cards } }),
  closePeekDialog: () => set({ peekDialog: null }),
});
