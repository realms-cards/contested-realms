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

const readInitialActionNotifications = (): boolean => {
  try {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("sorcery:actionNotifications");
      // Default to true if not set
      return stored === null ? true : stored === "1";
    }
  } catch {}
  return true;
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
  | "announceGuidePrefs"
  | "actionNotifications"
  | "setActionNotifications"
>;

const initialInteractionGuides = readInitialInteractionGuides();
const initialMagicGuides = readInitialMagicGuides();
const initialActionNotifications = readInitialActionNotifications();

export const createPreferenceSlice: StateCreator<
  GameState,
  [],
  [],
  PreferenceSlice
> = (set, get) => ({
  interactionGuides: initialInteractionGuides,
  magicGuides: initialMagicGuides,
  actionNotifications: initialActionNotifications,
  // Per-seat prefs are exchanged over `guidePref` messages once an online seat
  // is assigned (see sessionState.setActorKey and the guidePref handler). The
  // effective flags stay off until both seats have opted in: the guided flows
  // need a second client to answer, so hotseat / local play never activates
  // them even when the local toggle is on.
  combatGuideSeatPrefs: { p1: false, p2: false },
  magicGuideSeatPrefs: { p1: false, p2: false },
  combatGuidesActive: false,
  magicGuidesActive: false,

  setInteractionGuides: (on) => {
    const next = !!on;
    const transport = get().transport;
    const actorKey = get().actorKey;
    const prevActive = !!get().combatGuidesActive;

    if (!transport?.sendMessage || (actorKey !== "p1" && actorKey !== "p2")) {
      // Offline / hotseat / spectator: remember the preference only. It is
      // announced to the opponent once a seat is assigned.
      set({
        interactionGuides: next,
        combatGuidesActive: false,
      } as Partial<GameState> as GameState);
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
        get().announceGuidePrefs(false);
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

    if (!transport?.sendMessage || (actorKey !== "p1" && actorKey !== "p2")) {
      // Offline / hotseat / spectator: remember the preference only.
      set({
        magicGuides: next,
        magicGuidesActive: false,
      } as Partial<GameState> as GameState);
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
        get().announceGuidePrefs(false);
      } catch {}
    }
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem("sorcery:magicGuides", next ? "1" : "0");
      }
    } catch {}
  },

  announceGuidePrefs: (reply) => {
    const transport = get().transport;
    const actorKey = get().actorKey;
    if (!transport?.sendMessage) return;
    if (actorKey !== "p1" && actorKey !== "p2") return;
    try {
      transport.sendMessage({
        type: "guidePref",
        seat: actorKey,
        combatGuides: !!get().interactionGuides,
        magicGuides: !!get().magicGuides,
        reply: !!reply,
      } as unknown as CustomMessage);
    } catch {}
  },

  setActionNotifications: (on) => {
    const next = !!on;
    set({ actionNotifications: next } as Partial<GameState> as GameState);
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem("sorcery:actionNotifications", next ? "1" : "0");
      }
    } catch {}
  },
});
