"use client";

import { useEffect, useState } from "react";
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
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-24 bg-gray-800 rounded-lg" />
        <div className="h-32 bg-gray-800 rounded-lg" />
        <div className="h-32 bg-gray-800 rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/50 border border-red-700 rounded-lg p-4">
        {error}
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-bold mb-4">Collection Summary</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-3xl font-bold">{stats.summary.totalCards}</div>
            <div className="text-gray-400 text-sm">Total Cards</div>
          </div>
          <div>
            <div className="text-3xl font-bold">
              {stats.summary.uniqueCards}
            </div>
            <div className="text-gray-400 text-sm">Unique Cards</div>
          </div>
          <div className="col-span-2">
            <div className="text-2xl font-bold">
              {stats.summary.totalValue != null
                ? `$${stats.summary.totalValue.toFixed(2)} ${
                    stats.summary.currency
                  }`
                : "Value N/A"}
            </div>
            <div className="text-gray-400 text-sm">Estimated Value</div>
          </div>
        </div>

        {/* Export Buttons */}
        <div className="mt-4 pt-4 border-t border-gray-700">
          <div className="text-sm text-gray-400 mb-2">Export Collection</div>
          <div className="flex gap-2">
            <a
              href="/api/collection/export?format=csv"
              download="collection.csv"
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm"
            >
              CSV
            </a>
            <a
              href="/api/collection/export?format=json"
              download="collection.json"
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm"
            >
              JSON
            </a>
            <a
              href="/api/collection/export?format=text"
              download="collection.txt"
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm"
            >
              Text
            </a>
          </div>
        </div>
      </div>

      {/* Set Completion */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-bold mb-4">Set Completion</h3>
        <div className="space-y-3">
          {stats.bySet.map((set) => (
            <div key={set.setId}>
              <div className="flex justify-between text-sm mb-1">
                <span>{set.setName}</span>
                <span className="text-gray-400">
                  {set.owned}/{set.total} ({(set.completion * 100).toFixed(1)}%)
                </span>
              </div>
              <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all"
                  style={{ width: `${set.completion * 100}%` }}
                />
              </div>
            </div>
          ))}
          {stats.bySet.length === 0 && (
            <div className="text-gray-400 text-sm">
              No cards in collection yet
            </div>
          )}
        </div>
      </div>

      {/* By Element */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-bold mb-4">By Element</h3>
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(stats.byElement).map(([element, count]) => (
            <div key={element} className="flex items-center gap-2">
              <div
                className={`w-3 h-3 rounded-full ${getElementColor(element)}`}
              />
              <span className="text-sm">{element}</span>
              <span className="text-gray-400 text-sm ml-auto">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* By Rarity */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-bold mb-4">By Rarity</h3>
        <div className="space-y-2">
          {["Unique", "Elite", "Exceptional", "Ordinary"].map((rarity) => (
            <div key={rarity} className="flex items-center justify-between">
              <span className={`text-sm ${getRarityTextColor(rarity)}`}>
                {rarity}
              </span>
              <span className="text-gray-400 text-sm">
                {stats.byRarity[rarity] || 0}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function getElementColor(element: string): string {
  switch (element.toLowerCase()) {
    case "air":
      return "bg-cyan-400";
    case "earth":
      return "bg-green-500";
    case "fire":
      return "bg-red-500";
    case "water":
      return "bg-blue-500";
    default:
      return "bg-gray-500";
  }
}

function getRarityTextColor(rarity: string): string {
  switch (rarity.toLowerCase()) {
    case "unique":
      return "text-purple-400";
    case "elite":
      return "text-yellow-400";
    case "exceptional":
      return "text-blue-400";
    default:
      return "text-gray-300";
  }
}
