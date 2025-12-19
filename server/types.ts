export type AnyRecord = Record<string, unknown>;

export type Seat = "p1" | "p2";

export type MatchPatch = Record<string, unknown>;

export type PlayerLocation =
  | "lobby"
  | "match"
  | "collection"
  | "decks"
  | "browsing"
  | "offline";

export interface PlayerState {
  id: string;
  displayName: string;
  socketId: string | null;
  lobbyId: string | null;
  matchId: string | null;
  location?: PlayerLocation;
}

export interface ServerMatchState extends AnyRecord {
  id: string;
  playerIds: string[];
  status: string;
  matchType: string;
  lobbyId?: string | null;
  lobbyName?: string | null;
  roundId?: string | null;
  draftSessionId?: string | null;
  draftState?: AnyRecord | null;
  draftConfig?: AnyRecord | null;
  playerDecks?: Map<string, unknown> | null;
  sealedPacks?: AnyRecord | null;
  game?:
    | (AnyRecord & {
        winner?: Seat | null;
        matchEnded?: boolean;
        results?: unknown;
      })
    | null;
  players?: AnyRecord;
  seed?: string | null;
  turn?: string | null;
  lastTs?: number;
  tournamentId?: string | null;
  winnerId?: string | null;
  loserId?: string | null;
  _finalized?: boolean;
  _cleanupTimer?: NodeJS.Timeout | null;
  interactionGrants?: Map<string, AnyRecord[]>;
  interactionRequests?: Map<string, AnyRecord>;
  mulliganDone?: Set<string>;
  playerReady?: { p1?: boolean; p2?: boolean };
}

export interface LobbyState extends AnyRecord {
  id: string;
  name: string | null;
  hostId: string | null;
  playerIds: Set<string>;
  status: string;
  maxPlayers: number;
  ready: Set<string>;
  visibility: "open" | "private";
  plannedMatchType?: string | null;
  lastActive: number;
}

export interface VoiceParticipant {
  id: string;
  displayName: string | null;
  lobbyId: string | null;
  matchId: string | null;
  roomId: string | null;
  joinedAt: number;
}

export interface PendingVoiceRequest {
  id: string;
  from: string;
  to: string;
  lobbyId: string | null;
  matchId: string | null;
  createdAt: number;
}

export interface DraftPresenceEntry {
  playerId: string;
  playerName: string | null;
  isConnected: boolean;
  lastActivity: number;
}

// Rate limiting types for socket events
export interface TokenBucket {
  tokens: number;
  lastRefill: number;
  capacity: number;
  refillRate: number; // tokens per second
  refillInterval: number; // milliseconds
}

export interface RateLimiterConfig {
  capacity: number;
  refillRate: number;
  refillInterval: number;
}

export interface SocketRateLimits {
  chat: TokenBucket;
  cursor: TokenBucket;
  message: TokenBucket;
}

// Metrics types for Prometheus instrumentation
export interface HotPathMetrics {
  cursorRecvTotal: number;
  cursorSentTotal: number;
  chatRecvTotal: number;
  chatSentTotal: number;
  lobbiesUpdatedSentTotal: number;
  rateLimitHitsTotal: Map<string, number>; // key: event type
}
