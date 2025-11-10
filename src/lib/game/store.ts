import { create, type StateCreator } from "zustand";
import type { GameState, PlayerKey } from "./store/types";
import { createEmptyZonesRecord } from "./store/utils/zoneHelpers";
import { createDefaultAvatars } from "./store/utils/avatarHelpers";
import { createDefaultPlayerPositions } from "./store/utils/positionHelpers";
import { clearSnapshotsStorageFor } from "./store/utils/snapshotHelpers";
import { createEventSlice } from "./store/eventState";
import { createDialogSlice, createInitialDialogState } from "./store/dialogState";
import { createUiSlice, createInitialUiState } from "./store/uiState";
import { createBoardUiSlice, createInitialBoardUiState } from "./store/boardUiState";
import { createBoardSlice, createInitialBoard } from "./store/boardState";
import { createHistorySlice, createInitialHistoryState } from "./store/historyState";
import { createCoreSlice, createInitialPlayers, createInitialD20Rolls } from "./store/coreState";
import { createResourceSlice } from "./store/resourceState";
import { createPermanentSlice } from "./store/permanentState";
import { createPositionSlice } from "./store/positionState";
import { createAvatarSlice } from "./store/avatarState";
import { createZoneSlice, createInitialMulligans, createInitialMulliganDrawn } from "./store/zoneState";
import { createPreferenceSlice } from "./store/preferenceState";
import { createCardMetaSlice } from "./store/cardMetaState";
import { createSessionSlice } from "./store/sessionState";
import { createRemoteCursorSlice } from "./store/remoteCursorState";
import {
  createTransportSlice,
  setTransportStateAccessor,
} from "./store/transportState";
import { handleCustomMessage } from "./store/customMessageHandlers";
import { createInteractionSlice } from "./store/interactionState";
import { createGameActionsSlice } from "./store/gameActions";
import { createCombatSlice } from "./store/combatState";
import { createNetworkSlice } from "./store/networkState";
import { createMagicSlice } from "./store/magicState";
import {
  createSnapshotSlice,
  createEmptySnapshots,
} from "./store/snapshotState";

export {
  BOARD_PING_LIFETIME_MS,
  BOARD_PING_MAX_HISTORY,
  MAX_EVENTS,
  REMOTE_CURSOR_TTL_MS,
} from "./store/types";
export type {
  AvatarState,
  BoardPingEvent,
  BoardSize,
  BoardState,
  CardRef,
  CellKey,
  GameEvent,
  GameState,
  InteractionRecordStatus,
  InteractionRequestEntry,
  InteractionResponseOptions,
  InteractionStateMap,
  LifeState,
  Permanents,
  PermanentItem,
  Phase,
  PlayerKey,
  PlayerState,
  RemoteCursorState,
  ServerPatchT,
  SendInteractionRequestInput,
  SerializedGame,
  SiteTile,
  Thresholds,
  Zones,
} from "./store/types";

const createGameStoreState: StateCreator<GameState> = (set, get, storeApi) => ({
  ...createEventSlice(set, get, storeApi),
  ...createDialogSlice(set, get, storeApi),
  ...createUiSlice(set, get, storeApi),
  ...createBoardSlice(set, get, storeApi),
  ...createBoardUiSlice(set, get, storeApi),
  ...createHistorySlice(set, get, storeApi),
  ...createCoreSlice(set, get, storeApi),
  ...createResourceSlice(set, get, storeApi),
  ...createPermanentSlice(set, get, storeApi),
  ...createPositionSlice(set, get, storeApi),
  ...createAvatarSlice(set, get, storeApi),
  ...createZoneSlice(set, get, storeApi),
  ...createGameActionsSlice(set, get, storeApi),
  ...createCombatSlice(set, get, storeApi),
  ...createMagicSlice(set, get, storeApi),
  ...createPreferenceSlice(set, get, storeApi),
  ...createCardMetaSlice(set, get, storeApi),
  ...createSessionSlice(set, get, storeApi),
  ...createSnapshotSlice(set, get, storeApi),
  ...createRemoteCursorSlice(set, get, storeApi),
  ...createInteractionSlice(set, get, storeApi),
  ...createTransportSlice(set, get, storeApi),
  ...createNetworkSlice(set, get, storeApi),

  // Multiplayer transport (injected by online play UI)
  receiveCustomMessage: (msg) => handleCustomMessage(msg, set, get),

  // Reset all game state to initial values (for new matches)
  resetGameState: () =>
    set((state) => {
      console.log("[game] Resetting game state for new match");
      try { clearSnapshotsStorageFor(get().matchId ?? null); } catch {}
      const reset: Partial<GameState> = {
        players: createInitialPlayers(),
        currentPlayer: 1,
        turn: 1,
        phase: "Setup",
        lastServerTs: 0,
        lastLocalActionTs: 0,
        setupWinner: null,
        d20Rolls: createInitialD20Rolls(),
        actorKey: state.actorKey, // Preserve actorKey during reset
        matchEnded: false,
        winner: null,
        board: createInitialBoard(),
        zones: createEmptyZonesRecord(),
        ...createInitialUiState(),
        ...createInitialBoardUiState(),
        avatars: createDefaultAvatars(),
        permanents: {},
        permanentPositions: {},
        permanentAbilities: {},
        sitePositions: {},
        playerPositions: createDefaultPlayerPositions(),
        ...createInitialDialogState(),
        ...createInitialHistoryState(),
        mulligans: createInitialMulligans(),
        mulliganDrawn: createInitialMulliganDrawn(),
        events: [],
        eventSeq: 0,
        pendingPatches: [],
        interactionLog: {},
        pendingInteractionId: null,
        acknowledgedInteractionIds: {},
        activeInteraction: null,
        transportSubscriptions: [],
        snapshots: createEmptySnapshots(),
        pendingMagic: null,
      };
      return reset as GameState;
    })
});

export const createGameStore = () => create<GameState>(createGameStoreState);

export const useGameStore = createGameStore();
setTransportStateAccessor(useGameStore.getState);
