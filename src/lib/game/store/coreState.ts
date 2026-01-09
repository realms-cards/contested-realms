import type { StateCreator } from "zustand";
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
        set({ d20Rolls: newRolls, setupWinner: null });
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
          newRolls.p2
        )})!`
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
      `Player ${winnerNum} chooses to ${choiceText}. Player ${firstPlayer} starts!`
    );
  },

  matchEnded: false,
  winner: null,
  checkMatchEnd: () => {
    const state = get();
    const p1LifeState = state.players.p1.lifeState;
    const p2LifeState = state.players.p2.lifeState;

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
      const p1 = state.players.p1;
      const p2 = state.players.p2;
      if (state.matchEnded) return state as GameState;
      if (!(p1.lifeState === "dd" && p2.lifeState === "dd")) {
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
        : "Card resolvers ENABLED for this match"
    );
  },

  addLife: (who, delta) =>
    set((state) => {
      const currentLife = state.players[who].life;
      const currentLifeState = state.players[who].lifeState;
      let newLife = currentLife + delta;
      let newLifeState: LifeState = currentLifeState;

      // Break Imposter mask when taking damage (delta < 0)
      if (delta < 0 && state.imposterMasks[who]) {
        // Schedule mask break after this state update completes
        setTimeout(() => get().breakMask(who), 0);
      }

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

      const patch = { players: newState.players };
      get().trySendPatch(patch);

      if (currentLife !== newLife) {
        const playerNum = who === "p1" ? "1" : "2";
        const changeText =
          delta > 0 ? `gains ${delta}` : `loses ${Math.abs(delta)}`;
        get().log(
          `[p${playerNum}:PLAYER] ${changeText} life (${currentLife} → ${newLife})`
        );
      }

      if (currentLifeState !== newLifeState) {
        const playerNum = who === "p1" ? "1" : "2";
        if (newLifeState === "dd") {
          get().log(`[p${playerNum}:PLAYER] enters Death's Door!`);
        } else if (newLifeState === "alive" && currentLifeState === "dd") {
          get().log(`[p${playerNum}:PLAYER] recovers from Death's Door`);
        } else if (newLifeState === "dead") {
          get().log(`[p${playerNum}:PLAYER] has died! Match ended.`);
        }
      }

      setTimeout(() => get().checkMatchEnd(), 0);

      return newState;
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

      // Don't send turn in patch - server increments turn when currentPlayer changes
      const base: ServerPatchT = {
        phase: nextPhase,
        currentPlayer: nextPlayer,
        hasDrawnThisTurn: false, // Reset draw tracking for new turn
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
      get().triggerOmphalosEndOfTurn(endingPlayerSeat);
    } catch {}

    // Trigger Lilith end-of-turn reveals for the ending player
    try {
      get().triggerLilithEndOfTurn(endingPlayerSeat);
    } catch {}

    // Clear turn-based bonuses (bloom sites, genesis mana, etc.)
    try {
      get().clearTurnBonuses();
    } catch {}

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

    // Don't send turn in patch - server increments turn when currentPlayer changes
    const base: ServerPatchT = {
      phase: "Start",
      currentPlayer: nextPlayer,
      hasDrawnThisTurn: false, // Reset draw tracking for new turn
      players: playersNext,
      necromancerSkeletonUsed: necromancerSkeletonUsedNext,
    };
    const deltaPatch =
      updates.length > 0 ? createPermanentDeltaPatch(updates) : undefined;
    const patch: ServerPatchT = deltaPatch ? { ...deltaPatch, ...base } : base;
    get().trySendPatch(patch);

    // Don't set turn locally - server will send the authoritative turn value
    set({
      phase: "Start",
      currentPlayer: nextPlayer,
      hasDrawnThisTurn: false, // Reset draw tracking for new turn
      permanents,
      avatars: avatarsNext,
      players: playersNext,
      necromancerSkeletonUsed: necromancerSkeletonUsedNext,
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
    // Snapshot creation is handled by GameToolbox.tsx useEffect
  },
});
