"use client";

import clsx from "clsx";
import Image from "next/image";
import React, { useCallback, useEffect, useState } from "react";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { PageHeader, PanelHeader } from "@/components/ui/page-header";
import { RcButton, RcLinkButton } from "@/components/ui/rc-button";
import { RcDialog } from "@/components/ui/rc-dialog";

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

type RarityStat = {
  rarity: string;
  plays: number;
  wins: number;
  winRate: number;
};

type CardPairSynergy = {
  cardA: string;
  cardB: string;
  slugA: string | null;
  slugB: string | null;
  coOccurrences: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
};

type DeckArchetype = {
  avatarName: string;
  avatarSlug: string | null;
  avatarCardId: number;
  elements: Record<string, number>;
  totalCards: number;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
};

type AvatarSitePairing = {
  siteName: string;
  siteSlug: string | null;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
};

type AvatarSpellEntry = {
  spellName: string;
  spellSlug: string | null;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
};

type MetaDashboardProps = {
  adminName?: string | null;
};

const ELEMENT_COLORS: Record<string, { bg: string; border: string; text: string; bar: string }> = {
  Fire: { bg: "bg-red-950/30", border: "border-red-700/45", text: "text-red-300", bar: "bg-red-500" },
  Water: { bg: "bg-blue-950/30", border: "border-blue-700/45", text: "text-blue-300", bar: "bg-blue-500" },
  Earth: { bg: "bg-yellow-950/30", border: "border-yellow-600/45", text: "text-yellow-300", bar: "bg-yellow-500" },
  Air: { bg: "bg-black/30", border: "border-rc-line/18", text: "text-rc-moonlight", bar: "bg-rc-moonlight" },
};

const DEFAULT_ELEMENT_STYLE = {
  bg: "bg-black/30",
  border: "border-rc-line/18",
  text: "text-rc-fg-muted",
  bar: "bg-rc-accent",
};

const RARITY_STYLES: Record<string, { bg: string; border: string; text: string; bar: string }> = {
  Unique: { bg: "bg-yellow-950/30", border: "border-yellow-600/45", text: "text-yellow-300", bar: "bg-yellow-500" },
  Elite: { bg: "bg-violet-950/30", border: "border-violet-600/45", text: "text-violet-300", bar: "bg-violet-500" },
  Exceptional: { bg: "bg-sky-950/30", border: "border-sky-600/45", text: "text-sky-300", bar: "bg-sky-500" },
  Ordinary: { bg: "bg-black/30", border: "border-rc-line/18", text: "text-rc-fg-muted", bar: "bg-rc-accent" },
};

const ELEMENT_BAR_COLORS: Record<string, string> = {
  Fire: "#ef4444",
  Water: "#3b82f6",
  Earth: "#ca8a04",
  Air: "#94a3b8",
  None: "#64748b",
};

const ELEMENT_HEX: Record<string, { from: string; to: string; border: string }> = {
  Fire: { from: "rgba(127,29,29,0.4)", to: "rgba(127,29,29,0.15)", border: "rgba(185,28,28,0.6)" },
  Water: { from: "rgba(23,37,84,0.4)", to: "rgba(23,37,84,0.15)", border: "rgba(29,78,216,0.6)" },
  Earth: { from: "rgba(161,128,16,0.4)", to: "rgba(161,128,16,0.15)", border: "rgba(202,138,4,0.6)" },
  Air: { from: "rgba(148,163,184,0.4)", to: "rgba(148,163,184,0.15)", border: "rgba(148,163,184,0.6)" },
};

function parseElements(element: string): string[] {
  return element.split(/[,\s/]+/).map((s) => s.trim()).filter(Boolean);
}

function getElementGradientStyle(element: string): React.CSSProperties {
  const parts = parseElements(element);
  const known = parts.filter((p) => ELEMENT_HEX[p]);
  if (known.length === 0) return {};
  if (known.length === 1) {
    const c = ELEMENT_HEX[known[0]];
    return { background: `linear-gradient(135deg, ${c.from}, ${c.to})`, borderColor: c.border };
  }
  const stops = known.map((k, i) => {
    const c = ELEMENT_HEX[k];
    const pct = (i / (known.length - 1)) * 100;
    return `${c.from} ${pct}%`;
  });
  return { background: `linear-gradient(135deg, ${stops.join(", ")})`, borderColor: ELEMENT_HEX[known[0]].border };
}

function ElementIcon({ element, size = 14 }: { element: string; size?: number }) {
  const lower = element.toLowerCase();
  if (!["fire", "water", "earth", "air"].includes(lower)) return null;
  return (
    <Image
      src={`/api/assets/${lower}.png`}
      alt={element}
      width={size}
      height={size}
      unoptimized
      className="inline-block"
    />
  );
}

function ElementIcons({ element, size = 16 }: { element: string; size?: number }) {
  const parts = parseElements(element);
  const known = parts.filter((p) => ["Fire", "Water", "Earth", "Air"].includes(p));
  if (known.length === 0) return <span className="rc-hint">None</span>;
  return (
    <span className="inline-flex items-center gap-1">
      {known.map((el) => (
        <ElementIcon key={el} element={el} size={size} />
      ))}
    </span>
  );
}

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
    <div className="rc-panel px-4 py-3">
      <div className="rc-eyebrow">{label}</div>
      <div className="rc-stat mt-1 text-2xl">
        {typeof value === "number"
          ? new Intl.NumberFormat().format(value)
          : value ?? "—"}
      </div>
      {sublabel && <div className="rc-hint mt-1">{sublabel}</div>}
    </div>
  );
}

function WinRateBar({ winRate, barColor }: { winRate: number; barColor: string }) {
  const pct = Math.round(winRate * 100);
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full border border-rc-line/12 bg-black/45">
        <div
          className={`h-full rounded-full ${barColor} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="rc-stat w-12 text-right text-xs">
        {(winRate * 100).toFixed(1)}%
      </span>
    </div>
  );
}

function ElementDistributionBar({ elements }: { elements: Record<string, number> }) {
  const entries = Object.entries(elements)
    .filter(([, pct]) => pct > 0)
    .sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <div className="flex h-2.5 flex-1 overflow-hidden rounded-full border border-rc-line/12 bg-black/45">
        {entries.map(([el, pct]) => (
          <div
            key={el}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${pct}%`,
              backgroundColor: ELEMENT_BAR_COLORS[el] || ELEMENT_BAR_COLORS.None,
            }}
            title={`${el}: ${pct}%`}
          />
        ))}
      </div>
      <div className="flex gap-1.5 flex-shrink-0">
        {entries.map(([el, pct]) => (
          <span
            key={el}
            className="font-rc-mono text-[10px] tabular-nums"
            style={{ color: ELEMENT_BAR_COLORS[el] || ELEMENT_BAR_COLORS.None }}
          >
            {pct}%
          </span>
        ))}
      </div>
    </div>
  );
}

function ElementLegend() {
  const elements = ["Fire", "Water", "Earth", "Air"];
  return (
    <div className="flex gap-3 font-rc-mono text-[10px] uppercase tracking-[0.14em] text-rc-fg-subtle">
      {elements.map((el) => (
        <span key={el} className="flex items-center gap-1">
          <ElementIcon element={el} size={12} />
          {el}
        </span>
      ))}
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
  expandedCard,
  expandedCardData,
  expandedCardLoading,
  onRowClick,
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
  expandedCard?: string | null;
  expandedCardData?: { synergies: CardPairSynergy[]; antiSynergies: CardPairSynergy[] } | null;
  expandedCardLoading?: boolean;
  onRowClick?: (cardName: string) => void;
}) {
  const [search, setSearch] = useState("");
  const colCount = showType ? 7 : 6;
  const filteredStats = search.trim()
    ? stats.filter((s) => s.name.toLowerCase().includes(search.trim().toLowerCase()))
    : stats;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="relative max-w-xs flex-1">
          <input
            type="text"
            placeholder="Search cards..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rc-input h-9 w-full pl-8"
          />
          <svg
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-rc-fg-dim"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">
            <span className="rc-eyebrow">Order</span>
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
          <label className="flex items-center gap-2">
            <span className="rc-eyebrow">Limit</span>
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
              className="rc-input h-9 w-20"
            />
          </label>
          <RcButton
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </RcButton>
        </div>
      </div>
      {error && (
        <div className="rc-alert" data-tone="danger">
          {error}
        </div>
      )}
      <div className="overflow-x-auto rounded-rc-lg border border-rc-line/18">
        <table className="rc-table">
          <thead>
            <tr>
              <th>Card</th>
              {showType && <th>Type</th>}
              <th>Plays</th>
              <th>Wins</th>
              <th>Losses</th>
              <th>Draws</th>
              <th>Win Rate</th>
            </tr>
          </thead>
          <tbody>
            {filteredStats.length === 0 ? (
              <tr>
                <td className="text-rc-fg-subtle" colSpan={colCount}>
                  {search.trim() ? "No cards match your search." : "No stats yet. Play some matches or adjust filters."}
                </td>
              </tr>
            ) : (
              filteredStats.map((row) => {
                const isExpanded = expandedCard === row.name;
                return (
                  <React.Fragment key={row.cardId}>
                    <tr
                      className={clsx(
                        "cursor-pointer",
                        isExpanded && "bg-rc-accent/6",
                      )}
                      onClick={() => onRowClick?.(row.name)}
                    >
                      <td>
                        <span className="text-rc-fg-strong">{row.name}</span>
                        <div className="rc-hint mt-0.5">#{row.cardId}</div>
                      </td>
                      {showType && (
                        <td className="text-rc-fg-subtle">{row.type}</td>
                      )}
                      <td className="tabular-nums">{row.plays}</td>
                      <td className="tabular-nums">{row.wins}</td>
                      <td className="tabular-nums">{row.losses}</td>
                      <td className="tabular-nums">{row.draws}</td>
                      <td className="tabular-nums">
                        {(row.winRate * 100).toFixed(1)}%
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={colCount} className="bg-black/30">
                          {expandedCardLoading ? (
                            <p className="rc-hint">loading card synergies…</p>
                          ) : !expandedCardData ? (
                            <p className="rc-hint">no synergy data available</p>
                          ) : (
                            <div className="grid gap-4 md:grid-cols-2">
                              <div>
                                <h4 className="rc-eyebrow mb-2 text-rc-success">Best Partners</h4>
                                {expandedCardData.synergies.length === 0 ? (
                                  <p className="rc-hint">no data</p>
                                ) : (
                                  <div className="space-y-1">
                                    {expandedCardData.synergies.slice(0, 10).map((p) => {
                                      const partner = p.cardA === row.name ? p.cardB : p.cardA;
                                      return (
                                        <div key={partner} className="flex items-center justify-between text-[11px]">
                                          <span className="mr-2 truncate text-rc-fg">{partner}</span>
                                          <span className="flex-shrink-0 text-rc-fg-subtle">
                                            {p.coOccurrences}x &middot;{" "}
                                            <span className="text-rc-success">
                                              {(p.winRate * 100).toFixed(1)}%
                                            </span>
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                              <div>
                                <h4 className="rc-eyebrow mb-2 text-rc-danger">Worst Partners</h4>
                                {expandedCardData.antiSynergies.length === 0 ? (
                                  <p className="rc-hint">no data</p>
                                ) : (
                                  <div className="space-y-1">
                                    {expandedCardData.antiSynergies.slice(0, 10).map((p) => {
                                      const partner = p.cardA === row.name ? p.cardB : p.cardA;
                                      return (
                                        <div key={partner} className="flex items-center justify-between text-[11px]">
                                          <span className="mr-2 truncate text-rc-fg">{partner}</span>
                                          <span className="flex-shrink-0 text-rc-fg-subtle">
                                            {p.coOccurrences}x &middot;{" "}
                                            <span className="text-rc-danger">
                                              {(p.winRate * 100).toFixed(1)}%
                                            </span>
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
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
  >("winRate");
  const [siteStatsLimit, setSiteStatsLimit] = useState(50);

  // Spellbook stats
  const [spellbookStats, setSpellbookStats] = useState<CardStat[]>([]);
  const [spellbookStatsError, setSpellbookStatsError] = useState<string | null>(
    null
  );
  const [spellbookStatsLoading, setSpellbookStatsLoading] = useState(false);
  const [spellbookStatsOrder, setSpellbookStatsOrder] = useState<
    "plays" | "wins" | "winRate"
  >("winRate");
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

  // Rarity stats
  const [rarityStats, setRarityStats] = useState<RarityStat[]>([]);
  const [rarityStatsLoading, setRarityStatsLoading] = useState(false);

  // Deck archetype stats
  const [deckArchetypes, setDeckArchetypes] = useState<DeckArchetype[]>([]);
  const [deckArchetypesLoading, setDeckArchetypesLoading] = useState(false);

  // Synergy stats
  const [synergies, setSynergies] = useState<CardPairSynergy[]>([]);
  const [antiSynergies, setAntiSynergies] = useState<CardPairSynergy[]>([]);
  const [synergiesLoading, setSynergiesLoading] = useState(false);
  const [synergyTotalDecks, setSynergyTotalDecks] = useState(0);

  // Card drill-down state
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [expandedCardData, setExpandedCardData] = useState<{
    synergies: CardPairSynergy[];
    antiSynergies: CardPairSynergy[];
  } | null>(null);
  const [expandedCardLoading, setExpandedCardLoading] = useState(false);

  // Avatar drill-down state
  const [expandedAvatar, setExpandedAvatar] = useState<string | null>(null);
  const [expandedAvatarSites, setExpandedAvatarSites] = useState<AvatarSitePairing[]>([]);
  const [expandedAvatarSpells, setExpandedAvatarSpells] = useState<AvatarSpellEntry[]>([]);
  const [expandedAvatarLoading, setExpandedAvatarLoading] = useState(false);

  // Cache timestamp from server
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

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
        const payload = (await response.json()) as { stats: ElementStat[]; generatedAt?: string };
        setElementStats(payload.stats || []);
        if (payload.generatedAt) setLastUpdated(payload.generatedAt);
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

  const refreshRarityStats = useCallback(async () => {
    setRarityStatsLoading(true);
    try {
      const response = await fetch(`/api/meta/rarity?format=${format}`, {
        cache: "no-store",
      });
      if (response.ok) {
        const payload = (await response.json()) as { stats: RarityStat[] };
        setRarityStats(payload.stats || []);
      }
    } finally {
      setRarityStatsLoading(false);
    }
  }, [format]);

  const refreshDeckArchetypes = useCallback(async () => {
    setDeckArchetypesLoading(true);
    try {
      const response = await fetch(`/api/meta/decks?format=${format}`, {
        cache: "no-store",
      });
      if (response.ok) {
        const payload = (await response.json()) as { archetypes: DeckArchetype[] };
        setDeckArchetypes(payload.archetypes || []);
      }
    } finally {
      setDeckArchetypesLoading(false);
    }
  }, [format]);

  const refreshSynergies = useCallback(async () => {
    setSynergiesLoading(true);
    try {
      const response = await fetch(`/api/meta/synergies?format=${format}`, {
        cache: "no-store",
      });
      if (response.ok) {
        const payload = (await response.json()) as {
          synergies: CardPairSynergy[];
          antiSynergies: CardPairSynergy[];
          totalDecks: number;
        };
        setSynergies(payload.synergies || []);
        setAntiSynergies(payload.antiSynergies || []);
        setSynergyTotalDecks(payload.totalDecks || 0);
      }
    } finally {
      setSynergiesLoading(false);
    }
  }, [format]);

  const handleCardClick = useCallback(
    async (cardName: string) => {
      if (expandedCard === cardName) {
        setExpandedCard(null);
        setExpandedCardData(null);
        return;
      }
      setExpandedCard(cardName);
      setExpandedCardLoading(true);
      setExpandedCardData(null);
      try {
        const response = await fetch(
          `/api/meta/synergies?format=${format}&card=${encodeURIComponent(cardName)}`,
          { cache: "no-store" },
        );
        if (response.ok) {
          const payload = (await response.json()) as {
            synergies: CardPairSynergy[];
            antiSynergies: CardPairSynergy[];
          };
          setExpandedCardData({
            synergies: payload.synergies || [],
            antiSynergies: payload.antiSynergies || [],
          });
        }
      } finally {
        setExpandedCardLoading(false);
      }
    },
    [expandedCard, format],
  );

  const handleAvatarClick = useCallback(
    async (avatarName: string) => {
      if (expandedAvatar === avatarName) {
        setExpandedAvatar(null);
        setExpandedAvatarSites([]);
        setExpandedAvatarSpells([]);
        return;
      }
      setExpandedAvatar(avatarName);
      setExpandedAvatarLoading(true);
      setExpandedAvatarSites([]);
      setExpandedAvatarSpells([]);
      try {
        const response = await fetch(
          `/api/meta/decks?format=${format}&avatar=${encodeURIComponent(avatarName)}`,
          { cache: "no-store" },
        );
        if (response.ok) {
          const payload = (await response.json()) as {
            sites: AvatarSitePairing[];
            spells: AvatarSpellEntry[];
          };
          setExpandedAvatarSites(payload.sites || []);
          setExpandedAvatarSpells(payload.spells || []);
        }
      } finally {
        setExpandedAvatarLoading(false);
      }
    },
    [expandedAvatar, format],
  );

  const refreshAll = useCallback(() => {
    void refreshAvatarStats();
    void refreshSiteStats();
    void refreshSpellbookStats();
    void refreshElementStats();
    void refreshTypeStats();
    void refreshCostStats();
    void refreshMatchStats();
    void refreshRarityStats();
    void refreshDeckArchetypes();
    void refreshSynergies();
  }, [
    refreshAvatarStats,
    refreshSiteStats,
    refreshSpellbookStats,
    refreshElementStats,
    refreshTypeStats,
    refreshCostStats,
    refreshMatchStats,
    refreshRarityStats,
    refreshDeckArchetypes,
    refreshSynergies,
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
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="admin"
        title="Meta Statistics"
        description={`Card and match analytics · Signed in as ${adminName || "admin"}`}
        actions={
          <>
            <RcLinkButton variant="outline" href="/admin">
              Back to Admin
            </RcLinkButton>
            <RcButton onClick={refreshAll}>Refresh All</RcButton>
            <RcButton
              variant="destructive"
              onClick={() => setShowClearConfirm(true)}
            >
              Clear Stats
            </RcButton>
          </>
        }
      />
      {lastUpdated && (
        <div className="rc-hint -mt-6">
          Last updated: {new Date(lastUpdated).toLocaleString()}
        </div>
      )}

      {/* Clear confirmation modal */}
      {showClearConfirm && (
        <RcDialog
          eyebrow="destructive"
          title="Clear Meta Statistics"
          size="sm"
          closeOnBackdrop={false}
          onClose={() => setShowClearConfirm(false)}
          actions={
            <RcButton
              variant="outline"
              onClick={() => setShowClearConfirm(false)}
              disabled={clearing}
            >
              Cancel
            </RcButton>
          }
        >
          <p className="m-0">
            This will permanently delete card win rate data. Choose which format
            to clear:
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <RcButton
              variant="outline"
              onClick={() => void clearStats(format)}
              disabled={clearing}
            >
              {clearing ? "Clearing..." : `Clear ${format} only`}
            </RcButton>
            <RcButton
              variant="destructive"
              onClick={() => void clearStats()}
              disabled={clearing}
            >
              {clearing ? "Clearing..." : "Clear ALL formats"}
            </RcButton>
          </div>
        </RcDialog>
      )}

      {/* Format selector */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="rc-eyebrow">Format</span>
        <div className="rc-segment">
          {(["constructed", "sealed", "draft"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFormat(f)}
              aria-pressed={format === f}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Match Overview */}
      <section className="flex flex-col gap-4">
        <h2 className="m-0 font-rc-display text-[26px] leading-none text-rc-fg-strong">
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
        {matchStatsLoading && <p className="rc-hint">loading…</p>}
      </section>

      {/* Avatar Win Rates */}
      <section className="flex flex-col gap-4">
        <h2 className="m-0 font-rc-display text-[26px] leading-none text-rc-fg-strong">
          Avatar Win Rates
        </h2>
        {avatarStatsLoading ? (
          <p className="rc-hint">loading…</p>
        ) : avatarStats.length === 0 ? (
          <p className="rc-hint">no avatar data available</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {avatarStats.map((a) => {
              const isAvatarExpanded = expandedAvatar === a.name;
              return (
                <React.Fragment key={a.cardId}>
                  <div
                    className={clsx(
                      "cursor-pointer rounded-rc-md border border-rc-line/12 bg-black/30 px-4 py-3 transition hover:border-rc-accent/45",
                      isAvatarExpanded && "border-rc-accent/45 bg-rc-accent/6",
                    )}
                    onClick={() => void handleAvatarClick(a.name)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong">
                        {a.name}
                      </span>
                      <span className="rc-stat text-sm">
                        {(a.winRate * 100).toFixed(1)}%
                      </span>
                    </div>
                    <WinRateBar winRate={a.winRate} barColor="bg-rc-accent" />
                    <div className="mt-1.5 flex flex-wrap items-center gap-3 font-rc-mono text-[11px] text-rc-fg-subtle">
                      <span>{a.plays} played</span>
                      <span>{a.wins}W / {a.losses}L{a.draws > 0 ? ` / ${a.draws}D` : ""}</span>
                      <span className="text-rc-fg-dim">#{a.cardId}</span>
                    </div>
                  </div>
                  {isAvatarExpanded && (
                    <div className="col-span-full rounded-rc-md border border-rc-line/12 bg-black/30 p-3">
                      {expandedAvatarLoading ? (
                        <p className="rc-hint">loading deck details…</p>
                      ) : expandedAvatarSites.length === 0 && expandedAvatarSpells.length === 0 ? (
                        <p className="rc-hint">no deck detail data yet — it appears after the server recomputes statistics</p>
                      ) : (
                        <div className="grid gap-4 md:grid-cols-2">
                          {expandedAvatarSites.length > 0 && (
                            <div>
                              <h4 className="rc-eyebrow mb-2">Most Used Sites</h4>
                              <div className="overflow-x-auto rounded-rc-md border border-rc-line/12">
                                <table className="rc-table">
                                  <thead>
                                    <tr>
                                      <th>Site</th>
                                      <th>Decks</th>
                                      <th>Win Rate</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {expandedAvatarSites.slice(0, 10).map((s) => (
                                      <tr key={s.siteName}>
                                        <td className="text-rc-fg-strong">{s.siteName}</td>
                                        <td className="tabular-nums">{s.matches}</td>
                                        <td className="rc-stat">
                                          {(s.winRate * 100).toFixed(1)}%
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                          {expandedAvatarSpells.length > 0 && (
                            <div>
                              <h4 className="rc-eyebrow mb-2">Most Used Spells</h4>
                              <div className="overflow-x-auto rounded-rc-md border border-rc-line/12">
                                <table className="rc-table">
                                  <thead>
                                    <tr>
                                      <th>Spell</th>
                                      <th>Decks</th>
                                      <th>Win Rate</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {expandedAvatarSpells.slice(0, 10).map((s) => (
                                      <tr key={s.spellName}>
                                        <td className="text-rc-fg-strong">{s.spellName}</td>
                                        <td className="tabular-nums">{s.matches}</td>
                                        <td className="rc-stat">
                                          {(s.winRate * 100).toFixed(1)}%
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        )}
      </section>

      {/* Deck Composition */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="m-0 font-rc-display text-[26px] leading-none text-rc-fg-strong">
              Deck Composition
            </h2>
            <p className="rc-hint mt-1.5">
              Avatar performance with spellbook element distribution ({format})
              {deckArchetypes.length > 0 && (
                <span className="ml-1">
                  &middot; {deckArchetypes.reduce((sum, d) => sum + d.matches, 0)} decks analyzed
                </span>
              )}
            </p>
          </div>
          <ElementLegend />
        </div>
        {deckArchetypesLoading ? (
          <p className="rc-hint">loading…</p>
        ) : deckArchetypes.length === 0 ? (
          <p className="rc-hint">no deck composition data available</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {deckArchetypes.map((d) => {
              const isAvatarExpanded = expandedAvatar === d.avatarName;
              return (
                <React.Fragment key={d.avatarCardId}>
                  <div
                    className={clsx(
                      "cursor-pointer rounded-rc-md border border-rc-line/12 bg-black/30 px-4 py-3 transition hover:border-rc-accent/45",
                      isAvatarExpanded && "border-rc-accent/45 bg-rc-accent/6",
                    )}
                    onClick={() => void handleAvatarClick(d.avatarName)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong">
                        {d.avatarName}
                      </span>
                      <span className="rc-stat text-sm">
                        {(d.winRate * 100).toFixed(1)}%
                      </span>
                    </div>
                    <ElementDistributionBar elements={d.elements} />
                    <div className="mt-1 flex flex-wrap items-center gap-3 font-rc-mono text-[11px] text-rc-fg-subtle">
                      <span>{d.matches} decks</span>
                      <span>
                        {d.wins}W / {d.losses}L
                        {d.draws > 0 ? ` / ${d.draws}D` : ""}
                      </span>
                      <span>~{d.totalCards} spells</span>
                      <span className="text-rc-fg-dim">#{d.avatarCardId}</span>
                    </div>
                  </div>
                  {isAvatarExpanded && (
                    <div className="col-span-full rounded-rc-md border border-rc-line/12 bg-black/30 p-3">
                      {expandedAvatarLoading ? (
                        <p className="rc-hint">loading deck details…</p>
                      ) : expandedAvatarSites.length === 0 && expandedAvatarSpells.length === 0 ? (
                        <p className="rc-hint">no deck detail data yet — it appears after the server recomputes statistics</p>
                      ) : (
                        <div className="grid gap-4 md:grid-cols-2">
                          {expandedAvatarSites.length > 0 && (
                            <div>
                              <h4 className="rc-eyebrow mb-2">Most Used Sites</h4>
                              <div className="overflow-x-auto rounded-rc-md border border-rc-line/12">
                                <table className="rc-table">
                                  <thead>
                                    <tr>
                                      <th>Site</th>
                                      <th>Decks</th>
                                      <th>Win Rate</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {expandedAvatarSites.slice(0, 10).map((s) => (
                                      <tr key={s.siteName}>
                                        <td className="text-rc-fg-strong">{s.siteName}</td>
                                        <td className="tabular-nums">{s.matches}</td>
                                        <td className="rc-stat">
                                          {(s.winRate * 100).toFixed(1)}%
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                          {expandedAvatarSpells.length > 0 && (
                            <div>
                              <h4 className="rc-eyebrow mb-2">Most Used Spells</h4>
                              <div className="overflow-x-auto rounded-rc-md border border-rc-line/12">
                                <table className="rc-table">
                                  <thead>
                                    <tr>
                                      <th>Spell</th>
                                      <th>Decks</th>
                                      <th>Win Rate</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {expandedAvatarSpells.slice(0, 10).map((s) => (
                                      <tr key={s.spellName}>
                                        <td className="text-rc-fg-strong">{s.spellName}</td>
                                        <td className="tabular-nums">{s.matches}</td>
                                        <td className="rc-stat">
                                          {(s.winRate * 100).toFixed(1)}%
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        )}
      </section>

      {/* Card Synergies — hidden until 100+ deck observations */}
      {synergyTotalDecks >= 100 && (
        <>
          <section className="rc-panel overflow-hidden">
            <PanelHeader
              title="Top Card Synergies"
              meta="min. 3 co-occurrences"
            />
            <p className="px-[18px] py-3.5 font-rc-sans text-sm text-rc-fg-muted">
              Spellbook card pairs with the highest win rate when played together
            </p>
            {synergiesLoading ? (
              <p className="rc-hint px-[18px] pb-3.5">loading…</p>
            ) : synergies.length === 0 ? (
              <p className="rc-hint px-[18px] pb-3.5">no synergy data available yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="rc-table">
                  <thead>
                    <tr>
                      <th>Card A</th>
                      <th>Card B</th>
                      <th>Paired</th>
                      <th>Wins</th>
                      <th>Losses</th>
                      <th>Win Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {synergies.slice(0, 20).map((pair) => (
                      <tr key={`${pair.cardA}||${pair.cardB}`}>
                        <td className="text-rc-fg-strong">{pair.cardA}</td>
                        <td className="text-rc-fg-strong">{pair.cardB}</td>
                        <td className="tabular-nums">{pair.coOccurrences}</td>
                        <td className="tabular-nums">{pair.wins}</td>
                        <td className="tabular-nums">{pair.losses}</td>
                        <td className="tabular-nums text-rc-success">
                          {(pair.winRate * 100).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rc-panel overflow-hidden">
            <PanelHeader title="Anti-Synergies" />
            <p className="px-[18px] py-3.5 font-rc-sans text-sm text-rc-fg-muted">
              Card pairs with the lowest win rate when played together
            </p>
            {synergiesLoading ? (
              <p className="rc-hint px-[18px] pb-3.5">loading…</p>
            ) : antiSynergies.length === 0 ? (
              <p className="rc-hint px-[18px] pb-3.5">no anti-synergy data available yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="rc-table">
                  <thead>
                    <tr>
                      <th>Card A</th>
                      <th>Card B</th>
                      <th>Paired</th>
                      <th>Wins</th>
                      <th>Losses</th>
                      <th>Win Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {antiSynergies.slice(0, 20).map((pair) => (
                      <tr key={`${pair.cardA}||${pair.cardB}`}>
                        <td className="text-rc-fg-strong">{pair.cardA}</td>
                        <td className="text-rc-fg-strong">{pair.cardB}</td>
                        <td className="tabular-nums">{pair.coOccurrences}</td>
                        <td className="tabular-nums">{pair.wins}</td>
                        <td className="tabular-nums">{pair.losses}</td>
                        <td className="tabular-nums text-rc-danger">
                          {(pair.winRate * 100).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {/* Element Distribution */}
      <section className="flex flex-col gap-4">
        <h2 className="m-0 font-rc-display text-[26px] leading-none text-rc-fg-strong">
          Win Rate by Element
        </h2>
        {elementStatsLoading ? (
          <p className="rc-hint">loading…</p>
        ) : elementStats.length === 0 ? (
          <p className="rc-hint">no element data available</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {elementStats.map((e) => {
              const style = getElementStyle(e.element);
              const gradientStyle = getElementGradientStyle(e.element);
              const hasGradient = Object.keys(gradientStyle).length > 0;
              return (
                <div
                  key={e.element}
                  className={clsx(
                    "rounded-rc-md border px-4 py-3",
                    !hasGradient && `${style.border} ${style.bg}`,
                  )}
                  style={hasGradient ? gradientStyle : undefined}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`inline-flex items-center gap-1.5 ${style.text}`}>
                      <ElementIcons element={e.element} size={16} />
                    </span>
                    <span className="rc-hint">
                      {e.plays.toLocaleString()} plays
                    </span>
                  </div>
                  <WinRateBar winRate={e.winRate} barColor={style.bar} />
                  <div className="rc-hint mt-1">
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
      <section className="flex flex-col gap-4">
        <h2 className="m-0 font-rc-display text-[26px] leading-none text-rc-fg-strong">
          Win Rate by Card Type
        </h2>
        {typeStatsLoading ? (
          <p className="rc-hint">loading…</p>
        ) : typeStats.length === 0 ? (
          <p className="rc-hint">no type data available</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {typeStats.map((t) => (
              <div
                key={t.type}
                className="rounded-rc-md border border-rc-line/12 bg-black/30 px-4 py-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-rc-fg-strong">{t.type}</span>
                  <span className="rc-hint">
                    {t.plays.toLocaleString()} plays
                  </span>
                </div>
                <WinRateBar winRate={t.winRate} barColor="bg-rc-accent" />
                <div className="rc-hint mt-1">
                  {t.wins.toLocaleString()} wins of{" "}
                  {t.plays.toLocaleString()} plays
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Rarity Distribution */}
      <section className="flex flex-col gap-4">
        <h2 className="m-0 font-rc-display text-[26px] leading-none text-rc-fg-strong">
          Win Rate by Rarity
        </h2>
        {rarityStatsLoading ? (
          <p className="rc-hint">loading…</p>
        ) : rarityStats.length === 0 ? (
          <p className="rc-hint">no rarity data available</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {rarityStats.map((r) => {
              const style = RARITY_STYLES[r.rarity] || RARITY_STYLES.Ordinary;
              return (
                <div
                  key={r.rarity}
                  className={`rounded-rc-md border ${style.border} ${style.bg} px-4 py-3`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={style.text}>{r.rarity}</span>
                    <span className="rc-hint">
                      {r.plays.toLocaleString()} plays
                    </span>
                  </div>
                  <WinRateBar winRate={r.winRate} barColor={style.bar} />
                  <div className="rc-hint mt-1">
                    {r.wins.toLocaleString()} wins of{" "}
                    {r.plays.toLocaleString()} plays
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Mana Curve */}
      <section className="rc-panel overflow-hidden">
        <PanelHeader title="Win Rate by Mana Cost" />
        {costStatsLoading ? (
          <p className="rc-hint px-[18px] py-3.5">loading…</p>
        ) : costStats.length === 0 ? (
          <p className="rc-hint px-[18px] py-3.5">no cost data available</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="rc-table">
              <thead>
                <tr>
                  <th>Cost</th>
                  <th>Plays</th>
                  <th>Wins</th>
                  <th>Win Rate</th>
                </tr>
              </thead>
              <tbody>
                {costStats.map((c) => (
                  <tr key={c.cost}>
                    <td className="text-rc-fg-strong tabular-nums">{c.cost}</td>
                    <td className="tabular-nums">{c.plays.toLocaleString()}</td>
                    <td className="tabular-nums">{c.wins.toLocaleString()}</td>
                    <td className="tabular-nums text-rc-success">
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
        <h2 className="m-0 font-rc-display text-[26px] leading-none text-rc-fg-strong">
          Site Win Rates
        </h2>
        <CardStatsTable
          stats={siteStats}
          loading={siteStatsLoading}
          error={siteStatsError}
          order={siteStatsOrder}
          setOrder={setSiteStatsOrder}
          limit={siteStatsLimit}
          setLimit={setSiteStatsLimit}
          onRefresh={() => void refreshSiteStats()}
          expandedCard={expandedCard}
          expandedCardData={expandedCardData}
          expandedCardLoading={expandedCardLoading}
          onRowClick={handleCardClick}
        />
      </section>

      {/* Spellbook Win Rates */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="m-0 font-rc-display text-[26px] leading-none text-rc-fg-strong">
            Spellbook Win Rates
          </h2>
          <p className="rc-hint mt-1.5">
            Minions, Auras, Artifacts, Magic, and other non-site cards
          </p>
        </div>
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
          expandedCard={expandedCard}
          expandedCardData={expandedCardData}
          expandedCardLoading={expandedCardLoading}
          onRowClick={handleCardClick}
        />
      </section>
    </div>
  );
}
