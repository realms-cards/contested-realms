"use client";

import clsx from "clsx";
import { ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { Badge } from "@/components/ui/badge";
import { PageHeader, PanelHeader } from "@/components/ui/page-header";
import { RcButton, RcLinkButton } from "@/components/ui/rc-button";
import { RcEmpty } from "@/components/ui/rc-empty";
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
          ? "border-rc-success/35 bg-rc-success/10"
          : conn.status === "skipped"
          ? "border-rc-line/18 bg-black/30"
          : "border-rc-danger/40 bg-rc-danger/10";
      const statusTone =
        conn.status === "ok"
          ? "text-rc-success"
          : conn.status === "skipped"
          ? "text-rc-fg-muted"
          : "text-rc-danger";
      return { ...conn, statusClass, statusTone };
    });
  }, [connections]);

  const actionDescriptors = useMemo(() => {
    return actions.map((action) => ({
      ...action,
      result: actionResults[action.id],
    }));
  }, [actions, actionResults]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="admin"
        title="Control Room"
        description={`Signed in as ${adminName || "admin"} · Last refresh ${formatTimestamp(statusTimestamp)}`}
        actions={
          <RcButton
            onClick={() => {
              void runConnectionRefresh();
            }}
            disabled={refreshingStatus}
          >
            {refreshingStatus ? "Refreshing…" : "Run diagnostics"}
          </RcButton>
        }
      />

      {statusError && (
        <div className="rc-alert" data-tone="danger">
          Diagnostics refresh failed: {statusError}
        </div>
      )}

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="m-0 font-rc-display text-[26px] leading-none text-rc-fg-strong">
            Snapshot statistics
          </h2>
          <p className="rc-hint mt-1.5">
            numbers are aggregated live from the database
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard label="Registered users" value={stats.totals.users} />
          <StatCard
            label="Tournaments stored"
            value={stats.totals.tournaments}
            sublabel={`${formatNumber(stats.totals.activeTournaments)} active`}
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

      <section className="rc-panel overflow-hidden">
        <PanelHeader
          title="Live Matches"
          meta="currently active on the server"
        >
          <RcButton
            variant="outline"
            size="sm"
            onClick={() => {
              void refreshActiveMatches();
            }}
            disabled={activeMatchesLoading}
          >
            {activeMatchesLoading ? "Refreshing…" : "Refresh"}
          </RcButton>
        </PanelHeader>
        {(activeMatchesError || activeMatches.length === 0) && (
          <div className="flex flex-col gap-3 px-[18px] py-3.5">
            {activeMatchesError && (
              <div className="rc-alert" data-tone="danger">
                {activeMatchesError}
              </div>
            )}
            {activeMatchesLoading && activeMatches.length === 0 && (
              <div className="rc-hint py-6 text-center">
                loading active matches…
              </div>
            )}
            {!activeMatchesLoading && activeMatches.length === 0 && (
              <RcEmpty title="No active matches">
                nothing is running right now
              </RcEmpty>
            )}
          </div>
        )}
        {activeMatches.length > 0 && (
          <div className="overflow-x-auto">
            <table className="rc-table">
              <thead>
                <tr>
                  <th>Match ID</th>
                  <th>Players</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Started</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {activeMatches.map((match) => {
                  const startedStr = match.startedAt
                    ? formatTimestamp(new Date(match.startedAt).toISOString())
                    : "—";
                  return (
                    <tr key={match.matchId}>
                      <td>
                        <button
                          onClick={() => copyMatchId(match.matchId)}
                          className="cursor-pointer font-rc-mono text-[11px] text-rc-fg-muted transition-colors hover:text-rc-accent-ring"
                          title="Click to copy full match ID"
                        >
                          {copiedMatchId === match.matchId ? (
                            <span className="text-rc-success">Copied!</span>
                          ) : (
                            <>{match.matchId.slice(0, 8)}…</>
                          )}
                        </button>
                      </td>
                      <td>
                        <div
                          className="max-w-xs truncate text-rc-fg-strong"
                          title={match.playerNames.join(" vs ")}
                        >
                          {match.playerNames.join(" vs ")}
                        </div>
                        {match.lobbyName && (
                          <div className="rc-hint mt-0.5">
                            {match.lobbyName}
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge>{match.matchType}</Badge>
                          {match.tournamentId && (
                            <Badge tone="gold">Tournament</Badge>
                          )}
                        </div>
                      </td>
                      <td>
                        <span
                          className={clsx(
                            "flex items-center gap-2 text-[11px] uppercase tracking-[0.14em]",
                            match.status === "playing"
                              ? "text-rc-success"
                              : match.status === "waiting"
                              ? "text-rc-warning"
                              : "text-rc-fg-muted"
                          )}
                        >
                          <span className="rc-dot" />
                          {match.status}
                        </span>
                      </td>
                      <td className="text-[11px] text-rc-fg-subtle">
                        {startedStr}
                      </td>
                      <td>
                        <div className="flex gap-2">
                          <RcLinkButton
                            variant="outline"
                            size="sm"
                            href={`/online/play/${match.matchId}?watch=true`}
                          >
                            Spectate
                          </RcLinkButton>
                          <RcButton
                            variant="destructive"
                            size="sm"
                            onClick={() => cleanupMatch(match.matchId)}
                            disabled={cleaningUpMatch === match.matchId}
                            title="End this match (players will be notified)"
                          >
                            {cleaningUpMatch === match.matchId
                              ? "Ending…"
                              : "End Match"}
                          </RcButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rc-panel overflow-hidden">
        <PanelHeader
          title="Recent Matches"
          meta="recently completed, click to view replay"
        >
          <RcButton
            variant="outline"
            size="sm"
            onClick={() => {
              void refreshRecentMatches();
            }}
            disabled={recentMatchesLoading}
          >
            {recentMatchesLoading ? "Refreshing…" : "Refresh"}
          </RcButton>
        </PanelHeader>
        {(recentMatchesError || recentMatches.length === 0) && (
          <div className="flex flex-col gap-3 px-[18px] py-3.5">
            {recentMatchesError && (
              <div className="rc-alert" data-tone="danger">
                {recentMatchesError}
              </div>
            )}
            {recentMatchesLoading && recentMatches.length === 0 && (
              <div className="rc-hint py-6 text-center">
                loading recent matches…
              </div>
            )}
            {!recentMatchesLoading && recentMatches.length === 0 && (
              <RcEmpty title="No completed matches">
                nothing has finished yet
              </RcEmpty>
            )}
          </div>
        )}
        {recentMatches.length > 0 && (
          <div className="overflow-x-auto">
            <table className="rc-table">
              <thead>
                <tr>
                  <th>Match ID</th>
                  <th>Players</th>
                  <th>Type</th>
                  <th>Winner</th>
                  <th>Completed</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {recentMatches.map((match) => (
                  <tr key={match.matchId}>
                    <td>
                      <button
                        onClick={() => copyMatchId(match.matchId)}
                        className="cursor-pointer font-rc-mono text-[11px] text-rc-fg-muted transition-colors hover:text-rc-accent-ring"
                        title="Click to copy full match ID"
                      >
                        {copiedMatchId === match.matchId ? (
                          <span className="text-rc-success">Copied!</span>
                        ) : (
                          <>{match.matchId.slice(0, 8)}…</>
                        )}
                      </button>
                    </td>
                    <td>
                      <div
                        className="max-w-xs truncate text-rc-fg-strong"
                        title={match.playerNames.join(" vs ")}
                      >
                        {match.playerNames.join(" vs ")}
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge>{match.matchType}</Badge>
                        {match.tournamentId && (
                          <Badge tone="gold">Tournament</Badge>
                        )}
                      </div>
                    </td>
                    <td>
                      {match.winnerName ? (
                        <span className="text-rc-success">
                          {match.winnerName}
                        </span>
                      ) : (
                        <span className="text-rc-fg-dim">Draw/Unknown</span>
                      )}
                    </td>
                    <td className="text-[11px] text-rc-fg-subtle">
                      {formatTimestamp(match.completedAt)}
                    </td>
                    <td>
                      <RcLinkButton
                        variant="outline"
                        size="sm"
                        href={`/replay/${match.matchId}`}
                      >
                        View Replay
                      </RcLinkButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rc-panel overflow-hidden">
        <PanelHeader
          title="Active Tournaments"
          meta="close to end them immediately"
        >
          <RcButton
            variant="outline"
            size="sm"
            onClick={() => {
              void refreshTournaments();
            }}
            disabled={tournamentsLoading}
          >
            {tournamentsLoading ? "Refreshing…" : "Refresh"}
          </RcButton>
        </PanelHeader>
        {(tournamentsError || tournaments.length === 0) && (
          <div className="flex flex-col gap-3 px-[18px] py-3.5">
            {tournamentsError && (
              <div className="rc-alert" data-tone="danger">
                {tournamentsError}
              </div>
            )}
            {tournamentsLoading && tournaments.length === 0 && (
              <div className="rc-hint py-6 text-center">
                loading tournaments…
              </div>
            )}
            {!tournamentsLoading && tournaments.length === 0 && (
              <RcEmpty title="No active tournaments">
                nothing is running right now
              </RcEmpty>
            )}
          </div>
        )}
        {tournaments.length > 0 && (
          <div className="overflow-x-auto">
            <table className="rc-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Format</th>
                  <th>Status</th>
                  <th>Round</th>
                  <th>Players</th>
                  <th>Creator</th>
                  <th>Started</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tournaments.map((tournament) => (
                  <tr key={tournament.id}>
                    <td>
                      <div
                        className="max-w-xs truncate font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong"
                        title={tournament.name}
                      >
                        {tournament.name}
                      </div>
                    </td>
                    <td>
                      <Badge>{tournament.format}</Badge>
                    </td>
                    <td>
                      <span
                        className={clsx(
                          "flex items-center gap-2 text-[11px] uppercase tracking-[0.14em]",
                          tournament.status === "active" ||
                            tournament.status === "in_progress"
                            ? "text-rc-success"
                            : tournament.status === "registering"
                            ? "text-rc-info"
                            : tournament.status === "drafting"
                            ? "text-rc-moonlight"
                            : "text-rc-warning"
                        )}
                      >
                        <span className="rc-dot" />
                        {tournament.status}
                      </span>
                    </td>
                    <td className="text-center tabular-nums">
                      {tournament.currentRound}/{tournament.maxRounds}
                    </td>
                    <td className="text-center tabular-nums">
                      {tournament.playerCount}
                    </td>
                    <td>
                      <div
                        className="max-w-[100px] truncate text-[11px] text-rc-fg-subtle"
                        title={tournament.creatorName ?? "Unknown"}
                      >
                        {tournament.creatorName ?? "Unknown"}
                      </div>
                    </td>
                    <td className="text-[11px] text-rc-fg-subtle">
                      {tournament.startedAt
                        ? formatTimestamp(tournament.startedAt)
                        : "Not started"}
                    </td>
                    <td>
                      <div className="flex gap-2">
                        <RcLinkButton
                          variant="outline"
                          size="sm"
                          href={`/tournaments/${tournament.id}`}
                        >
                          View
                        </RcLinkButton>
                        <RcButton
                          variant="destructive"
                          size="sm"
                          onClick={() =>
                            closeTournament(tournament.id, tournament.name)
                          }
                          disabled={closingTournament === tournament.id}
                          title="Close this tournament (all matches will be ended)"
                        >
                          {closingTournament === tournament.id
                            ? "Closing…"
                            : "Close"}
                        </RcButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rc-panel">
        <PanelHeader title="Meta Statistics">
          <RcLinkButton variant="outline" size="sm" href="/admin/meta">
            View Meta Dashboard
          </RcLinkButton>
        </PanelHeader>
        <p className="px-[18px] py-3.5 font-rc-sans text-sm text-rc-fg-muted">
          Card win rates, element distribution, mana curves, and more
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="m-0 font-rc-display text-[26px] leading-none text-rc-fg-strong">
          Connection diagnostics
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {connectionStatusSummaries.map((connection) => (
            <div
              key={connection.id}
              className={clsx(
                "rounded-rc-lg border px-4 py-4 shadow-rc-sm",
                connection.statusClass
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="font-rc-sans text-sm text-rc-fg-strong">
                  {connection.label}
                </div>
                <span
                  className={clsx(
                    "inline-flex items-center gap-2 font-rc-mono text-[11px] uppercase tracking-[0.14em]",
                    connection.statusTone
                  )}
                >
                  <span className="rc-dot" />
                  {connection.status}
                </span>
              </div>
              {typeof connection.latencyMs === "number" && (
                <div className="rc-stat mt-1.5 text-sm">
                  {connection.latencyMs.toFixed(1)} ms
                </div>
              )}
              {connection.details && (
                <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-rc-md border border-rc-line/12 bg-black/45 p-2 font-rc-mono text-[11px] text-rc-fg-muted">
                  {connection.details}
                </pre>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="rc-panel">
        <PanelHeader title="System health timeline">
          <RcButton
            variant="outline"
            size="sm"
            onClick={() => {
              void refreshHealthHistory();
            }}
            disabled={loadingHealthHistory}
          >
            {loadingHealthHistory ? "Refreshing…" : "Refresh"}
          </RcButton>
        </PanelHeader>
        <div className="flex flex-col gap-3 px-[18px] py-3.5">
          {healthHistoryError && (
            <div className="rc-alert" data-tone="danger">
              {healthHistoryError}
            </div>
          )}
          {!loadingHealthHistory && healthHistory.length === 0 && (
            <RcEmpty title="No health snapshots yet">
              run diagnostics to capture the first sample
            </RcEmpty>
          )}
          {loadingHealthHistory && (
            <div className="rc-hint py-6 text-center">loading timeline…</div>
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
                    className="rounded-rc-md border border-rc-line/12 bg-black/30 px-4 py-3"
                  >
                    <div className="font-rc-mono text-xs text-rc-fg-strong">
                      {formatTimestamp(snapshot.timestamp)}
                    </div>
                    <div className="rc-hint mt-1">
                      Users: {formatNumber(snapshot.stats.totals.users)} ·
                      Matches: {formatNumber(snapshot.stats.totals.matches)}
                    </div>
                    <div className="mt-2 flex items-center gap-3 font-rc-mono text-[11px] uppercase tracking-[0.14em]">
                      <span className="text-rc-success">OK {ok}</span>
                      <span className="text-rc-danger">Errors {errors}</span>
                      <span className="text-rc-fg-muted">
                        Skipped {skipped}
                      </span>
                    </div>
                    <ul className="mt-2 space-y-1 font-rc-mono text-[11px] text-rc-fg-muted">
                      {snapshot.connections.map((conn) => (
                        <li key={`${snapshot.id}-${conn.id}`}>
                          <span className="text-rc-fg-strong">
                            {conn.label}:
                          </span>{" "}
                          {conn.status}
                          {typeof conn.latencyMs === "number"
                            ? ` · ${conn.latencyMs.toFixed(1)} ms`
                            : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="rc-panel overflow-hidden">
        <div className="rc-panel-head">
          <button
            onClick={() => setErrorsExpanded((prev) => !prev)}
            className="flex items-center gap-2 text-left"
            aria-expanded={errorsExpanded}
          >
            <ChevronRight
              className={clsx(
                "h-4 w-4 text-rc-fg-muted transition-transform",
                errorsExpanded ? "rotate-90" : ""
              )}
            />
            <h2 className="m-0 font-rc-display text-[26px] leading-none text-rc-fg-strong">
              Recent errors
            </h2>
          </button>
          {errorsData.length > 0 && (
            <Badge tone="warn">{errorsData.length}</Badge>
          )}
          <div className="flex-1" />
          <RcButton
            variant="outline"
            size="sm"
            onClick={() => {
              void refreshErrors();
            }}
          >
            Refresh
          </RcButton>
        </div>
        {errorsExpanded && (
          <>
            {(errorsError || errorsData.length === 0) && (
              <div className="flex flex-col gap-3 px-[18px] py-3.5">
                {errorsError && (
                  <div className="rc-alert" data-tone="danger">
                    {errorsError}
                  </div>
                )}
                {errorsData.length === 0 && (
                  <RcEmpty title="No error events">
                    nothing in the last 50 entries
                  </RcEmpty>
                )}
              </div>
            )}
            {errorsData.length > 0 && (
              <div className="overflow-x-auto">
                <table className="rc-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Event</th>
                      <th>Status</th>
                      <th>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {errorsData.map((record) => (
                      <tr key={record.id}>
                        <td className="text-[11px] text-rc-fg-subtle">
                          {formatTimestamp(record.timestamp)}
                        </td>
                        <td>
                          <span className="text-rc-fg-strong">
                            {record.eventType}
                          </span>
                          <div className="rc-hint mt-0.5">
                            {record.targetUrl}
                          </div>
                        </td>
                        <td>
                          <span className="tabular-nums">
                            {record.statusCode ?? "—"}
                          </span>{" "}
                          {!record.success ? (
                            <span className="ml-1 text-[11px] uppercase tracking-[0.14em] text-rc-danger">
                              failed
                            </span>
                          ) : (
                            <span className="ml-1 text-[11px] uppercase tracking-[0.14em] text-rc-success">
                              ok
                            </span>
                          )}
                        </td>
                        <td className="text-[11px] text-rc-fg-muted">
                          {record.errorMessage ?? "—"}{" "}
                          {record.retryCount > 0 && (
                            <span className="ml-2 text-rc-fg-dim">
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

      <section className="rc-panel">
        <PanelHeader title="Queue status">
          <RcButton
            variant="outline"
            size="sm"
            onClick={() => {
              void refreshJobs();
            }}
          >
            Refresh
          </RcButton>
        </PanelHeader>
        <div className="flex flex-col gap-3 px-[18px] py-3.5">
          {jobsError && (
            <div className="rc-alert" data-tone="danger">
              {jobsError}
            </div>
          )}
          {jobsData.length === 0 ? (
            <RcEmpty title="No active jobs">nothing queued</RcEmpty>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {jobsData.map((job) => (
                <div
                  key={job.id}
                  className="rounded-rc-md border border-rc-line/12 bg-black/30 px-4 py-3"
                >
                  <div className="font-rc-sans text-sm text-rc-fg-strong">
                    {job.label}
                  </div>
                  <div className="rc-hint mt-1">
                    Updated {formatTimestamp(job.updatedAt)}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 font-rc-mono text-[11px] uppercase tracking-[0.14em]">
                    <span className="text-rc-warning">
                      Queued: {formatNumber(job.queued)}
                    </span>
                    <span className="text-rc-success">
                      Active: {formatNumber(job.inProgress)}
                    </span>
                    <span className="text-rc-danger">
                      Failed: {formatNumber(job.failed)}
                    </span>
                  </div>
                  {job.details && (
                    <div className="mt-2 font-rc-mono text-[11px] text-rc-fg-muted">
                      {job.details}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="rc-panel">
        <PanelHeader title="Active sessions">
          <RcButton
            variant="outline"
            size="sm"
            onClick={() => {
              void refreshSessions();
            }}
          >
            Refresh
          </RcButton>
        </PanelHeader>
        <div className="flex flex-col gap-3 px-[18px] py-3.5">
          {sessionsError && (
            <div className="rc-alert" data-tone="danger">
              {sessionsError}
            </div>
          )}
          {sessionsData.length === 0 ? (
            <RcEmpty title="No live sessions">nothing connected</RcEmpty>
          ) : (
            <div className="grid gap-3">
              {sessionsData.map((session) => (
                <div
                  key={session.id}
                  className="rounded-rc-md border border-rc-line/12 bg-black/30 px-4 py-3"
                >
                  <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="font-rc-mono text-xs uppercase tracking-[0.14em] text-rc-fg-strong">
                        {session.type.toUpperCase()} · {session.status}
                      </div>
                      <div className="mt-1 font-rc-sans text-sm text-rc-fg-muted">
                        {session.description}
                      </div>
                    </div>
                    <div className="font-rc-mono text-xs text-rc-fg-subtle">
                      Players: {formatNumber(session.playerCount)}
                    </div>
                  </div>
                  <div className="rc-hint mt-2">
                    Started {formatTimestamp(session.startedAt)} · Updated{" "}
                    {formatTimestamp(session.updatedAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="rc-panel">
        <PanelHeader title="Usage snapshots">
          <RcButton
            variant="outline"
            size="sm"
            onClick={() => {
              void refreshUsage();
            }}
          >
            Refresh
          </RcButton>
        </PanelHeader>
        <div className="flex flex-col gap-3 px-[18px] py-3.5">
          {usageError && (
            <div className="rc-alert" data-tone="danger">
              {usageError}
            </div>
          )}
          {usageData.length === 0 ? (
            <RcEmpty title="Usage data unavailable">
              no snapshots returned
            </RcEmpty>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {usageData.map((snapshot) => (
                <div
                  key={snapshot.period}
                  className="rounded-rc-md border border-rc-line/12 bg-black/30 px-4 py-3"
                >
                  <div className="rc-eyebrow">Last {snapshot.period}</div>
                  <div className="rc-hint mt-1">
                    Updated {formatTimestamp(snapshot.generatedAt)}
                  </div>
                  <ul className="mt-2 space-y-1 font-rc-mono text-xs text-rc-fg">
                    <li>New users: {formatNumber(snapshot.newUsers)}</li>
                    <li>
                      Matches completed: {formatNumber(snapshot.matchesCompleted)}
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
        </div>
      </section>

      <section className="rc-panel overflow-hidden">
        <PanelHeader title="User directory">
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
            className="rc-input h-9 w-48"
          />
          <RcButton
            variant="outline"
            size="sm"
            onClick={() => {
              void loadUsers("initial", userSearchQuery);
            }}
            disabled={usersLoading}
          >
            {users ? "Search" : "Load users"}
          </RcButton>
          <RcButton
            variant="outline"
            size="sm"
            onClick={() => {
              void loadUsers("more");
            }}
            disabled={usersLoading || !usersNextCursor}
          >
            Load more
          </RcButton>
        </PanelHeader>
        {(usersError || usersLoading || users) && (
          <div className="flex flex-col gap-3 px-[18px] py-3.5">
            {usersError && (
              <div className="rc-alert" data-tone="danger">
                {usersError}
              </div>
            )}
            {users && users.length > 0 && (
              <div className="rc-hint">
                Loaded {users.length} users · Updated{" "}
                {formatTimestamp(usersFetchedAt)}
              </div>
            )}
            {usersLoading && (
              <div className="rc-hint py-6 text-center">loading users…</div>
            )}
            {users && users.length === 0 && !usersLoading && (
              <RcEmpty title="No users match">
                adjust the current filters
              </RcEmpty>
            )}
          </div>
        )}
        {users && users.length > 0 && (
          <div className="overflow-x-auto">
            <table className="rc-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Created</th>
                  <th>Last seen</th>
                  <th>Matches</th>
                  <th>Tournaments</th>
                  <th>Patron Tier</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="text-rc-fg-strong">
                        {user.name || "—"}
                      </div>
                      <div className="rc-hint mt-0.5">{user.id}</div>
                    </td>
                    <td className="text-[11px] text-rc-fg-subtle">
                      {formatTimestamp(user.createdAt)}
                    </td>
                    <td className="text-[11px] text-rc-fg-subtle">
                      {formatTimestamp(user.lastSeenAt)}
                    </td>
                    <td className="tabular-nums">
                      {formatNumber(user.matchCount)}
                    </td>
                    <td className="tabular-nums">
                      {formatNumber(user.tournamentRegistrations)}
                    </td>
                    <td>
                      <CustomSelect
                        value={user.patronTier ?? ""}
                        onChange={(v) => {
                          const value = v || null;
                          updatePatronTier(user.id, value);
                        }}
                        disabled={updatingPatronTier === user.id}
                        placeholder="None"
                        options={[
                          { value: "", label: "None" },
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
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="m-0 font-rc-display text-[26px] leading-none text-rc-fg-strong">
            Maintenance actions
          </h2>
          <p className="mt-1.5 max-w-[68ch] font-rc-sans text-sm text-rc-fg-muted">
            Run administrative maintenance jobs. Dangerous actions are marked
            and should only be executed in controlled environments.
          </p>
        </div>
        <div className="grid gap-4">
          {actionDescriptors.map((action) => {
            const result = action.result;
            const isLoading = actionBusy === action.id;
            return (
              <div
                key={action.id}
                className={clsx(
                  "rounded-rc-lg border px-5 py-4",
                  action.dangerous
                    ? "border-rc-warning/45 bg-[rgba(112,65,22,0.35)]"
                    : "border-rc-line/18 bg-black/30"
                )}
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-rc-sans text-sm text-rc-fg-strong">
                        {action.label}
                      </span>
                      {action.dangerous && <Badge tone="warn">dangerous</Badge>}
                    </div>
                    <p className="mt-1 font-rc-sans text-sm text-rc-fg-muted">
                      {action.description}
                    </p>
                  </div>
                  <RcButton
                    variant={action.dangerous ? "destructive" : "outline"}
                    size="sm"
                    onClick={() => {
                      void runAdminAction(action.id);
                    }}
                    disabled={isLoading}
                  >
                    {isLoading ? "Running…" : "Run"}
                  </RcButton>
                </div>
                {result && (
                  <div
                    className="rc-alert mt-3"
                    data-tone={result.status === "ok" ? "success" : "danger"}
                  >
                    <div>{result.message}</div>
                    {result.details && (
                      <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-rc-md border border-rc-line/12 bg-black/45 p-2 text-[11px]">
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
    <div className="rc-panel px-5 py-4">
      <div className="rc-eyebrow">{label}</div>
      <div className="rc-stat mt-2 text-2xl">
        {typeof value === "number" ? formatNumber(value) : valueLabel ?? "—"}
      </div>
      {sublabel && <div className="rc-hint mt-1">{sublabel}</div>}
    </div>
  );
}
