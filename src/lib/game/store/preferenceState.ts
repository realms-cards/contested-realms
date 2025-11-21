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

const readInitialMagicGuides = (): boolean => {
  try {
    if (typeof window !== "undefined") {
      return localStorage.getItem("sorcery:magicGuides") === "1";
    }
  } catch {}
  return false;
};

type PreferenceSlice = Pick<
  GameState,
  | "interactionGuides"
  | "setInteractionGuides"
  | "magicGuides"
  | "setMagicGuides"
  | "combatGuideSeatPrefs"
  | "magicGuideSeatPrefs"
  | "combatGuidesActive"
  | "magicGuidesActive"
>;

const initialInteractionGuides = readInitialInteractionGuides();
const initialMagicGuides = readInitialMagicGuides();

export const createPreferenceSlice: StateCreator<
  GameState,
  [],
  [],
  PreferenceSlice
> = (set) => ({
  interactionGuides: initialInteractionGuides,
  magicGuides: initialMagicGuides,
  // Initialize per-seat prefs from the local toggle; will be refined once
  // remote guide preference sync is wired in.
  combatGuideSeatPrefs: {
    p1: initialInteractionGuides,
    p2: initialInteractionGuides,
  },
  magicGuideSeatPrefs: { p1: initialMagicGuides, p2: initialMagicGuides },
  combatGuidesActive: initialInteractionGuides && initialInteractionGuides,
  magicGuidesActive: initialMagicGuides && initialMagicGuides,

  setInteractionGuides: (on) => {
    const next = !!on;
    // For now mirror the local toggle to both seats; later this will be
    // combined with remote prefs to derive the effective flags.
    set({
      interactionGuides: next,
      combatGuideSeatPrefs: { p1: next, p2: next },
      combatGuidesActive: next && next,
    } as Partial<GameState> as GameState);
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem("sorcery:interactionGuides", next ? "1" : "0");
      }
    } catch {}
  },

  setMagicGuides: (on) => {
    const next = !!on;
    set({
      magicGuides: next,
      magicGuideSeatPrefs: { p1: next, p2: next },
      magicGuidesActive: next && next,
    } as Partial<GameState> as GameState);
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem("sorcery:magicGuides", next ? "1" : "0");
      }
    } catch {}
  },
});
