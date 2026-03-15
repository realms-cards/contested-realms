import type { StateCreator } from "zustand";
import type { CustomMessage } from "@/lib/net/transport";
import type { CardRef, GameState, MerlinEntry, PlayerKey, ServerPatchT } from "./types";

/**
 * Merlin — Spellcaster passive ability.
 *
 * "Any time during your turn, Merlin may look at your next spell
 *  and may cast it if it's a magic spell."
 *
 * Implementation:
 * - When Merlin is on the board and it's the owner's turn, the top spellbook
 *   card is revealed in a persistent (non-blocking) overlay widget.
 * - If the top card is a magic spell and the phase is Main, the owner can
 *   click "Cast" to move it from spellbook to hand, then play it normally.
 * - The peek is automatic — no confirmation needed.
 */

export type MerlinSlice = Pick<
  GameState,
  | "merlinInstances"
  | "registerMerlin"
  | "unregisterMerlin"
  | "castFromMerlin"
>;

export const createMerlinSlice: StateCreator<
  GameState,
  [],
  [],
  MerlinSlice
> = (set, get) => ({
  merlinInstances: [],

  registerMerlin: (entry: Omit<MerlinEntry, "id">) => {
    set((state) => {
      const existing = state.merlinInstances.find(
        (m) => m.instanceId === entry.instanceId,
      );
      if (existing) return state;
      const id = `merlin_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      return {
        ...state,
        merlinInstances: [...state.merlinInstances, { id, ...entry }],
      } as GameState;
    });

    get().log(
      `[${entry.ownerSeat.toUpperCase()}] Merlin registered (Spellcaster)`,
    );

    // Broadcast registration to opponent
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "merlinRegister",
          instanceId: entry.instanceId,
          location: entry.location,
          ownerSeat: entry.ownerSeat,
          cardName: entry.cardName,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  unregisterMerlin: (instanceId: string) => {
    const entry = get().merlinInstances.find(
      (m) => m.instanceId === instanceId,
    );
    if (!entry) return;

    set((state) => ({
      ...state,
      merlinInstances: state.merlinInstances.filter(
        (m) => m.instanceId !== instanceId,
      ),
    }));

    get().log(
      `[${entry.ownerSeat.toUpperCase()}] Merlin unregistered`,
    );

    // Broadcast unregistration
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "merlinUnregister",
          instanceId,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  castFromMerlin: (ownerSeat: PlayerKey) => {
    if (get().resolversDisabled) {
      get().log("[MERLIN] Resolver disabled, skipping cast");
      return;
    }

    const state = get();
    const zones = state.zones;
    const spellbook = zones[ownerSeat]?.spellbook || [];
    const topCard = spellbook[0] as CardRef | undefined;

    if (!topCard) {
      get().log(`[${ownerSeat.toUpperCase()}] Merlin: No spells in spellbook`);
      return;
    }

    // Verify it's a magic spell — check CardRef.type directly (always populated at deck load)
    const cardType = (topCard.type || "").toLowerCase();
    if (!cardType.includes("magic")) {
      get().log(
        `[${ownerSeat.toUpperCase()}] Merlin: ${topCard.name} is not a magic spell`,
      );
      return;
    }

    // Verify it's the owner's turn and Main phase
    const ownerNum = ownerSeat === "p1" ? 1 : 2;
    if (state.currentPlayer !== ownerNum) {
      get().log(`[${ownerSeat.toUpperCase()}] Merlin: Not your turn`);
      return;
    }
    if (state.phase !== "Main") {
      get().log(
        `[${ownerSeat.toUpperCase()}] Merlin: Can only cast during Main phase`,
      );
      return;
    }

    // Check Garden of Eden draw limit (moving from spellbook counts as drawing)
    const canDraw = state.canDrawCard(ownerSeat, 1);
    if (!canDraw.allowed) {
      get().log(
        `[${ownerSeat.toUpperCase()}] Garden of Eden prevents Merlin from drawing`,
      );
      return;
    }

    // Move top card from spellbook to hand
    const newSpellbook = [...spellbook];
    newSpellbook.shift();
    const newHand = [...(zones[ownerSeat]?.hand || []), topCard];

    const targetZones = {
      spellbook: newSpellbook,
      atlas: [...zones[ownerSeat].atlas],
      hand: newHand,
      graveyard: [...zones[ownerSeat].graveyard],
      battlefield: [...zones[ownerSeat].battlefield],
      collection: [...zones[ownerSeat].collection],
      banished: [...(zones[ownerSeat].banished || [])],
    };

    const zonesNext = { ...zones, [ownerSeat]: targetZones };

    set({ zones: zonesNext } as Partial<GameState> as GameState);

    // Increment cards drawn counter for Garden of Eden tracking
    get().incrementCardsDrawn(ownerSeat, 1);

    // Send full zone patch
    get().trySendPatch({
      zones: { [ownerSeat]: targetZones },
    } as ServerPatchT);

    get().log(
      `[${ownerSeat.toUpperCase()}] Merlin casts ${topCard.name} from spellbook to hand`,
    );

    // Broadcast to opponent
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "merlinCast",
          ownerSeat,
          cardName: topCard.name,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    // Show toast
    try {
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("app:toast", {
            detail: {
              message: `[card:Merlin] reveals [card:${topCard.name}] — added to hand`,
              seat: ownerSeat,
              showToSelf: true,
            },
          }),
        );
      }
    } catch {}
  },
});
