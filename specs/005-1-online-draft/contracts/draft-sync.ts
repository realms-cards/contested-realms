/**
 * Socket.io Event Contracts for Draft Synchronization
 * Strongly typed interfaces for all draft-related socket events
 */

// ============================================================================
// Client → Server Events
// ============================================================================

/**
 * Event: draft:pick_card
 * Sent when a player picks a card from their current pack
 */
export interface PickCardRequest {
  sessionId: string;
  playerId: string;
  cardId: string;
  packId: string;
  pickNumber: number;
  timestamp: number;
}

export interface PickCardResponse {
  success: boolean;
  error?: string;
  nextPackId?: string;
  remainingCards?: string[];
}

/**
 * Event: draft:pass_pack
 * Sent when a player passes the remaining pack after picking
 */
export interface PassPackRequest {
  sessionId: string;
  playerId: string;
  packId: string;
  direction: 'left' | 'right';
  timestamp: number;
}

export interface PassPackResponse {
  success: boolean;
  error?: string;
}

/**
 * Event: draft:request_sync
 * Client requests full state sync (usually after reconnection)
 */
export interface RequestSyncRequest {
  sessionId: string;
  playerId: string;
  lastSyncVersion?: number;
}

// ============================================================================
// Server → Client Events
// ============================================================================

/**
 * Event: draft:sync_state
 * Server broadcasts complete draft state to all clients
 */
export interface SyncStateEvent {
  sessionId: string;
  syncVersion: number;
  timestamp: number;
  
  sessionStatus: 'waiting' | 'drafting' | 'deck_building' | 'submitting' | 'complete';
  currentRound: number;
  currentPack: number;
  
  // Who we're waiting for
  waitingForPlayers: Array<{
    playerId: string;
    playerName: string;
    seatPosition: number;
  }>;
  
  // Who has completed their pick
  readyPlayers: Array<{
    playerId: string;
    playerName: string;
    seatPosition: number;
  }>;
  
  // Pack rotation info
  packRotation: {
    direction: 'left' | 'right';
    nextRotationAt?: number; // timestamp when packs will rotate
  };
}

/**
 * Event: draft:pack_received
 * Server sends a new pack to a specific player
 */
export interface PackReceivedEvent {
  sessionId: string;
  playerId: string;
  packId: string;
  cards: Array<{
    cardId: string;
    name: string;
    manaCost: string;
    type: string;
    rarity: string;
    imageUrl: string;
  }>;
  packNumber: number;
  roundNumber: number;
  picksRemaining: number;
}

/**
 * Event: draft:waiting_update
 * Server updates waiting status during pick phase
 */
export interface WaitingUpdateEvent {
  sessionId: string;
  timestamp: number;
  
  totalPlayers: number;
  playersReady: number;
  playersWaiting: Array<{
    playerId: string;
    playerName: string;
    timeRemaining?: number; // seconds until auto-pick
  }>;
  
  estimatedWaitTime?: number; // seconds
  yourStatus: 'picking' | 'waiting' | 'ready';
}

/**
 * Event: draft:player_timeout
 * Server notifies when a player times out on a pick
 */
export interface PlayerTimeoutEvent {
  sessionId: string;
  playerId: string;
  playerName: string;
  autopickedCard?: {
    cardId: string;
    name: string;
  };
  timeoutDuration: number;
}

/**
 * Event: draft:player_reconnected
 * Server notifies when a player reconnects
 */
export interface PlayerReconnectedEvent {
  sessionId: string;
  playerId: string;
  playerName: string;
  missedPicks: number;
  currentStatus: 'picking' | 'waiting' | 'ready';
}

/**
 * Event: draft:round_complete
 * Server notifies when a draft round completes
 */
export interface RoundCompleteEvent {
  sessionId: string;
  roundNumber: number;
  nextRoundStartsAt?: number; // timestamp
  isLastRound: boolean;
}

/**
 * Event: draft:phase_transition
 * Server notifies when draft phase changes
 */
export interface PhaseTransitionEvent {
  sessionId: string;
  fromPhase: 'waiting' | 'drafting' | 'deck_building' | 'submitting';
  toPhase: 'drafting' | 'deck_building' | 'submitting' | 'complete';
  timestamp: number;
  metadata?: {
    deckBuildingTimeLimit?: number; // seconds
    submissionDeadline?: number; // timestamp
  };
}

// ============================================================================
// Error Events
// ============================================================================

/**
 * Event: draft:error
 * Server sends error information
 */
export interface DraftErrorEvent {
  sessionId: string;
  playerId?: string;
  errorCode: string;
  errorMessage: string;
  severity: 'warning' | 'error' | 'critical';
  retryable: boolean;
  context?: Record<string, unknown>;
}

// ============================================================================
// Socket.io Namespace Types
// ============================================================================

/**
 * Type-safe socket interface for draft events
 */
export interface DraftClientToServerEvents {
  'draft:pick_card': (data: PickCardRequest, callback: (response: PickCardResponse) => void) => void;
  'draft:pass_pack': (data: PassPackRequest, callback: (response: PassPackResponse) => void) => void;
  'draft:request_sync': (data: RequestSyncRequest) => void;
}

export interface DraftServerToClientEvents {
  'draft:sync_state': (data: SyncStateEvent) => void;
  'draft:pack_received': (data: PackReceivedEvent) => void;
  'draft:waiting_update': (data: WaitingUpdateEvent) => void;
  'draft:player_timeout': (data: PlayerTimeoutEvent) => void;
  'draft:player_reconnected': (data: PlayerReconnectedEvent) => void;
  'draft:round_complete': (data: RoundCompleteEvent) => void;
  'draft:phase_transition': (data: PhaseTransitionEvent) => void;
  'draft:error': (data: DraftErrorEvent) => void;
}

// ============================================================================
// Validation Functions
// ============================================================================

export function isPickCardRequest(data: unknown): data is PickCardRequest {
  return (
    typeof data === 'object' &&
    data !== null &&
    'sessionId' in data &&
    'playerId' in data &&
    'cardId' in data &&
    'packId' in data
  );
}

export function isSyncStateEvent(data: unknown): data is SyncStateEvent {
  return (
    typeof data === 'object' &&
    data !== null &&
    'sessionId' in data &&
    'syncVersion' in data &&
    'sessionStatus' in data
  );
}

export function isPackReceivedEvent(data: unknown): data is PackReceivedEvent {
  return (
    typeof data === 'object' &&
    data !== null &&
    'sessionId' in data &&
    'packId' in data &&
    'cards' in data &&
    Array.isArray((data as Record<string, unknown>).cards)
  );
}