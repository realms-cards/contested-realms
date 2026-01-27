"use client";

import clsx from "clsx";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CustomSelect } from "@/components/ui/CustomSelect";
import type {
  ActiveMatchInfo,
  AdminActionResult,
  AdminStats,
  ConnectionTestResult,
  AdminUserSummary,
  HealthSnapshot,
  AdminErrorRecord,
  AdminJobStatus,
  AdminSessionInfo,
  UsageSnapshot,
  RecentMatchInfo,
  AdminTournamentInfo,
} from "@/lib/admin/types";

type ActionDescriptor = {
  id: string;
  label: string;
  description: string;
  dangerous?: boolean;
};

type AdminDashboardProps = {
  adminName?: string | null;
  initialStats: AdminStats;
  initialConnections: ConnectionTestResult[];
  initialStatusTimestamp: string;
  actions: ActionDescriptor[];
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function formatTimestamp(timestamp: string | null | undefined): string {
  if (!timestamp) return "unknown";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "medium",
    }).format(new Date(timestamp));
  } catch {
    return timestamp;
  }
}

export default function AdminDashboard({
  adminName,
  initialStats,
  initialConnections,
  initialStatusTimestamp,
  actions,
}: AdminDashboardProps) {
  const [stats, setStats] = useState<AdminStats>(initialStats);
  const [connections, setConnections] =
    useState<ConnectionTestResult[]>(initialConnections);
  const [statusTimestamp, setStatusTimestamp] = useState<string>(
    initialStatusTimestamp
  );
  const [refreshingStatus, setRefreshingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionResults, setActionResults] = useState<
    Record<string, AdminActionResult>
  >({});
  const [healthHistory, setHealthHistory] = useState<HealthSnapshot[]>([]);
  const [loadingHealthHistory, setLoadingHealthHistory] = useState(false);
  const [healthHistoryError, setHealthHistoryError] = useState<string | null>(
    null
  );
  const [errorsData, setErrorsData] = useState<AdminErrorRecord[]>([]);
  const [errorsExpanded, setErrorsExpanded] = useState(false);
  const [errorsError, setErrorsError] = useState<string | null>(null);
  const [jobsData, setJobsData] = useState<AdminJobStatus[]>([]);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [sessionsData, setSessionsData] = useState<AdminSessionInfo[]>([]);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [usageData, setUsageData] = useState<UsageSnapshot[]>([]);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [users, setUsers] = useState<AdminUserSummary[] | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [usersNextCursor, setUsersNextCursor] = useState<string | null>(null);
  const [usersFetchedAt, setUsersFetchedAt] = useState<string | null>(null);
  const [activeMatches, setActiveMatches] = useState<ActiveMatchInfo[]>([]);
  const [activeMatchesLoading, setActiveMatchesLoading] = useState(false);
  const [activeMatchesError, setActiveMatchesError] = useState<string | null>(
    null
  );
  const [cleaningUpMatch, setCleaningUpMatch] = useState<string | null>(null);
  const [copiedMatchId, setCopiedMatchId] = useState<string | null>(null);
  const [recentMatches, setRecentMatches] = useState<RecentMatchInfo[]>([]);
  const [recentMatchesLoading, setRecentMatchesLoading] = useState(false);
  const [recentMatchesError, setRecentMatchesError] = useState<string | null>(
    null
  );
  const [updatingPatronTier, setUpdatingPatronTier] = useState<string | null>(
    null
  );
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const userSearchRef = useRef<string>("");
  const [tournaments, setTournaments] = useState<AdminTournamentInfo[]>([]);
  const [tournamentsLoading, setTournamentsLoading] = useState(false);
  const [tournamentsError, setTournamentsError] = useState<string | null>(null);
  const [closingTournament, setClosingTournament] = useState<string | null>(
    null
  );

  const refreshHealthHistory = useCallback(async () => {
    setLoadingHealthHistory(true);
    setHealthHistoryError(null);
    try {
      const response = await fetch("/api/admin/health-log?limit=20", {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error || `HTTP ${response.status}`);
      }
      const payload = (await response.json()) as {
        history: HealthSnapshot[];
      };
      setHealthHistory(payload.history ?? []);
    } catch (error) {
      setHealthHistoryError(
        error instanceof Error ? error.message : "Failed to load history"
      );
    } finally {
      setLoadingHealthHistory(false);
    }
  }, []);

  const refreshErrors = useCallback(async () => {
    setErrorsError(null);
    try {
      const response = await fetch("/api/admin/errors", {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error || `HTTP ${response.status}`);
      }
      const payload = (await response.json()) as {
        events: AdminErrorRecord[];
      };
      setErrorsData(payload.events ?? []);
    } catch (error) {
      setErrorsError(
        error instanceof Error ? error.message : "Failed to load errors"
      );
    }
  }, []);

  const refreshJobs = useCallback(async () => {
    setJobsError(null);
    try {
      const response = await fetch("/api/admin/jobs", {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error || `HTTP ${response.status}`);
      }
      const payload = (await response.json()) as {
        jobs: AdminJobStatus[];
      };
      setJobsData(payload.jobs ?? []);
    } catch (error) {
      setJobsError(
        error instanceof Error ? error.message : "Failed to load job status"
      );
    }
  }, []);

  const refreshSessions = useCallback(async () => {
    setSessionsError(null);
    try {
      const response = await fetch("/api/admin/sessions", {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error || `HTTP ${response.status}`);
      }
      const payload = (await response.json()) as {
        sessions: AdminSessionInfo[];
      };
      setSessionsData(payload.sessions ?? []);
    } catch (error) {
      setSessionsError(
        error instanceof Error ? error.message : "Failed to load sessions"
      );
    }
  }, []);

  const refreshUsage = useCallback(async () => {
    setUsageError(null);
    try {
      const response = await fetch("/api/admin/usage", {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error || `HTTP ${response.status}`);
      }
      const payload = (await response.json()) as {
        snapshots: UsageSnapshot[];
      };
      setUsageData(payload.snapshots ?? []);
    } catch (error) {
      setUsageError(
        error instanceof Error ? error.message : "Failed to load usage data"
      );
    }
  }, []);

  const refreshActiveMatches = useCallback(async () => {
    setActiveMatchesLoading(true);
    setActiveMatchesError(null);
    try {
      const response = await fetch("/api/admin/matches/active", {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error || `HTTP ${response.status}`);
      }
      const payload = (await response.json()) as {
        matches: ActiveMatchInfo[];
        total: number;
      };
      setActiveMatches(payload.matches ?? []);
    } catch (error) {
      setActiveMatchesError(
        error instanceof Error ? error.message : "Failed to load active matches"
      );
    } finally {
      setActiveMatchesLoading(false);
    }
  }, []);

  const refreshRecentMatches = useCallback(async () => {
    setRecentMatchesLoading(true);
    setRecentMatchesError(null);
    try {
      const response = await fetch("/api/admin/matches/recent?limit=50", {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error || `HTTP ${response.status}`);
      }
      const payload = (await response.json()) as {
        matches: RecentMatchInfo[];
        total: number;
      };
      setRecentMatches(payload.matches ?? []);
    } catch (error) {
      setRecentMatchesError(
        error instanceof Error ? error.message : "Failed to load recent matches"
      );
    } finally {
      setRecentMatchesLoading(false);
    }
  }, []);

  const cleanupMatch = useCallback(
    async (matchId: string) => {
      if (
        !confirm(
          `Are you sure you want to end match ${matchId.slice(
            0,
            8
          )}...? Players will be notified.`
        )
      ) {
        return;
      }
      setCleaningUpMatch(matchId);
      try {
        const response = await fetch("/api/admin/matches/cleanup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matchId }),
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error || `HTTP ${response.status}`);
        }
        await refreshActiveMatches();
      } catch (error) {
        setActiveMatchesError(
          error instanceof Error ? error.message : "Failed to cleanup match"
        );
      } finally {
        setCleaningUpMatch(null);
      }
    },
    [refreshActiveMatches]
  );

  const refreshTournaments = useCallback(async () => {
    setTournamentsLoading(true);
    setTournamentsError(null);
    try {
      const response = await fetch("/api/admin/tournaments", {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error || `HTTP ${response.status}`);
      }
      const payload = (await response.json()) as {
        tournaments: AdminTournamentInfo[];
        total: number;
      };
      setTournaments(payload.tournaments ?? []);
    } catch (error) {
      setTournamentsError(
        error instanceof Error ? error.message : "Failed to load tournaments"
      );
    } finally {
      setTournamentsLoading(false);
    }
  }, []);

  const closeTournament = useCallback(
    async (tournamentId: string, tournamentName: string) => {
      if (
        !confirm(
          `Are you sure you want to close tournament "${tournamentName}"? All active matches will be ended and players will be notified.`
        )
      ) {
        return;
      }
      setClosingTournament(tournamentId);
      try {
        const response = await fetch("/api/admin/tournaments/close", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tournamentId }),
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error || `HTTP ${response.status}`);
        }
        await refreshTournaments();
      } catch (error) {
        setTournamentsError(
          error instanceof Error ? error.message : "Failed to close tournament"
        );
      } finally {
        setClosingTournament(null);
      }
    },
    [refreshTournaments]
  );

  const copyMatchId = useCallback((matchId: string) => {
    navigator.clipboard.writeText(matchId).then(() => {
      setCopiedMatchId(matchId);
      setTimeout(() => setCopiedMatchId(null), 2000);
    });
  }, []);

  const updatePatronTier = useCallback(
    async (userId: string, patronTier: string | null) => {
      setUpdatingPatronTier(userId);
      try {
        const response = await fetch("/api/admin/users", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, patronTier }),
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error || `HTTP ${response.status}`);
        }
        // Update local state
        setUsers(
          (prev) =>
            prev?.map((u) => (u.id === userId ? { ...u, patronTier } : u)) ??
            null
        );
      } catch (error) {
        setUsersError(
          error instanceof Error
            ? error.message
            : "Failed to update patron tier"
        );
      } finally {
        setUpdatingPatronTier(null);
      }
    },
    []
  );

  const loadUsers = useCallback(
    async (mode: "initial" | "more" = "initial", searchQuery?: string) => {
      if (mode === "more" && !usersNextCursor) return;
      setUsersLoading(true);
      setUsersError(null);
      const query = searchQuery ?? userSearchRef.current;
      try {
        const params = new URLSearchParams();
        params.set("limit", "50");
        if (query && query.length > 1) {
          params.set("q", query);
        }
        if (mode === "more" && usersNextCursor) {
          params.set("cursor", usersNextCursor);
        }
        const response = await fetch(`/api/admin/users?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error || `HTTP ${response.status}`);
        }
        const payload = (await response.json()) as {
          users: AdminUserSummary[];
          nextCursor?: string | null;
          fetchedAt?: string;
        };
        setUsers((prev) => {
          if (mode === "more" && prev) {
            return [...prev, ...(payload.users ?? [])];
          }
          return payload.users ?? [];
        });
        setUsersNextCursor(payload.nextCursor ?? null);
        setUsersFetchedAt(payload.fetchedAt ?? new Date().toISOString());
      } catch (error) {
        setUsersError(
          error instanceof Error ? error.message : "Failed to load users"
        );
      } finally {
        setUsersLoading(false);
      }
    },
    [usersNextCursor]
  );

  const runConnectionRefresh = useCallback(async () => {
    setRefreshingStatus(true);
    setStatusError(null);
    try {
      const response = await fetch("/api/admin/status", {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error || `HTTP ${response.status}`);
      }
      const payload = (await response.json()) as {
        connections: ConnectionTestResult[];
        stats: AdminStats;
        generatedAt?: string;
      };
      setConnections(payload.connections);
      setStats(payload.stats);
      setStatusTimestamp(
        payload.generatedAt ||
          payload.stats.updatedAt ||
          new Date().toISOString()
      );
      await Promise.allSettled([
        refreshHealthHistory(),
        refreshErrors(),
        refreshJobs(),
        refreshSessions(),
        refreshUsage(),
        refreshActiveMatches(),
        refreshRecentMatches(),
        refreshTournaments(),
      ]);
    } catch (error) {
      setStatusError(
        error instanceof Error ? error.message : "Failed to refresh status"
      );
    } finally {
      setRefreshingStatus(false);
    }
  }, [
    refreshActiveMatches,
    refreshErrors,
    refreshHealthHistory,
    refreshJobs,
    refreshRecentMatches,
    refreshSessions,
    refreshTournaments,
    refreshUsage,
  ]);

  useEffect(() => {
    void refreshHealthHistory();
    void refreshErrors();
    void refreshJobs();
    void refreshSessions();
    void refreshUsage();
    void refreshActiveMatches();
    void refreshRecentMatches();
    void refreshTournaments();
  }, [
    refreshActiveMatches,
    refreshErrors,
    refreshHealthHistory,
    refreshJobs,
    refreshRecentMatches,
    refreshSessions,
    refreshTournaments,
    refreshUsage,
  ]);

  const runAdminAction = useCallback(
    async (actionId: string) => {
      setActionBusy(actionId);
      try {
        const response = await fetch("/api/admin/actions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action: actionId }),
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error || `HTTP ${response.status}`);
        }
        const result = (await response.json()) as AdminActionResult;
        setActionResults((prev) => ({
          ...prev,
          [actionId]: result,
        }));
        if (result.status === "ok") {
          await runConnectionRefresh();
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Action failed";
        setActionResults((prev) => ({
          ...prev,
          [actionId]: {
            action: actionId,
            status: "error",
            message,
          },
        }));
      } finally {
        setActionBusy(null);
      }
    },
    [runConnectionRefresh]
  );

  const connectionStatusSummaries = useMemo(() => {
    return connections.map((conn) => {
      const statusClass =
        conn.status === "ok"
          ? "bg-emerald-500/10 border-emerald-400/50 text-emerald-200"
          : conn.status === "skipped"
          ? "bg-slate-700/40 border-slate-500/50 text-slate-200"
          : "bg-rose-500/10 border-rose-400/60 text-rose-200";
      return { ...conn, statusClass };
    });
  }, [connections]);

  const actionDescriptors = useMemo(() => {
    return actions.map((action) => ({
      ...action,
      result: actionResults[action.id],
    }));
  }, [actions, actionResults]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-10">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-white">
              Admin Control Room
            </h1>
            <p className="text-sm text-slate-400">
              Signed in as {adminName || "admin"} • Last refresh{" "}
              {formatTimestamp(statusTimestamp)}
            </p>
          </div>
          <button
            onClick={() => {
              void runConnectionRefresh();
            }}
            disabled={refreshingStatus}
            className={clsx(
              "inline-flex items-center justify-center rounded border px-4 py-2 text-sm font-medium transition",
              refreshingStatus
                ? "border-slate-500 bg-slate-800 text-slate-300"
                : "border-emerald-400 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
            )}
          >
            {refreshingStatus ? "Refreshing…" : "Run diagnostics"}
          </button>
        </header>

        {statusError && (
          <div className="rounded border border-rose-500/60 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            Diagnostics refresh failed: {statusError}
          </div>
        )}

        <section>
          <h2 className="text-lg font-semibold text-white">
            Snapshot statistics
          </h2>
          <p className="text-xs text-slate-400">
            Numbers are aggregated live from the database.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label="Registered users" value={stats.totals.users} />
            <StatCard
              label="Tournaments stored"
              value={stats.totals.tournaments}
              sublabel={`${formatNumber(
                stats.totals.activeTournaments
              )} active`}
            />
            <StatCard label="Matches recorded" value={stats.totals.matches} />
            <StatCard
              label="Replay sessions"
              value={stats.totals.replaySessions}
            />
            <StatCard
              label="Leaderboard entries"
              value={stats.totals.leaderboardEntries}
            />
            <StatCard
              label="Updated at"
              valueLabel={formatTimestamp(stats.updatedAt)}
            />
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Live Matches</h2>
              <p className="text-xs text-slate-400">
                Currently active matches on the server. Click to spectate.
              </p>
            </div>
            <button
              onClick={() => {
                void refreshActiveMatches();
              }}
              className="inline-flex items-center justify-center rounded border border-slate-600 px-3 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800"
              disabled={activeMatchesLoading}
            >
              {activeMatchesLoading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
          {activeMatchesError && (
            <div className="rounded border border-rose-500/50 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
              {activeMatchesError}
            </div>
          )}
          {activeMatchesLoading && activeMatches.length === 0 && (
            <div className="rounded border border-slate-800 bg-slate-900/50 px-3 py-4 text-center text-xs text-slate-300">
              Loading active matches…
            </div>
          )}
          {!activeMatchesLoading && activeMatches.length === 0 && (
            <div className="rounded border border-slate-800 bg-slate-900/50 px-3 py-2 text-xs text-slate-300">
              No active matches at the moment.
            </div>
          )}
          {activeMatches.length > 0 && (
            <div className="overflow-auto rounded border border-slate-800 bg-slate-900/40">
              <table className="min-w-full text-left text-xs text-slate-200">
                <thead className="bg-slate-900/70 text-[11px] uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Match ID</th>
                    <th className="px-3 py-2">Players</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Started</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {activeMatches.map((match) => {
                    const startedStr = match.startedAt
                      ? formatTimestamp(new Date(match.startedAt).toISOString())
                      : "—";
                    return (
                      <tr
                        key={match.matchId}
                        className="border-t border-slate-800/60 hover:bg-slate-800/30"
                      >
                        <td className="px-3 py-2">
                          <button
                            onClick={() => copyMatchId(match.matchId)}
                            className="font-mono text-[10px] hover:text-blue-300 cursor-pointer transition-colors"
                            title="Click to copy full match ID"
                          >
                            {copiedMatchId === match.matchId ? (
                              <span className="text-emerald-400">Copied!</span>
                            ) : (
                              <>{match.matchId.slice(0, 8)}…</>
                            )}
                          </button>
                        </td>
                        <td className="px-3 py-2">
                          <div
                            className="max-w-xs truncate"
                            title={match.playerNames.join(" vs ")}
                          >
                            {match.playerNames.join(" vs ")}
                          </div>
                          {match.lobbyName && (
                            <div className="text-[10px] text-slate-400">
                              {match.lobbyName}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span className="rounded bg-slate-700/50 px-1.5 py-0.5 text-[10px] uppercase">
                            {match.matchType}
                          </span>
                          {match.tournamentId && (
                            <span className="ml-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-200">
                              Tournament
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={clsx(
                              "rounded px-1.5 py-0.5 text-[10px]",
                              match.status === "playing"
                                ? "bg-emerald-500/20 text-emerald-200"
                                : match.status === "waiting"
                                ? "bg-amber-500/20 text-amber-200"
                                : "bg-slate-700/50 text-slate-300"
                            )}
                          >
                            {match.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-[10px] text-slate-400">
                          {startedStr}
                        </td>
                        <td className="px-3 py-2 flex gap-1">
                          <Link
                            href={`/online/play/${match.matchId}?watch=true`}
                            className="rounded bg-blue-600/20 px-2 py-1 text-[10px] text-blue-200 hover:bg-blue-600/30"
                          >
                            Spectate
                          </Link>
                          <button
                            onClick={() => cleanupMatch(match.matchId)}
                            disabled={cleaningUpMatch === match.matchId}
                            className={clsx(
                              "rounded px-2 py-1 text-[10px]",
                              cleaningUpMatch === match.matchId
                                ? "bg-slate-700/50 text-slate-400 cursor-wait"
                                : "bg-rose-600/20 text-rose-200 hover:bg-rose-600/30"
                            )}
                            title="End this match (players will be notified)"
                          >
                            {cleaningUpMatch === match.matchId
                              ? "Ending…"
                              : "End Match"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Recent Matches
              </h2>
              <p className="text-xs text-slate-400">
                Recently completed matches from the database. Click to view
                replay.
              </p>
            </div>
            <button
              onClick={() => {
                void refreshRecentMatches();
              }}
              className="inline-flex items-center justify-center rounded border border-slate-600 px-3 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800"
              disabled={recentMatchesLoading}
            >
              {recentMatchesLoading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
          {recentMatchesError && (
            <div className="rounded border border-rose-500/50 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
              {recentMatchesError}
            </div>
          )}
          {recentMatchesLoading && recentMatches.length === 0 && (
            <div className="rounded border border-slate-800 bg-slate-900/50 px-3 py-4 text-center text-xs text-slate-300">
              Loading recent matches…
            </div>
          )}
          {!recentMatchesLoading && recentMatches.length === 0 && (
            <div className="rounded border border-slate-800 bg-slate-900/50 px-3 py-2 text-xs text-slate-300">
              No completed matches found.
            </div>
          )}
          {recentMatches.length > 0 && (
            <div className="overflow-auto rounded border border-slate-800 bg-slate-900/40">
              <table className="min-w-full text-left text-xs text-slate-200">
                <thead className="bg-slate-900/70 text-[11px] uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Match ID</th>
                    <th className="px-3 py-2">Players</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Winner</th>
                    <th className="px-3 py-2">Completed</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {recentMatches.map((match) => (
                    <tr
                      key={match.matchId}
                      className="border-t border-slate-800/60 hover:bg-slate-800/30"
                    >
                      <td className="px-3 py-2">
                        <button
                          onClick={() => copyMatchId(match.matchId)}
                          className="font-mono text-[10px] hover:text-blue-300 cursor-pointer transition-colors"
                          title="Click to copy full match ID"
                        >
                          {copiedMatchId === match.matchId ? (
                            <span className="text-emerald-400">Copied!</span>
                          ) : (
                            <>{match.matchId.slice(0, 8)}…</>
                          )}
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <div
                          className="max-w-xs truncate"
                          title={match.playerNames.join(" vs ")}
                        >
                          {match.playerNames.join(" vs ")}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span className="rounded bg-slate-700/50 px-1.5 py-0.5 text-[10px] uppercase">
                          {match.matchType}
                        </span>
                        {match.tournamentId && (
                          <span className="ml-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-200">
                            Tournament
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {match.winnerName ? (
                          <span className="text-emerald-300">
                            {match.winnerName}
                          </span>
                        ) : (
                          <span className="text-slate-500">Draw/Unknown</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[10px] text-slate-400">
                        {formatTimestamp(match.completedAt)}
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/replay/${match.matchId}`}
                          className="rounded bg-blue-600/20 px-2 py-1 text-[10px] text-blue-200 hover:bg-blue-600/30"
                        >
                          View Replay
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Active Tournaments
              </h2>
              <p className="text-xs text-slate-400">
                Tournaments that are currently running. Close to end them
                immediately.
              </p>
            </div>
            <button
              onClick={() => {
                void refreshTournaments();
              }}
              className="inline-flex items-center justify-center rounded border border-slate-600 px-3 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800"
              disabled={tournamentsLoading}
            >
              {tournamentsLoading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
          {tournamentsError && (
            <div className="rounded border border-rose-500/50 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
              {tournamentsError}
            </div>
          )}
          {tournamentsLoading && tournaments.length === 0 && (
            <div className="rounded border border-slate-800 bg-slate-900/50 px-3 py-4 text-center text-xs text-slate-300">
              Loading tournaments…
            </div>
          )}
          {!tournamentsLoading && tournaments.length === 0 && (
            <div className="rounded border border-slate-800 bg-slate-900/50 px-3 py-2 text-xs text-slate-300">
              No active tournaments at the moment.
            </div>
          )}
          {tournaments.length > 0 && (
            <div className="overflow-auto rounded border border-slate-800 bg-slate-900/40">
              <table className="min-w-full text-left text-xs text-slate-200">
                <thead className="bg-slate-900/70 text-[11px] uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Format</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Round</th>
                    <th className="px-3 py-2">Players</th>
                    <th className="px-3 py-2">Creator</th>
                    <th className="px-3 py-2">Started</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tournaments.map((tournament) => (
                    <tr
                      key={tournament.id}
                      className="border-t border-slate-800/60 hover:bg-slate-800/30"
                    >
                      <td className="px-3 py-2">
                        <div
                          className="max-w-xs truncate font-medium"
                          title={tournament.name}
                        >
                          {tournament.name}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span className="rounded bg-slate-700/50 px-1.5 py-0.5 text-[10px] uppercase">
                          {tournament.format}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={clsx(
                            "rounded px-1.5 py-0.5 text-[10px]",
                            tournament.status === "active" ||
                              tournament.status === "in_progress"
                              ? "bg-emerald-500/20 text-emerald-200"
                              : tournament.status === "registering"
                              ? "bg-blue-500/20 text-blue-200"
                              : tournament.status === "drafting"
                              ? "bg-purple-500/20 text-purple-200"
                              : "bg-amber-500/20 text-amber-200"
                          )}
                        >
                          {tournament.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        {tournament.currentRound}/{tournament.maxRounds}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {tournament.playerCount}
                      </td>
                      <td className="px-3 py-2">
                        <div
                          className="max-w-[100px] truncate text-[10px] text-slate-400"
                          title={tournament.creatorName ?? "Unknown"}
                        >
                          {tournament.creatorName ?? "Unknown"}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-[10px] text-slate-400">
                        {tournament.startedAt
                          ? formatTimestamp(tournament.startedAt)
                          : "Not started"}
                      </td>
                      <td className="px-3 py-2 flex gap-1">
                        <Link
                          href={`/tournaments/${tournament.id}`}
                          className="rounded bg-blue-600/20 px-2 py-1 text-[10px] text-blue-200 hover:bg-blue-600/30"
                        >
                          View
                        </Link>
                        <button
                          onClick={() =>
                            closeTournament(tournament.id, tournament.name)
                          }
                          disabled={closingTournament === tournament.id}
                          className={clsx(
                            "rounded px-2 py-1 text-[10px]",
                            closingTournament === tournament.id
                              ? "bg-slate-700/50 text-slate-400 cursor-wait"
                              : "bg-rose-600/20 text-rose-200 hover:bg-rose-600/30"
                          )}
                          title="Close this tournament (all matches will be ended)"
                        >
                          {closingTournament === tournament.id
                            ? "Closing…"
                            : "Close"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded border border-slate-700 bg-slate-900/60 px-6 py-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Meta Statistics
              </h2>
              <p className="text-sm text-slate-400">
                Card win rates, element distribution, mana curves, and more
              </p>
            </div>
            <Link
              href="/admin/meta"
              className="inline-flex items-center justify-center rounded border border-emerald-400 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-500/20"
            >
              View Meta Dashboard →
            </Link>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-white">
            Connection diagnostics
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {connectionStatusSummaries.map((connection) => (
              <div
                key={connection.id}
                className={clsx(
                  "rounded border px-4 py-4 shadow-sm",
                  connection.statusClass
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium">{connection.label}</div>
                  <span
                    className={clsx(
                      "inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                      connection.status === "ok"
                        ? "bg-emerald-400/20 text-emerald-100"
                        : connection.status === "skipped"
                        ? "bg-slate-500/30 text-slate-200"
                        : "bg-rose-500/30 text-rose-100"
                    )}
                  >
                    {connection.status}
                  </span>
                </div>
                {typeof connection.latencyMs === "number" && (
                  <div className="mt-1 text-xs text-slate-200">
                    {connection.latencyMs.toFixed(1)} ms
                  </div>
                )}
                {connection.details && (
                  <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded bg-black/40 p-2 text-[11px] text-slate-200">
                    {connection.details}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <h2 className="text-lg font-semibold text-white">
              System health timeline
            </h2>
            <button
              onClick={() => {
                void refreshHealthHistory();
              }}
              className="inline-flex items-center justify-center rounded border border-slate-600 px-3 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800"
              disabled={loadingHealthHistory}
            >
              {loadingHealthHistory ? "Refreshing…" : "Refresh"}
            </button>
          </div>
          {healthHistoryError && (
            <div className="rounded border border-rose-500/50 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
              {healthHistoryError}
            </div>
          )}
          {!loadingHealthHistory && healthHistory.length === 0 && (
            <div className="rounded border border-slate-800 bg-slate-900/50 px-3 py-2 text-xs text-slate-300">
              No health snapshots recorded yet. Run diagnostics to capture the
              first sample.
            </div>
          )}
          {loadingHealthHistory && (
            <div className="rounded border border-slate-800 bg-slate-900/50 px-3 py-4 text-center text-xs text-slate-300">
              Loading timeline…
            </div>
          )}
          {!loadingHealthHistory && healthHistory.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2">
              {healthHistory.map((snapshot) => {
                const ok = snapshot.connections.filter(
                  (c) => c.status === "ok"
                ).length;
                const errors = snapshot.connections.filter(
                  (c) => c.status === "error"
                ).length;
                const skipped = snapshot.connections.filter(
                  (c) => c.status === "skipped"
                ).length;
                return (
                  <div
                    key={snapshot.id}
                    className="rounded border border-slate-800 bg-slate-900/60 px-4 py-3"
                  >
                    <div className="text-sm font-semibold text-white">
                      {formatTimestamp(snapshot.timestamp)}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400">
                      Users: {formatNumber(snapshot.stats.totals.users)} •
                      Matches: {formatNumber(snapshot.stats.totals.matches)}
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-xs text-slate-200">
                      <span className="text-emerald-300">OK {ok}</span>
                      <span className="text-rose-300">Errors {errors}</span>
                      <span className="text-slate-300">Skipped {skipped}</span>
                    </div>
                    <ul className="mt-2 space-y-1 text-[11px] text-slate-300">
                      {snapshot.connections.map((conn) => (
                        <li key={`${snapshot.id}-${conn.id}`}>
                          <span className="font-semibold text-slate-100">
                            {conn.label}:
                          </span>{" "}
                          {conn.status}
                          {typeof conn.latencyMs === "number"
                            ? ` • ${conn.latencyMs.toFixed(1)} ms`
                            : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => setErrorsExpanded((prev) => !prev)}
              className="flex items-center gap-2 text-left"
            >
              <span
                className={clsx(
                  "inline-block transition-transform",
                  errorsExpanded ? "rotate-90" : ""
                )}
              >
                ▶
              </span>
              <h2 className="text-lg font-semibold text-white">
                Recent errors
              </h2>
              {errorsData.length > 0 && (
                <span className="rounded bg-rose-500/20 px-2 py-0.5 text-xs text-rose-200">
                  {errorsData.length}
                </span>
              )}
            </button>
            <button
              onClick={() => {
                void refreshErrors();
              }}
              className="inline-flex items-center justify-center rounded border border-slate-600 px-3 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800"
            >
              Refresh
            </button>
          </div>
          {errorsExpanded && (
            <>
              {errorsError && (
                <div className="rounded border border-rose-500/50 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
                  {errorsError}
                </div>
              )}
              {errorsData.length === 0 ? (
                <div className="rounded border border-slate-800 bg-slate-900/50 px-3 py-2 text-xs text-slate-300">
                  No error events recorded in the last 50 entries.
                </div>
              ) : (
                <div className="overflow-auto rounded border border-slate-800 bg-slate-900/40">
                  <table className="min-w-full text-left text-xs text-slate-200">
                    <thead className="bg-slate-900/70 text-[11px] uppercase tracking-wide text-slate-400">
                      <tr>
                        <th className="px-3 py-2">Timestamp</th>
                        <th className="px-3 py-2">Event</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {errorsData.map((record) => (
                        <tr
                          key={record.id}
                          className="border-t border-slate-800/60"
                        >
                          <td className="px-3 py-2">
                            {formatTimestamp(record.timestamp)}
                          </td>
                          <td className="px-3 py-2">
                            <span className="font-medium text-white">
                              {record.eventType}
                            </span>
                            <div className="text-[10px] text-slate-400">
                              {record.targetUrl}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            {record.statusCode ?? "—"}{" "}
                            {!record.success ? (
                              <span className="ml-1 rounded bg-rose-500/30 px-1 py-0.5 text-[10px] text-rose-100">
                                failed
                              </span>
                            ) : (
                              <span className="ml-1 rounded bg-emerald-500/20 px-1 py-0.5 text-[10px] text-emerald-100">
                                ok
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-[11px] text-slate-300">
                            {record.errorMessage ?? "—"}{" "}
                            {record.retryCount > 0 && (
                              <span className="ml-2 text-slate-400">
                                (retries: {record.retryCount})
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <h2 className="text-lg font-semibold text-white">Queue status</h2>
            <button
              onClick={() => {
                void refreshJobs();
              }}
              className="inline-flex items-center justify-center rounded border border-slate-600 px-3 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800"
            >
              Refresh
            </button>
          </div>
          {jobsError && (
            <div className="rounded border border-rose-500/50 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
              {jobsError}
            </div>
          )}
          {jobsData.length === 0 ? (
            <div className="rounded border border-slate-800 bg-slate-900/50 px-3 py-2 text-xs text-slate-300">
              No active jobs detected.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {jobsData.map((job) => (
                <div
                  key={job.id}
                  className="rounded border border-slate-800 bg-slate-900/60 px-4 py-3"
                >
                  <div className="text-sm font-semibold text-white">
                    {job.label}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-400">
                    Updated {formatTimestamp(job.updatedAt)}
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs">
                    <span className="text-amber-200">
                      Queued: {formatNumber(job.queued)}
                    </span>
                    <span className="text-emerald-200">
                      Active: {formatNumber(job.inProgress)}
                    </span>
                    <span className="text-rose-200">
                      Failed: {formatNumber(job.failed)}
                    </span>
                  </div>
                  {job.details && (
                    <div className="mt-2 text-[11px] text-slate-300">
                      {job.details}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <h2 className="text-lg font-semibold text-white">
              Active sessions
            </h2>
            <button
              onClick={() => {
                void refreshSessions();
              }}
              className="inline-flex items-center justify-center rounded border border-slate-600 px-3 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800"
            >
              Refresh
            </button>
          </div>
          {sessionsError && (
            <div className="rounded border border-rose-500/50 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
              {sessionsError}
            </div>
          )}
          {sessionsData.length === 0 ? (
            <div className="rounded border border-slate-800 bg-slate-900/50 px-3 py-2 text-xs text-slate-300">
              No live sessions detected.
            </div>
          ) : (
            <div className="grid gap-3">
              {sessionsData.map((session) => (
                <div
                  key={session.id}
                  className="rounded border border-slate-800 bg-slate-900/60 px-4 py-3"
                >
                  <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {session.type.toUpperCase()} • {session.status}
                      </div>
                      <div className="text-xs text-slate-300">
                        {session.description}
                      </div>
                    </div>
                    <div className="text-xs text-slate-400">
                      Players: {formatNumber(session.playerCount)}
                    </div>
                  </div>
                  <div className="mt-2 text-[11px] text-slate-400">
                    Started {formatTimestamp(session.startedAt)} • Updated{" "}
                    {formatTimestamp(session.updatedAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <h2 className="text-lg font-semibold text-white">
              Usage snapshots
            </h2>
            <button
              onClick={() => {
                void refreshUsage();
              }}
              className="inline-flex items-center justify-center rounded border border-slate-600 px-3 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800"
            >
              Refresh
            </button>
          </div>
          {usageError && (
            <div className="rounded border border-rose-500/50 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
              {usageError}
            </div>
          )}
          {usageData.length === 0 ? (
            <div className="rounded border border-slate-800 bg-slate-900/50 px-3 py-2 text-xs text-slate-300">
              Usage data unavailable.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {usageData.map((snapshot) => (
                <div
                  key={snapshot.period}
                  className="rounded border border-slate-800 bg-slate-900/60 px-4 py-3"
                >
                  <div className="text-sm font-semibold text-white">
                    Last {snapshot.period}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-400">
                    Updated {formatTimestamp(snapshot.generatedAt)}
                  </div>
                  <ul className="mt-2 space-y-1 text-xs text-slate-200">
                    <li>New users: {formatNumber(snapshot.newUsers)}</li>
                    <li>
                      Matches completed:{" "}
                      {formatNumber(snapshot.matchesCompleted)}
                    </li>
                    <li>
                      Tournaments started:{" "}
                      {formatNumber(snapshot.tournamentsStarted)}
                    </li>
                    <li>
                      Drafts created: {formatNumber(snapshot.draftsStarted)}
                    </li>
                    <li>Active users: {formatNumber(snapshot.activeUsers)}</li>
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <h2 className="text-lg font-semibold text-white">User directory</h2>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search by name or email..."
                value={userSearchQuery}
                onChange={(e) => {
                  setUserSearchQuery(e.target.value);
                  userSearchRef.current = e.target.value;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    void loadUsers("initial", userSearchQuery);
                  }
                }}
                className="rounded border border-slate-600 bg-slate-800 px-3 py-1 text-xs text-slate-200 placeholder:text-slate-500 focus:border-slate-500 focus:outline-none w-48"
              />
              <button
                onClick={() => {
                  void loadUsers("initial", userSearchQuery);
                }}
                disabled={usersLoading}
                className="inline-flex items-center justify-center rounded border border-slate-600 px-3 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-60"
              >
                {users ? "Search" : "Load users"}
              </button>
              <button
                onClick={() => {
                  void loadUsers("more");
                }}
                disabled={usersLoading || !usersNextCursor}
                className="inline-flex items-center justify-center rounded border border-slate-600 px-3 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-60"
              >
                Load more
              </button>
            </div>
          </div>
          {usersError && (
            <div className="rounded border border-rose-500/50 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
              {usersError}
            </div>
          )}
          {users && users.length > 0 && (
            <div className="text-[11px] text-slate-400">
              Loaded {users.length} users • Updated{" "}
              {formatTimestamp(usersFetchedAt)}
            </div>
          )}
          {usersLoading && (
            <div className="rounded border border-slate-800 bg-slate-900/50 px-3 py-4 text-center text-xs text-slate-300">
              Loading users…
            </div>
          )}
          {users && users.length > 0 && (
            <div className="overflow-auto rounded border border-slate-800 bg-slate-900/40">
              <table className="min-w-full text-left text-xs text-slate-200">
                <thead className="bg-slate-900/70 text-[11px] uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Created</th>
                    <th className="px-3 py-2">Last seen</th>
                    <th className="px-3 py-2">Matches</th>
                    <th className="px-3 py-2">Tournaments</th>
                    <th className="px-3 py-2">Patron Tier</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr
                      key={user.id}
                      className="border-t border-slate-800/60 text-[11px]"
                    >
                      <td className="px-3 py-2">
                        <div className="font-semibold text-white">
                          {user.name || "—"}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {user.id}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {formatTimestamp(user.createdAt)}
                      </td>
                      <td className="px-3 py-2">
                        {formatTimestamp(user.lastSeenAt)}
                      </td>
                      <td className="px-3 py-2 text-slate-200">
                        {formatNumber(user.matchCount)}
                      </td>
                      <td className="px-3 py-2 text-slate-200">
                        {formatNumber(user.tournamentRegistrations)}
                      </td>
                      <td className="px-3 py-2">
                        <CustomSelect
                          value={user.patronTier ?? ""}
                          onChange={(v) => {
                            const value = v || null;
                            updatePatronTier(user.id, value);
                          }}
                          disabled={updatingPatronTier === user.id}
                          placeholder="None"
                          options={[
                            { value: "apprentice", label: "Apprentice" },
                            { value: "grandmaster", label: "Grandmaster" },
                            { value: "kingofthe", label: "KingOfThe" },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {users && users.length === 0 && !usersLoading && (
            <div className="rounded border border-slate-800 bg-slate-900/50 px-3 py-2 text-xs text-slate-300">
              No users match the current filters.
            </div>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-white">
            Maintenance actions
          </h2>
          <p className="text-xs text-slate-400">
            Run administrative maintenance jobs. Dangerous actions are marked
            and should only be executed in controlled environments.
          </p>
          <div className="grid gap-4">
            {actionDescriptors.map((action) => {
              const result = action.result;
              const isLoading = actionBusy === action.id;
              return (
                <div
                  key={action.id}
                  className={clsx(
                    "rounded border px-5 py-4",
                    action.dangerous
                      ? "border-amber-500/60 bg-amber-500/10"
                      : "border-slate-700/60 bg-slate-800/40"
                  )}
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {action.label}
                      </div>
                      <p className="mt-1 text-xs text-slate-300">
                        {action.description}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        void runAdminAction(action.id);
                      }}
                      disabled={isLoading}
                      className={clsx(
                        "inline-flex items-center justify-center rounded px-3 py-1.5 text-xs font-medium transition",
                        isLoading
                          ? "bg-slate-700 text-slate-300"
                          : action.dangerous
                          ? "bg-rose-600 text-white hover:bg-rose-500"
                          : "bg-emerald-600 text-white hover:bg-emerald-500"
                      )}
                    >
                      {isLoading ? "Running…" : "Run"}
                    </button>
                  </div>
                  {result && (
                    <div
                      className={clsx(
                        "mt-3 rounded px-3 py-2 text-xs",
                        result.status === "ok"
                          ? "bg-emerald-500/10 text-emerald-100"
                          : "bg-rose-500/10 text-rose-100"
                      )}
                    >
                      <div className="font-semibold">{result.message}</div>
                      {result.details && (
                        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words text-[11px]">
                          {JSON.stringify(result.details, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sublabel,
  valueLabel,
}: {
  label: string;
  value?: number;
  sublabel?: string;
  valueLabel?: string;
}) {
  return (
    <div className="rounded border border-slate-800 bg-slate-900/60 px-5 py-4">
      <div className="text-xs uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-white">
        {typeof value === "number" ? formatNumber(value) : valueLabel ?? "—"}
      </div>
      {sublabel && (
        <div className="mt-1 text-[11px] text-slate-400">{sublabel}</div>
      )}
    </div>
  );
}
