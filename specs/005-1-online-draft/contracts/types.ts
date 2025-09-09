/**
 * Shared TypeScript types for Draft contracts
 * Strongly typed interfaces used across multiple contract files
 */

/**
 * Core Card type used throughout the draft system
 */
export interface Card {
  cardId: string;
  name: string;
  set: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'mythic';
  manaCost: string;
  type: string;
  imageUrl: string;
  variantId?: string;
  pickOrder?: number;
  source: 'draft' | 'standard' | 'sideboard';
  
  // Additional metadata
  colors?: string[];
  convertedManaCost?: number;
  power?: string;
  toughness?: string;
  oracleText?: string;
}

/**
 * Player identification and status
 */
export interface PlayerInfo {
  playerId: string;
  playerName: string;
  seatPosition: number;
  connectionStatus: 'connected' | 'disconnected' | 'reconnecting';
  avatar?: string;
}

/**
 * Session timing configuration
 */
export interface TimingConfig {
  pickTimeLimit: number; // seconds per pick
  deckBuildTimeLimit: number; // seconds for deck building
  disconnectGracePeriod: number; // seconds before bot takeover
  submissionDeadline: number; // seconds for deck submission
}

/**
 * Draft format configuration
 */
export interface DraftFormat {
  format: 'standard' | 'limited' | 'cube' | 'custom';
  packsPerPlayer: number;
  cardsPerPack: number;
  minimumDeckSize: number;
  sideboardLimit: number;
}

/**
 * Common error structure
 */
export interface DraftError {
  code: string;
  message: string;
  severity: 'warning' | 'error' | 'critical';
  retryable: boolean;
  context?: Record<string, unknown>;
}

/**
 * Pagination for large data sets
 */
export interface PaginationParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Generic success/failure response
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: DraftError;
  timestamp: number;
}

// ============================================================================
// Type Guards
// ============================================================================

export function isCard(obj: unknown): obj is Card {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'cardId' in obj &&
    'name' in obj &&
    'manaCost' in obj
  );
}

export function isPlayerInfo(obj: unknown): obj is PlayerInfo {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'playerId' in obj &&
    'playerName' in obj &&
    'seatPosition' in obj
  );
}

export function isDraftError(obj: unknown): obj is DraftError {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'code' in obj &&
    'message' in obj &&
    'severity' in obj
  );
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Makes specific properties optional
 */
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Makes specific properties required
 */
export type RequiredBy<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

/**
 * Extract event payload type from event map
 */
export type EventPayload<
  T extends Record<string, (...args: unknown[]) => void>,
  K extends keyof T
> = Parameters<T[K]>[0];

/**
 * Extract callback response type from event map
 */
export type CallbackResponse<
  T extends Record<string, (...args: unknown[]) => void>,
  K extends keyof T
> = Parameters<T[K]>[1] extends (response: infer R) => void ? R : never;

// ============================================================================
// Constants
// ============================================================================

export const DRAFT_EVENTS = {
  // Client to Server
  PICK_CARD: 'draft:pick_card',
  PASS_PACK: 'draft:pass_pack',
  REQUEST_SYNC: 'draft:request_sync',
  DECK_SUBMIT: 'draft:deck_submit',
  DECK_SAVE: 'draft:deck_save',
  DECK_RECALL: 'draft:deck_recall',
  STANDARD_CARDS_REQUEST: 'draft:standard_cards_request',
  
  // Server to Client
  SYNC_STATE: 'draft:sync_state',
  PACK_RECEIVED: 'draft:pack_received',
  WAITING_UPDATE: 'draft:waiting_update',
  PLAYER_TIMEOUT: 'draft:player_timeout',
  PLAYER_RECONNECTED: 'draft:player_reconnected',
  ROUND_COMPLETE: 'draft:round_complete',
  PHASE_TRANSITION: 'draft:phase_transition',
  SUBMISSION_UPDATE: 'draft:submission_update',
  ALL_SUBMITTED: 'draft:all_submitted',
  SUBMISSION_DEADLINE: 'draft:submission_deadline',
  DECK_VALIDATION_ERROR: 'draft:deck_validation_error',
  DECK_AUTO_SAVED: 'draft:deck_auto_saved',
  WAITING_OVERLAY_SHOW: 'draft:waiting_overlay_show',
  WAITING_OVERLAY_UPDATE: 'draft:waiting_overlay_update',
  WAITING_OVERLAY_HIDE: 'draft:waiting_overlay_hide',
  ERROR: 'draft:error',
} as const;

export const DRAFT_PHASES = {
  WAITING: 'waiting',
  DRAFTING: 'drafting',
  DECK_BUILDING: 'deck_building',
  SUBMITTING: 'submitting',
  COMPLETE: 'complete',
} as const;

export const CONNECTION_STATUS = {
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  RECONNECTING: 'reconnecting',
} as const;

export const CARD_RARITY = {
  COMMON: 'common',
  UNCOMMON: 'uncommon',
  RARE: 'rare',
  MYTHIC: 'mythic',
} as const;

export const ERROR_SEVERITY = {
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical',
} as const;