/**
 * Open Tournament Types
 * Type definitions for the modular open tournament system
 */

/** Settings stored in Tournament.settings JSON for open format tournaments */
export interface OpenTournamentSettings {
  mode: "open";
  /** Play Network event page URL (link only, no API) */
  playNetworkUrl?: string;
  matchResolution: {
    /** Allow playing matches on Realms */
    allowRealms: boolean;
    /** Allow manually reporting match results (TTS, paper, etc.) */
    allowManualReport: boolean;
    /** Host must confirm manually reported results */
    requireHostApproval: boolean;
  };
  pairing: {
    /** Default pairing mode — host can override per round */
    source: "swiss" | "manual";
    /** Total planned rounds (optional, for display purposes) */
    totalRounds?: number;
  };
}

/** Source of a match result */
export type MatchResultSource = "realms" | "manual" | "tts";

/** Match result submission */
export interface OpenMatchResult {
  winnerId: string;
  loserId: string;
  isDraw: boolean;
  source: MatchResultSource;
}

/** Manual pairing entry from the host */
export interface ManualPairing {
  player1Id: string;
  player2Id: string;
}

/** Pairing request body */
export interface PairingRequest {
  source: "swiss" | "manual";
  /** Required when source is 'manual' */
  pairings?: ManualPairing[];
}

/** Player data in open tournament context */
export interface OpenTournamentPlayer {
  playerId: string;
  displayName: string;
  deckId?: string;
  curiosaUrl?: string;
  wins: number;
  losses: number;
  draws: number;
  matchPoints: number;
}

/** Default settings for new open tournaments */
export const DEFAULT_OPEN_TOURNAMENT_SETTINGS: OpenTournamentSettings = {
  mode: "open",
  matchResolution: {
    allowRealms: true,
    allowManualReport: true,
    requireHostApproval: true,
  },
  pairing: {
    source: "swiss",
  },
};
