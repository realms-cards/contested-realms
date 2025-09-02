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
  // 8 buckets: 0,1,2,3,4,5,6,7+ (7+ aggregates 7 and above)
  const buckets = [0, 1, 2, 3, 4, 5, 6, 7];
  const valFor = (c: number) =>
    c === 7
      ? Object.entries(manaCurve).reduce((sum, [k, v]) => {
          const n = Number(k);
          return sum + (Number.isFinite(n) && n >= 7 ? v : 0);
        }, 0)
      : manaCurve[c] || 0;
  const values = buckets.map((c) => valFor(c));
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
          <div className="flex gap-1 px-2 py-2">
            {buckets.map((cost) => (
              <div key={cost} className="text-center">
                <div className="w-4 text-[10px] opacity-80">
                  {cost === 7 ? "7+" : cost}
                </div>
                <div className="w-4 h-8 bg-white/20 rounded-sm flex items-end relative">
                  <div
                    className="w-full bg-blue-400 rounded-sm transition-all absolute bottom-0"
                    style={{
                      height: `${Math.max(
                        2,
                        Math.round((valFor(cost) / maxCount) * 32)
                      )}px`,
                      display: valFor(cost) ? "block" : "none",
                    }}
                  />
                </div>
                <div className="w-4 text-[10px] font-mono">{valFor(cost)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export type { DeckCounts, DeckStatisticsProps };
