import type { StateCreator } from "zustand";
import type { GameState } from "./types";

const readInitialInteractionGuides = (): boolean => {
  try {
    if (typeof window !== "undefined") {
      return localStorage.getItem("sorcery:interactionGuides") === "1";
    }
  } catch {}
  return false;
};

type PreferenceSlice = Pick<
  GameState,
  "interactionGuides" | "setInteractionGuides"
>;

export const createPreferenceSlice: StateCreator<
  GameState,
  [],
  [],
  PreferenceSlice
> = (set) => ({
  interactionGuides: readInitialInteractionGuides(),
  setInteractionGuides: (on) => {
    const next = !!on;
    set({ interactionGuides: next } as Partial<GameState> as GameState);
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem("sorcery:interactionGuides", next ? "1" : "0");
      }
    } catch {}
  },
});
