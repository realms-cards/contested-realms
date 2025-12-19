export type ConnectionTestStatus = "ok" | "error" | "skipped";

export interface ConnectionTestResult {
  id: string;
  label: string;
  status: ConnectionTestStatus;
  latencyMs?: number;
  details?: string;
}

export interface AdminStats {
  totals: {
    users: number;
    tournaments: number;
    activeTournaments: number;
    matches: number;
    replaySessions: number;
    leaderboardEntries: number;
  };
  updatedAt: string;
}

export interface AdminActionResult {
  action: string;
  status: "ok" | "error";
  message: string;
  details?: Record<string, unknown>;
}

export interface HealthSnapshot {
  id: string;
  timestamp: string;
  connections: ConnectionTestResult[];
  stats: AdminStats;
}

export interface AdminUserSummary {
  id: string;
  name: string | null;
  createdAt: string | null;
  lastSeenAt: string | null;
  matchCount: number;
  tournamentRegistrations: number;
  patronTier: string | null;
}

export interface AdminErrorRecord {
  id: string;
  timestamp: string;
  eventType: string;
  success: boolean;
  statusCode: number | null;
  errorMessage: string | null;
  targetUrl: string;
  retryCount: number;
}

export interface AdminJobStatus {
  id: string;
  label: string;
  queued: number;
  inProgress: number;
  failed: number;
  updatedAt: string;
  details?: string;
}

export interface AdminSessionInfo {
  id: string;
  type: "match" | "draft" | "tournament";
  status: string;
  playerCount: number;
  description: string;
  startedAt: string | null;
  updatedAt: string | null;
}

export interface UsageSnapshot {
  period: "24h" | "7d";
  newUsers: number;
  matchesCompleted: number;
  tournamentsStarted: number;
  draftsStarted: number;
  activeUsers: number;
  generatedAt: string;
}

export interface ActiveMatchInfo {
  matchId: string;
  playerIds: string[];
  playerNames: string[];
  matchType: string;
  status: string;
  lobbyName: string | null;
  startedAt: number | null;
  tournamentId: string | null;
}

export interface RecentMatchInfo {
  matchId: string;
  playerNames: string[];
  matchType: string;
  winnerId: string | null;
  winnerName: string | null;
  completedAt: string;
  duration: number | null;
  tournamentId: string | null;
}

export interface AdminTournamentInfo {
  id: string;
  name: string;
  status: string;
  format: string;
  createdAt: string | null;
  startedAt: string | null;
  currentRound: number;
  maxRounds: number;
  creatorId: string | null;
  creatorName: string | null;
  playerCount: number;
  matchCount: number;
}
