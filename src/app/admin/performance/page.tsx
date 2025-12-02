'use client';

import { useEffect, useState } from 'react';

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

export default function AdminPerformancePage() {
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchData = async () => {
    try {
      const res = await fetch('/api/monitoring/performance');
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch performance data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    if (autoRefresh) {
      const interval = setInterval(fetchData, 10000); // Refresh every 10s
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
    if (avg < 50) return 'text-emerald-400';
    if (avg < 200) return 'text-yellow-400';
    if (avg < 500) return 'text-orange-400';
    return 'text-red-400';
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-slate-100">API Performance Monitoring</h1>
        <div className="text-slate-400">Loading performance data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-slate-100">API Performance Monitoring</h1>
        <div className="rounded-lg border border-red-800 bg-red-900/20 p-4">
          <div className="font-semibold text-red-400">Error</div>
          <div className="text-sm text-red-300">{error}</div>
        </div>
        <button
          onClick={() => {
            setLoading(true);
            fetchData();
          }}
          className="rounded bg-slate-700 px-4 py-2 text-sm text-slate-100 hover:bg-slate-600"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data || !data.overall) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-slate-100">API Performance Monitoring</h1>
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6 text-center">
          <div className="text-slate-400">No performance data collected yet</div>
          <div className="mt-2 text-sm text-slate-500">
            Metrics will appear once API routes are called
          </div>
        </div>
      </div>
    );
  }

  const sortedRoutes = Object.entries(data.byRoute).sort((a, b) => b[1].count - a[1].count);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100">API Performance Monitoring</h1>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Auto-refresh (10s)
          </label>
          <button
            onClick={fetchData}
            className="rounded bg-slate-700 px-3 py-1.5 text-sm text-slate-100 hover:bg-slate-600"
          >
            Refresh Now
          </button>
        </div>
      </div>

      {/* Overall Stats */}
      <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-200">Overall Statistics</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
          <div>
            <div className="text-xs text-slate-400">Requests</div>
            <div className="text-2xl font-bold text-slate-100">{data.overall.count}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">Average</div>
            <div className={`text-2xl font-bold ${getStatusColor(data.overall.avg)}`}>
              {formatDuration(data.overall.avg)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400">Min</div>
            <div className="text-2xl font-bold text-emerald-400">
              {formatDuration(data.overall.min)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400">Max</div>
            <div className="text-2xl font-bold text-red-400">
              {formatDuration(data.overall.max)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400">P50 (Median)</div>
            <div className="text-2xl font-bold text-slate-100">
              {formatDuration(data.overall.p50)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400">P95</div>
            <div className="text-2xl font-bold text-orange-400">
              {formatDuration(data.overall.p95)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400">P99</div>
            <div className="text-2xl font-bold text-red-400">
              {formatDuration(data.overall.p99)}
            </div>
          </div>
        </div>
      </div>

      {/* Per-Route Stats */}
      <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-200">Performance by Route</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-700">
              <tr className="text-xs text-slate-400">
                <th className="pb-2 font-medium">Route</th>
                <th className="pb-2 font-medium text-right">Count</th>
                <th className="pb-2 font-medium text-right">Avg</th>
                <th className="pb-2 font-medium text-right">Min</th>
                <th className="pb-2 font-medium text-right">Max</th>
                <th className="pb-2 font-medium text-right">P50</th>
                <th className="pb-2 font-medium text-right">P95</th>
                <th className="pb-2 font-medium text-right">P99</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {sortedRoutes.map(([route, stats]) => (
                <tr key={route} className="hover:bg-slate-700/30">
                  <td className="py-2 font-mono text-xs text-slate-300">{route}</td>
                  <td className="py-2 text-right text-slate-100">{stats.count}</td>
                  <td className={`py-2 text-right font-semibold ${getStatusColor(stats.avg)}`}>
                    {formatDuration(stats.avg)}
                  </td>
                  <td className="py-2 text-right text-emerald-400">{formatDuration(stats.min)}</td>
                  <td className="py-2 text-right text-red-400">{formatDuration(stats.max)}</td>
                  <td className="py-2 text-right text-slate-300">{formatDuration(stats.p50)}</td>
                  <td className="py-2 text-right text-orange-400">{formatDuration(stats.p95)}</td>
                  <td className="py-2 text-right text-red-400">{formatDuration(stats.p99)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Requests */}
      <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-200">Recent Requests (Last 20)</h2>
        <div className="space-y-2">
          {data.recentRequests.map((req, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded border border-slate-700 bg-slate-900/50 px-3 py-2 text-sm"
            >
              <div className="font-mono text-xs text-slate-300">{req.route}</div>
              <div className="flex items-center gap-4">
                <div className="text-xs text-slate-500">{formatTimestamp(req.timestamp)}</div>
                <div className={`font-semibold ${getStatusColor(req.duration)}`}>
                  {formatDuration(req.duration)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Performance Targets */}
      <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-200">Performance Targets</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded border border-emerald-800 bg-emerald-900/20 p-3">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-emerald-400" />
              <div className="text-sm font-semibold text-emerald-300">Excellent</div>
            </div>
            <div className="mt-1 text-xs text-slate-400">&lt; 50ms</div>
          </div>
          <div className="rounded border border-yellow-800 bg-yellow-900/20 p-3">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-yellow-400" />
              <div className="text-sm font-semibold text-yellow-300">Good</div>
            </div>
            <div className="mt-1 text-xs text-slate-400">50ms - 200ms</div>
          </div>
          <div className="rounded border border-orange-800 bg-orange-900/20 p-3">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-orange-400" />
              <div className="text-sm font-semibold text-orange-300">Fair</div>
            </div>
            <div className="mt-1 text-xs text-slate-400">200ms - 500ms</div>
          </div>
          <div className="rounded border border-red-800 bg-red-900/20 p-3">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-red-400" />
              <div className="text-sm font-semibold text-red-300">Slow</div>
            </div>
            <div className="mt-1 text-xs text-slate-400">&gt; 500ms</div>
          </div>
        </div>
      </div>
    </div>
  );
}
