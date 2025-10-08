/**
 * Broadcast Service Contract
 *
 * Defines the interface for tournament event broadcasting.
 * Eliminates global broadcasts, adds event deduplication.
 */

export interface BroadcastService {
  /**
   * Emit phase change event to tournament participants
   * @param tournamentId - Tournament identifier
   * @param newPhase - New phase name
   * @param additionalData - Optional metadata
   */
  emitPhaseChanged(
    tournamentId: string,
    newPhase: string,
    additionalData?: Record<string, unknown>
  ): Promise<void>;

  /**
   * Emit full tournament update to participants
   * @param tournamentId - Tournament identifier
   * @param tournamentData - Full tournament state
   */
  emitTournamentUpdate(
    tournamentId: string,
    tournamentData: Record<string, unknown>
  ): Promise<void>;

  /**
   * Emit draft ready event to participants
   * @param tournamentId - Tournament identifier
   * @param draftSessionId - Draft session identifier
   * @param totalPlayers - Number of players in draft
   */
  emitDraftReady(
    tournamentId: string,
    draftSessionId: string,
    totalPlayers: number
  ): Promise<void>;

  /**
   * Emit round started event to participants
   * @param tournamentId - Tournament identifier
   * @param roundNumber - Round number (1-indexed)
   * @param matches - Match data for this round
   */
  emitRoundStarted(
    tournamentId: string,
    roundNumber: number,
    matches: Array<Record<string, unknown>>
  ): Promise<void>;

  /**
   * Emit matches ready event to participants
   * @param tournamentId - Tournament identifier
   * @param matches - Match data
   */
  emitMatchesReady(
    tournamentId: string,
    matches: Array<Record<string, unknown>>
  ): Promise<void>;
}

/**
 * Broadcast Event Types
 */
export enum BroadcastEventType {
  PHASE_CHANGED = 'PHASE_CHANGED',
  TOURNAMENT_UPDATED = 'TOURNAMENT_UPDATED',
  DRAFT_READY = 'DRAFT_READY',
  ROUND_STARTED = 'ROUND_STARTED',
  MATCHES_READY = 'MATCHES_READY',
}

/**
 * Broadcast Event Payload
 */
export interface BroadcastEvent {
  tournamentId: string;
  eventType: BroadcastEventType;
  payload: Record<string, unknown>;
  timestamp: string; // ISO 8601
  roomTarget: string; // e.g., "tournament:123"
}

/**
 * Broadcast Health Check
 */
export interface BroadcastHealthCheck {
  eventType: string;
  tournamentId?: string;
  targetUrl: string;
  success: boolean;
  statusCode?: number;
  errorMessage?: string;
  retryCount: number;
  latencyMs: number;
  timestamp: string;
}

/**
 * Expected Behavior:
 *
 * 1. All emissions target specific tournament room (no global broadcasts)
 * 2. Events are deduplicated within 5-second window
 * 3. All events are logged to TournamentBroadcastEvent table
 * 4. Failed emissions are retried up to 2 times with exponential backoff
 * 5. Health metrics are recorded in SocketBroadcastHealth table
 */

/**
 * Error Scenarios:
 *
 * - Socket.IO server not running → Retry 2x, then log failure
 * - Tournament room has no members → Emit anyway (members may join late)
 * - Duplicate event within 5s → Skip emission, log warning
 * - Invalid tournamentId → Throw error immediately (no retry)
 */
