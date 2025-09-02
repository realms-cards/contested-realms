"use client";

interface DeckCounts {
  deck: number;
  sideboard: number;
  creatures: number;
  spells: number;
  sites: number;
  avatars: number;
}

interface DeckStatisticsProps {
  counts: DeckCounts;
  manaCurve: Record<number, number>;
}

export default function DeckStatistics({
  counts,
  manaCurve,
}: DeckStatisticsProps) {
  // Dynamically scale bar heights relative to the maximum count for visual alignment
  const buckets = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const values = buckets.map((c) => manaCurve[c] || 0);
  const maxCount = Math.max(1, ...values);
  return (
    <div className="absolute bottom-6 left-6 z-10 bg-black/80 backdrop-blur-sm rounded-lg p-4 ring-1 ring-white/30 shadow-lg text-white">
      <div className="text-sm font-medium mb-3">Deck Statistics</div>
      <div className="flex gap-6">
        <div className="space-y-1 text-xs">
          <div className="flex justify-between gap-4">
            <span>Deck:</span>
            <span className="font-mono">{counts.deck}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span>Sideboard:</span>
            <span className="font-mono">{counts.sideboard}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span>Creatures:</span>
            <span className="font-mono">{counts.creatures}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span>Spells:</span>
            <span className="font-mono">{counts.spells}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span>Sites:</span>
            <span className="font-mono">{counts.sites}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span>Avatars:</span>
            <span className="font-mono">{counts.avatars}</span>
          </div>
        </div>

        <div className="space-y-1 text-xs">
          <div className="font-medium">Mana Curve (Deck Only):</div>
          <div className="flex gap-1">
            {buckets.map((cost) => (
              <div key={cost} className="text-center">
                <div className="w-4 text-[10px] opacity-80">{cost}+</div>
                <div className="w-4 h-8 bg-white/20 rounded-sm flex items-end">
                  <div
                    className="w-full bg-blue-400 rounded-sm transition-all"
                    style={{
                      height: `${Math.round(
                        ((manaCurve[cost] || 0) / maxCount) * 100
                      )}%`,
                      minHeight: manaCurve[cost] ? "2px" : "0px",
                    }}
                  />
                </div>
                <div className="w-4 text-[10px] font-mono">
                  {manaCurve[cost] || 0}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export type { DeckCounts, DeckStatisticsProps };
