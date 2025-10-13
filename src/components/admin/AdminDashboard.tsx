"use client";

import clsx from "clsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AdminActionResult,
  AdminStats,
  ConnectionTestResult,
  AdminUserSummary,
  HealthSnapshot,
  AdminErrorRecord,
  AdminJobStatus,
  AdminSessionInfo,
  UsageSnapshot,
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
  const [connections, setConnections] = useState<ConnectionTestResult[]>(
    initialConnections
  );
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

  const refreshHealthHistory = useCallback(async () => {
    setLoadingHealthHistory(true);
    setHealthHistoryError(null);
    try {
      const response = await fetch("/api/admin/health-log?limit=20", {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
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
        const body = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
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
        const body = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
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
        const body = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
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
        const body = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
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

  const loadUsers = useCallback(
    async (mode: "initial" | "more" = "initial") => {
      if (mode === "more" && !usersNextCursor) return;
      setUsersLoading(true);
      setUsersError(null);
      try {
        const params = new URLSearchParams();
        params.set("limit", "50");
        if (mode === "more" && usersNextCursor) {
          params.set("cursor", usersNextCursor);
        }
        const response = await fetch(`/api/admin/users?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
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
        const body = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
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
        payload.generatedAt || payload.stats.updatedAt || new Date().toISOString()
      );
      await Promise.allSettled([
        refreshHealthHistory(),
        refreshErrors(),
        refreshJobs(),
        refreshSessions(),
        refreshUsage(),
      ]);
    } catch (error) {
      setStatusError(
        error instanceof Error ? error.message : "Failed to refresh status"
      );
    } finally {
      setRefreshingStatus(false);
    }
  }, [
    refreshErrors,
    refreshHealthHistory,
    refreshJobs,
    refreshSessions,
    refreshUsage,
  ]);

  useEffect(() => {
    void refreshHealthHistory();
    void refreshErrors();
    void refreshJobs();
    void refreshSessions();
    void refreshUsage();
  }, [
    refreshErrors,
    refreshHealthHistory,
    refreshJobs,
    refreshSessions,
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
          const body = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
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
            <StatCard
              label="Registered users"
              value={stats.totals.users}
            />
            <StatCard
              label="Tournaments stored"
              value={stats.totals.tournaments}
              sublabel={`${formatNumber(stats.totals.activeTournaments)} active`}
            />
            <StatCard
              label="Matches recorded"
              value={stats.totals.matches}
            />
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
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <h2 className="text-lg font-semibold text-white">Recent errors</h2>
            <button
              onClick={() => {
                void refreshErrors();
              }}
              className="inline-flex items-center justify-center rounded border border-slate-600 px-3 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800"
            >
              Refresh
            </button>
          </div>
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
            <h2 className="text-lg font-semibold text-white">Active sessions</h2>
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
            <h2 className="text-lg font-semibold text-white">Usage snapshots</h2>
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
                    <li>Matches completed: {formatNumber(snapshot.matchesCompleted)}</li>
                    <li>Tournaments started: {formatNumber(snapshot.tournamentsStarted)}</li>
                    <li>Drafts created: {formatNumber(snapshot.draftsStarted)}</li>
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
              <button
                onClick={() => {
                  void loadUsers("initial");
                }}
                disabled={usersLoading}
                className="inline-flex items-center justify-center rounded border border-slate-600 px-3 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-60"
              >
                {users ? "Reload" : "Load users"}
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
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Created</th>
                    <th className="px-3 py-2">Last seen</th>
                    <th className="px-3 py-2">Matches</th>
                    <th className="px-3 py-2">Tournaments</th>
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
                      <td className="px-3 py-2">{user.email ?? "—"}</td>
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
