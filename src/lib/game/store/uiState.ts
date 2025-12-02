import type { StateCreator } from "zustand";
import type { CardRef, GameState, PlayerKey } from "./types";

export type UiSlice = Pick<
  GameState,
  | "cameraMode"
  | "selectedCard"
  | "selectedPermanent"
  | "selectedAvatar"
  | "mouseInHandZone"
  | "handHoverCount"
  | "dragFromHand"
  | "dragFromPile"
  | "hoverCell"
  | "previewCard"
  | "selectHandCard"
  | "selectAvatar"
  | "clearSelection"
  | "setMouseInHandZone"
  | "setHandHoverCount"
  | "setDragFromHand"
  | "setDragFromPile"
  | "setHoverCell"
  | "clearHoverCell"
  | "setPreviewCard"
  | "selectPermanent"
  | "setCameraMode"
  | "toggleCameraMode"
  | "switchSiteSource"
  | "setSwitchSiteSource"
>;

type UiStateDefaults = Pick<
  GameState,
  | "cameraMode"
  | "selectedCard"
  | "selectedPermanent"
  | "selectedAvatar"
  | "mouseInHandZone"
  | "handHoverCount"
  | "dragFromHand"
  | "dragFromPile"
  | "hoverCell"
  | "previewCard"
  | "switchSiteSource"
>;

export const createInitialUiState = (): UiStateDefaults => ({
  cameraMode: "orbit",
  selectedCard: null,
  selectedPermanent: null,
  selectedAvatar: null,
  mouseInHandZone: false,
  handHoverCount: 0,
  dragFromHand: false,
  dragFromPile: null,
  hoverCell: null,
  previewCard: null,
  switchSiteSource: null,
});

export const createUiSlice: StateCreator<GameState, [], [], UiSlice> = (
  set
) => ({
  ...createInitialUiState(),

  selectHandCard: (who: PlayerKey, index: number) =>
    set((state) => {
      const card = state.zones[who].hand[index];
      if (!card) return state;
      return {
        selectedCard: { who, index, card },
        selectedPermanent: null,
        selectedAvatar: null,
        previewCard: null,
      };
    }),

  selectAvatar: (who: PlayerKey) =>
    set({
      selectedAvatar: who,
      selectedCard: null,
      selectedPermanent: null,
      previewCard: null,
    }),

  selectPermanent: (at, index) =>
    set((state) => {
      const arr = state.permanents[at] || [];
      if (!arr[index]) return state;
      return {
        selectedPermanent: { at, index },
        selectedCard: null,
        selectedAvatar: null,
        previewCard: null,
      };
    }),

  clearSelection: () =>
    set({ selectedCard: null, selectedPermanent: null, selectedAvatar: null }),

  setMouseInHandZone: (inZone: boolean) => set({ mouseInHandZone: inZone }),
  setHandHoverCount: (count: number) => set({ handHoverCount: count }),

  setDragFromHand: (on: boolean) => set({ dragFromHand: on }),
  setDragFromPile: (
    info: {
      who: PlayerKey;
      from: "spellbook" | "atlas" | "graveyard" | "collection" | "tokens";
      card: CardRef | null;
    } | null
  ) => set({ dragFromPile: info }),

  setHoverCell: (x: number, y: number) => set({ hoverCell: [x, y] }),
  clearHoverCell: () => set({ hoverCell: null }),

  setPreviewCard: (card: CardRef | null) => set({ previewCard: card }),

  setCameraMode: (mode: GameState["cameraMode"]) => set({ cameraMode: mode }),
  toggleCameraMode: () =>
    set((state) => ({
      cameraMode: state.cameraMode === "orbit" ? "topdown" : "orbit",
    })),

  setSwitchSiteSource: (source: { x: number; y: number } | null) =>
    set({ switchSiteSource: source }),
});
