"use client";

import clsx from "clsx";
import Image from "next/image";
import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { PanelHeader } from "@/components/ui/page-header";
import { RcButton } from "@/components/ui/rc-button";
import { RcEmpty } from "@/components/ui/rc-empty";

type CardStat = {
  cardId: number;
  name: string;
  plays: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  /** Wilson lower bound of winRate (absent on snapshots from before it existed) */
  winRateLB?: number;
  /** plays / matches with the card in the maindeck; null until deck data accrues */
  playRate?: number | null;
  inDeck?: number;
  slug: string | null;
  type: string | null;
};

type MetaWindow = "all" | "month" | "3m";
const WINDOW_OPTIONS: ReadonlyArray<{ value: MetaWindow; label: string; title: string }> = [
  { value: "all", label: "All time", title: "Every recorded match" },
  { value: "month", label: "This month", title: "Matches in the current calendar month (UTC)" },
  { value: "3m", label: "3 months", title: "Current and previous two calendar months" },
];

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
  avgCopies: number;
};

type AvatarSpellEntry = {
  spellName: string;
  spellSlug: string | null;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  avgCopies: number;
};

type AvatarElementComboEntry = {
  combo: string;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
};

const ELEMENT_COLORS: Record<
  string,
  { bg: string; border: string; text: string; bar: string }
> = {
  Fire: {
    bg: "bg-red-950/40",
    border: "border-red-700/60",
    text: "text-red-300",
    bar: "bg-red-500",
  },
  Water: {
    bg: "bg-blue-950/40",
    border: "border-blue-700/60",
    text: "text-blue-300",
    bar: "bg-blue-500",
  },
  Earth: {
    bg: "bg-yellow-950/40",
    border: "border-yellow-600/60",
    text: "text-yellow-300",
    bar: "bg-yellow-500",
  },
  Air: {
    bg: "bg-slate-800/40",
    border: "border-slate-500/60",
    text: "text-slate-300",
    bar: "bg-slate-400",
  },
};

const DEFAULT_ELEMENT_STYLE = {
  bg: "bg-black/30",
  border: "border-rc-line/18",
  text: "text-rc-fg-muted",
  bar: "bg-rc-fg-subtle",
};

const RARITY_STYLES: Record<
  string,
  { bg: string; border: string; text: string; bar: string }
> = {
  Unique: {
    bg: "bg-rc-accent/10",
    border: "border-rc-accent/35",
    text: "text-rc-accent-link",
    bar: "bg-rc-accent",
  },
  Elite: {
    bg: "bg-rc-ember/12",
    border: "border-rc-ember/40",
    text: "text-rc-ember",
    bar: "bg-rc-ember",
  },
  Exceptional: {
    bg: "bg-rc-info/12",
    border: "border-rc-info/40",
    text: "text-rc-moonlight",
    bar: "bg-rc-info",
  },
  Ordinary: {
    bg: "bg-black/30",
    border: "border-rc-line/18",
    text: "text-rc-fg-muted",
    bar: "bg-rc-fg-subtle",
  },
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

/** Parse element string like "Fire, Water" into individual element names */
function parseElements(element: string): string[] {
  return element.split(/[,\s/]+/).map((s) => s.trim()).filter(Boolean);
}

/** Get inline gradient style for multi-element cards */
function getElementGradientStyle(element: string): React.CSSProperties {
  const parts = parseElements(element);
  const known = parts.filter((p) => ELEMENT_HEX[p]);
  if (known.length === 0) return {};
  if (known.length === 1) {
    const c = ELEMENT_HEX[known[0]];
    return { background: `linear-gradient(135deg, ${c.from}, ${c.to})`, borderColor: c.border };
  }
  // Multi-element gradient
  const stops = known.map((k, i) => {
    const c = ELEMENT_HEX[k];
    const pct = (i / (known.length - 1)) * 100;
    return `${c.from} ${pct}%`;
  });
  const borders = known.map((k) => ELEMENT_HEX[k].border);
  // Use the first element's border color for simplicity
  return { background: `linear-gradient(135deg, ${stops.join(", ")})`, borderColor: borders[0] };
}

/** Small element icon (14px) */
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

/** Render element icons for a comma-separated element string */
function ElementIcons({ element, size = 16 }: { element: string; size?: number }) {
  const parts = parseElements(element);
  const known = parts.filter((p) => ["Fire", "Water", "Earth", "Air"].includes(p));
  if (known.length === 0)
    return (
      <span className="font-rc-mono text-xs tracking-[0.1em] text-rc-fg-subtle">
        None
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1">
      {known.map((el) => (
        <ElementIcon key={el} element={el} size={size} />
      ))}
    </span>
  );
}

/** Stacked horizontal bar showing element distribution in a deck */
function ElementDistributionBar({
  elements,
}: {
  elements: Record<string, number>;
}) {
  const KNOWN_ELEMENTS = ["Fire", "Water", "Earth", "Air"];
  const entries = Object.entries(elements)
    .filter(([, pct]) => pct > 0)
    .sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;

  // Separate known elements from "other"
  const known = entries.filter(([el]) => KNOWN_ELEMENTS.includes(el));
  const otherPct = entries
    .filter(([el]) => !KNOWN_ELEMENTS.includes(el))
    .reduce((sum, [, pct]) => sum + pct, 0);

  // Bar segments: known elements + aggregated other
  const barSegments = [
    ...known.map(([el, pct]) => ({ el, pct, color: ELEMENT_BAR_COLORS[el] })),
    ...(otherPct > 0 ? [{ el: "Other", pct: otherPct, color: ELEMENT_BAR_COLORS.None }] : []),
  ];

  // Full breakdown for tooltip
  const tooltipText = entries.map(([el, pct]) => `${el}: ${pct}%`).join("\n");

  return (
    <div className="flex flex-col gap-1 mt-1.5" title={tooltipText}>
      <div className="flex h-3 rounded-full overflow-hidden border border-rc-line/12 bg-black/45">
        {barSegments.map((seg) => (
          <div
            key={seg.el}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${seg.pct}%`,
              backgroundColor: seg.color,
            }}
          />
        ))}
      </div>
      <div className="flex gap-2 flex-wrap">
        {known.map(([el, pct]) => (
          <span
            key={el}
            className="inline-flex items-center gap-0.5 font-rc-mono text-[10px] tabular-nums"
          >
            <ElementIcon element={el} size={10} />
            <span style={{ color: ELEMENT_BAR_COLORS[el] }}>{pct}%</span>
          </span>
        ))}
        {otherPct > 0 && (
          <span className="font-rc-mono text-[10px] tabular-nums text-rc-fg-dim">
            Other {otherPct}%
          </span>
        )}
      </div>
    </div>
  );
}

/** Legend for the element colors */
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

function getElementStyle(element: string) {
  // Handle multi-element (e.g. "Fire,Water" or "Fire Water")
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
    <div className="rc-panel px-[18px] py-3.5">
      <div className="rc-eyebrow">{label}</div>
      <div className="rc-stat mt-2 text-[28px] leading-none">
        {typeof value === "number"
          ? new Intl.NumberFormat().format(value)
          : (value ?? "—")}
      </div>
      {sublabel && <div className="rc-hint mt-1.5">{sublabel}</div>}
    </div>
  );
}

function WinRateBar({
  winRate,
  barColor,
}: {
  winRate: number;
  /** Element/rarity colourway for the fill; omit for the default gold meter */
  barColor?: string;
}) {
  const pct = Math.round(winRate * 100);
  return (
    <div className="flex items-center gap-2 mt-1.5">
      {barColor ? (
        <div className="flex-1 h-2 rounded-full border border-rc-line/12 bg-black/45 overflow-hidden">
          <div
            className={`h-full rounded-full ${barColor} transition-all`}
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : (
        <div className="rc-progress flex-1">
          <span style={{ width: `${pct}%` }} />
        </div>
      )}
      <span className="rc-stat w-12 text-right text-xs">
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
  onHoverCard,
  onLeaveCard,
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
  onHoverCard: (card: { slug: string; type: string | null }) => void;
  onLeaveCard: () => void;
  showType?: boolean;
  expandedCard?: string | null;
  expandedCardData?: { synergies: CardPairSynergy[]; antiSynergies: CardPairSynergy[] } | null;
  expandedCardLoading?: boolean;
  onRowClick?: (cardName: string) => void;
}) {
  const [search, setSearch] = useState("");
  const colCount = showType ? 8 : 7;
  const filteredStats = search.trim()
    ? stats.filter((s) => s.name.toLowerCase().includes(search.trim().toLowerCase()))
    : stats;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex-1 md:max-w-xs">
          <input
            type="text"
            placeholder="Search cards..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rc-input h-9 w-full"
            aria-label="Search cards"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
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
                  Math.max(1, Math.min(200, Number(e.target.value) || 50)),
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
      {filteredStats.length === 0 ? (
        <RcEmpty
          title={search.trim() ? "No matches" : "Nothing here yet."}
        >
          {search.trim()
            ? "no cards match your search"
            : "play some matches or adjust filters"}
        </RcEmpty>
      ) : (
        <div className="overflow-x-auto">
          <table className="rc-table">
            <thead>
              <tr>
                <th>Card</th>
                {showType && <th>Type</th>}
                <th>Plays</th>
                <th>Wins</th>
                <th>Losses</th>
                <th>Draws</th>
                <th title="Share of matches where the card hit the board, out of matches it was brought in the maindeck">
                  Play Rate
                </th>
                <th title="Wins / (wins + losses) when played. The smaller figure is the 95% lower bound the win-rate ordering uses.">
                  Win Rate
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredStats.map((row) => {
                const isExpanded = expandedCard === row.name;
                return (
                  <React.Fragment key={row.cardId}>
                    <tr
                      className={clsx(
                        "cursor-pointer",
                        isExpanded && "bg-rc-accent/6",
                      )}
                      onClick={() => onRowClick?.(row.name)}
                      onMouseEnter={() =>
                        row.slug && onHoverCard({ slug: row.slug, type: row.type })
                      }
                      onMouseLeave={onLeaveCard}
                    >
                      <td>
                        <span className="font-rc-display text-[15px] text-rc-fg-strong">
                          {row.name}
                        </span>
                      </td>
                      {showType && (
                        <td className="text-rc-fg-subtle">{row.type}</td>
                      )}
                      <td className="tabular-nums">{row.plays}</td>
                      <td className="tabular-nums">{row.wins}</td>
                      <td className="tabular-nums">{row.losses}</td>
                      <td className="tabular-nums">{row.draws}</td>
                      <td className="tabular-nums text-rc-fg-muted">
                        {typeof row.playRate === "number"
                          ? `${(row.playRate * 100).toFixed(0)}%`
                          : "–"}
                      </td>
                      <td className="tabular-nums text-rc-fg-strong">
                        {(row.winRate * 100).toFixed(1)}%
                        {typeof row.winRateLB === "number" && (
                          <span
                            className="ml-1 text-[10px] text-rc-fg-dim"
                            title="95% Wilson lower bound"
                          >
                            ≥{(row.winRateLB * 100).toFixed(0)}%
                          </span>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={colCount} className="bg-black/30">
                          {expandedCardLoading ? (
                            <div className="rc-hint py-6 text-center">
                              loading card synergies…
                            </div>
                          ) : !expandedCardData ? (
                            <div className="rc-hint py-6 text-center">
                              no synergy data available
                            </div>
                          ) : (
                            <div className="grid gap-4 md:grid-cols-2">
                              <div>
                                <h4 className="rc-eyebrow mb-2 text-rc-success">
                                  Best Partners
                                </h4>
                                {expandedCardData.synergies.length === 0 ? (
                                  <div className="rc-hint">no data</div>
                                ) : (
                                  <div className="space-y-1">
                                    {expandedCardData.synergies.slice(0, 10).map((p) => {
                                      const partner = p.cardA === row.name ? p.cardB : p.cardA;
                                      return (
                                        <div key={partner} className="flex items-center justify-between text-[11px]">
                                          <span className="mr-2 truncate text-rc-fg">{partner}</span>
                                          <span className="flex-shrink-0 tabular-nums text-rc-fg-subtle">
                                            {p.coOccurrences}x &middot;{" "}
                                            <span className="font-medium text-rc-success">
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
                                <h4 className="rc-eyebrow mb-2 text-rc-danger">
                                  Worst Partners
                                </h4>
                                {expandedCardData.antiSynergies.length === 0 ? (
                                  <div className="rc-hint">no data</div>
                                ) : (
                                  <div className="space-y-1">
                                    {expandedCardData.antiSynergies.slice(0, 10).map((p) => {
                                      const partner = p.cardA === row.name ? p.cardB : p.cardA;
                                      return (
                                        <div key={partner} className="flex items-center justify-between text-[11px]">
                                          <span className="mr-2 truncate text-rc-fg">{partner}</span>
                                          <span className="flex-shrink-0 tabular-nums text-rc-fg-subtle">
                                            {p.coOccurrences}x &middot;{" "}
                                            <span className="font-medium text-rc-danger">
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
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}


/** Expanded drill-down under an avatar tile: element combos + most used sites/spells */
function AvatarDetail({
  loading,
  sites,
  spells,
  elementCombos,
  selectedCombo,
  onSelectCombo,
  displayedSites,
  displayedSpells,
  onHoverCard,
  onLeaveCard,
}: {
  loading: boolean;
  sites: AvatarSitePairing[];
  spells: AvatarSpellEntry[];
  elementCombos: AvatarElementComboEntry[];
  selectedCombo: string | null;
  onSelectCombo: (combo: string | null) => void;
  displayedSites: AvatarSitePairing[];
  displayedSpells: AvatarSpellEntry[];
  onHoverCard: (card: { slug: string; type: string | null }) => void;
  onLeaveCard: () => void;
}) {
  const chipClass = (active: boolean) =>
    clsx(
      "cursor-pointer rounded-rc-md border px-3 py-1.5 font-rc-mono text-[11px] tracking-[0.06em] transition-colors",
      active
        ? "border-rc-accent/60 bg-rc-accent/12 text-rc-fg-strong"
        : "border-rc-line/14 bg-black/30 text-rc-fg-muted hover:border-rc-accent/40 hover:text-rc-fg",
    );
  return (
    <div className="col-span-full rounded-rc-md border border-rc-line/12 bg-black/30 p-3">
      {loading ? (
        <div className="rc-hint py-6 text-center">loading deck details…</div>
      ) : sites.length === 0 &&
        spells.length === 0 &&
        elementCombos.length === 0 ? (
        <div className="rc-hint py-6 text-center">
          no deck detail data yet — it appears after the server recomputes statistics
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {elementCombos.length > 0 && (
            <div>
              <h4 className="rc-eyebrow mb-2">Element Combinations</h4>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  aria-pressed={selectedCombo === null}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectCombo(null);
                  }}
                  className={chipClass(selectedCombo === null)}
                >
                  <span className="text-rc-fg-strong">All</span>
                </button>
                {elementCombos.map((ec) => (
                  <button
                    key={ec.combo}
                    type="button"
                    aria-pressed={selectedCombo === ec.combo}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectCombo(selectedCombo === ec.combo ? null : ec.combo);
                    }}
                    className={chipClass(selectedCombo === ec.combo)}
                  >
                    <span className="mr-2 inline-flex items-center gap-1">
                      <ElementIcons element={ec.combo} size={12} />
                    </span>
                    <span className="tabular-nums">{ec.matches} decks</span>
                    <span className="mx-1.5 text-rc-fg-dim">|</span>
                    <span className="tabular-nums text-rc-fg-strong">
                      {(ec.winRate * 100).toFixed(1)}%
                    </span>
                    <span className="ml-1.5 tabular-nums text-rc-fg-dim">
                      {ec.wins}W/{ec.losses}L{ec.draws > 0 ? `/${ec.draws}D` : ""}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            {displayedSites.length > 0 && (
              <div>
                <h4 className="rc-eyebrow mb-2">
                  Most Used Sites{selectedCombo ? ` (${selectedCombo})` : ""}
                </h4>
                <div className="overflow-x-auto">
                  <table className="rc-table">
                    <thead>
                      <tr>
                        <th>Site</th>
                        <th>Avg#</th>
                        <th>Decks</th>
                        <th>W</th>
                        <th>L</th>
                        <th>D</th>
                        <th>Win%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedSites.slice(0, 45).map((s) => (
                        <tr
                          key={s.siteName}
                          onMouseEnter={() =>
                            s.siteSlug && onHoverCard({ slug: s.siteSlug, type: "Site" })
                          }
                          onMouseLeave={onLeaveCard}
                        >
                          <td className="font-rc-display text-[15px] text-rc-fg-strong">{s.siteName}</td>
                          <td className="tabular-nums text-rc-fg-subtle">{s.avgCopies}</td>
                          <td className="tabular-nums">{s.matches}</td>
                          <td className="tabular-nums text-rc-success">{s.wins}</td>
                          <td className="tabular-nums text-rc-danger">{s.losses}</td>
                          <td className="tabular-nums text-rc-fg-subtle">{s.draws}</td>
                          <td className="tabular-nums text-rc-fg-strong">
                            {(s.winRate * 100).toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {displayedSpells.length > 0 && (
              <div>
                <h4 className="rc-eyebrow mb-2">
                  Most Used Spells{selectedCombo ? ` (${selectedCombo})` : ""}
                </h4>
                <div className="overflow-x-auto">
                  <table className="rc-table">
                    <thead>
                      <tr>
                        <th>Spell</th>
                        <th>Avg#</th>
                        <th>Decks</th>
                        <th>W</th>
                        <th>L</th>
                        <th>D</th>
                        <th>Win%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedSpells.slice(0, 45).map((s) => (
                        <tr
                          key={s.spellName}
                          onMouseEnter={() =>
                            s.spellSlug && onHoverCard({ slug: s.spellSlug, type: null })
                          }
                          onMouseLeave={onLeaveCard}
                        >
                          <td className="font-rc-display text-[15px] text-rc-fg-strong">{s.spellName}</td>
                          <td className="tabular-nums text-rc-fg-subtle">{s.avgCopies}</td>
                          <td className="tabular-nums">{s.matches}</td>
                          <td className="tabular-nums text-rc-success">{s.wins}</td>
                          <td className="tabular-nums text-rc-danger">{s.losses}</td>
                          <td className="tabular-nums text-rc-fg-subtle">{s.draws}</td>
                          <td className="tabular-nums text-rc-fg-strong">
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
        </div>
      )}
    </div>
  );
}

export default function PublicMetaDashboard() {
  const [metaWindow, setMetaWindow] = useState<MetaWindow>("all");
  const [format, setFormat] = useState<"constructed" | "sealed" | "draft">(
    "constructed",
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
    null,
  );
  const [spellbookStatsLoading, setSpellbookStatsLoading] = useState(false);
  const [spellbookStatsOrder, setSpellbookStatsOrder] = useState<
    "plays" | "wins" | "winRate"
  >("winRate");
  const [spellbookStatsLimit, setSpellbookStatsLimit] = useState(50);

  const [hoveredCard, setHoveredCard] = useState<{
    slug: string;
    type: string | null;
  } | null>(null);

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
  const SYNERGY_PAGE_SIZE = 20;
  const [synergyVisible, setSynergyVisible] = useState(SYNERGY_PAGE_SIZE);
  const [antiSynergyVisible, setAntiSynergyVisible] = useState(SYNERGY_PAGE_SIZE);

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
  const [expandedAvatarElementCombos, setExpandedAvatarElementCombos] = useState<AvatarElementComboEntry[]>([]);
  const [selectedCombo, setSelectedCombo] = useState<string | null>(null);
  const [expandedAvatarComboSites, setExpandedAvatarComboSites] = useState<Record<string, AvatarSitePairing[]>>({});
  const [expandedAvatarComboSpells, setExpandedAvatarComboSpells] = useState<Record<string, AvatarSpellEntry[]>>({});

  // Element card drill-down state
  const [expandedElement, setExpandedElement] = useState<string | null>(null);

  // Cache timestamp from server
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const fetchCategoryStats = useCallback(
    async (
      category: CardCategory,
      order: "plays" | "wins" | "winRate",
      limit: number,
    ) => {
      const params = new URLSearchParams();
      params.set("format", format);
      params.set("order", order);
      params.set("limit", String(limit));
      params.set("category", category);
      params.set("window", metaWindow);
      const response = await fetch(`/api/meta/cards?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error || `HTTP ${response.status}`);
      }
      const payload = (await response.json()) as { stats: CardStat[] };
      return payload.stats || [];
    },
    [format, metaWindow],
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
        siteStatsLimit,
      );
      setSiteStats(stats);
    } catch (error) {
      setSiteStatsError(
        error instanceof Error ? error.message : "Failed to load stats",
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
        spellbookStatsLimit,
      );
      setSpellbookStats(stats);
    } catch (error) {
      setSpellbookStatsError(
        error instanceof Error ? error.message : "Failed to load stats",
      );
    } finally {
      setSpellbookStatsLoading(false);
    }
  }, [fetchCategoryStats, spellbookStatsOrder, spellbookStatsLimit]);

  const refreshElementStats = useCallback(async () => {
    setElementStatsLoading(true);
    try {
      const response = await fetch(`/api/meta/elements?format=${format}&window=${metaWindow}`, {
        cache: "no-store",
      });
      if (response.ok) {
        const payload = (await response.json()) as { stats: ElementStat[]; generatedAt?: string };
        setElementStats(payload.stats || []);
        if (payload.generatedAt) setLastUpdated(payload.generatedAt);
      }
    } finally {
      setElementStatsLoading(false);
    }
  }, [format, metaWindow]);

  const refreshTypeStats = useCallback(async () => {
    setTypeStatsLoading(true);
    try {
      const response = await fetch(`/api/meta/types?format=${format}&window=${metaWindow}`, {
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
  }, [format, metaWindow]);

  const refreshCostStats = useCallback(async () => {
    setCostStatsLoading(true);
    try {
      const response = await fetch(`/api/meta/costs?format=${format}&window=${metaWindow}`, {
        cache: "no-store",
      });
      if (response.ok) {
        const payload = (await response.json()) as { stats: CostStat[] };
        setCostStats(payload.stats || []);
      }
    } finally {
      setCostStatsLoading(false);
    }
  }, [format, metaWindow]);

  const refreshMatchStats = useCallback(async () => {
    setMatchStatsLoading(true);
    try {
      const response = await fetch("/api/meta/matches", {
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
      const response = await fetch(`/api/meta/rarity?format=${format}&window=${metaWindow}`, {
        cache: "no-store",
      });
      if (response.ok) {
        const payload = (await response.json()) as { stats: RarityStat[] };
        setRarityStats(payload.stats || []);
      }
    } finally {
      setRarityStatsLoading(false);
    }
  }, [format, metaWindow]);

  const refreshDeckArchetypes = useCallback(async () => {
    setDeckArchetypesLoading(true);
    try {
      const response = await fetch(`/api/meta/decks?format=${format}`, {
        cache: "no-store",
      });
      if (response.ok) {
        const payload = (await response.json()) as {
          archetypes: DeckArchetype[];
        };
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
        setExpandedAvatarElementCombos([]);
        setExpandedAvatarComboSites({});
        setExpandedAvatarComboSpells({});
        setSelectedCombo(null);
        return;
      }
      setExpandedAvatar(avatarName);
      setExpandedAvatarLoading(true);
      setExpandedAvatarSites([]);
      setExpandedAvatarSpells([]);
      setExpandedAvatarElementCombos([]);
      setExpandedAvatarComboSites({});
      setExpandedAvatarComboSpells({});
      setSelectedCombo(null);
      try {
        const response = await fetch(
          `/api/meta/decks?format=${format}&avatar=${encodeURIComponent(avatarName)}`,
          { cache: "no-store" },
        );
        if (response.ok) {
          const payload = (await response.json()) as {
            sites: AvatarSitePairing[];
            spells: AvatarSpellEntry[];
            elementCombos: AvatarElementComboEntry[];
            comboSites: Record<string, AvatarSitePairing[]>;
            comboSpells: Record<string, AvatarSpellEntry[]>;
          };
          setExpandedAvatarSites(payload.sites || []);
          setExpandedAvatarSpells(payload.spells || []);
          setExpandedAvatarElementCombos(payload.elementCombos || []);
          setExpandedAvatarComboSites(payload.comboSites || {});
          setExpandedAvatarComboSpells(payload.comboSpells || {});
        }
      } finally {
        setExpandedAvatarLoading(false);
      }
    },
    [expandedAvatar, format],
  );

  const handleElementClick = useCallback(
    (element: string) => {
      setExpandedElement(expandedElement === element ? null : element);
    },
    [expandedElement],
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

  const exportToCsv = useCallback(() => {
    const allCards = [...avatarStats, ...siteStats, ...spellbookStats];
    if (allCards.length === 0) return;
    const headers = [
      "Card Name",
      "Card ID",
      "Type",
      "Plays",
      "Wins",
      "Losses",
      "Draws",
      "Win Rate",
    ];
    const rows = allCards.map((row) => [
      `"${row.name.replace(/"/g, '""')}"`,
      row.cardId,
      `"${row.type || ""}"`,
      row.plays,
      row.wins,
      row.losses,
      row.draws,
      `${(row.winRate * 100).toFixed(1)}%`,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `meta-stats-${format}-${
      new Date().toISOString().split("T")[0]
    }.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [avatarStats, siteStats, spellbookStats, format]);

  // Derived: filtered sites/spells based on selected element combo
  const displayedSites = selectedCombo
    ? (expandedAvatarComboSites[selectedCombo] || [])
    : expandedAvatarSites;
  const displayedSpells = selectedCombo
    ? (expandedAvatarComboSpells[selectedCombo] || [])
    : expandedAvatarSpells;

  return (
    <div className="flex flex-col gap-7">
      {/* Filters and global actions */}
      <section className="rc-panel">
        <PanelHeader
          title="Filters"
          meta={
            lastUpdated
              ? `updated ${new Date(lastUpdated).toLocaleString()}`
              : undefined
          }
        >
          <RcButton size="sm" onClick={refreshAll}>
            Refresh All
          </RcButton>
          <RcButton
            variant="outline"
            size="sm"
            onClick={exportToCsv}
            disabled={
              avatarStats.length + siteStats.length + spellbookStats.length === 0
            }
          >
            Export CSV
          </RcButton>
        </PanelHeader>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-[18px] py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="rc-eyebrow">Format</span>
            <div className="rc-segment">
              {(["constructed", "sealed", "draft"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={format === f}
                  onClick={() => setFormat(f)}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="rc-eyebrow">Period</span>
            <div className="rc-segment">
              {WINDOW_OPTIONS.map((w) => (
                <button
                  key={w.value}
                  type="button"
                  title={w.title}
                  aria-pressed={metaWindow === w.value}
                  onClick={() => setMetaWindow(w.value)}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Match Overview */}
      <section className="rc-panel">
        <PanelHeader title="Match Overview" />
        <div className="px-[18px] py-3.5">
          {matchStatsLoading && matchStats.length === 0 ? (
            <div className="rc-hint py-6 text-center">loading…</div>
          ) : matchStats.length === 0 ? (
            <RcEmpty title="Nothing recorded yet.">
              match totals appear once games finish
            </RcEmpty>
          ) : (
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
          )}
        </div>
      </section>

      {/* Avatar Win Rates */}
      <section className="rc-panel">
        <PanelHeader
          title="Avatar Win Rates"
          meta={
            avatarStats.length > 0
              ? `${avatarStats.length} ${avatarStats.length === 1 ? "avatar" : "avatars"}`
              : undefined
          }
        />
        <div className="px-[18px] py-3.5">
          {avatarStatsLoading ? (
            <div className="rc-hint py-6 text-center">loading…</div>
          ) : avatarStats.length === 0 ? (
            <RcEmpty title="No avatar data.">
              nothing recorded for this format and period
            </RcEmpty>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {avatarStats.map((a) => {
                const isAvatarExpanded = expandedAvatar === a.name;
                return (
                  <React.Fragment key={a.cardId}>
                    <div
                      className={clsx(
                        "flex cursor-pointer gap-3 overflow-hidden rounded-rc-md border border-rc-line/12 bg-black/30 p-3 transition-colors hover:border-rc-accent/40 hover:bg-rc-accent/6",
                        isAvatarExpanded && "border-rc-accent/50 bg-rc-accent/8",
                      )}
                      onClick={() => void handleAvatarClick(a.name)}
                    >
                      {a.slug && (
                        <div className="relative w-16 h-[86px] flex-shrink-0 rounded-rc-sm overflow-hidden bg-black/45">
                          <Image
                            src={`/api/images/${a.slug}`}
                            alt={a.name}
                            fill
                            className="object-cover"
                            sizes="64px"
                            unoptimized
                          />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong">
                            {a.name}
                          </span>
                          <span className="rc-stat flex-shrink-0 text-sm">
                            {(a.winRate * 100).toFixed(1)}%
                          </span>
                        </div>
                        <WinRateBar winRate={a.winRate} />
                        <div className="mt-1.5 flex items-center gap-3 font-rc-mono text-[11px] tracking-[0.06em] text-rc-fg-subtle">
                          <span>{a.plays} played</span>
                          <span>
                            {a.wins}W / {a.losses}L
                            {a.draws > 0 ? ` / ${a.draws}D` : ""}
                          </span>
                        </div>
                      </div>
                    </div>
                    {isAvatarExpanded && (
                      <AvatarDetail
                        loading={expandedAvatarLoading}
                        sites={expandedAvatarSites}
                        spells={expandedAvatarSpells}
                        elementCombos={expandedAvatarElementCombos}
                        selectedCombo={selectedCombo}
                        onSelectCombo={setSelectedCombo}
                        displayedSites={displayedSites}
                        displayedSpells={displayedSpells}
                        onHoverCard={setHoveredCard}
                        onLeaveCard={() => setHoveredCard(null)}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Deck Composition - Avatar + Element Combos */}
      <section className="rc-panel">
        <PanelHeader
          title="Deck Composition"
          meta={
            deckArchetypes.length > 0
              ? `${format} · ${deckArchetypes.reduce((sum, d) => sum + d.matches, 0)} decks analyzed`
              : format
          }
        >
          <ElementLegend />
        </PanelHeader>
        <div className="px-[18px] py-3.5">
          <p className="mb-3.5 font-rc-sans text-sm text-rc-fg-muted">
            Avatar performance with spellbook element distribution.
          </p>
          {deckArchetypesLoading ? (
            <div className="rc-hint py-6 text-center">loading…</div>
          ) : deckArchetypes.length === 0 ? (
            <RcEmpty title="No deck composition data.">
              decks are analysed once enough matches are recorded
            </RcEmpty>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {deckArchetypes.map((d) => {
                const isAvatarExpanded = expandedAvatar === d.avatarName;
                return (
                  <React.Fragment key={d.avatarCardId}>
                    <div
                      className={clsx(
                        "flex cursor-pointer gap-3 overflow-hidden rounded-rc-md border border-rc-line/12 bg-black/30 p-3 transition-colors hover:border-rc-accent/40 hover:bg-rc-accent/6",
                        isAvatarExpanded && "border-rc-accent/50 bg-rc-accent/8",
                      )}
                      onClick={() => void handleAvatarClick(d.avatarName)}
                    >
                      {d.avatarSlug && (
                        <div className="relative w-14 h-[75px] flex-shrink-0 rounded-rc-sm overflow-hidden bg-black/45">
                          <Image
                            src={`/api/images/${d.avatarSlug}`}
                            alt={d.avatarName}
                            fill
                            className="object-cover"
                            sizes="56px"
                            unoptimized
                          />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-rc-display text-[17px] leading-[1.1] text-rc-fg-strong">
                            {d.avatarName}
                          </span>
                          <span className="rc-stat flex-shrink-0 text-sm">
                            {(d.winRate * 100).toFixed(1)}%
                          </span>
                        </div>
                        <ElementDistributionBar elements={d.elements} />
                        <div className="mt-1 flex items-center gap-3 font-rc-mono text-[11px] tracking-[0.06em] text-rc-fg-subtle">
                          <span>{d.matches} decks</span>
                          <span>
                            {d.wins}W / {d.losses}L
                            {d.draws > 0 ? ` / ${d.draws}D` : ""}
                          </span>
                          <span>~{d.totalCards} spells</span>
                        </div>
                      </div>
                    </div>
                    {isAvatarExpanded && (
                      <AvatarDetail
                        loading={expandedAvatarLoading}
                        sites={expandedAvatarSites}
                        spells={expandedAvatarSpells}
                        elementCombos={expandedAvatarElementCombos}
                        selectedCombo={selectedCombo}
                        onSelectCombo={setSelectedCombo}
                        displayedSites={displayedSites}
                        displayedSpells={displayedSpells}
                        onHoverCard={setHoveredCard}
                        onLeaveCard={() => setHoveredCard(null)}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Card Synergies — moved to bottom, see below */}

      {/* Element Distribution */}
      <section className="rc-panel">
        <PanelHeader title="Win Rate by Element" />
        <div className="px-[18px] py-3.5">
          {elementStatsLoading ? (
            <div className="rc-hint py-6 text-center">loading…</div>
          ) : elementStats.length === 0 ? (
            <RcEmpty title="No element data.">
              nothing recorded for this format and period
            </RcEmpty>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {elementStats.map((e) => {
                const style = getElementStyle(e.element);
                const gradientStyle = getElementGradientStyle(e.element);
                const hasGradient = Object.keys(gradientStyle).length > 0;
                const isElementExpanded = expandedElement === e.element;
                // Filter deck archetypes: avatars whose element distribution includes this element
                const elementParts = parseElements(e.element);
                const matchingAvatars = isElementExpanded
                  ? deckArchetypes
                      .filter((d) => elementParts.some((ep) => (d.elements[ep] || 0) > 0))
                      .sort((a, b) => b.winRate - a.winRate)
                  : [];
                return (
                  <React.Fragment key={e.element}>
                    <div
                      className={clsx(
                        "cursor-pointer rounded-rc-md border px-4 py-3.5 transition hover:brightness-110",
                        !hasGradient && `${style.border} ${style.bg}`,
                        isElementExpanded && "ring-1 ring-rc-accent/35",
                      )}
                      style={hasGradient ? gradientStyle : undefined}
                      onClick={() => handleElementClick(e.element)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`inline-flex items-center gap-1.5 ${style.text}`}>
                          <ElementIcons element={e.element} size={16} />
                        </span>
                        <span className="font-rc-mono text-[11px] tracking-[0.06em] tabular-nums text-rc-fg-subtle">
                          {e.plays.toLocaleString()} plays
                        </span>
                      </div>
                      <WinRateBar winRate={e.winRate} barColor={style.bar} />
                      <div className="mt-1 font-rc-mono text-[11px] tracking-[0.06em] tabular-nums text-rc-fg-subtle">
                        {e.wins.toLocaleString()} wins of{" "}
                        {e.plays.toLocaleString()} plays
                      </div>
                    </div>
                    {isElementExpanded && (
                      <div className="col-span-full rounded-rc-md border border-rc-line/12 bg-black/30 p-3">
                        <h4 className="rc-eyebrow mb-2 inline-flex items-center gap-1.5">
                          Avatar Win Rates with{" "}
                          <ElementIcons element={e.element} size={14} />
                        </h4>
                        {matchingAvatars.length === 0 ? (
                          <div className="rc-hint py-4">
                            no deck composition data for this element yet
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="rc-table">
                              <thead>
                                <tr>
                                  <th>Avatar</th>
                                  <th>Element %</th>
                                  <th>Decks</th>
                                  <th>W</th>
                                  <th>L</th>
                                  <th>D</th>
                                  <th>Win Rate</th>
                                </tr>
                              </thead>
                              <tbody>
                                {matchingAvatars.map((d) => {
                                  const elemPct = elementParts.reduce((sum, ep) => sum + (d.elements[ep] || 0), 0);
                                  return (
                                    <tr key={d.avatarCardId}>
                                      <td className="font-rc-display text-[15px] text-rc-fg-strong">{d.avatarName}</td>
                                      <td className="tabular-nums text-rc-fg-subtle">{elemPct}%</td>
                                      <td className="tabular-nums">{d.matches}</td>
                                      <td className="tabular-nums text-rc-success">{d.wins}</td>
                                      <td className="tabular-nums text-rc-danger">{d.losses}</td>
                                      <td className="tabular-nums text-rc-fg-subtle">{d.draws}</td>
                                      <td className="tabular-nums text-rc-fg-strong">{(d.winRate * 100).toFixed(1)}%</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Type Distribution */}
      <section className="rc-panel">
        <PanelHeader title="Win Rate by Card Type" />
        <div className="px-[18px] py-3.5">
          {typeStatsLoading ? (
            <div className="rc-hint py-6 text-center">loading…</div>
          ) : typeStats.length === 0 ? (
            <RcEmpty title="No card type data.">
              nothing recorded for this format and period
            </RcEmpty>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {typeStats.map((t) => (
                <div
                  key={t.type}
                  className="rounded-rc-md border border-rc-line/12 bg-black/30 px-4 py-3.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-rc-display text-[17px] leading-[1.1] text-rc-fg-strong">
                      {t.type}
                    </span>
                    <span className="font-rc-mono text-[11px] tracking-[0.06em] tabular-nums text-rc-fg-subtle">
                      {t.plays.toLocaleString()} plays
                    </span>
                  </div>
                  <WinRateBar winRate={t.winRate} />
                  <div className="mt-1 font-rc-mono text-[11px] tracking-[0.06em] tabular-nums text-rc-fg-subtle">
                    {t.wins.toLocaleString()} wins of {t.plays.toLocaleString()}{" "}
                    plays
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Rarity Distribution */}
      <section className="rc-panel">
        <PanelHeader title="Win Rate by Rarity" />
        <div className="px-[18px] py-3.5">
          {rarityStatsLoading ? (
            <div className="rc-hint py-6 text-center">loading…</div>
          ) : rarityStats.length === 0 ? (
            <RcEmpty title="No rarity data.">
              nothing recorded for this format and period
            </RcEmpty>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {rarityStats.map((r) => {
                const style = RARITY_STYLES[r.rarity] || RARITY_STYLES.Ordinary;
                return (
                  <div
                    key={r.rarity}
                    className={`rounded-rc-md border ${style.border} ${style.bg} px-4 py-3.5`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`font-rc-display text-[17px] leading-[1.1] ${style.text}`}>
                        {r.rarity}
                      </span>
                      <span className="font-rc-mono text-[11px] tracking-[0.06em] tabular-nums text-rc-fg-subtle">
                        {r.plays.toLocaleString()} plays
                      </span>
                    </div>
                    <WinRateBar winRate={r.winRate} barColor={style.bar} />
                    <div className="mt-1 font-rc-mono text-[11px] tracking-[0.06em] tabular-nums text-rc-fg-subtle">
                      {r.wins.toLocaleString()} wins of{" "}
                      {r.plays.toLocaleString()} plays
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Mana Curve */}
      <section className="rc-panel">
        <PanelHeader title="Win Rate by Mana Cost" />
        <div className="px-[18px] py-3.5">
          {costStatsLoading ? (
            <div className="rc-hint py-6 text-center">loading…</div>
          ) : costStats.length === 0 ? (
            <RcEmpty title="No mana cost data.">
              nothing recorded for this format and period
            </RcEmpty>
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
                      <td className="tabular-nums text-rc-fg-strong">{c.cost}</td>
                      <td className="tabular-nums">{c.plays.toLocaleString()}</td>
                      <td className="tabular-nums">{c.wins.toLocaleString()}</td>
                      <td className="tabular-nums text-rc-fg-strong">
                        {(c.winRate * 100).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Site Win Rates */}
      <section className="rc-panel">
        <PanelHeader title="Site Win Rates" />
        <div className="px-[18px] py-3.5">
          <CardStatsTable
            stats={siteStats}
            loading={siteStatsLoading}
            error={siteStatsError}
            order={siteStatsOrder}
            setOrder={setSiteStatsOrder}
            limit={siteStatsLimit}
            setLimit={setSiteStatsLimit}
            onRefresh={() => void refreshSiteStats()}
            onHoverCard={setHoveredCard}
            onLeaveCard={() => setHoveredCard(null)}
            expandedCard={expandedCard}
            expandedCardData={expandedCardData}
            expandedCardLoading={expandedCardLoading}
            onRowClick={handleCardClick}
          />
        </div>
      </section>

      {/* Spellbook Win Rates */}
      <section className="rc-panel">
        <PanelHeader title="Spellbook Win Rates" />
        <div className="px-[18px] py-3.5">
          <p className="mb-3.5 font-rc-sans text-sm text-rc-fg-muted">
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
            onHoverCard={setHoveredCard}
            onLeaveCard={() => setHoveredCard(null)}
            showType
            expandedCard={expandedCard}
            expandedCardData={expandedCardData}
            expandedCardLoading={expandedCardLoading}
            onRowClick={handleCardClick}
          />
        </div>
      </section>

      {/* Spell Synergies — at the bottom, lazy-loaded */}
      {synergyTotalDecks >= 100 && (
        <>
          <section className="rc-panel">
            <PanelHeader title="Top Spell Synergies" />
            <div className="px-[18px] py-3.5">
              <p className="mb-3.5 font-rc-sans text-sm text-rc-fg-muted">
                Spell pairs with the highest win rate when played together (min. 3 co-occurrences)
              </p>
              {synergiesLoading ? (
                <div className="rc-hint py-6 text-center">loading…</div>
              ) : synergies.length === 0 ? (
                <RcEmpty title="No synergy data yet.">
                  pairs appear once enough decks are recorded
                </RcEmpty>
              ) : (
                <div className="max-h-[600px] overflow-auto rounded-rc-md border border-rc-line/12">
                  <table className="rc-table">
                    <thead className="sticky top-0 z-10 [&>tr>th]:bg-rc-bg">
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
                      {synergies.slice(0, synergyVisible).map((pair) => (
                        <tr
                          key={`${pair.cardA}||${pair.cardB}`}
                          className="cursor-pointer"
                          onMouseEnter={() =>
                            pair.slugA && setHoveredCard({ slug: pair.slugA, type: null })
                          }
                          onMouseLeave={() => setHoveredCard(null)}
                        >
                          <td className="font-rc-display text-[15px] text-rc-fg-strong">{pair.cardA}</td>
                          <td className="font-rc-display text-[15px] text-rc-fg-strong">{pair.cardB}</td>
                          <td className="tabular-nums">{pair.coOccurrences}</td>
                          <td className="tabular-nums">{pair.wins}</td>
                          <td className="tabular-nums">{pair.losses}</td>
                          <td className="tabular-nums font-medium text-rc-success">
                            {(pair.winRate * 100).toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {synergyVisible < synergies.length && (
                    <div className="flex justify-center border-t border-rc-line/8 py-3">
                      <RcButton
                        variant="link"
                        size="sm"
                        onClick={() => setSynergyVisible((v) => v + SYNERGY_PAGE_SIZE)}
                      >
                        Show more ({synergies.length - synergyVisible} remaining)
                      </RcButton>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          <section className="rc-panel">
            <PanelHeader title="Spell Anti-Synergies" />
            <div className="px-[18px] py-3.5">
              <p className="mb-3.5 font-rc-sans text-sm text-rc-fg-muted">
                Spell pairs with the lowest win rate when played together
              </p>
              {synergiesLoading ? (
                <div className="rc-hint py-6 text-center">loading…</div>
              ) : antiSynergies.length === 0 ? (
                <RcEmpty title="No anti-synergy data yet.">
                  pairs appear once enough decks are recorded
                </RcEmpty>
              ) : (
                <div className="max-h-[600px] overflow-auto rounded-rc-md border border-rc-line/12">
                  <table className="rc-table">
                    <thead className="sticky top-0 z-10 [&>tr>th]:bg-rc-bg">
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
                      {antiSynergies.slice(0, antiSynergyVisible).map((pair) => (
                        <tr
                          key={`${pair.cardA}||${pair.cardB}`}
                          className="cursor-pointer"
                          onMouseEnter={() =>
                            pair.slugA && setHoveredCard({ slug: pair.slugA, type: null })
                          }
                          onMouseLeave={() => setHoveredCard(null)}
                        >
                          <td className="font-rc-display text-[15px] text-rc-fg-strong">{pair.cardA}</td>
                          <td className="font-rc-display text-[15px] text-rc-fg-strong">{pair.cardB}</td>
                          <td className="tabular-nums">{pair.coOccurrences}</td>
                          <td className="tabular-nums">{pair.wins}</td>
                          <td className="tabular-nums">{pair.losses}</td>
                          <td className="tabular-nums font-medium text-rc-danger">
                            {(pair.winRate * 100).toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {antiSynergyVisible < antiSynergies.length && (
                    <div className="flex justify-center border-t border-rc-line/8 py-3">
                      <RcButton
                        variant="link"
                        size="sm"
                        onClick={() => setAntiSynergyVisible((v) => v + SYNERGY_PAGE_SIZE)}
                      >
                        Show more ({antiSynergies.length - antiSynergyVisible} remaining)
                      </RcButton>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        </>
      )}

      {/* Card Preview Overlay - rendered via portal to ensure viewport-fixed positioning */}
      {hoveredCard &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed top-1/4 right-8 z-[9999] pointer-events-none">
            <div
              className={`relative overflow-hidden rounded-rc-lg bg-black/60 shadow-rc-md ring-1 ring-rc-accent/30 backdrop-blur-md ${
                (hoveredCard.type || "").toLowerCase().includes("site")
                  ? "w-72 aspect-[4/3]"
                  : "w-56 aspect-[3/4]"
              }`}
            >
              <Image
                src={`/api/images/${hoveredCard.slug}`}
                alt="Card preview"
                fill
                className={`${
                  (hoveredCard.type || "").toLowerCase().includes("site")
                    ? "object-contain scale-150 rotate-90 origin-center"
                    : "object-cover"
                } object-center`}
                sizes="288px"
                unoptimized
                priority
              />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
