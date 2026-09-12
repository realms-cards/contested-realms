"use client";

import { useEffect, useState } from "react";
import { PageHeader, PanelHeader } from "@/components/ui/page-header";
import { RcButton } from "@/components/ui/rc-button";
import { RcEmpty } from "@/components/ui/rc-empty";

interface RouteStats {
  count: number;
  avg: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
}

interface PerformanceMetric {
  route: string;
  duration: number;
  timestamp: number;
}

interface PerformanceData {
  timestamp: number;
  overall: RouteStats | null;
  byRoute: Record<string, RouteStats>;
  recentRequests: PerformanceMetric[];
}

const TARGETS: { label: string; range: string; tone: string }[] = [
  { label: "Excellent", range: "< 50ms", tone: "text-rc-success" },
  { label: "Good", range: "50ms - 200ms", tone: "text-rc-warning" },
  { label: "Fair", range: "200ms - 500ms", tone: "text-rc-ember" },
  { label: "Slow", range: "> 500ms", tone: "text-rc-danger" },
];

export default function AdminPerformancePage() {
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchData = async () => {
    try {
      const res = await fetch("/api/monitoring/performance");
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to fetch performance data"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    if (autoRefresh) {
      const interval = setInterval(fetchData, 30000); // Refresh every 30s for cost savings
      return () => clearInterval(interval);
    }
    return undefined;
  }, [autoRefresh]);

  const formatDuration = (ms: number) => {
    if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`;
    if (ms < 1000) return `${ms.toFixed(2)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatTimestamp = (ts: number) => {
    return new Date(ts).toLocaleTimeString();
  };

  const getStatusColor = (avg: number) => {
    if (avg < 50) return "text-rc-success";
    if (avg < 200) return "text-rc-warning";
    if (avg < 500) return "text-rc-ember";
    return "text-rc-danger";
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="admin" title="API Performance" />
        <div className="rc-hint py-6 text-center">
          loading performance data…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="admin" title="API Performance" />
        <div className="rc-alert" data-tone="danger">
          {error}
        </div>
        <RcButton
          variant="outline"
          onClick={() => {
            setLoading(true);
            fetchData();
          }}
        >
          Retry
        </RcButton>
      </div>
    );
  }

  if (!data || !data.overall) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="admin" title="API Performance" />
        <RcEmpty title="No performance data collected yet">
          metrics will appear once api routes are called
        </RcEmpty>
      </div>
    );
  }

  const sortedRoutes = Object.entries(data.byRoute).sort(
    (a, b) => b[1].count - a[1].count
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="admin"
        title="API Performance"
        description="Request latency by route, sampled in-process."
        actions={
          <>
            <label className="rc-check">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              Auto-refresh (10s)
            </label>
            <RcButton variant="outline" size="sm" onClick={fetchData}>
              Refresh Now
            </RcButton>
          </>
        }
      />

      {/* Overall Stats */}
      <section className="rc-panel">
        <PanelHeader title="Overall Statistics" />
        <div className="grid grid-cols-2 gap-4 px-[18px] py-3.5 sm:grid-cols-4 lg:grid-cols-7">
          <div>
            <div className="rc-eyebrow">Requests</div>
            <div className="rc-stat mt-1 text-2xl">{data.overall.count}</div>
          </div>
          <div>
            <div className="rc-eyebrow">Average</div>
            <div
              className={`rc-stat mt-1 text-2xl ${getStatusColor(
                data.overall.avg
              )}`}
            >
              {formatDuration(data.overall.avg)}
            </div>
          </div>
          <div>
            <div className="rc-eyebrow">Min</div>
            <div className="rc-stat mt-1 text-2xl text-rc-success">
              {formatDuration(data.overall.min)}
            </div>
          </div>
          <div>
            <div className="rc-eyebrow">Max</div>
            <div className="rc-stat mt-1 text-2xl text-rc-danger">
              {formatDuration(data.overall.max)}
            </div>
          </div>
          <div>
            <div className="rc-eyebrow">P50 (Median)</div>
            <div className="rc-stat mt-1 text-2xl">
              {formatDuration(data.overall.p50)}
            </div>
          </div>
          <div>
            <div className="rc-eyebrow">P95</div>
            <div className="rc-stat mt-1 text-2xl text-rc-ember">
              {formatDuration(data.overall.p95)}
            </div>
          </div>
          <div>
            <div className="rc-eyebrow">P99</div>
            <div className="rc-stat mt-1 text-2xl text-rc-danger">
              {formatDuration(data.overall.p99)}
            </div>
          </div>
        </div>
      </section>

      {/* Per-Route Stats */}
      <section className="rc-panel overflow-hidden">
        <PanelHeader
          title="Performance by Route"
          meta={`${sortedRoutes.length} routes`}
        />
        <div className="overflow-x-auto">
          <table className="rc-table">
            <thead>
              <tr>
                <th>Route</th>
                <th className="text-right">Count</th>
                <th className="text-right">Avg</th>
                <th className="text-right">Min</th>
                <th className="text-right">Max</th>
                <th className="text-right">P50</th>
                <th className="text-right">P95</th>
                <th className="text-right">P99</th>
              </tr>
            </thead>
            <tbody>
              {sortedRoutes.map(([route, stats]) => (
                <tr key={route}>
                  <td className="text-xs text-rc-fg-muted">{route}</td>
                  <td className="text-right tabular-nums text-rc-fg-strong">
                    {stats.count}
                  </td>
                  <td className={`text-right ${getStatusColor(stats.avg)}`}>
                    {formatDuration(stats.avg)}
                  </td>
                  <td className="text-right text-rc-success">
                    {formatDuration(stats.min)}
                  </td>
                  <td className="text-right text-rc-danger">
                    {formatDuration(stats.max)}
                  </td>
                  <td className="text-right text-rc-fg-muted">
                    {formatDuration(stats.p50)}
                  </td>
                  <td className="text-right text-rc-ember">
                    {formatDuration(stats.p95)}
                  </td>
                  <td className="text-right text-rc-danger">
                    {formatDuration(stats.p99)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recent Requests */}
      <section className="rc-panel">
        <PanelHeader title="Recent Requests" meta="last 20" />
        <div className="space-y-2 px-[18px] py-3.5">
          {data.recentRequests.map((req, i) => (
            <div
              key={i}
              className="flex flex-wrap items-center justify-between gap-2 rounded-rc-md border border-rc-line/12 bg-black/45 px-3 py-2 font-rc-mono text-xs"
            >
              <div className="text-rc-fg-muted">{req.route}</div>
              <div className="flex items-center gap-4">
                <div className="text-rc-fg-dim">
                  {formatTimestamp(req.timestamp)}
                </div>
                <div className={getStatusColor(req.duration)}>
                  {formatDuration(req.duration)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Performance Targets */}
      <section className="rc-panel">
        <PanelHeader title="Performance Targets" />
        <div className="grid grid-cols-1 gap-4 px-[18px] py-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {TARGETS.map((t) => (
            <div
              key={t.label}
              className="rounded-rc-md border border-rc-line/12 bg-black/30 p-3"
            >
              <div
                className={`flex items-center gap-2 font-rc-mono text-[11px] uppercase tracking-[0.16em] ${t.tone}`}
              >
                <span className="rc-dot" />
                <span>{t.label}</span>
              </div>
              <div className="rc-hint mt-1.5">{t.range}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
