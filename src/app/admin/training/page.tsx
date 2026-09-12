import "server-only";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
import { cookies } from "next/headers";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { PageHeader, PanelHeader } from "@/components/ui/page-header";
import { RcButton, RcLinkButton } from "@/components/ui/rc-button";
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

const RUN_FIELDS: Array<{ name: string; label: string; defaultValue: number; min?: number; step?: string }> = [
  { name: "minutes", label: "Minutes", defaultValue: 2, min: 1 },
  { name: "beam", label: "Beam", defaultValue: 8, min: 1 },
  { name: "depth", label: "Depth", defaultValue: 3, min: 1 },
  { name: "budget", label: "Budget", defaultValue: 60, min: 1 },
  { name: "epsilon", label: "Epsilon", defaultValue: 0, step: "0.05" },
  { name: "gamma", label: "Gamma", defaultValue: 0.6, step: "0.05" },
];

export default async function AdminTrainingPage() {
  await requireAdminSession();
  const [metrics, botReplaysData] = await Promise.all([getMetrics(), getBotReplays()]);
  const topGainers: PerCardEntry[] = (metrics?.perCard?.topGainers as PerCardEntry[] | undefined) ?? [];
  const topLosers: PerCardEntry[] = (metrics?.perCard?.topLosers as PerCardEntry[] | undefined) ?? [];
  const eloRatings: EloRating[] = (metrics?.elo?.ratings as EloRating[] | undefined) ?? [];
  const botReplays: BotReplay[] = botReplaysData?.recordings ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="admin"
        title="CPU Training"
        description="Monitor training runs and launch self-play simulations."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <form action="/api/admin/training/start" method="post" className="rc-panel">
          <PanelHeader title="Start self-play" />
          <div className="px-[18px] py-3.5">
            <div className="grid grid-cols-2 gap-3">
              {RUN_FIELDS.map((f) => (
                <label key={f.name} className="block">
                  <span className="rc-eyebrow">{f.label}</span>
                  <input
                    name={f.name}
                    defaultValue={f.defaultValue}
                    type="number"
                    min={f.min}
                    step={f.step}
                    className="rc-input mt-1 h-9 w-full"
                  />
                </label>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <RcButton type="submit" size="sm">Run</RcButton>
              <RcLinkButton variant="outline" size="sm" href="/api/admin/training/metrics">Raw JSON</RcLinkButton>
            </div>
          </div>
        </form>
        {metrics && (
          <section className="rc-panel">
            <PanelHeader title="Summary" />
            <div className="grid grid-cols-2 gap-4 px-[18px] py-3.5">
              <div>
                <div className="rc-eyebrow">Runs</div>
                <div className="rc-stat mt-1 text-2xl">{metrics.runs}</div>
              </div>
              <div>
                <div className="rc-eyebrow">Files</div>
                <div className="rc-stat mt-1 text-2xl">{metrics.files}</div>
              </div>
              <div>
                <div className="rc-eyebrow">Entries</div>
                <div className="rc-stat mt-1 text-2xl">{metrics.entries}</div>
              </div>
              <div>
                <div className="rc-eyebrow">Avg time (ms)</div>
                <div className="rc-stat mt-1 text-2xl">{metrics.avgTimeMs?.toFixed?.(1) ?? "-"}</div>
              </div>
            </div>
          </section>
        )}
        {metrics && (
          <section className="rc-panel">
            <PanelHeader title="Averages" />
            <div className="grid grid-cols-3 gap-4 px-[18px] py-3.5">
              <div>
                <div className="rc-eyebrow">Avg nodes</div>
                <div className="rc-stat mt-1 text-2xl">{metrics.avgNodes?.toFixed?.(1) ?? "-"}</div>
              </div>
              <div>
                <div className="rc-eyebrow">Avg depth</div>
                <div className="rc-stat mt-1 text-2xl">{metrics.avgDepth?.toFixed?.(2) ?? "-"}</div>
              </div>
              <div>
                <div className="rc-eyebrow">Avg eval</div>
                <div className="rc-stat mt-1 text-2xl">{metrics.avgEval?.toFixed?.(2) ?? "-"}</div>
              </div>
            </div>
          </section>
        )}
      </div>

      <section className="rc-panel">
        <PanelHeader title="Trends" />
        <div className="px-[18px] py-3.5">
          {!metrics && <div className="rc-hint">no data yet</div>}
          {metrics && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {renderSpark("Eval", metrics.trends?.rootEval)}
              {renderSpark("Nodes", metrics.trends?.nodes)}
              {renderSpark("Depth", metrics.trends?.depth)}
              {renderSpark("Time (ms)", metrics.trends?.timeMs)}
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rc-panel overflow-hidden">
          <PanelHeader title="Per-card influence" />
          <div className="px-[18px] py-3.5">
            {!metrics && <div className="rc-hint">no data</div>}
            {metrics && (
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="rc-eyebrow text-rc-success">Top gainers</div>
                  <div className="mt-2 overflow-x-auto">
                    <table className="rc-table">
                      <thead><tr><th>Card</th><th>Count</th><th>Avg Δ</th></tr></thead>
                      <tbody>
                        {topGainers.length > 0 ? topGainers.map((c: PerCardEntry) => (
                          <tr key={c.key}><td className="text-rc-fg-strong">{c.name || c.key}</td><td className="tabular-nums">{c.count}</td><td className="tabular-nums">{(c.avgDelta as number).toFixed(3)}</td></tr>
                        )) : (<tr><td className="text-rc-fg-subtle" colSpan={3}>No data</td></tr>)}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div>
                  <div className="rc-eyebrow text-rc-danger">Top losers</div>
                  <div className="mt-2 overflow-x-auto">
                    <table className="rc-table">
                      <thead><tr><th>Card</th><th>Count</th><th>Avg Δ</th></tr></thead>
                      <tbody>
                        {topLosers.length > 0 ? topLosers.map((c: PerCardEntry) => (
                          <tr key={c.key}><td className="text-rc-fg-strong">{c.name || c.key}</td><td className="tabular-nums">{c.count}</td><td className="tabular-nums">{(c.avgDelta as number).toFixed(3)}</td></tr>
                        )) : (<tr><td className="text-rc-fg-subtle" colSpan={3}>No data</td></tr>)}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
        <section className="rc-panel overflow-hidden">
          <PanelHeader title="Elo ratings" meta={`${eloRatings.length} thetas`} />
          {!metrics && <div className="rc-hint px-[18px] py-3.5">no data</div>}
          {metrics && (
            <div className="overflow-x-auto">
              <table className="rc-table">
                <thead><tr><th>Theta</th><th>Rating</th><th>Games</th></tr></thead>
                <tbody>
                  {eloRatings.length > 0 ? eloRatings.map((r: EloRating) => (
                    <tr key={r.thetaId}><td className="text-rc-fg-strong">{r.thetaId}</td><td className="rc-stat">{r.rating}</td><td className="tabular-nums">{r.games}</td></tr>
                  )) : (<tr><td className="text-rc-fg-subtle" colSpan={3}>No ratings</td></tr>)}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section className="rc-panel overflow-hidden">
        <PanelHeader
          title="Bot Match Replays"
          meta="recent bot training matches"
        />
        {!botReplaysData && <div className="rc-hint px-[18px] py-3.5">no bot replays found</div>}
        {botReplaysData && botReplays.length === 0 && (
          <div className="rc-hint px-[18px] py-3.5">no bot matches recorded yet</div>
        )}
        {botReplays.length > 0 && (
          <div className="overflow-x-auto">
            <table className="rc-table">
              <thead>
                <tr>
                  <th>Match ID</th>
                  <th>Players</th>
                  <th>Type</th>
                  <th>Duration</th>
                  <th>Actions</th>
                  <th>Time</th>
                  <th>View</th>
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
                    <tr key={replay.matchId}>
                      <td className="text-[11px] text-rc-fg-muted">{replay.matchId.slice(0, 8)}</td>
                      <td>
                        <div className="max-w-xs truncate text-rc-fg-strong" title={replay.playerNames.join(' vs ')}>
                          {replay.playerNames.join(' vs ')}
                        </div>
                      </td>
                      <td>
                        <Badge>{replay.matchType}</Badge>
                      </td>
                      <td className="tabular-nums">{durationStr}</td>
                      <td className="tabular-nums">{replay.actionCount}</td>
                      <td className="text-[11px] text-rc-fg-subtle">{timeStr}</td>
                      <td>
                        <div className="flex gap-2">
                          <Link
                            href={`/admin/replays/${replay.matchId}`}
                            className="rc-link text-[11px] uppercase tracking-[0.14em]"
                          >
                            Watch
                          </Link>
                          <Link
                            href={`/api/admin/replays/bots/${replay.matchId}`}
                            className="text-[11px] uppercase tracking-[0.14em] text-rc-fg-muted hover:text-rc-accent-ring"
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
          <div className="rc-hint px-[18px] py-3.5">
            Showing 20 of {botReplays.length} bot replays.
            <Link href="/api/admin/replays/bots" className="rc-link ml-2">
              View all (JSON)
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}

function renderSpark(title: string, data?: Array<{ t: number; v: number }>) {
  if (!Array.isArray(data) || data.length === 0) {
    return (
      <div className="rounded-rc-md border border-rc-line/12 bg-black/30 p-3">
        <div className="font-rc-mono text-[10px] uppercase tracking-[0.22em] text-rc-fg-dim">{title}</div>
        <div className="rc-hint mt-2">no data</div>
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
    <div className="rounded-rc-md border border-rc-line/12 bg-black/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="font-rc-mono text-[10px] uppercase tracking-[0.22em] text-rc-fg-dim">{title}</div>
        <div className="rc-stat text-sm">{Number.isFinite(last) ? last.toFixed(2) : "-"}</div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="60" className="mt-1">
        <polyline fill="none" stroke="rgb(16,185,129)" strokeWidth="1.5" points={pts} />
      </svg>
    </div>
  );
}
