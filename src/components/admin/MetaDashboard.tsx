"use client";

import clsx from "clsx";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CustomSelect } from "@/components/ui/CustomSelect";

type CardStat = {
  cardId: number;
  name: string;
  plays: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  type: string | null;
};

type ElementStat = {
  element: string;
  plays: number;
  wins: number;
  winRate: number;
};

type TypeStat = {
  type: string;
  plays: number;
  wins: number;
  winRate: number;
};

type CostStat = {
  cost: number;
  plays: number;
  wins: number;
  winRate: number;
};

type MatchStat = {
  format: string;
  totalMatches: number;
  avgDurationSec: number | null;
};

type MetaDashboardProps = {
  adminName?: string | null;
};

const ELEMENT_COLORS: Record<string, { bg: string; border: string; text: string; bar: string }> = {
  Fire: { bg: "bg-red-950/40", border: "border-red-700/60", text: "text-red-300", bar: "bg-red-500" },
  Water: { bg: "bg-blue-950/40", border: "border-blue-700/60", text: "text-blue-300", bar: "bg-blue-500" },
  Earth: { bg: "bg-amber-950/40", border: "border-amber-700/60", text: "text-amber-300", bar: "bg-amber-500" },
  Air: { bg: "bg-cyan-950/40", border: "border-cyan-700/60", text: "text-cyan-300", bar: "bg-cyan-400" },
};

const DEFAULT_ELEMENT_STYLE = {
  bg: "bg-slate-900/60",
  border: "border-slate-700",
  text: "text-slate-300",
  bar: "bg-slate-500",
};

function getElementStyle(element: string) {
  const parts = element.split(/[,\s/]+/).map((s) => s.trim());
  for (const part of parts) {
    const match = ELEMENT_COLORS[part];
    if (match) return match;
  }
  return DEFAULT_ELEMENT_STYLE;
}

function StatCard({
  label,
  value,
  sublabel,
}: {
  label: string;
  value?: number | string;
  sublabel?: string;
}) {
  return (
    <div className="rounded border border-slate-700 bg-slate-900/60 px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-white">
        {typeof value === "number"
          ? new Intl.NumberFormat().format(value)
          : value ?? "—"}
      </div>
      {sublabel && <div className="text-xs text-slate-400">{sublabel}</div>}
    </div>
  );
}

function WinRateBar({ winRate, barColor }: { winRate: number; barColor: string }) {
  const pct = Math.round(winRate * 100);
  return (
    <div className="flex items-center gap-2 mt-1.5">
      <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden">
        <div
          className={`h-full rounded-full ${barColor} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-medium text-white tabular-nums w-12 text-right">
        {(winRate * 100).toFixed(1)}%
      </span>
    </div>
  );
}

type CardCategory = "avatar" | "site" | "spellbook";

function CardStatsTable({
  stats,
  loading,
  error,
  order,
  setOrder,
  limit,
  setLimit,
  onRefresh,
  showType,
}: {
  stats: CardStat[];
  loading: boolean;
  error: string | null;
  order: "plays" | "wins" | "winRate";
  setOrder: (v: "plays" | "wins" | "winRate") => void;
  limit: number;
  setLimit: (v: number) => void;
  onRefresh: () => void;
  showType?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-end">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1">
            <span className="text-slate-300">Order</span>
            <CustomSelect
              value={order}
              onChange={(v) => setOrder(v as typeof order)}
              options={[
                { value: "plays", label: "plays" },
                { value: "wins", label: "wins" },
                { value: "winRate", label: "win rate" },
              ]}
            />
          </label>
          <label className="flex items-center gap-1">
            <span className="text-slate-300">Limit</span>
            <input
              type="number"
              min={1}
              max={200}
              value={limit}
              onChange={(e) =>
                setLimit(
                  Math.max(1, Math.min(200, Number(e.target.value) || 50))
                )
              }
              className="w-20 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-slate-200"
            />
          </label>
          <button
            onClick={onRefresh}
            className="inline-flex items-center rounded border border-slate-600 px-3 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800"
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>
      {error && (
        <div className="rounded border border-rose-500/50 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
          {error}
        </div>
      )}
      <div className="overflow-auto rounded border border-slate-800 bg-slate-900/40">
        <table className="min-w-full text-left text-xs text-slate-200">
          <thead className="bg-slate-900/70 text-[11px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2">Card</th>
              {showType && <th className="px-3 py-2">Type</th>}
              <th className="px-3 py-2">Plays</th>
              <th className="px-3 py-2">Wins</th>
              <th className="px-3 py-2">Losses</th>
              <th className="px-3 py-2">Draws</th>
              <th className="px-3 py-2">Win Rate</th>
            </tr>
          </thead>
          <tbody>
            {stats.length === 0 ? (
              <tr>
                <td
                  className="px-3 py-2 text-slate-300"
                  colSpan={showType ? 7 : 6}
                >
                  No stats yet. Play some matches or adjust filters.
                </td>
              </tr>
            ) : (
              stats.map((row) => (
                <tr
                  key={row.cardId}
                  className="border-t border-slate-800/60"
                >
                  <td className="px-3 py-2">
                    <span className="font-medium text-white">{row.name}</span>
                    <div className="text-[10px] text-slate-400">
                      #{row.cardId}
                    </div>
                  </td>
                  {showType && (
                    <td className="px-3 py-2 text-slate-400">{row.type}</td>
                  )}
                  <td className="px-3 py-2">{row.plays}</td>
                  <td className="px-3 py-2">{row.wins}</td>
                  <td className="px-3 py-2">{row.losses}</td>
                  <td className="px-3 py-2">{row.draws}</td>
                  <td className="px-3 py-2">
                    {(row.winRate * 100).toFixed(1)}%
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function MetaDashboard({ adminName }: MetaDashboardProps) {
  const [format, setFormat] = useState<"constructed" | "sealed" | "draft">(
    "constructed"
  );

  // Avatar stats
  const [avatarStats, setAvatarStats] = useState<CardStat[]>([]);
  const [avatarStatsLoading, setAvatarStatsLoading] = useState(false);

  // Site stats
  const [siteStats, setSiteStats] = useState<CardStat[]>([]);
  const [siteStatsError, setSiteStatsError] = useState<string | null>(null);
  const [siteStatsLoading, setSiteStatsLoading] = useState(false);
  const [siteStatsOrder, setSiteStatsOrder] = useState<
    "plays" | "wins" | "winRate"
  >("plays");
  const [siteStatsLimit, setSiteStatsLimit] = useState(50);

  // Spellbook stats
  const [spellbookStats, setSpellbookStats] = useState<CardStat[]>([]);
  const [spellbookStatsError, setSpellbookStatsError] = useState<string | null>(
    null
  );
  const [spellbookStatsLoading, setSpellbookStatsLoading] = useState(false);
  const [spellbookStatsOrder, setSpellbookStatsOrder] = useState<
    "plays" | "wins" | "winRate"
  >("plays");
  const [spellbookStatsLimit, setSpellbookStatsLimit] = useState(50);

  // Element stats
  const [elementStats, setElementStats] = useState<ElementStat[]>([]);
  const [elementStatsLoading, setElementStatsLoading] = useState(false);

  // Type stats
  const [typeStats, setTypeStats] = useState<TypeStat[]>([]);
  const [typeStatsLoading, setTypeStatsLoading] = useState(false);

  // Cost stats
  const [costStats, setCostStats] = useState<CostStat[]>([]);
  const [costStatsLoading, setCostStatsLoading] = useState(false);

  // Match stats
  const [matchStats, setMatchStats] = useState<MatchStat[]>([]);
  const [matchStatsLoading, setMatchStatsLoading] = useState(false);

  // Clear stats
  const [clearing, setClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const fetchCategoryStats = useCallback(
    async (
      category: CardCategory,
      order: "plays" | "wins" | "winRate",
      limit: number
    ) => {
      const params = new URLSearchParams();
      params.set("format", format);
      params.set("order", order);
      params.set("limit", String(limit));
      params.set("category", category);
      const response = await fetch(
        `/api/admin/human-card-stats?${params.toString()}`,
        { method: "GET", cache: "no-store" }
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error || `HTTP ${response.status}`);
      }
      const payload = (await response.json()) as { stats: CardStat[] };
      return payload.stats || [];
    },
    [format]
  );

  const refreshAvatarStats = useCallback(async () => {
    setAvatarStatsLoading(true);
    try {
      const stats = await fetchCategoryStats("avatar", "plays", 50);
      setAvatarStats(stats);
    } finally {
      setAvatarStatsLoading(false);
    }
  }, [fetchCategoryStats]);

  const refreshSiteStats = useCallback(async () => {
    setSiteStatsLoading(true);
    setSiteStatsError(null);
    try {
      const stats = await fetchCategoryStats(
        "site",
        siteStatsOrder,
        siteStatsLimit
      );
      setSiteStats(stats);
    } catch (error) {
      setSiteStatsError(
        error instanceof Error ? error.message : "Failed to load stats"
      );
    } finally {
      setSiteStatsLoading(false);
    }
  }, [fetchCategoryStats, siteStatsOrder, siteStatsLimit]);

  const refreshSpellbookStats = useCallback(async () => {
    setSpellbookStatsLoading(true);
    setSpellbookStatsError(null);
    try {
      const stats = await fetchCategoryStats(
        "spellbook",
        spellbookStatsOrder,
        spellbookStatsLimit
      );
      setSpellbookStats(stats);
    } catch (error) {
      setSpellbookStatsError(
        error instanceof Error ? error.message : "Failed to load stats"
      );
    } finally {
      setSpellbookStatsLoading(false);
    }
  }, [fetchCategoryStats, spellbookStatsOrder, spellbookStatsLimit]);

  const refreshElementStats = useCallback(async () => {
    setElementStatsLoading(true);
    try {
      const response = await fetch(
        `/api/admin/meta/elements?format=${format}`,
        { cache: "no-store" }
      );
      if (response.ok) {
        const payload = (await response.json()) as { stats: ElementStat[] };
        setElementStats(payload.stats || []);
      }
    } finally {
      setElementStatsLoading(false);
    }
  }, [format]);

  const refreshTypeStats = useCallback(async () => {
    setTypeStatsLoading(true);
    try {
      const response = await fetch(`/api/admin/meta/types?format=${format}`, {
        cache: "no-store",
      });
      if (response.ok) {
        const payload = (await response.json()) as { stats: TypeStat[] };
        const filtered = (payload.stats || []).filter((t) => {
          const lower = t.type.toLowerCase();
          return lower !== "avatar" && !lower.includes("site");
        });
        setTypeStats(filtered);
      }
    } finally {
      setTypeStatsLoading(false);
    }
  }, [format]);

  const refreshCostStats = useCallback(async () => {
    setCostStatsLoading(true);
    try {
      const response = await fetch(`/api/admin/meta/costs?format=${format}`, {
        cache: "no-store",
      });
      if (response.ok) {
        const payload = (await response.json()) as { stats: CostStat[] };
        setCostStats(payload.stats || []);
      }
    } finally {
      setCostStatsLoading(false);
    }
  }, [format]);

  const refreshMatchStats = useCallback(async () => {
    setMatchStatsLoading(true);
    try {
      const response = await fetch("/api/admin/meta/matches", {
        cache: "no-store",
      });
      if (response.ok) {
        const payload = (await response.json()) as { stats: MatchStat[] };
        setMatchStats(payload.stats || []);
      }
    } finally {
      setMatchStatsLoading(false);
    }
  }, []);

  const refreshAll = useCallback(() => {
    void refreshAvatarStats();
    void refreshSiteStats();
    void refreshSpellbookStats();
    void refreshElementStats();
    void refreshTypeStats();
    void refreshCostStats();
    void refreshMatchStats();
  }, [
    refreshAvatarStats,
    refreshSiteStats,
    refreshSpellbookStats,
    refreshElementStats,
    refreshTypeStats,
    refreshCostStats,
    refreshMatchStats,
  ]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const clearStats = useCallback(
    async (formatToClear?: string) => {
      setClearing(true);
      try {
        const response = await fetch("/api/admin/meta/clear", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ format: formatToClear }),
        });
        if (response.ok) {
          setShowClearConfirm(false);
          refreshAll();
        }
      } finally {
        setClearing(false);
      }
    },
    [refreshAll]
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-10">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-white">
              Meta Statistics
            </h1>
            <p className="text-sm text-slate-400">
              Card and match analytics • Signed in as {adminName || "admin"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="inline-flex items-center justify-center rounded border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
            >
              ← Back to Admin
            </Link>
            <button
              onClick={refreshAll}
              className="inline-flex items-center justify-center rounded border border-emerald-400 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-500/20"
            >
              Refresh All
            </button>
            <button
              onClick={() => setShowClearConfirm(true)}
              className="inline-flex items-center justify-center rounded border border-rose-400 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-200 hover:bg-rose-500/20"
            >
              Clear Stats
            </button>
          </div>
        </header>

        {/* Clear confirmation modal */}
        {showClearConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="rounded-lg border border-slate-700 bg-slate-900 p-6 shadow-xl max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-white mb-2">
                Clear Meta Statistics
              </h3>
              <p className="text-sm text-slate-300 mb-4">
                This will permanently delete card win rate data. Choose which
                format to clear:
              </p>
              <div className="flex flex-col gap-2 mb-4">
                <button
                  onClick={() => void clearStats(format)}
                  disabled={clearing}
                  className="w-full rounded border border-amber-400 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-200 hover:bg-amber-500/20 disabled:opacity-50"
                >
                  {clearing ? "Clearing..." : `Clear ${format} only`}
                </button>
                <button
                  onClick={() => void clearStats()}
                  disabled={clearing}
                  className="w-full rounded border border-rose-400 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-200 hover:bg-rose-500/20 disabled:opacity-50"
                >
                  {clearing ? "Clearing..." : "Clear ALL formats"}
                </button>
              </div>
              <button
                onClick={() => setShowClearConfirm(false)}
                disabled={clearing}
                className="w-full rounded border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Format selector */}
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-300">Format:</span>
          {(["constructed", "sealed", "draft"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFormat(f)}
              className={clsx(
                "rounded px-3 py-1.5 text-sm font-medium transition",
                format === f
                  ? "bg-emerald-500/20 text-emerald-200 border border-emerald-400"
                  : "bg-slate-800 text-slate-300 border border-slate-600 hover:bg-slate-700"
              )}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Match Overview */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-4">
            Match Overview
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {matchStats.map((stat) => (
              <StatCard
                key={stat.format}
                label={`${stat.format} matches`}
                value={stat.totalMatches}
                sublabel={
                  stat.avgDurationSec
                    ? `Avg ${Math.round(stat.avgDurationSec / 60)} min`
                    : undefined
                }
              />
            ))}
          </div>
          {matchStatsLoading && (
            <p className="text-xs text-slate-400 mt-2">Loading...</p>
          )}
        </section>

        {/* Avatar Win Rates */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-4">
            Avatar Win Rates
          </h2>
          {avatarStatsLoading ? (
            <p className="text-sm text-slate-400">Loading...</p>
          ) : avatarStats.length === 0 ? (
            <p className="text-sm text-slate-400">No avatar data available.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {avatarStats.map((a) => (
                <div
                  key={a.cardId}
                  className="rounded border border-purple-700/40 bg-purple-950/20 px-4 py-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-white">{a.name}</span>
                    <span className="text-sm font-semibold text-purple-300">
                      {(a.winRate * 100).toFixed(1)}%
                    </span>
                  </div>
                  <WinRateBar winRate={a.winRate} barColor="bg-purple-500" />
                  <div className="flex items-center gap-3 text-xs text-slate-400 mt-1.5">
                    <span>{a.plays} played</span>
                    <span>{a.wins}W / {a.losses}L{a.draws > 0 ? ` / ${a.draws}D` : ""}</span>
                    <span className="text-[10px]">#{a.cardId}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Element Distribution */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-4">
            Win Rate by Element
          </h2>
          {elementStatsLoading ? (
            <p className="text-sm text-slate-400">Loading...</p>
          ) : elementStats.length === 0 ? (
            <p className="text-sm text-slate-400">No element data available.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {elementStats.map((e) => {
                const style = getElementStyle(e.element);
                return (
                  <div
                    key={e.element}
                    className={`rounded border ${style.border} ${style.bg} px-4 py-3`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`font-medium ${style.text}`}>
                        {e.element || "None"}
                      </span>
                      <span className="text-xs text-slate-400">
                        {e.plays.toLocaleString()} plays
                      </span>
                    </div>
                    <WinRateBar winRate={e.winRate} barColor={style.bar} />
                    <div className="text-xs text-slate-400 mt-1">
                      {e.wins.toLocaleString()} wins of{" "}
                      {e.plays.toLocaleString()} plays
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Type Distribution */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-4">
            Win Rate by Card Type
          </h2>
          {typeStatsLoading ? (
            <p className="text-sm text-slate-400">Loading...</p>
          ) : typeStats.length === 0 ? (
            <p className="text-sm text-slate-400">No type data available.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {typeStats.map((t) => (
                <div
                  key={t.type}
                  className="rounded border border-slate-700 bg-slate-900/60 px-4 py-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-white">{t.type}</span>
                    <span className="text-xs text-slate-400">
                      {t.plays.toLocaleString()} plays
                    </span>
                  </div>
                  <WinRateBar winRate={t.winRate} barColor="bg-emerald-500" />
                  <div className="text-xs text-slate-400 mt-1">
                    {t.wins.toLocaleString()} wins of{" "}
                    {t.plays.toLocaleString()} plays
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Mana Curve */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-4">
            Win Rate by Mana Cost
          </h2>
          {costStatsLoading ? (
            <p className="text-sm text-slate-400">Loading...</p>
          ) : costStats.length === 0 ? (
            <p className="text-sm text-slate-400">No cost data available.</p>
          ) : (
            <div className="overflow-auto rounded border border-slate-800 bg-slate-900/40">
              <table className="min-w-full text-left text-sm text-slate-200">
                <thead className="bg-slate-900/70 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Cost</th>
                    <th className="px-3 py-2">Plays</th>
                    <th className="px-3 py-2">Wins</th>
                    <th className="px-3 py-2">Win Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {costStats.map((c) => (
                    <tr key={c.cost} className="border-t border-slate-800/60">
                      <td className="px-3 py-2 font-medium">{c.cost}</td>
                      <td className="px-3 py-2">{c.plays.toLocaleString()}</td>
                      <td className="px-3 py-2">{c.wins.toLocaleString()}</td>
                      <td className="px-3 py-2 text-emerald-300">
                        {(c.winRate * 100).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Site Win Rates */}
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-white">Site Win Rates</h2>
          <CardStatsTable
            stats={siteStats}
            loading={siteStatsLoading}
            error={siteStatsError}
            order={siteStatsOrder}
            setOrder={setSiteStatsOrder}
            limit={siteStatsLimit}
            setLimit={setSiteStatsLimit}
            onRefresh={() => void refreshSiteStats()}
          />
        </section>

        {/* Spellbook Win Rates */}
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-white">
            Spellbook Win Rates
          </h2>
          <p className="text-xs text-slate-400 -mt-2">
            Minions, Auras, Artifacts, Magic, and other non-site cards
          </p>
          <CardStatsTable
            stats={spellbookStats}
            loading={spellbookStatsLoading}
            error={spellbookStatsError}
            order={spellbookStatsOrder}
            setOrder={setSpellbookStatsOrder}
            limit={spellbookStatsLimit}
            setLimit={setSpellbookStatsLimit}
            onRefresh={() => void refreshSpellbookStats()}
            showType
          />
        </section>
      </div>
    </div>
  );
}
