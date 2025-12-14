import type { StateCreator } from "zustand";
import type { CardRef, GameState, PlayerKey } from "./types";

const CAMERA_MODE_KEY = "sorcery:cameraMode";

/**
 * Load persisted camera mode preference from localStorage.
 * IMPORTANT: Always returns "topdown" during SSR to avoid hydration mismatch.
 * The actual localStorage value is applied via useEffect on mount.
 */
function loadCameraMode(): GameState["cameraMode"] {
  // Always return default during SSR to ensure consistent hydration
  return "topdown";
}

/**
 * Get camera mode from localStorage (client-side only).
 * Call this in useEffect to restore user preference after hydration.
 */
export function getStoredCameraMode(): GameState["cameraMode"] {
  if (typeof window === "undefined") return "topdown";
  try {
    const stored = localStorage.getItem(CAMERA_MODE_KEY);
    if (stored === "orbit" || stored === "topdown") return stored;
  } catch {}
  return "topdown";
}

/** Persist camera mode preference to localStorage */
function saveCameraMode(mode: GameState["cameraMode"]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CAMERA_MODE_KEY, mode);
  } catch {}
}

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
  cameraMode: loadCameraMode(),
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

  setCameraMode: (mode: GameState["cameraMode"]) => {
    saveCameraMode(mode);
    set({ cameraMode: mode });
  },
  toggleCameraMode: () =>
    set((state) => {
      const newMode = state.cameraMode === "orbit" ? "topdown" : "orbit";
      saveCameraMode(newMode);
      return { cameraMode: newMode };
    }),

  setSwitchSiteSource: (source: { x: number; y: number } | null) =>
    set({ switchSiteSource: source }),
});
