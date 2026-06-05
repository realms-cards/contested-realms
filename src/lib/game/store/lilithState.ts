import type { StateCreator } from "zustand";
import type { CustomMessage } from "@/lib/net/transport";
import { isPermanentSilenced } from "./boudiccaState";
import { findInquisitionInCards } from "./inquisitionSummonState";
import type { GameState, PlayerKey } from "./types";
import { findPermanentByInstanceId } from "./utils/permanentHelpers";

function newLilithRevealId() {
  return `lilith_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export type LilithSlice = Pick<
  GameState,
  | "lilithMinions"
  | "pendingLilithReveal"
  | "registerLilith"
  | "unregisterLilith"
  | "triggerLilithEndOfTurn"
  | "resolveLilithReveal"
  | "cancelLilithReveal"
>;

export const createLilithSlice: StateCreator<GameState, [], [], LilithSlice> = (
  set,
  get,
) => ({
  lilithMinions: [],
  pendingLilithReveal: null,

  registerLilith: (input) => {
    const { instanceId, location, ownerSeat, cardName } = input;
    const id = `lilith_${instanceId}`;

    set((state) => ({
      ...state,
      lilithMinions: [
        ...state.lilithMinions.filter((l) => l.instanceId !== instanceId),
        { id, instanceId, location, ownerSeat, cardName },
      ],
    }));

    get().log(`[${ownerSeat.toUpperCase()}] ${cardName} enters the realm`);
  },

  unregisterLilith: (instanceId) => {
    set((state) => ({
      ...state,
      lilithMinions: state.lilithMinions.filter(
        (l) => l.instanceId !== instanceId,
      ),
    }));
  },

  // Trigger end of turn - reveals opponent's top spell for each Lilith owned by the ending player
  triggerLilithEndOfTurn: async (
    endingPlayerSeat: PlayerKey,
    skipConfirmation?: boolean,
  ) => {
    const lilithMinions = get().lilithMinions;
    const zones = get().zones;
    const permanents = get().permanents;
    const actorKey = get().actorKey;

    console.log("[Lilith] triggerLilithEndOfTurn called:", {
      endingPlayerSeat,
      actorKey,
      lilithMinions,
      lilithCount: lilithMinions.length,
      skipConfirmation,
    });

    // Find all Lilith minions owned by the ending player
    const playerLiliths = lilithMinions.filter(
      (l) => l.ownerSeat === endingPlayerSeat,
    );

    console.log("[Lilith] Player Liliths found:", {
      playerLiliths,
      count: playerLiliths.length,
    });

    if (playerLiliths.length === 0) return;

    // Process each Lilith sequentially
    for (const registered of playerLiliths) {
      // Resolve Lilith's CURRENT cell from `permanents` by instanceId. The
      // registry's cached `location` can be stale: Lilith may have been moved
      // (by either player — the active player can move opponent permanents) or
      // changed control, and on networked clients only `permanents` is synced —
      // the locally-derived registry is never re-located. Trusting the cached
      // location here is what made the resolver silently skip after a move.
      const located = findPermanentByInstanceId(
        permanents,
        registered.instanceId,
      );
      if (!located) {
        // Lilith no longer exists anywhere on the board, unregister
        get().unregisterLilith(registered.instanceId);
        continue;
      }
      // A Silenced/Disabled token attached to Lilith suppresses her ability.
      if (isPermanentSilenced(permanents, located.at, located.index)) {
        continue;
      }
      const currentLocation = located.at;
      // Keep the registry's cached location fresh (silent — registerLilith logs
      // a re-entry message we don't want to repeat here).
      if (currentLocation !== registered.location) {
        set((state) => ({
          ...state,
          lilithMinions: state.lilithMinions.map((l) =>
            l.instanceId === registered.instanceId
              ? { ...l, location: currentLocation }
              : l,
          ),
        }));
      }
      const lilith = { ...registered, location: currentLocation };

      const opponentSeat = endingPlayerSeat === "p1" ? "p2" : "p1";

      // Show confirmation dialog before revealing (only for owner)
      if (
        !skipConfirmation &&
        (actorKey === null || actorKey === endingPlayerSeat)
      ) {
        const opponentSpellbook = zones[opponentSeat]?.spellbook || [];
        if (opponentSpellbook.length > 0) {
          get().beginAutoResolve({
            kind: "lilith_reveal",
            ownerSeat: endingPlayerSeat,
            sourceName: lilith.cardName,
            sourceLocation: lilith.location,
            sourceInstanceId: lilith.instanceId,
            effectDescription: `Reveal ${opponentSeat.toUpperCase()}'s top spell (if minion, summon it under your control)`,
            callbackData: {
              lilithInstanceId: lilith.instanceId,
              lilithLocation: lilith.location,
              skipConfirmation: true,
            },
          });
          return; // Wait for confirmation before proceeding
        }
      }

      // In online games, only the Lilith owner initiates the reveal flow
      // The opponent responds via the lilithRevealRequest handler in customMessageHandlers.ts
      // Skip if we are the opponent - we'll respond when we receive the request
      if (actorKey === opponentSeat) {
        console.log(
          "[Lilith] We are opponent, skipping - will respond to request",
        );
        continue;
      }

      const id = newLilithRevealId();

      if (actorKey === endingPlayerSeat) {
        // We ARE the Lilith owner - request the card from opponent
        console.log(
          "[Lilith] We are Lilith owner, requesting opponent's top card",
        );

        // Send request to opponent
        const transport = get().transport;
        if (transport?.sendMessage) {
          try {
            transport.sendMessage({
              type: "lilithRevealRequest",
              id,
              lilithInstanceId: lilith.instanceId,
              lilithLocation: lilith.location,
              lilithOwner: endingPlayerSeat,
              ts: Date.now(),
            } as unknown as CustomMessage);
          } catch {}
        }

        // Set pending state to show we're waiting
        set({
          pendingLilithReveal: {
            id,
            lilithInstanceId: lilith.instanceId,
            lilithLocation: lilith.location,
            lilithOwner: endingPlayerSeat,
            phase: "revealing",
            revealedCard: null, // Will be filled when we get the response
            isMinion: false,
            createdAt: Date.now(),
          },
        } as Partial<GameState> as GameState);
      }
      // If actorKey is null (solo/hotseat), use the old logic
      else if (actorKey === null) {
        const opponentSpellbook = [...(zones[opponentSeat]?.spellbook || [])];

        if (opponentSpellbook.length === 0) {
          get().log(
            `[${endingPlayerSeat.toUpperCase()}] ${
              lilith.cardName
            }: Opponent's spellbook is empty`,
          );
          continue;
        }

        const revealedCard = opponentSpellbook[0];
        if (!revealedCard) continue;

        // Fetch card meta
        const cardIds = [revealedCard.cardId].filter(
          (cid) => Number.isFinite(cid) && cid > 0,
        );
        if (cardIds.length > 0) {
          try {
            await get().fetchCardMeta(cardIds);
          } catch {}
        }

        const metaByCardId = get().metaByCardId;
        const meta = metaByCardId[revealedCard.cardId] as
          | { type?: string }
          | undefined;
        const cardType = (meta?.type || revealedCard.type || "").toLowerCase();
        const isMinion = cardType.includes("minion");

        set({
          pendingLilithReveal: {
            id,
            lilithInstanceId: lilith.instanceId,
            lilithLocation: lilith.location,
            lilithOwner: endingPlayerSeat,
            phase: "revealing",
            revealedCard,
            isMinion,
            createdAt: Date.now(),
          },
        } as Partial<GameState> as GameState);

        get().log(
          `[${endingPlayerSeat.toUpperCase()}] ${lilith.cardName} reveals ${
            revealedCard.name
          } from opponent's spellbook`,
        );

        // Check if The Inquisition was revealed from opponent's spellbook
        if (findInquisitionInCards([revealedCard]) !== -1) {
          setTimeout(() => {
            try {
              get().offerInquisitionSummon({
                ownerSeat: opponentSeat,
                triggerSource: "lilith",
                card: revealedCard,
                sourceZone: "spellbook",
                cardIndex: 0, // top of spellbook
              });
            } catch {}
          }, 800);
        }
      }
    }
  },

  resolveLilithReveal: () => {
    const pending = get().pendingLilithReveal;
    if (!pending || pending.phase !== "revealing") return;

    const { revealedCard, isMinion, lilithLocation, lilithOwner, id } = pending;
    if (!revealedCard) {
      set({ pendingLilithReveal: null } as Partial<GameState> as GameState);
      if (get().turnEffectQueueActive) get().resolveCurrentTurnEffect();
      return;
    }

    // Summon the revealed minion at Lilith's CURRENT cell — she may have moved
    // between the reveal and this resolve. Fall back to the captured location
    // only if she has left the board.
    const lilithNow = findPermanentByInstanceId(
      get().permanents,
      pending.lilithInstanceId,
    );
    const summonLocation = lilithNow?.at ?? lilithLocation;

    const actorKey = get().actorKey;
    const isOnline = !!get().transport;
    const opponentSeat = lilithOwner === "p1" ? "p2" : "p1";

    // In online games, the spellbook owner must modify their own spellbook
    // Lilith owner sends resolve message, opponent handles their spellbook
    if (isOnline && actorKey === lilithOwner) {
      // Lilith owner: send resolve message to opponent
      const transport = get().transport;
      if (transport?.sendMessage) {
        try {
          transport.sendMessage({
            type: "lilithRevealResolve",
            id,
            isMinion,
            lilithLocation: summonLocation,
            lilithOwner,
            revealedCard,
            revealedCardName: revealedCard.name,
            ts: Date.now(),
          } as unknown as CustomMessage);
        } catch {}
      }

      // Lilith owner: if minion, summon it locally
      if (isMinion) {
        const permanents = get().permanents;
        const ownerNum = lilithOwner === "p1" ? 1 : 2;
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

        const cellPerms = permanents[summonLocation] || [];
        const permanentsNext = {
          ...permanents,
          [summonLocation]: [...cellPerms, newPermanent],
        };

        set({
          permanents: permanentsNext,
          pendingLilithReveal: { ...pending, phase: "complete" },
        } as Partial<GameState> as GameState);

        get().trySendPatch({
          permanents: { [summonLocation]: permanentsNext[summonLocation] },
        });

        get().log(
          `[${lilithOwner.toUpperCase()}] Lilith summons ${revealedCard.name}!`,
        );
      } else {
        // Not a minion - just mark complete, opponent handles their spellbook
        set({
          pendingLilithReveal: { ...pending, phase: "complete" },
        } as Partial<GameState> as GameState);

        get().log(
          `[${lilithOwner.toUpperCase()}] ${
            revealedCard.name
          } goes to the bottom of ${opponentSeat.toUpperCase()}'s spellbook`,
        );
      }

      // Clear pending after delay
      setTimeout(() => {
        set((state) => {
          if (state.pendingLilithReveal?.id === id) {
            return { ...state, pendingLilithReveal: null };
          }
          return state;
        });
        if (get().turnEffectQueueActive) get().resolveCurrentTurnEffect();
      }, 500);
      return;
    }

    // Offline/hotseat mode: handle everything locally
    const zones = get().zones;
    const permanents = get().permanents;

    // Remove card from opponent's spellbook
    const opponentSpellbook = [...(zones[opponentSeat]?.spellbook || [])];
    opponentSpellbook.shift(); // Remove top card

    let zonesNext = {
      ...zones,
      [opponentSeat]: {
        ...zones[opponentSeat],
        spellbook: opponentSpellbook,
      },
    };

    let permanentsNext = { ...permanents };

    if (isMinion) {
      // Summon the minion at Lilith's location under Lilith owner's control
      const ownerNum = lilithOwner === "p1" ? 1 : 2;
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

      const cellPerms = permanentsNext[summonLocation] || [];
      permanentsNext = {
        ...permanentsNext,
        [summonLocation]: [...cellPerms, newPermanent],
      };

      get().log(
        `[${lilithOwner.toUpperCase()}] Lilith summons ${revealedCard.name}!`,
      );
    } else {
      // Put card at the bottom of opponent's spellbook
      zonesNext = {
        ...zonesNext,
        [opponentSeat]: {
          ...zonesNext[opponentSeat],
          spellbook: [...zonesNext[opponentSeat].spellbook, revealedCard],
        },
      };

      get().log(
        `[${lilithOwner.toUpperCase()}] ${
          revealedCard.name
        } goes to the bottom of ${opponentSeat.toUpperCase()}'s spellbook`,
      );
    }

    // Apply state changes
    set({
      zones: zonesNext,
      permanents: permanentsNext,
      pendingLilithReveal: { ...pending, phase: "complete" },
    } as Partial<GameState> as GameState);

    // Clear pending after a short delay
    setTimeout(() => {
      set((state) => {
        if (state.pendingLilithReveal?.id === id) {
          return { ...state, pendingLilithReveal: null };
        }
        return state;
      });
      if (get().turnEffectQueueActive) get().resolveCurrentTurnEffect();
    }, 500);
  },

  cancelLilithReveal: () => {
    set({ pendingLilithReveal: null } as Partial<GameState> as GameState);
    if (get().turnEffectQueueActive) get().resolveCurrentTurnEffect();
  },
});
