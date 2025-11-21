import type { StateCreator } from "zustand";
import type { CustomMessage } from "@/lib/net/transport";
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
> = (set, get) => ({
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
    const transport = get().transport;
    const actorKey = get().actorKey;
    const prevActive = !!get().combatGuidesActive;

    if (!transport || (actorKey !== "p1" && actorKey !== "p2")) {
      // Offline / hotseat / spectator: treat toggle as a local-only flag.
      const nextActive = next && next;
      set({
        interactionGuides: next,
        combatGuideSeatPrefs: { p1: next, p2: next },
        combatGuidesActive: nextActive,
      } as Partial<GameState> as GameState);
      if (prevActive !== nextActive) {
        try {
          get().log(
            nextActive
              ? "Combat guides enabled (both players opted in)"
              : "Combat guides disabled"
          );
        } catch {}
        try {
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("app:toast", {
                detail: {
                  message: nextActive
                    ? "Combat guides enabled (both players opted in)"
                    : "Combat guides disabled",
                },
              })
            );
          }
        } catch {}
      }
    } else {
      // Online: treat this as a per-seat preference and derive the effective flag
      // from both seats' prefs once guidePref messages are exchanged.
      let nextActive = prevActive;
      set((state) => {
        const prefs = {
          p1: !!state.combatGuideSeatPrefs?.p1,
          p2: !!state.combatGuideSeatPrefs?.p2,
        };
        prefs[actorKey] = next;
        const active = prefs.p1 && prefs.p2;
        nextActive = active;
        return {
          interactionGuides: next,
          combatGuideSeatPrefs: prefs,
          combatGuidesActive: active,
        } as Partial<GameState> as GameState;
      });

      if (prevActive !== nextActive) {
        try {
          transport?.sendMessage?.({
            type: "toast",
            text: nextActive
              ? "Combat guides enabled (both players opted in)"
              : "Combat guides disabled",
          } as unknown as CustomMessage);
        } catch {}
      }

      try {
        transport?.sendMessage?.({
          type: "guidePref",
          seat: actorKey,
          combatGuides: next,
          magicGuides: !!get().magicGuides,
        } as unknown as CustomMessage);
      } catch {}
    }
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem("sorcery:interactionGuides", next ? "1" : "0");
      }
    } catch {}
  },

  setMagicGuides: (on) => {
    const next = !!on;
    const transport = get().transport;
    const actorKey = get().actorKey;
    const prevActive = !!get().magicGuidesActive;

    if (!transport || (actorKey !== "p1" && actorKey !== "p2")) {
      // Offline / hotseat / spectator: local-only toggle.
      const nextActive = next && next;
      set({
        magicGuides: next,
        magicGuideSeatPrefs: { p1: next, p2: next },
        magicGuidesActive: nextActive,
      } as Partial<GameState> as GameState);
      if (prevActive !== nextActive) {
        try {
          get().log(
            nextActive
              ? "Magic guides enabled (both players opted in)"
              : "Magic guides disabled"
          );
        } catch {}
        try {
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("app:toast", {
                detail: {
                  message: nextActive
                    ? "Magic guides enabled (both players opted in)"
                    : "Magic guides disabled",
                },
              })
            );
          }
        } catch {}
      }
    } else {
      // Online: per-seat preference; effective flag depends on both seats.
      let nextActive = prevActive;
      set((state) => {
        const prefs = {
          p1: !!state.magicGuideSeatPrefs?.p1,
          p2: !!state.magicGuideSeatPrefs?.p2,
        };
        prefs[actorKey] = next;
        const active = prefs.p1 && prefs.p2;
        nextActive = active;
        return {
          magicGuides: next,
          magicGuideSeatPrefs: prefs,
          magicGuidesActive: active,
        } as Partial<GameState> as GameState;
      });

      if (prevActive !== nextActive) {
        try {
          transport?.sendMessage?.({
            type: "toast",
            text: nextActive
              ? "Magic guides enabled (both players opted in)"
              : "Magic guides disabled",
          } as unknown as CustomMessage);
        } catch {}
      }

      try {
        transport?.sendMessage?.({
          type: "guidePref",
          seat: actorKey,
          combatGuides: !!get().interactionGuides,
          magicGuides: next,
        } as unknown as CustomMessage);
      } catch {}
    }
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem("sorcery:magicGuides", next ? "1" : "0");
      }
    } catch {}
  },
});
