/**
 * Tournament System Constants
 * Centralized constants for tournament functionality
 */

// Tournament Player Limits
export const TOURNAMENT_PLAYER_LIMITS = {
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 32,
  DEFAULT_MAX_PLAYERS: 8,
  RECOMMENDED_MIN_FOR_SWISS: 4, // Swiss pairing works better with 4+ players
} as const;

// Tournament Status Values
export const TOURNAMENT_STATUS = {
  REGISTERING: 'registering',
  PREPARING: 'preparing', 
  ACTIVE: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
} as const;

// Tournament Formats
export const TOURNAMENT_FORMATS = {
  SEALED: 'sealed',
  DRAFT: 'draft',
  CONSTRUCTED: 'constructed'
} as const;

// Tournament Phase Timeouts (in minutes)
export const TOURNAMENT_TIMEOUTS = {
  REGISTRATION_PHASE: {
    DEFAULT: 30, // 30 minutes to register
    MIN: 5,
    MAX: 120
  },
  PREPARATION_PHASE: {
    SEALED: {
      PACK_OPENING: 5, // 5 minutes to open packs
      DECK_BUILDING: 30, // 30 minutes to build deck
      DEFAULT: 35
    },
    DRAFT: {
      PICK_TIME: 90, // 90 seconds per pick
      DECK_BUILDING: 30, // 30 minutes to build deck after draft
      MIN_PICK_TIME: 30,
      MAX_PICK_TIME: 300
    },
    CONSTRUCTED: {
      DECK_SELECTION: 15, // 15 minutes to select and validate deck
      DEFAULT: 15
    }
  },
  MATCH_PHASE: {
    ROUND_TIME: 60, // 60 minutes per round
    MATCH_TIME: 50, // 50 minutes per individual match
    MIN_MATCH_TIME: 10,
    MAX_MATCH_TIME: 180,
    BREAK_BETWEEN_ROUNDS: 5 // 5 minutes between rounds
  }
} as const;

// Swiss Pairing Constants
export const SWISS_PAIRING = {
  MAX_ROUNDS: {
    2: 1,   // 2 players: 1 round (direct match)
    3: 2,   // 3 players: 2 rounds
    4: 2,   // 4 players: 2 rounds
    8: 3,   // 8 players: 3 rounds
    16: 4,  // 16 players: 4 rounds
    32: 5   // 32 players: 5 rounds
  },
  OPTIMAL_ROUNDS: {
    2: 1,
    3: 2, 
    4: 2,
    8: 3,
    16: 4,
    32: 5
  },
  // Points system
  MATCH_WIN_POINTS: 3,
  MATCH_DRAW_POINTS: 1,
  MATCH_LOSS_POINTS: 0,
  // Bye handling for odd number of players
  BYE_WIN_POINTS: 3
} as const;

// Tournament Statistics Constants
export const TOURNAMENT_STATS = {
  TIEBREAKER_TYPES: {
    OPPONENT_MATCH_WIN_PERCENTAGE: 'opponentMatchWinPercentage',
    GAME_WIN_PERCENTAGE: 'gameWinPercentage',
    OPPONENT_GAME_WIN_PERCENTAGE: 'opponentGameWinPercentage'
  },
  MIN_MATCHES_FOR_STATS: 1,
  STATS_UPDATE_INTERVAL_MS: 5000 // Update stats every 5 seconds
} as const;

// Real-time Socket Events
export const TOURNAMENT_SOCKET_EVENTS = {
  // Client to Server
  JOIN_TOURNAMENT: 'tournament:join',
  LEAVE_TOURNAMENT: 'tournament:leave',
  UPDATE_PREPARATION: 'tournament:preparation:update',
  SUBMIT_MATCH_RESULT: 'tournament:match:submit',
  
  // Server to Client
  TOURNAMENT_UPDATED: 'tournament:updated',
  PHASE_CHANGED: 'tournament:phase:changed',
  ROUND_STARTED: 'tournament:round:started',
  MATCH_ASSIGNED: 'tournament:match:assigned',
  STATISTICS_UPDATED: 'tournament:statistics:updated',
  PLAYER_JOINED: 'tournament:player:joined',
  PLAYER_LEFT: 'tournament:player:left',
  DRAFT_READY: 'tournament:draft:ready',
  PRESENCE_UPDATED: 'tournament:presence',
  ERROR: 'tournament:error'
} as const;

// Tournament Format Specific Constants
export const FORMAT_REQUIREMENTS = {
  SEALED: {
    MIN_PACKS: 3,
    MAX_PACKS: 10,
    DEFAULT_PACKS: 6,
    RECOMMENDED_PACKS_PER_SET: 6,
    MIN_DECK_SIZE: 40,
    MAX_DECK_SIZE: 100 // No upper limit in practice, but reasonable constraint
  },
  DRAFT: {
    MIN_PACKS: 2,
    MAX_PACKS: 5,
    DEFAULT_PACKS: 3,
    PACKS_PER_PLAYER: 3,
    MIN_PACK_SIZE: 8,
    MAX_PACK_SIZE: 20,
    MIN_DECK_SIZE: 40,
    MAX_DECK_SIZE: 100
  },
  CONSTRUCTED: {
    MIN_DECK_SIZE: 60,
    MAX_DECK_SIZE: 100,
    MAX_COPIES_PER_CARD: 4,
    ALLOWED_FORMATS: ['standard', 'modern', 'legacy', 'vintage'] as const
  }
} as const;

// Performance and Scaling Constants
export const PERFORMANCE_LIMITS = {
  MAX_CONCURRENT_TOURNAMENTS: 50,
  MAX_SPECTATORS_PER_TOURNAMENT: 100,
  MAX_CHAT_MESSAGES_PER_MINUTE: 30,
  DATABASE_QUERY_TIMEOUT_MS: 5000,
  SOCKET_EVENT_RATE_LIMIT_PER_SECOND: 10,
  STATISTICS_CALCULATION_BATCH_SIZE: 100
} as const;

// UI Constants
export const UI_CONSTANTS = {
  TOURNAMENT_CARD_ASPECT_RATIO: 16 / 9,
  STATISTICS_REFRESH_INTERVAL_MS: 3000,
  TOAST_DURATION_MS: 5000,
  LOADING_SKELETON_ANIMATION_MS: 1500,
  PHASE_TRANSITION_ANIMATION_MS: 800
} as const;

// Validation Patterns
export const VALIDATION_PATTERNS = {
  TOURNAMENT_NAME: {
    MIN_LENGTH: 3,
    MAX_LENGTH: 100,
    PATTERN: /^[a-zA-Z0-9\s\-_().]+$/ // Alphanumeric, spaces, hyphens, underscores, parentheses, periods
  },
  UUID_PATTERN: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
} as const;

// Helper functions for tournament round calculations
export function calculateOptimalRounds(playerCount: number): number {
  if (playerCount <= 2) return 1;
  if (playerCount <= 4) return 2;
  if (playerCount <= 8) return 3;
  if (playerCount <= 16) return 4;
  return 5; // For 17-32 players
}

export function calculateMaxRounds(playerCount: number): number {
  // Maximum rounds before it becomes excessive
  return Math.min(calculateOptimalRounds(playerCount) + 1, 6);
}

// Type exports for type safety
export type TournamentStatus = typeof TOURNAMENT_STATUS[keyof typeof TOURNAMENT_STATUS];
export type TournamentFormat = typeof TOURNAMENT_FORMATS[keyof typeof TOURNAMENT_FORMATS];
export type TournamentSocketEvent = typeof TOURNAMENT_SOCKET_EVENTS[keyof typeof TOURNAMENT_SOCKET_EVENTS];
