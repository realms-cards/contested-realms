import type { StateCreator } from "zustand";
import type { CardRef, GameState, PlayerKey } from "./types";

const CAMERA_MODE_KEY = "sorcery:cameraMode";
const CARD_PREVIEWS_KEY = "sorcery:cardPreviewsEnabled";
const UI_HIDDEN_KEY = "sorcery:uiHidden";

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

/**
 * Load camera mode from API (for authenticated users).
 * Returns null if not authenticated or on error.
 */
export async function loadCameraModeFromApi(): Promise<
  GameState["cameraMode"] | null
> {
  try {
    const res = await fetch("/api/users/me/playmats/preferences", {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { cameraMode?: string };
    if (data.cameraMode === "orbit" || data.cameraMode === "topdown") {
      return data.cameraMode;
    }
  } catch {}
  return null;
}

/**
 * Load card previews preference from localStorage.
 * Defaults to true (previews enabled).
 */
function loadCardPreviewsEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const stored = localStorage.getItem(CARD_PREVIEWS_KEY);
    if (stored === "false") return false;
  } catch {}
  return true;
}

/** Persist card previews preference to localStorage */
function saveCardPreviewsEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CARD_PREVIEWS_KEY, String(enabled));
  } catch {}
}

/**
 * Load UI hidden preference from localStorage.
 * Defaults to false (UI visible).
 */
function loadUiHidden(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const stored = localStorage.getItem(UI_HIDDEN_KEY);
    if (stored === "true") return true;
  } catch {}
  return false;
}

/** Persist UI hidden preference to localStorage */
function saveUiHidden(hidden: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(UI_HIDDEN_KEY, String(hidden));
  } catch {}
}

/** Persist camera mode preference to localStorage and API */
function saveCameraMode(mode: GameState["cameraMode"]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CAMERA_MODE_KEY, mode);
  } catch {}
  // Also save to API for authenticated users (fire and forget)
  try {
    void fetch("/api/users/me/playmats/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cameraMode: mode }),
    });
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
  | "handVisibilityMode"
  | "dragFromHand"
  | "dragFaceDown"
  | "castSubsurface"
  | "castPlacementMode"
  | "dragFromPile"
  | "boardDragActive"
  | "hoverCell"
  | "previewCard"
  | "cardPreviewsEnabled"
  | "setCardPreviewsEnabled"
  | "toggleCardPreviews"
  | "uiHidden"
  | "setUiHidden"
  | "toggleUiHidden"
  | "selectHandCard"
  | "selectAvatar"
  | "clearSelection"
  | "setMouseInHandZone"
  | "setHandHoverCount"
  | "setHandVisibilityMode"
  | "toggleHandVisibility"
  | "setDragFromHand"
  | "setDragFaceDown"
  | "setCastSubsurface"
  | "setDragFromPile"
  | "setBoardDragActive"
  | "setHoverCell"
  | "clearHoverCell"
  | "setPreviewCard"
  | "selectPermanent"
  | "setCameraMode"
  | "toggleCameraMode"
  | "switchSiteSource"
  | "setSwitchSiteSource"
  | "switchSitePending"
  | "setSwitchSitePending"
  | "showEndTurnConfirm"
  | "requestEndTurn"
  | "confirmEndTurn"
  | "dismissEndTurnConfirm"
>;

type UiStateDefaults = Pick<
  GameState,
  | "cameraMode"
  | "selectedCard"
  | "selectedPermanent"
  | "selectedAvatar"
  | "mouseInHandZone"
  | "handHoverCount"
  | "handVisibilityMode"
  | "dragFromHand"
  | "dragFaceDown"
  | "castSubsurface"
  | "castPlacementMode"
  | "dragFromPile"
  | "boardDragActive"
  | "hoverCell"
  | "previewCard"
  | "cardPreviewsEnabled"
  | "uiHidden"
  | "switchSiteSource"
  | "switchSitePending"
  | "showEndTurnConfirm"
>;

export const createInitialUiState = (): UiStateDefaults => ({
  cameraMode: loadCameraMode(),
  selectedCard: null,
  selectedPermanent: null,
  selectedAvatar: null,
  mouseInHandZone: false,
  handHoverCount: 0,
  handVisibilityMode: null,
  dragFromHand: false,
  dragFaceDown: false,
  castSubsurface: false,
  castPlacementMode: null,
  dragFromPile: null,
  boardDragActive: false,
  hoverCell: null,
  previewCard: null,
  cardPreviewsEnabled: loadCardPreviewsEnabled(),
  uiHidden: loadUiHidden(),
  switchSiteSource: null,
  switchSitePending: null,
  showEndTurnConfirm: false,
});

export const createUiSlice: StateCreator<GameState, [], [], UiSlice> = (
  set,
  get,
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
  setHandVisibilityMode: (mode: "hidden" | "visible" | null) =>
    set({ handVisibilityMode: mode }),
  toggleHandVisibility: () =>
    set((state) => {
      // Cycle: null (default) -> "hidden" -> "visible" (auto-resets to null when cursor leaves)
      const current = state.handVisibilityMode;
      const next =
        current === null ? "hidden" : current === "hidden" ? "visible" : null;
      return { handVisibilityMode: next };
    }),

  setDragFromHand: (on: boolean) => set({ dragFromHand: on }),
  setDragFaceDown: (on: boolean) => set({ dragFaceDown: on }),
  setCastSubsurface: (on: boolean) => set({ castSubsurface: on }),
  setBoardDragActive: (on: boolean) => set({ boardDragActive: on }),
  setDragFromPile: (
    info: {
      who: PlayerKey;
      from: "spellbook" | "atlas" | "graveyard" | "collection" | "tokens";
      card: CardRef | null;
    } | null,
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

  setSwitchSitePending: (
    pending: {
      source: { x: number; y: number };
      target: { x: number; y: number };
    } | null,
  ) => set({ switchSitePending: pending }),

  setCardPreviewsEnabled: (enabled: boolean) => {
    saveCardPreviewsEnabled(enabled);
    set({ cardPreviewsEnabled: enabled });
  },
  toggleCardPreviews: () =>
    set((state) => {
      const newEnabled = !state.cardPreviewsEnabled;
      saveCardPreviewsEnabled(newEnabled);
      return { cardPreviewsEnabled: newEnabled };
    }),

  setUiHidden: (hidden: boolean) => {
    saveUiHidden(hidden);
    set({ uiHidden: hidden });
  },
  toggleUiHidden: () =>
    set((state) => {
      const newHidden = !state.uiHidden;
      saveUiHidden(newHidden);
      return { uiHidden: newHidden };
    }),

  // End turn confirmation actions
  requestEndTurn: () => {
    const state = get();
    // Get the current player's seat key
    const currentSeat = state.currentPlayer === 1 ? "p1" : "p2";
    // Check if the current player's avatar is tapped
    const avatarTapped = state.avatars[currentSeat]?.tapped ?? false;

    if (avatarTapped) {
      // Avatar is tapped, end turn immediately
      state.endTurn();
    } else {
      // Avatar is untapped, show confirmation dialog
      set({ showEndTurnConfirm: true });
    }
  },

  confirmEndTurn: () => {
    set({ showEndTurnConfirm: false });
    get().endTurn();
  },

  dismissEndTurnConfirm: () => {
    set({ showEndTurnConfirm: false });
  },
});
