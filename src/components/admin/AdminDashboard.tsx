"use client";

import clsx from "clsx";
import { useCallback, useMemo, useState } from "react";
import type {
  AdminActionResult,
  AdminStats,
  ConnectionTestResult,
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
    } catch (error) {
      setStatusError(
        error instanceof Error ? error.message : "Failed to refresh status"
      );
    } finally {
      setRefreshingStatus(false);
    }
  }, []);

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
