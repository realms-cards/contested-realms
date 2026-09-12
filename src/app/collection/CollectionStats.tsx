"use client";

import { useEffect, useState } from "react";
import { PanelHeader } from "@/components/ui/page-header";
import { rcButtonVariants } from "@/components/ui/rc-button";
import type { CollectionStats as StatsType } from "@/lib/collection/types";

export default function CollectionStats() {
  const [stats, setStats] = useState<StatsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/collection/stats")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load stats");
        return res.json();
      })
      .then(setStats)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load stats")
      )
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="rc-hint py-6 text-center">loading…</div>;
  }

  if (error) {
    return (
      <div className="rc-alert" data-tone="danger">
        {error}
      </div>
    );
  }

  if (!stats) return null;

  const exportLinkClass = rcButtonVariants({
    variant: "outline",
    size: "sm",
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Summary */}
      <section className="rc-panel">
        <PanelHeader title="Collection Summary" />
        <div className="px-[18px] py-3.5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="rc-eyebrow">total cards</div>
              <div className="rc-stat text-2xl">{stats.summary.totalCards}</div>
            </div>
            <div>
              <div className="rc-eyebrow">unique cards</div>
              <div className="rc-stat text-2xl">
                {stats.summary.uniqueCards}
              </div>
            </div>
            <div className="col-span-2">
              <div className="rc-eyebrow">estimated value</div>
              <div className="rc-stat text-2xl">
                {stats.summary.totalValue != null
                  ? `$${stats.summary.totalValue.toFixed(2)} ${
                      stats.summary.currency
                    }`
                  : "N/A"}
              </div>
            </div>
          </div>

          {/* Export Buttons */}
          <div className="mt-4 border-t border-rc-line/12 pt-4">
            <div className="rc-eyebrow mb-2">Export Collection</div>
            <div className="flex flex-wrap gap-2">
              <a
                href="/api/collection/export?format=csv"
                download="collection.csv"
                className={exportLinkClass}
              >
                CSV
              </a>
              <a
                href="/api/collection/export?format=json"
                download="collection.json"
                className={exportLinkClass}
              >
                JSON
              </a>
              <a
                href="/api/collection/export?format=text"
                download="collection.txt"
                className={exportLinkClass}
              >
                Text
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Set Completion */}
      <section className="rc-panel">
        <PanelHeader title="Set Completion" />
        <div className="space-y-3 px-[18px] py-3.5">
          {stats.bySet.map((set) => (
            <div key={set.setId}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <span className="font-rc-display text-[17px] leading-none text-rc-fg-strong">
                  {set.setName}
                </span>
                <span className="font-rc-mono text-xs tracking-[0.1em] text-rc-fg-subtle">
                  {set.owned}/{set.total} ({(set.completion * 100).toFixed(1)}%)
                </span>
              </div>
              <div className="rc-progress">
                <span style={{ width: `${set.completion * 100}%` }} />
              </div>
            </div>
          ))}
          {stats.bySet.length === 0 && (
            <div className="rc-hint">No cards in collection yet</div>
          )}
        </div>
      </section>

      {/* By Element */}
      <section className="rc-panel">
        <PanelHeader title="By Element" />
        <div className="grid grid-cols-2 gap-3 px-[18px] py-3.5">
          {Object.entries(stats.byElement).map(([element, count]) => (
            <div key={element} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={`h-2.5 w-2.5 rounded-full ${getElementColor(
                  element
                )}`}
              />
              <span className="font-rc-sans text-sm text-rc-fg">{element}</span>
              <span className="rc-stat ml-auto text-sm">{count}</span>
            </div>
          ))}
        </div>
      </section>

      {/* By Rarity */}
      <section className="rc-panel">
        <PanelHeader title="By Rarity" />
        <div className="overflow-x-auto">
          <table className="rc-table">
            <thead>
              <tr>
                <th>Rarity</th>
                <th className="text-right">Owned</th>
              </tr>
            </thead>
            <tbody>
              {["Unique", "Elite", "Exceptional", "Ordinary"].map((rarity) => (
                <tr key={rarity}>
                  <td className={getRarityTextColor(rarity)}>{rarity}</td>
                  <td className="text-right tabular-nums">
                    {stats.byRarity[rarity] || 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function getElementColor(element: string): string {
  switch (element.toLowerCase()) {
    case "air":
      return "bg-rc-moonlight";
    case "earth":
      return "bg-rc-success";
    case "fire":
      return "bg-rc-ember";
    case "water":
      return "bg-rc-info";
    default:
      return "bg-rc-fg-dim";
  }
}

function getRarityTextColor(rarity: string): string {
  switch (rarity.toLowerCase()) {
    case "unique":
      return "text-rc-spark";
    case "elite":
      return "text-rc-accent-link";
    case "exceptional":
      return "text-rc-info";
    default:
      return "text-rc-fg-muted";
  }
}
