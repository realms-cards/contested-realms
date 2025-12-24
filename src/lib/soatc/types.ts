/**
 * SOATC League Integration Types
 * Types for interacting with the Sorcerers at the Core ranking API
 */

export interface SoatcParticipant {
  id: string; // SOATC UUID
  name: string;
  email_hash?: string;
  play_network_email_hash?: string;
}

export interface SoatcTournament {
  id: string; // SOATC tournament UUID
  name: string;
  game_type: "constructed" | "draft" | "sealed";
  description?: string;
  start_date: string;
  end_date: string;
  is_ongoing: boolean;
  is_upcoming: boolean;
  is_finished: boolean;
  realms_cards_allowed: boolean;
  players_count: number;
  organizer?: {
    id: string;
    name: string;
  };
  participants?: SoatcParticipant[];
}

export interface SoatcTournamentsResponse {
  data: SoatcTournament[];
  links?: {
    first: string;
    last: string;
    prev: string | null;
    next: string | null;
  };
  meta?: {
    current_page: number;
    from: number;
    last_page: number;
    per_page: number;
    to: number;
    total: number;
  };
}

export interface SoatcTournamentDetailsResponse extends SoatcTournament {
  participants: SoatcParticipant[];
}

export interface TournamentInfo {
  id: string;
  name: string;
  gameType: string;
  playersCount?: number;
  startDate?: string;
  endDate?: string;
}

export interface TournamentParticipationResult {
  isParticipant: boolean;
  noUuid?: boolean;
  tournament?: TournamentInfo;
  /** All tournaments the player is registered for */
  tournaments?: TournamentInfo[];
  error?: string;
}

export interface LeagueMatchResultPlayer {
  soatcUuid: string;
  displayName: string;
  realmsUserId: string;
}

export interface LeagueMatchResult {
  matchId: string;
  tournamentId: string;
  tournamentName: string;
  player1: LeagueMatchResultPlayer;
  player2: LeagueMatchResultPlayer;
  winnerId: string | null; // SOATC UUID
  loserId: string | null; // SOATC UUID
  isDraw: boolean;
  format: "constructed" | "sealed" | "draft";
  startedAt: string; // ISO 8601
  completedAt: string; // ISO 8601
  durationSeconds: number;
  replayId: string | null;
  replayUrl: string | null;
  timestamp: string; // When this object was generated
  signature: string; // HMAC-SHA256
}
