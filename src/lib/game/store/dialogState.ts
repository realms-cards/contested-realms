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
  | "removeCardFromSearchDialog"
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

export const createDialogSlice: StateCreator<GameState, [], [], DialogSlice> = (
  set,
  get
) => ({
  ...createInitialDialogState(),
  openContextMenu: (target: ContextMenuTarget, screen) =>
    set({ contextMenu: { target, screen } }),
  closeContextMenu: () => set({ contextMenu: null }),

  placementDialog: null,
  openPlacementDialog: (cardName, pileName, onPlace) =>
    set({ placementDialog: { cardName, pileName, onPlace } }),
  closePlacementDialog: () => set({ placementDialog: null }),

  searchDialog: null,
  openSearchDialog: (pileName, cards, onSelectCard, options) => {
    set({
      searchDialog: {
        pileName,
        cards,
        onSelectCard,
        onBanishCard: options?.onBanishCard,
        banishRequiresConsent: options?.banishRequiresConsent,
      },
    });
    get().log(`Viewing ${pileName} (${cards.length} cards)`);
  },
  closeSearchDialog: () => set({ searchDialog: null }),
  removeCardFromSearchDialog: (card) => {
    const dialog = get().searchDialog;
    if (!dialog) return;
    const idx = dialog.cards.findIndex(
      (c) =>
        c.cardId === card.cardId &&
        (c.instanceId ?? null) === (card.instanceId ?? null),
    );
    if (idx === -1) return;
    const updated = [...dialog.cards];
    updated.splice(idx, 1);
    set({ searchDialog: { ...dialog, cards: updated } });
  },

  peekDialog: null,
  openPeekDialog: (title, cards, source) =>
    set({ peekDialog: { title, cards, source } }),
  closePeekDialog: () => set({ peekDialog: null }),
});
