import { create, type StateCreator } from "zustand";
import type {
  InteractionEnvelope,
  InteractionGrant,
  InteractionGrantRequest,
  InteractionDecision,
  InteractionMessage,
  InteractionRequestMessage,
  InteractionResponseMessage,
  InteractionRequestKind,
  InteractionResultMessage,
} from "@/lib/net/interactions";
import {
  wrapInteractionMessage,
  grantFromRequest,
  generateInteractionRequestId,
  createInteractionRequest,
  createInteractionResponse,
} from "@/lib/net/interactions";
import type { GameTransport, CustomMessage } from "@/lib/net/transport";
import type {
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
import {
  BOARD_PING_LIFETIME_MS,
  BOARD_PING_MAX_HISTORY,
} from "./store/types";
import { createEmptyZonesRecord } from "./store/utils/zoneHelpers";
import { createDefaultAvatars } from "./store/utils/avatarHelpers";
import { createDefaultPlayerPositions } from "./store/utils/positionHelpers";
import { computeAvailableMana, computeThresholdTotals } from "./store/utils/resourceHelpers";
import {
  clearSnapshotsStorageFor,
  loadSnapshotsFromStorageFor,
  saveSnapshotsToStorageFor,
} from "./store/utils/snapshotHelpers";
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
import {
  createSnapshotSlice,
  createEmptySnapshots,
} from "./store/snapshotState";

function normalizeGrantRequest(
  candidate: unknown
): InteractionGrantRequest | null {
  if (!candidate || typeof candidate !== "object") return null;
  const src = candidate as Record<string, unknown>;
  const normalized: InteractionGrantRequest = {};
  if ("targetSeat" in src) {
    const seat = src.targetSeat;
    if (seat === "p1" || seat === "p2" || seat === null) {
      normalized.targetSeat = seat;
    }
  }
  if (typeof src.expiresAt === "number" && Number.isFinite(src.expiresAt)) {
    normalized.expiresAt = src.expiresAt;
  }
  if (typeof src.singleUse === "boolean") {
    normalized.singleUse = src.singleUse;
  }
  if (typeof src.allowOpponentZoneWrite === "boolean") {
    normalized.allowOpponentZoneWrite = src.allowOpponentZoneWrite;
  }
  if (typeof src.allowRevealOpponentHand === "boolean") {
    normalized.allowRevealOpponentHand = src.allowRevealOpponentHand;
  }
  return Object.keys(normalized).length > 0 ? normalized : null;
}

function pickNextPendingInteraction(
  log: InteractionStateMap
): InteractionRequestEntry | null {
  let selected: InteractionRequestEntry | null = null;
  for (const entry of Object.values(log)) {
    if (!entry || entry.status !== "pending") continue;
    if (!selected) {
      selected = entry;
      continue;
    }
    if (selected.direction === "outbound" && entry.direction === "inbound") {
      selected = entry;
      continue;
    }
    if (
      entry.direction === selected.direction &&
      entry.receivedAt < selected.receivedAt
    ) {
      selected = entry;
    }
  }
  return selected;
}

function computeInteractionFocus(log: InteractionStateMap): {
  active: InteractionRequestEntry | null;
  pendingId: string | null;
} {
  const next = pickNextPendingInteraction(log);
  return {
    active: next,
    pendingId: next ? next.request.requestId : null,
  };
}

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

// Small random visual tilt for permanents to reduce overlap uniformity (radians ~ -0.05..+0.05)
// ---- Shared helpers (pure) -------------------------------------------------

// Build an updated avatars record with a new position/offset for a player.
function buildAvatarUpdate(
  s: GameState,
  who: PlayerKey,
  pos: [number, number],
  offset: [number, number] | null
): Record<PlayerKey, AvatarState> {
  const next = { ...s.avatars[who], pos, offset } as AvatarState;
  return { ...s.avatars, [who]: next } as Record<PlayerKey, AvatarState>;
}

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
      };
      return reset as GameState;
    })
});

export const createGameStore = () => create<GameState>(createGameStoreState);

export const useGameStore = createGameStore();
setTransportStateAccessor(useGameStore.getState);
