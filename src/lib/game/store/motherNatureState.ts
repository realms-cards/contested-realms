import type { StateCreator } from "zustand";
import type { CustomMessage } from "@/lib/net/transport";
import type { GameState, PlayerKey, ServerPatchT } from "./types";

function newMotherNatureRevealId() {
  return `mother_nature_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export type MotherNatureSlice = Pick<
  GameState,
  | "motherNatureMinions"
  | "pendingMotherNatureReveal"
  | "registerMotherNature"
  | "unregisterMotherNature"
  | "triggerMotherNatureStartOfTurn"
  | "acceptMotherNatureSummon"
  | "declineMotherNatureSummon"
>;

export const createMotherNatureSlice: StateCreator<
  GameState,
  [],
  [],
  MotherNatureSlice
> = (set, get) => ({
  motherNatureMinions: [],
  pendingMotherNatureReveal: null,

  registerMotherNature: (entry: {
    instanceId: string;
    location: string;
    ownerSeat: PlayerKey;
    cardName: string;
  }) => {
    const id = newMotherNatureRevealId();
    set((state) => {
      const existing = state.motherNatureMinions.find(
        (m) => m.instanceId === entry.instanceId
      );
      if (existing) return state;
      return {
        ...state,
        motherNatureMinions: [...state.motherNatureMinions, { id, ...entry }],
      } as GameState;
    });
  },

  unregisterMotherNature: (instanceId: string) => {
    set((state) => ({
      ...state,
      motherNatureMinions: state.motherNatureMinions.filter(
        (m) => m.instanceId !== instanceId
      ),
    }));
  },

  triggerMotherNatureStartOfTurn: (startingPlayerSeat: PlayerKey) => {
    const actorKey = get().actorKey;
    const motherNatures = get().motherNatureMinions.filter(
      (m) => m.ownerSeat === startingPlayerSeat
    );

    if (motherNatures.length === 0) return;

    // In online play, only the Mother Nature owner triggers the reveal
    // The opponent will receive the broadcast message
    if (actorKey && actorKey !== startingPlayerSeat) return;

    // Queue handles ordering — no need to poll for Lilith completion

    const zones = get().zones;
    const spellbook = zones[startingPlayerSeat]?.spellbook || [];

    if (spellbook.length === 0) return;

    // Process each Mother Nature one at a time
    // For simplicity, we'll just handle the first one for now
    const motherNature = motherNatures[0];
    const topCard = spellbook[0];

    if (!topCard) return;

    const id = newMotherNatureRevealId();

    // Fetch card metadata to determine if it's a minion
    const metaByCardId = get().metaByCardId;
    const meta = metaByCardId[topCard.cardId];
    const cardType = (meta?.type || "").toLowerCase();
    const isMinion = cardType.includes("minion");

    // Set pending reveal state
    set({
      pendingMotherNatureReveal: {
        id,
        motherNatureInstanceId: motherNature.instanceId,
        motherNatureLocation: motherNature.location,
        ownerSeat: startingPlayerSeat,
        phase: isMinion ? "choosing" : "revealing",
        revealedCard: topCard,
        isMinion,
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);

    // Broadcast to opponent
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "motherNatureRevealBegin",
          id,
          motherNatureInstanceId: motherNature.instanceId,
          motherNatureLocation: motherNature.location,
          ownerSeat: startingPlayerSeat,
          revealedCard: topCard,
          isMinion,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log(
      `[${startingPlayerSeat.toUpperCase()}] Mother Nature reveals ${
        topCard.name
      }`
    );

    // If not a minion, auto-complete after delay
    if (!isMinion) {
      setTimeout(() => {
        set((state) => {
          if (state.pendingMotherNatureReveal?.id === id) {
            return {
              ...state,
              pendingMotherNatureReveal: {
                ...state.pendingMotherNatureReveal,
                phase: "complete",
              },
            } as GameState;
          }
          return state;
        });
        // Clear after showing
        setTimeout(() => {
          set((state) => {
            if (state.pendingMotherNatureReveal?.id === id) {
              return { ...state, pendingMotherNatureReveal: null } as GameState;
            }
            return state;
          });
          if (get().turnEffectQueueActive) get().resolveCurrentTurnEffect();
        }, 1500);
      }, 2000);
    }
  },

  acceptMotherNatureSummon: () => {
    const pending = get().pendingMotherNatureReveal;
    if (!pending || pending.phase !== "choosing" || !pending.isMinion) return;

    const { revealedCard, ownerSeat, motherNatureLocation } = pending;
    if (!revealedCard) return;

    // Remove card from spellbook
    const zones = get().zones;
    const spellbook = [...(zones[ownerSeat]?.spellbook || [])];
    const cardIndex = spellbook.findIndex(
      (c) => c.cardId === revealedCard.cardId
    );
    if (cardIndex === -1) return;

    spellbook.splice(cardIndex, 1);
    const zonesNext = {
      ...zones,
      [ownerSeat]: {
        ...zones[ownerSeat],
        spellbook,
      },
    };

    // Add to permanents at Mother Nature's location
    const permanents = get().permanents;
    const ownerNum = ownerSeat === "p1" ? 1 : 2;
    const newPermanent = {
      card: revealedCard,
      owner: ownerNum as 1 | 2,
      tapped: false,
      tapVersion: 0,
      version: 0,
      instanceId: `${revealedCard.cardId}_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 6)}`,
      counters: 0,
      damage: 0,
      summoningSickness: true,
    };

    const cellPerms = permanents[motherNatureLocation] || [];
    const permanentsNext = {
      ...permanents,
      [motherNatureLocation]: [...cellPerms, newPermanent],
    };

    // Create patches
    const patches: ServerPatchT = {};
    patches.zones = {
      [ownerSeat]: {
        spellbook: zonesNext[ownerSeat].spellbook,
      },
    } as unknown as ServerPatchT["zones"];
    patches.permanents = {
      [motherNatureLocation]: permanentsNext[motherNatureLocation],
    };

    // Update state
    set({
      zones: zonesNext,
      permanents: permanentsNext,
      pendingMotherNatureReveal: { ...pending, phase: "complete" },
    } as Partial<GameState> as GameState);

    // Send patches
    get().trySendPatch(patches);

    get().log(
      `[${ownerSeat.toUpperCase()}] Mother Nature summons ${revealedCard.name}!`
    );

    // Broadcast resolution
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "motherNatureRevealResolve",
          id: pending.id,
          accepted: true,
          revealedCardName: revealedCard.name,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    // Clear pending after delay
    setTimeout(() => {
      set((state) => {
        if (state.pendingMotherNatureReveal?.id === pending.id) {
          return { ...state, pendingMotherNatureReveal: null } as GameState;
        }
        return state;
      });
      if (get().turnEffectQueueActive) get().resolveCurrentTurnEffect();
    }, 1000);
  },

  declineMotherNatureSummon: () => {
    const pending = get().pendingMotherNatureReveal;
    if (!pending || pending.phase !== "choosing") return;

    set({
      pendingMotherNatureReveal: { ...pending, phase: "complete" },
    } as Partial<GameState> as GameState);

    get().log(
      `[${pending.ownerSeat.toUpperCase()}] declines to summon ${
        pending.revealedCard?.name || "the minion"
      }`
    );

    // Broadcast resolution
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "motherNatureRevealResolve",
          id: pending.id,
          accepted: false,
          revealedCardName: pending.revealedCard?.name,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    // Clear pending after delay
    setTimeout(() => {
      set((state) => {
        if (state.pendingMotherNatureReveal?.id === pending.id) {
          return { ...state, pendingMotherNatureReveal: null } as GameState;
        }
        return state;
      });
      if (get().turnEffectQueueActive) get().resolveCurrentTurnEffect();
    }, 1000);
  },
});
