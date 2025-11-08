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
  bumpPermanentVersion,
} from "./utils/permanentHelpers";
import {
  createPermanentDeltaPatch,
  type PermanentDeltaUpdate,
} from "./utils/patchHelpers";
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
  | "d20Rolls"
  | "rollD20"
  | "setupWinner"
  | "choosePlayerOrder"
  | "matchEnded"
  | "winner"
  | "checkMatchEnd"
  | "tieGame"
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
  setPhase: (phase) =>
    set((state) => {
      if (phase === "Start") {
        try {
          const turnNow = state.turn;
          const cpNow = state.currentPlayer;
          const hasForTurn =
            Array.isArray(state.snapshots) &&
            state.snapshots.some(
              (ss) => ss.kind === "auto" && ss.turn === turnNow
            );
          if (!hasForTurn) {
            setTimeout(() => {
              try {
                get().createSnapshot(
                  `Turn ${turnNow} start (P${cpNow})`,
                  "auto"
                );
              } catch {}
            }, 0);
          }
        } catch {}
      }
      return { phase } as Partial<GameState> as GameState;
    }),

  // D20 Setup phase
  d20Rolls: createInitialD20Rolls(),
  setupWinner: null,
  rollD20: (who) => {
    const roll = Math.floor(Math.random() * 20) + 1;
    const state = get();
    const newRolls = { ...state.d20Rolls, [who]: roll };

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
        get().trySendPatch(tiePatch);
        set({ d20Rolls: newRolls, setupWinner: null });
        return;
      }

      const patch: ServerPatchT = {
        d20Rolls: newRolls,
        setupWinner: winner,
      };
      get().trySendPatch(patch);
      set({ d20Rolls: newRolls, setupWinner: winner });
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
      get().trySendPatch(patch);
      set({ d20Rolls: newRolls });
      get().log(`Player ${who === "p1" ? "1" : "2"} rolled a ${roll}`);
    }
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

  addLife: (who, delta) =>
    set((state) => {
      const currentLife = state.players[who].life;
      const currentLifeState = state.players[who].lifeState;
      let newLife = currentLife + delta;
      let newLifeState: LifeState = currentLifeState;

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
        const changeText =
          delta > 0 ? `gains ${delta}` : `loses ${Math.abs(delta)}`;
        get().log(
          `${who.toUpperCase()} ${changeText} life (${currentLife} → ${newLife})`
        );
      }

      if (currentLifeState !== newLifeState) {
        if (newLifeState === "dd") {
          get().log(`${who.toUpperCase()} enters Death's Door!`);
        } else if (newLifeState === "alive" && currentLifeState === "dd") {
          get().log(`${who.toUpperCase()} recovers from Death's Door`);
        } else if (newLifeState === "dead") {
          get().log(`${who.toUpperCase()} has died! Match ended.`);
        }
      }

      setTimeout(() => get().checkMatchEnd(), 0);

      return newState;
    }),

  nextPhase: () => {
    const state = get();
    get().pushHistory();
    const idx = phases.indexOf(state.phase);
    const nextIdx = (idx + 1) % phases.length;
    const nextPhase = phases[nextIdx];
    const passTurn = nextPhase === "Start";

    if (passTurn) {
      const nextPlayer = state.currentPlayer === 1 ? 2 : 1;
      const nextTurn = state.turn + 1;
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

      const base: ServerPatchT = {
        phase: nextPhase,
        currentPlayer: nextPlayer,
        turn: nextTurn,
      };
      const deltaPatch =
        updates.length > 0 ? createPermanentDeltaPatch(updates) : undefined;
      const patch: ServerPatchT = deltaPatch ? { ...deltaPatch, ...base } : base;
      get().trySendPatch(patch);

      set({
        phase: nextPhase,
        currentPlayer: nextPlayer,
        turn: nextTurn,
        permanents,
        avatars: avatarsNext,
        selectedCard: null,
      });
      try {
        get().clearAllDamageForSeat(nextKey);
      } catch {}
      get().log(`Turn passes to P${nextPlayer}`);
      try {
        const snapshotTurn = nextTurn;
        const snapshotCP = nextPlayer;
        setTimeout(() => {
          try {
            const st = get();
            const hasForTurn =
              Array.isArray(st.snapshots) &&
              st.snapshots.some(
                (ss) => ss.kind === "auto" && ss.turn === snapshotTurn
              );
            if (!hasForTurn && st.phase !== "Setup") {
              st.createSnapshot(
                `Turn ${snapshotTurn} start (P${snapshotCP})`,
                "auto"
              );
            }
          } catch {}
        }, 0);
      } catch {}
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
    get().pushHistory();
    const cur = state.currentPlayer;
    get().log(`P${cur} ends the turn`);
    const nextPlayer = cur === 1 ? 2 : 1;
    const nextTurn = state.turn + 1;

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

    const base: ServerPatchT = {
      phase: "Main",
      currentPlayer: nextPlayer,
      turn: nextTurn,
    };
    const deltaPatch =
      updates.length > 0 ? createPermanentDeltaPatch(updates) : undefined;
    const patch: ServerPatchT = deltaPatch ? { ...deltaPatch, ...base } : base;
    get().trySendPatch(patch);

    set({
      phase: "Main",
      currentPlayer: nextPlayer,
      turn: nextTurn,
      permanents,
      avatars: avatarsNext,
      selectedCard: null,
      selectedPermanent: null,
    });
    try {
      get().clearAllDamageForSeat(nextKey);
    } catch {}

    try {
      const snapshotTurn = nextTurn;
      const snapshotCP = nextPlayer;
      setTimeout(() => {
        try {
          const st = get();
          const hasForTurn =
            Array.isArray(st.snapshots) &&
            st.snapshots.some(
              (ss) => ss.kind === "auto" && ss.turn === snapshotTurn
            );
          if (!hasForTurn && st.phase !== "Setup") {
            st.createSnapshot(
              `Turn ${snapshotTurn} start (P${snapshotCP})`,
              "auto"
            );
          }
        } catch {}
      }, 0);
    } catch {}
    get().log(`Turn passes to P${nextPlayer}`);
  },
});
