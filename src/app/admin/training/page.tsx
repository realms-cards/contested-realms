import "server-only";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
import { cookies } from "next/headers";
import Link from "next/link";
import { requireAdminSession } from "@/lib/admin/auth";

type TrendPoint = { t: number; v: number };
type PerCardEntry = { key: string; name?: string | null; count: number; avgDelta: number };
type EloRating = { thetaId: string; rating: number; games: number };
type Metrics = {
  runs: number;
  files: number;
  entries: number;
  avgNodes: number | null;
  avgDepth: number | null;
  avgEval: number | null;
  avgTimeMs: number | null;
  recent?: Array<{ t?: number | null; nodes?: number; depth?: number; rootEval?: number; timeMs?: number }>;
  trends?: { rootEval?: TrendPoint[]; nodes?: TrendPoint[]; depth?: TrendPoint[]; timeMs?: TrendPoint[] };
  perCard?: { topGainers?: PerCardEntry[]; topLosers?: PerCardEntry[] };
  elo?: { ratings?: EloRating[] };
};

type BotReplay = {
  matchId: string;
  playerNames: string[];
  playerIds: string[];
  startTime: number;
  endTime?: number;
  duration?: number;
  actionCount: number;
  matchType: string;
  lobbyName?: string;
};

type BotReplaysResponse = {
  recordings: BotReplay[];
  total: number;
};

async function getMetrics(): Promise<Metrics | null> {
  try {
    const base = (process.env.NEXT_PUBLIC_BASE_URL && process.env.NEXT_PUBLIC_BASE_URL.trim().length > 0)
      ? process.env.NEXT_PUBLIC_BASE_URL
      : "http://localhost:3000";
    const jar = await cookies();
    const all = jar.getAll();
    const cookie = all && all.length ? all.map((c) => `${c.name}=${c.value}`).join("; ") : "";
    const res = await fetch(`${base}/api/admin/training/metrics`, {
      cache: "no-store",
      headers: cookie ? { cookie } : undefined,
    });
    if (!res.ok) return null;
    return (await res.json()) as Metrics;
  } catch {
    return null;
  }
}

async function getBotReplays(): Promise<BotReplaysResponse | null> {
  try {
    const base = (process.env.NEXT_PUBLIC_BASE_URL && process.env.NEXT_PUBLIC_BASE_URL.trim().length > 0)
      ? process.env.NEXT_PUBLIC_BASE_URL
      : "http://localhost:3000";
    const jar = await cookies();
    const all = jar.getAll();
    const cookie = all && all.length ? all.map((c) => `${c.name}=${c.value}`).join("; ") : "";
    const res = await fetch(`${base}/api/admin/replays/bots`, {
      cache: "no-store",
      headers: cookie ? { cookie } : undefined,
    });
    if (!res.ok) {
      console.error(`[admin] Bot replays fetch failed: ${res.status} ${res.statusText}`);
      return null;
    }
    const data = (await res.json()) as BotReplaysResponse;
    console.log(`[admin] Bot replays loaded: ${data.recordings?.length || 0} matches`);
    return data;
  } catch (error) {
    console.error('[admin] Bot replays fetch error:', error);
    return null;
  }
}

export default async function AdminTrainingPage() {
  await requireAdminSession();
  const [metrics, botReplaysData] = await Promise.all([getMetrics(), getBotReplays()]);
  const topGainers: PerCardEntry[] = (metrics?.perCard?.topGainers as PerCardEntry[] | undefined) ?? [];
  const topLosers: PerCardEntry[] = (metrics?.perCard?.topLosers as PerCardEntry[] | undefined) ?? [];
  const eloRatings: EloRating[] = (metrics?.elo?.ratings as EloRating[] | undefined) ?? [];
  const botReplays: BotReplay[] = botReplaysData?.recordings ?? [];

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold text-white">Admin: CPU Training</h1>
        <p className="text-sm text-slate-400">Monitor training runs and launch self-play simulations.</p>
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-3">
        <form action="/api/admin/training/start" method="post" className="rounded border border-slate-800 bg-slate-900/60 p-4">
          <div className="text-sm font-semibold text-white">Start self-play</div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-slate-200">
            <label className="flex items-center gap-2"><span className="w-20 text-slate-400">Minutes</span><input name="minutes" defaultValue={2} type="number" min={1} className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1" /></label>
            <label className="flex items-center gap-2"><span className="w-20 text-slate-400">Beam</span><input name="beam" defaultValue={8} type="number" min={1} className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1" /></label>
            <label className="flex items-center gap-2"><span className="w-20 text-slate-400">Depth</span><input name="depth" defaultValue={3} type="number" min={1} className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1" /></label>
            <label className="flex items-center gap-2"><span className="w-20 text-slate-400">Budget</span><input name="budget" defaultValue={60} type="number" min={1} className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1" /></label>
            <label className="flex items-center gap-2"><span className="w-20 text-slate-400">Epsilon</span><input name="epsilon" defaultValue={0} step="0.05" type="number" className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1" /></label>
            <label className="flex items-center gap-2"><span className="w-20 text-slate-400">Gamma</span><input name="gamma" defaultValue={0.6} step="0.05" type="number" className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1" /></label>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button className="text-xs px-3 py-1 rounded border border-emerald-400 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20" type="submit">Run</button>
            <Link className="text-xs px-3 py-1 rounded border border-slate-700 text-slate-200 hover:bg-slate-800" href="/api/admin/training/metrics">Raw JSON</Link>
          </div>
        </form>
        {metrics && (
          <div className="rounded border border-slate-800 bg-slate-900/60 p-4">
            <div className="text-sm font-semibold text-white">Summary</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-200">
              <div><div className="text-slate-400">Runs</div><div className="text-base font-semibold text-white">{metrics.runs}</div></div>
              <div><div className="text-slate-400">Files</div><div className="text-base font-semibold text-white">{metrics.files}</div></div>
              <div><div className="text-slate-400">Entries</div><div className="text-base font-semibold text-white">{metrics.entries}</div></div>
              <div><div className="text-slate-400">Avg time (ms)</div><div className="text-base font-semibold text-white">{metrics.avgTimeMs?.toFixed?.(1) ?? "-"}</div></div>
            </div>
          </div>
        )}
        {metrics && (
          <div className="rounded border border-slate-800 bg-slate-900/60 p-4">
            <div className="text-sm font-semibold text-white">Averages</div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-200">
              <div><div className="text-slate-400">Avg nodes</div><div className="text-base font-semibold text-white">{metrics.avgNodes?.toFixed?.(1) ?? "-"}</div></div>
              <div><div className="text-slate-400">Avg depth</div><div className="text-base font-semibold text-white">{metrics.avgDepth?.toFixed?.(2) ?? "-"}</div></div>
              <div><div className="text-slate-400">Avg eval</div><div className="text-base font-semibold text-white">{metrics.avgEval?.toFixed?.(2) ?? "-"}</div></div>
            </div>
          </div>
        )}
      </div>

      <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
        <h2 className="mb-3 text-lg font-semibold text-white">Trends</h2>
        {!metrics && <div className="text-sm text-slate-400">No data yet.</div>}
        {metrics && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {renderSpark("Eval", metrics.trends?.rootEval)}
            {renderSpark("Nodes", metrics.trends?.nodes)}
            {renderSpark("Depth", metrics.trends?.depth)}
            {renderSpark("Time (ms)", metrics.trends?.timeMs)}
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
          <h2 className="mb-2 text-lg font-semibold text-white">Per-card influence</h2>
          {!metrics && <div className="text-sm text-slate-400">No data.</div>}
          {metrics && (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-wide text-emerald-300">Top gainers</div>
                <div className="mt-2 overflow-auto rounded border border-slate-800 bg-slate-900/50">
                  <table className="min-w-full text-left text-xs text-slate-200">
                    <thead className="bg-slate-900/70 text-[11px] uppercase tracking-wide text-slate-400"><tr><th className="px-3 py-2">Card</th><th className="px-3 py-2">Count</th><th className="px-3 py-2">Avg Δ</th></tr></thead>
                    <tbody>
                      {topGainers.length > 0 ? topGainers.map((c: PerCardEntry) => (
                        <tr key={c.key} className="border-t border-slate-800/60"><td className="px-3 py-2">{c.name || c.key}</td><td className="px-3 py-2">{c.count}</td><td className="px-3 py-2">{(c.avgDelta as number).toFixed(3)}</td></tr>
                      )) : (<tr><td className="px-3 py-2 text-slate-400" colSpan={3}>No data</td></tr>)}
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-rose-300">Top losers</div>
                <div className="mt-2 overflow-auto rounded border border-slate-800 bg-slate-900/50">
                  <table className="min-w-full text-left text-xs text-slate-200">
                    <thead className="bg-slate-900/70 text-[11px] uppercase tracking-wide text-slate-400"><tr><th className="px-3 py-2">Card</th><th className="px-3 py-2">Count</th><th className="px-3 py-2">Avg Δ</th></tr></thead>
                    <tbody>
                      {topLosers.length > 0 ? topLosers.map((c: PerCardEntry) => (
                        <tr key={c.key} className="border-t border-slate-800/60"><td className="px-3 py-2">{c.name || c.key}</td><td className="px-3 py-2">{c.count}</td><td className="px-3 py-2">{(c.avgDelta as number).toFixed(3)}</td></tr>
                      )) : (<tr><td className="px-3 py-2 text-slate-400" colSpan={3}>No data</td></tr>)}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
          <h2 className="mb-2 text-lg font-semibold text-white">Elo ratings</h2>
          {!metrics && <div className="text-sm text-slate-400">No data.</div>}
          {metrics && (
            <div className="overflow-auto rounded border border-slate-800 bg-slate-900/50">
              <table className="min-w-full text-left text-xs text-slate-200">
                <thead className="bg-slate-900/70 text-[11px] uppercase tracking-wide text-slate-400"><tr><th className="px-3 py-2">Theta</th><th className="px-3 py-2">Rating</th><th className="px-3 py-2">Games</th></tr></thead>
                <tbody>
                  {eloRatings.length > 0 ? eloRatings.map((r: EloRating) => (
                    <tr key={r.thetaId} className="border-t border-slate-800/60"><td className="px-3 py-2">{r.thetaId}</td><td className="px-3 py-2">{r.rating}</td><td className="px-3 py-2">{r.games}</td></tr>
                  )) : (<tr><td className="px-3 py-2 text-slate-400" colSpan={3}>No ratings</td></tr>)}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 rounded border border-slate-800 bg-slate-900/40 p-4">
        <h2 className="mb-3 text-lg font-semibold text-white">Bot Match Replays</h2>
        <p className="mb-3 text-sm text-slate-400">
          Recent bot training matches. Click a match to view the full replay.
        </p>
        {!botReplaysData && <div className="text-sm text-slate-400">No bot replays found.</div>}
        {botReplaysData && botReplays.length === 0 && (
          <div className="text-sm text-slate-400">No bot matches recorded yet.</div>
        )}
        {botReplays.length > 0 && (
          <div className="overflow-auto rounded border border-slate-800 bg-slate-900/50">
            <table className="min-w-full text-left text-xs text-slate-200">
              <thead className="bg-slate-900/70 text-[11px] uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-2">Match ID</th>
                  <th className="px-3 py-2">Players</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Duration</th>
                  <th className="px-3 py-2">Actions</th>
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">View</th>
                </tr>
              </thead>
              <tbody>
                {botReplays.slice(0, 20).map((replay) => {
                  const durationSeconds = replay.duration ? Math.floor(replay.duration / 1000) : null;
                  const durationStr = durationSeconds
                    ? `${Math.floor(durationSeconds / 60)}:${String(durationSeconds % 60).padStart(2, '0')}`
                    : '-';
                  const timeStr = replay.endTime
                    ? new Date(replay.endTime).toLocaleString()
                    : new Date(replay.startTime).toLocaleString();

                  return (
                    <tr key={replay.matchId} className="border-t border-slate-800/60 hover:bg-slate-800/30">
                      <td className="px-3 py-2 font-mono text-[10px]">{replay.matchId.slice(0, 8)}</td>
                      <td className="px-3 py-2">
                        <div className="max-w-xs truncate" title={replay.playerNames.join(' vs ')}>
                          {replay.playerNames.join(' vs ')}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span className="rounded bg-slate-700/50 px-1.5 py-0.5 text-[10px] uppercase">
                          {replay.matchType}
                        </span>
                      </td>
                      <td className="px-3 py-2">{durationStr}</td>
                      <td className="px-3 py-2">{replay.actionCount}</td>
                      <td className="px-3 py-2 text-[10px] text-slate-400">{timeStr}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <Link
                            href={`/admin/replays/${replay.matchId}`}
                            className="rounded bg-blue-600/20 px-2 py-1 text-[10px] text-blue-200 hover:bg-blue-600/30"
                          >
                            Watch
                          </Link>
                          <Link
                            href={`/api/admin/replays/bots/${replay.matchId}`}
                            className="rounded bg-slate-700/50 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-600/50"
                            target="_blank"
                          >
                            JSON
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {botReplays.length > 20 && (
          <div className="mt-3 text-xs text-slate-400">
            Showing 20 of {botReplays.length} bot replays.
            <Link href="/api/admin/replays/bots" className="ml-2 text-blue-400 hover:text-blue-300">
              View all (JSON)
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function renderSpark(title: string, data?: Array<{ t: number; v: number }>) {
  if (!Array.isArray(data) || data.length === 0) {
    return (
      <div className="rounded border border-slate-800 bg-slate-900/60 p-3">
        <div className="text-xs text-slate-400">{title}</div>
        <div className="mt-2 text-xs text-slate-500">No data</div>
      </div>
    );
  }
  const w = 260;
  const h = 60;
  const xs = data.map((_, i) => (i / Math.max(1, data.length - 1)) * (w - 2) + 1);
  const vals = data.map((p) => Number(p.v) || 0);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const ys = vals.map((v) => h - 1 - ((v - min) / span) * (h - 2));
  const pts = xs.map((x, i) => `${x},${ys[i]}`).join(" ");
  const last = vals[vals.length - 1];
  return (
    <div className="rounded border border-slate-800 bg-slate-900/60 p-3">
      <div className="flex items-center justify-between"><div className="text-xs text-slate-400">{title}</div><div className="text-xs font-semibold text-slate-200">{Number.isFinite(last) ? last.toFixed(2) : "-"}</div></div>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="60" className="mt-1">
        <polyline fill="none" stroke="rgb(16,185,129)" strokeWidth="1.5" points={pts} />
      </svg>
    </div>
  );
}
