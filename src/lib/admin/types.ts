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
<<<<<<< HEAD
=======

export interface AdminActionResult {
  action: string;
  status: "ok" | "error";
  message: string;
  details?: Record<string, unknown>;
}
>>>>>>> 4817179ce504700699079e7411e1e60c07eec641
