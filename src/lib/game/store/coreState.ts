import type { StateCreator } from "zustand";
import { soundManager } from "@/lib/audio/soundManager";
import { clearOmphalosDrawnCycle } from "./omphalosState";
import type {
  CellKey,
  GameState,
  LifeState,
  Permanents,
  PlayerKey,
  ServerPatchT,
} from "./types";
import {
  createPermanentDeltaPatch,
  type PermanentDeltaUpdate,
} from "./utils/patchHelpers";
import { bumpPermanentVersion } from "./utils/permanentHelpers";
import { phases } from "./utils/resourceHelpers";

export const createInitialPlayers = (): GameState["players"] => ({
  p1: {
    life: 20,
    lifeState: "alive",
    mana: 0,
    thresholds: { air: 0, water: 0, earth: 0, fire: 0 },
  },
  p2: {
    life: 20,
    lifeState: "alive",
    mana: 0,
    thresholds: { air: 0, water: 0, earth: 0, fire: 0 },
  },
});

export const createInitialD20Rolls = (): GameState["d20Rolls"] => ({
  p1: null,
  p2: null,
});

type CoreStateSlice = Pick<
  GameState,
  | "players"
  | "currentPlayer"
  | "turn"
  | "phase"
  | "setPhase"
  | "hasDrawnThisTurn"
  | "setHasDrawnThisTurn"
  | "d20Rolls"
  | "rollD20"
  | "setupWinner"
  | "choosePlayerOrder"
  | "d20PendingRoll"
  | "retryD20Roll"
  | "clearD20Pending"
  | "matchEnded"
  | "winner"
  | "checkMatchEnd"
  | "tieGame"
  | "resolversDisabled"
  | "setResolversDisabled"
  | "goldfishMode"
  | "goldfishHandSize"
  | "setGoldfishMode"
  | "setGoldfishHandSize"
  | "triggerGoldfishShuffle"
  | "addLife"
  | "nextPhase"
  | "endTurn"
>;

export const createCoreSlice: StateCreator<
  GameState,
  [],
  [],
  CoreStateSlice
> = (set, get) => ({
  players: createInitialPlayers(),
  currentPlayer: 1,
  turn: 1,
  phase: "Setup",
  hasDrawnThisTurn: false,
  setHasDrawnThisTurn: (drawn) => {
    const patch: ServerPatchT = { hasDrawnThisTurn: drawn };
    get().trySendPatch(patch);
    set({ hasDrawnThisTurn: drawn });
  },
  setPhase: (phase) =>
    set(() => {
      // Snapshot creation is handled by GameToolbox.tsx useEffect
      return { phase } as Partial<GameState> as GameState;
    }),

  // D20 Setup phase
  d20Rolls: createInitialD20Rolls(),
  setupWinner: null,
  d20PendingRoll: null, // Track pending roll for retry logic
  rollD20: (who) => {
    const roll = Math.floor(Math.random() * 20) + 1;
    const state = get();
    const newRolls = { ...state.d20Rolls, [who]: roll };

    // Log the roll for debugging
    console.log(`[D20] Rolling for ${who}: ${roll}`, {
      prevRolls: state.d20Rolls,
      newRolls,
    });

    // Track this roll as pending for retry logic
    set({ d20PendingRoll: { seat: who, roll, ts: Date.now() } });

    if (newRolls.p1 !== null && newRolls.p2 !== null) {
      let winner: PlayerKey | null = null;
      if (newRolls.p1 > newRolls.p2) {
        winner = "p1";
      } else if (newRolls.p2 > newRolls.p1) {
        winner = "p2";
      }

      if (newRolls.p1 === newRolls.p2) {
        get().log(`Both players rolled ${newRolls.p1}! Rolling again...`);
        const tiePatch: ServerPatchT = {
          d20Rolls: newRolls,
        };
        get().trySendD20Patch(tiePatch);
        // IMPORTANT: Clear pending roll on tie to prevent stale retries
        // The server will reset both rolls to null, so we shouldn't retry the old value
        set({ d20Rolls: newRolls, setupWinner: null, d20PendingRoll: null });
        return;
      }

      const patch: ServerPatchT = {
        d20Rolls: newRolls,
        setupWinner: winner,
      };
      get().trySendD20Patch(patch);
      set({ d20Rolls: newRolls, setupWinner: winner, d20PendingRoll: null });
      get().log(
        `Player ${
          newRolls.p1 > newRolls.p2 ? "1" : "2"
        } wins the roll (${Math.max(newRolls.p1, newRolls.p2)} vs ${Math.min(
          newRolls.p1,
          newRolls.p2,
        )})!`,
      );
    } else {
      const patch: ServerPatchT = { d20Rolls: newRolls };
      get().trySendD20Patch(patch);
      set({ d20Rolls: newRolls });
      get().log(`Player ${who === "p1" ? "1" : "2"} rolled a ${roll}`);
    }
  },
  retryD20Roll: () => {
    const state = get();
    const pending = state.d20PendingRoll;
    if (!pending) return false;

    // Only retry if the roll hasn't been acknowledged (still pending)
    const currentRoll = state.d20Rolls[pending.seat];
    if (currentRoll !== pending.roll) {
      // Roll was reset (tie) or changed, clear pending
      set({ d20PendingRoll: null });
      return false;
    }

    console.log("[D20] Retrying roll patch", { pending });
    const patch: ServerPatchT = {
      d20Rolls: {
        p1: pending.seat === "p1" ? pending.roll : state.d20Rolls.p1,
        p2: pending.seat === "p2" ? pending.roll : state.d20Rolls.p2,
      },
    };
    get().trySendD20Patch(patch);
    return true;
  },
  clearD20Pending: () => {
    set({ d20PendingRoll: null });
  },
  choosePlayerOrder: (winner, wantsToGoFirst) => {
    const firstPlayer = wantsToGoFirst
      ? winner === "p1"
        ? 1
        : 2
      : winner === "p1"
        ? 2
        : 1;

    const patch: ServerPatchT = {
      phase: "Start",
      currentPlayer: firstPlayer,
    };
    get().trySendPatch(patch);
    set({ phase: "Start", currentPlayer: firstPlayer });

    const winnerNum = winner === "p1" ? 1 : 2;
    const choiceText = wantsToGoFirst ? "goes first" : "goes second";
    get().log(
      `Player ${winnerNum} chooses to ${choiceText}. Player ${firstPlayer} starts!`,
    );
  },

  matchEnded: false,
  winner: null,
  checkMatchEnd: () => {
    const state = get();
    const p1LifeState = state.players?.p1?.lifeState;
    const p2LifeState = state.players?.p2?.lifeState;

    if (p1LifeState === "dead" && p2LifeState !== "dead") {
      set({ matchEnded: true, winner: "p2" });
      const patch = { matchEnded: true, winner: "p2" as PlayerKey };
      get().trySendPatch(patch);
      return;
    }
    if (p2LifeState === "dead" && p1LifeState !== "dead") {
      set({ matchEnded: true, winner: "p1" });
      const patch = { matchEnded: true, winner: "p1" as PlayerKey };
      get().trySendPatch(patch);
      return;
    }
    if (p1LifeState === "dead" && p2LifeState === "dead") {
      set({ matchEnded: true, winner: null });
      const patch = { matchEnded: true, winner: null as PlayerKey | null };
      get().trySendPatch(patch);
      return;
    }

    set({ matchEnded: false, winner: null });
  },

  tieGame: () =>
    set((state) => {
      const p1 = state.players?.p1;
      const p2 = state.players?.p2;
      if (state.matchEnded) return state as GameState;
      if (!(p1?.lifeState === "dd" && p2?.lifeState === "dd")) {
        return state as GameState;
      }
      const nextPlayers = {
        ...state.players,
        p1: { ...p1, life: 0, lifeState: "dead" as LifeState },
        p2: { ...p2, life: 0, lifeState: "dead" as LifeState },
      };
      get().trySendPatch({ players: nextPlayers });
      get().log("Tie declared: both players have died simultaneously.");
      setTimeout(() => get().checkMatchEnd(), 0);
      return { players: nextPlayers } as Partial<GameState> as GameState;
    }),

  resolversDisabled: false,
  setResolversDisabled: (disabled: boolean) => {
    set({ resolversDisabled: disabled });
    const patch = { resolversDisabled: disabled };
    get().trySendPatch(patch);
    get().log(
      disabled
        ? "Card resolvers DISABLED for this match"
        : "Card resolvers ENABLED for this match",
    );
  },

  // Goldfish mode (hotseat only): shuffle hands back to piles at start of each turn
  goldfishMode: false,
  goldfishHandSize: 5,
  setGoldfishMode: (enabled: boolean) => {
    set({ goldfishMode: enabled });
    get().log(
      enabled
        ? "Goldfish mode ENABLED: hands will shuffle back at turn start"
        : "Goldfish mode DISABLED",
    );
  },
  setGoldfishHandSize: (size: number) => {
    const clamped = Math.max(1, Math.min(10, Math.floor(size)));
    set({ goldfishHandSize: clamped });
    get().log(`Goldfish hand size set to ${clamped}`);
  },
  triggerGoldfishShuffle: (who: PlayerKey) => {
    const state = get();
    if (!state.goldfishMode) return;

    console.log("[goldfish] Triggering shuffle for", who);
    const hand = state.zones[who]?.hand || [];
    if (hand.length === 0) return;

    const spellbook = [...(state.zones[who]?.spellbook || [])];
    const atlas = [...(state.zones[who]?.atlas || [])];

    // Sort cards back to their respective piles
    for (const card of hand) {
      const isSite = (card.type || "").toLowerCase().includes("site");
      if (isSite) {
        atlas.push(card);
      } else {
        spellbook.push(card);
      }
    }

    // Shuffle both piles
    for (let i = spellbook.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [spellbook[i], spellbook[j]] = [spellbook[j], spellbook[i]];
    }
    for (let i = atlas.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [atlas[i], atlas[j]] = [atlas[j], atlas[i]];
    }

    // Update zones with shuffled piles and empty hand
    const zonesNext = {
      ...state.zones,
      [who]: {
        ...state.zones[who],
        hand: [],
        spellbook,
        atlas,
      },
    } as GameState["zones"];

    set({ zones: zonesNext });

    const playerNum = who === "p1" ? "1" : "2";
    get().log(
      `[p${playerNum}:PLAYER] shuffles hand back into piles (Goldfish)`,
    );

    // Draw fresh hand (respecting goldfishHandSize)
    const handSize = state.goldfishHandSize;
    // Draw from spellbook first, then atlas if needed
    const drawn: typeof hand = [];
    const spellbookMut = [...zonesNext[who].spellbook];
    const atlasMut = [...zonesNext[who].atlas];

    // Try to draw mostly spells with some sites (similar to opening hand)
    const sitesToDraw = Math.min(2, atlasMut.length);
    const spellsToDrawCount = Math.min(
      handSize - sitesToDraw,
      spellbookMut.length,
    );

    for (let i = 0; i < spellsToDrawCount; i++) {
      const card = spellbookMut.shift();
      if (card) drawn.push(card);
    }
    for (let i = 0; i < sitesToDraw && drawn.length < handSize; i++) {
      const card = atlasMut.shift();
      if (card) drawn.push(card);
    }
    // Fill remaining from spellbook if atlas was short
    while (drawn.length < handSize && spellbookMut.length > 0) {
      const card = spellbookMut.shift();
      if (card) drawn.push(card);
    }

    const finalZones = {
      ...zonesNext,
      [who]: {
        ...zonesNext[who],
        hand: drawn,
        spellbook: spellbookMut,
        atlas: atlasMut,
      },
    } as GameState["zones"];

    set({ zones: finalZones });
    get().log(`[p${playerNum}:PLAYER] draws ${drawn.length} cards (Goldfish)`);
  },

  addLife: (who, delta, _isAvatarDamage) =>
    set((state) => {
      const currentLife = state.players[who]?.life ?? 20;
      const currentLifeState = state.players[who]?.lifeState ?? "alive";
      let newLife = currentLife + delta;
      let newLifeState: LifeState = currentLifeState;

      // Imposter mask breaking is manual only - no automatic triggers

      if (newLife > 20) {
        newLife = 20;
      } else if (newLife <= 0) {
        if (currentLifeState === "alive") {
          newLife = 0;
          newLifeState = "dd";
        } else if (currentLifeState === "dd") {
          newLife = 0;
          newLifeState = "dead";
        }
      } else if (newLife > 0 && currentLifeState === "dd") {
        newLifeState = "alive";
      }

      const newState = {
        players: {
          ...state.players,
          [who]: {
            ...state.players[who],
            life: newLife,
            lifeState: newLifeState,
          },
        },
      };

      // Build event messages for life changes
      const eventMessages: string[] = [];
      const playerNum = who === "p1" ? "1" : "2";

      if (currentLife !== newLife) {
        const changeText =
          delta > 0 ? `gains ${delta}` : `loses ${Math.abs(delta)}`;
        eventMessages.push(
          `[p${playerNum}:PLAYER] ${changeText} life (${currentLife} → ${newLife})`,
        );
        // Play health change sound effect
        if (delta > 0) {
          soundManager.play("healthPlus");
        } else {
          soundManager.play("healthMinus");
        }
      }

      if (currentLifeState !== newLifeState) {
        if (newLifeState === "dd") {
          eventMessages.push(`[p${playerNum}:PLAYER] enters Death's Door!`);
        } else if (newLifeState === "alive" && currentLifeState === "dd") {
          eventMessages.push(
            `[p${playerNum}:PLAYER] recovers from Death's Door`,
          );
        } else if (newLifeState === "dead") {
          eventMessages.push(`[p${playerNum}:PLAYER] has died! Match ended.`);
        }
      }

      // Create events and include them in the patch
      // This ensures life changes are logged even when it's not the player's turn
      let nextEventSeq = state.eventSeq;
      const newEvents = eventMessages.map((text) => {
        nextEventSeq += 1;
        return {
          id: nextEventSeq,
          ts: Date.now(),
          text,
          turn: state.turn || 1,
          player: state.currentPlayer,
        };
      });

      const allEvents = [...state.events, ...newEvents];
      const MAX_EVENTS = 200;
      const trimmedEvents =
        allEvents.length > MAX_EVENTS
          ? allEvents.slice(-MAX_EVENTS)
          : allEvents;

      // Only send the affected player's data to avoid overwriting opponent's mana
      // Include events in the patch so they are synced to the opponent
      const patch: ServerPatchT = {
        players: { [who]: newState.players[who] } as GameState["players"],
        ...(newEvents.length > 0
          ? { events: trimmedEvents, eventSeq: nextEventSeq }
          : {}),
      };
      get().trySendPatch(patch);

      setTimeout(() => get().checkMatchEnd(), 0);

      return {
        ...newState,
        ...(newEvents.length > 0
          ? { events: trimmedEvents, eventSeq: nextEventSeq }
          : {}),
      };
    }),

  nextPhase: () => {
    const state = get();
    // In online play, only the current player can advance the phase
    if (state.transport && state.actorKey) {
      const currentSeat = state.currentPlayer === 1 ? "p1" : "p2";
      if (state.actorKey !== currentSeat) {
        console.debug("[game] nextPhase ignored: not current player");
        return;
      }
    }
    get().pushHistory();
    const idx = phases.indexOf(state.phase);
    const nextIdx = (idx + 1) % phases.length;
    const nextPhase = phases[nextIdx];
    const passTurn = nextPhase === "Start";

    if (passTurn) {
      const nextPlayer = state.currentPlayer === 1 ? 2 : 1;
      const nextPlayerNum = nextPlayer === 1 ? "1" : "2";
      // Log before updating state so it uses the current turn number
      get().log(`Turn passes to [p${nextPlayerNum}:PLAYER]`);
      const permanents: Permanents = { ...state.permanents };
      const updates: PermanentDeltaUpdate[] = [];
      for (const cellKey of Object.keys(permanents)) {
        const cellPermanents = permanents[cellKey] || [];
        const arr = [...cellPermanents];
        let changed = false;
        for (let i = 0; i < arr.length; i++) {
          const cur = arr[i];
          if (!cur) continue;
          if (cur.owner !== nextPlayer) continue;
          if (cur.tapped) {
            const next = bumpPermanentVersion({ ...cur, tapped: false });
            arr[i] = next;
            updates.push({
              at: cellKey as CellKey,
              entry: {
                instanceId: next.instanceId ?? undefined,
                tapped: false,
                tapVersion: next.tapVersion,
                version: next.version,
              },
            });
            changed = true;
          }
        }
        if (changed) permanents[cellKey] = arr;
      }

      const nextKey = (nextPlayer === 1 ? "p1" : "p2") as PlayerKey;
      const avatarsNext = {
        ...state.avatars,
        [nextKey]: { ...state.avatars[nextKey], tapped: false },
      } as GameState["avatars"];

      // Reset pathfinder usage for both players on turn change
      const pathfinderUsedNext = { p1: false, p2: false };

      // Don't send turn in patch - server increments turn when currentPlayer changes
      // Include avatars to ensure correct position is broadcast (e.g., after Pathfinder move)
      const base: ServerPatchT = {
        phase: nextPhase,
        currentPlayer: nextPlayer,
        hasDrawnThisTurn: false, // Reset draw tracking for new turn
        pathfinderUsed: pathfinderUsedNext,
        avatars: avatarsNext,
      };
      const deltaPatch =
        updates.length > 0 ? createPermanentDeltaPatch(updates) : undefined;
      const patch: ServerPatchT = deltaPatch
        ? { ...deltaPatch, ...base }
        : base;
      get().trySendPatch(patch);

      // Don't set turn locally - server will send the authoritative turn value
      set({
        phase: nextPhase,
        currentPlayer: nextPlayer,
        hasDrawnThisTurn: false, // Reset draw tracking for new turn
        permanents,
        avatars: avatarsNext,
        pathfinderUsed: pathfinderUsedNext,
        selectedCard: null,
      });
      try {
        get().clearAllDamageForSeat(nextKey);
      } catch {}
      // Snapshot creation is handled by GameToolbox.tsx useEffect
    } else {
      const patch: ServerPatchT = { phase: nextPhase };
      get().trySendPatch(patch);
      set({ phase: nextPhase });
    }
  },

  endTurn: () => {
    const state = get();
    if (state.matchEnded) {
      console.debug("[game] endTurn ignored after match ended");
      return;
    }
    // In online play, only the current player can end the turn
    if (state.transport && state.actorKey) {
      const currentSeat = state.currentPlayer === 1 ? "p1" : "p2";
      if (state.actorKey !== currentSeat) {
        console.debug("[game] endTurn ignored: not current player");
        return;
      }
    }
    get().pushHistory();
    const cur = state.currentPlayer;
    const nextPlayer = cur === 1 ? 2 : 1;
    const curPlayerNum = cur === 1 ? "1" : "2";
    const nextPlayerNum = nextPlayer === 1 ? "1" : "2";

    // Log both messages before updating state so they use the current turn number
    get().log(`[p${curPlayerNum}:PLAYER] ends the turn`);

    // Trigger Omphalos end-of-turn draws for the ending player
    const endingPlayerSeat = (cur === 1 ? "p1" : "p2") as PlayerKey;
    try {
      clearOmphalosDrawnCycle();
      get().triggerOmphalosEndOfTurn(endingPlayerSeat);
    } catch {}

    // Trigger Lilith end-of-turn reveals for the ending player
    // ONLY if Omphalos didn't queue an auto-resolve confirmation.
    // If Omphalos is pending, Lilith will be chained after it completes
    // (see confirmAutoResolve / cancelAutoResolve in autoResolveState.ts)
    if (!get().pendingAutoResolve) {
      try {
        get().triggerLilithEndOfTurn(endingPlayerSeat);
      } catch {}
    }

    // Trigger Torshammar Trinket return to hand for the ending player
    try {
      get().triggerTorshammarEndOfTurn(endingPlayerSeat);
    } catch {}

    // Clear turn-based bonuses (bloom sites, genesis mana, etc.)
    try {
      get().clearTurnBonuses();
    } catch {}

    get().log(`Turn passes to [p${nextPlayerNum}:PLAYER]`);

    // IMPORTANT: Re-read permanents AFTER end-of-turn triggers have run
    // Torshammar, Lilith, Omphalos may have modified the permanents state
    const permanents: Permanents = { ...get().permanents };
    const updates: PermanentDeltaUpdate[] = [];

    for (const cellKey of Object.keys(permanents)) {
      const cellPermanents = permanents[cellKey] || [];
      const arr = [...cellPermanents];
      let changed = false;
      for (let i = 0; i < arr.length; i++) {
        const cur = arr[i];
        if (!cur) continue;
        if (cur.owner !== nextPlayer) continue;
        if (cur.tapped) {
          const next = bumpPermanentVersion({ ...cur, tapped: false });
          arr[i] = next;
          updates.push({
            at: cellKey as CellKey,
            entry: {
              instanceId: next.instanceId ?? undefined,
              tapped: false,
              tapVersion: next.tapVersion,
              version: next.version,
            },
          });
          changed = true;
        }
      }
      if (changed) permanents[cellKey] = arr;
    }

    const nextKey = (nextPlayer === 1 ? "p1" : "p2") as PlayerKey;
    const avatarsNext = {
      ...state.avatars,
      [nextKey]: { ...state.avatars[nextKey], tapped: false },
    } as GameState["avatars"];

    // Reset mana offset to 0 for the next player (refill spent mana)
    const playersNext = {
      ...state.players,
      [nextKey]: { ...state.players[nextKey], mana: 0 },
    };

    // Reset necromancer skeleton usage for the next player's turn
    const necromancerSkeletonUsedNext = {
      ...state.necromancerSkeletonUsed,
      [nextKey]: false, // Reset for the player whose turn is starting
    };

    // Reset mephistopheles summon usage for the next player's turn
    const mephistophelesSummonUsedNext = {
      ...state.mephistophelesSummonUsed,
      [nextKey]: false, // Reset for the player whose turn is starting
    };

    // Reset harbinger portal discount usage for the next player's turn
    const harbingerPortalDiscountUsedNext = {
      ...state.harbingerPortalDiscountUsed,
      [nextKey]: false, // Reset for the player whose turn is starting
    };

    // Reset assimilator snail usage for the next player's turn
    const assimilatorSnailUsedNext = {
      ...state.assimilatorSnailUsed,
      [nextKey]: false, // Reset for the player whose turn is starting
    };

    // Revert Assimilator Snail transformations for the player whose turn is starting
    // (the card text says "until your next turn")
    const snailTransformsToRevert = state.assimilatorSnailTransforms.filter(
      (t) => t.ownerSeat === nextKey,
    );
    if (snailTransformsToRevert.length > 0) {
      for (const transform of snailTransformsToRevert) {
        const cellPerms = [...(permanents[transform.snailAt] || [])];
        const snailIndex = cellPerms.findIndex(
          (p) =>
            (p.instanceId && p.instanceId === transform.snailInstanceId) ||
            (p.card?.instanceId &&
              p.card.instanceId === transform.snailInstanceId),
        );
        if (snailIndex !== -1) {
          cellPerms[snailIndex] = {
            ...cellPerms[snailIndex],
            card: {
              ...transform.originalCard,
              instanceId: cellPerms[snailIndex].card.instanceId,
              owner: cellPerms[snailIndex].card.owner,
            },
            isCopy: false,
            version: (cellPerms[snailIndex].version ?? 0) + 1,
          };
          permanents[transform.snailAt] = cellPerms;
        }
      }
    }
    const assimilatorSnailTransformsNext =
      state.assimilatorSnailTransforms.filter((t) => t.ownerSeat !== nextKey);

    // Reset pathfinder usage for both players on turn change
    const pathfinderUsedNext = { p1: false, p2: false };

    // Track which Ether Cores are currently in the void at turn start
    // Ether Core only provides 3 mana if it was cast this turn OR started the turn in the void
    const etherCoresInVoidAtTurnStartNext: string[] = [];
    // Track which core artifacts are currently carried (attached) at turn start
    // Cores only provide mana if summoned this turn OR were carried at turn start
    const coresCarriedAtTurnStartNext: string[] = [];
    for (const [cellKey, cellPerms] of Object.entries(permanents)) {
      const isVoidCell = !state.board?.sites?.[cellKey];
      for (const perm of cellPerms || []) {
        const cardName = String(perm.card?.name || "").toLowerCase();
        if (!perm.instanceId) continue;
        // Ether Core void tracking
        if (isVoidCell && cardName === "ether core") {
          etherCoresInVoidAtTurnStartNext.push(perm.instanceId);
        }
        // Core carried tracking - cores that are attached to a unit at turn start
        const cardType = String(perm.card?.type || "").toLowerCase();
        if (cardType.includes("artifact") && perm.attachedTo) {
          const isCoreArtifact = cardName.includes("core");
          if (isCoreArtifact) {
            coresCarriedAtTurnStartNext.push(perm.instanceId);
          }
        }
      }
    }

    // Build combined patch with all end-of-turn changes
    // NOTE: We do NOT include zones here - zone changes (like Torshammar's hand update)
    // are already applied locally, and sending partial zones can wipe the other player's
    // zone data on the server (server does full replacement, not merge, for zones).
    // Zone state is private to each player anyway (opponent can't see hand contents).

    // Don't send turn in patch - server increments turn when currentPlayer changes
    // Include full permanents with __replaceKeys to ensure all trigger changes are synced
    // Include avatars to ensure correct position is broadcast (e.g., after Pathfinder move)
    const base: ServerPatchT = {
      phase: "Start",
      currentPlayer: nextPlayer,
      hasDrawnThisTurn: false, // Reset draw tracking for new turn
      cardsDrawnThisTurn: { p1: 0, p2: 0 }, // Reset Garden of Eden draw counters
      players: { [nextKey]: playersNext[nextKey] } as GameState["players"],
      necromancerSkeletonUsed: necromancerSkeletonUsedNext,
      mephistophelesSummonUsed: mephistophelesSummonUsedNext,
      harbingerPortalDiscountUsed: harbingerPortalDiscountUsedNext,
      assimilatorSnailUsed: assimilatorSnailUsedNext,
      assimilatorSnailTransforms: assimilatorSnailTransformsNext,
      pathfinderUsed: pathfinderUsedNext,
      etherCoresInVoidAtTurnStart: etherCoresInVoidAtTurnStartNext,
      coresCarriedAtTurnStart: coresCarriedAtTurnStartNext,
      // Include full permanents after all end-of-turn triggers
      permanents,
      // Include avatars to ensure correct positions are synced
      avatars: avatarsNext,
      __replaceKeys: ["permanents"],
    };
    // NOTE: We do NOT include deltaPatch when using __replaceKeys: ["permanents"]
    // The full permanents object already contains untapping changes.
    // Spreading deltaPatch would OVERWRITE permanents with incomplete delta data,
    // causing all permanents except the updated one to be lost!
    // The deltaPatch is only useful when NOT doing a full replacement.
    get().trySendPatch(base);

    set({
      phase: "Start",
      currentPlayer: nextPlayer,
      hasDrawnThisTurn: false, // Reset draw tracking for new turn
      cardsDrawnThisTurn: { p1: 0, p2: 0 }, // Reset Garden of Eden draw counters
      permanents,
      avatars: avatarsNext,
      players: playersNext,
      necromancerSkeletonUsed: necromancerSkeletonUsedNext,
      mephistophelesSummonUsed: mephistophelesSummonUsedNext,
      harbingerPortalDiscountUsed: harbingerPortalDiscountUsedNext,
      assimilatorSnailUsed: assimilatorSnailUsedNext,
      assimilatorSnailTransforms: assimilatorSnailTransformsNext,
      pathfinderUsed: pathfinderUsedNext,
      etherCoresInVoidAtTurnStart: etherCoresInVoidAtTurnStartNext,
      coresCarriedAtTurnStart: coresCarriedAtTurnStartNext,
      selectedCard: null,
      selectedPermanent: null,
    });

    try {
      get().clearAllDamageForSeat(nextKey);
    } catch {}

    // Trigger Mother Nature start-of-turn reveals for the starting player
    try {
      get().triggerMotherNatureStartOfTurn(nextKey);
    } catch {}

    // Trigger Headless Haunt start-of-turn movement for the starting player
    try {
      get().triggerHeadlessHauntStartOfTurn(nextKey);
    } catch {}

    // Goldfish mode: shuffle hand back to piles and draw fresh hand (hotseat only)
    // In hotseat, actorKey is null; in online play, actorKey is set
    if (state.goldfishMode && !state.actorKey) {
      try {
        get().triggerGoldfishShuffle(nextKey);
      } catch {}
    }
    // Snapshot creation is handled by GameToolbox.tsx useEffect
  },
});
