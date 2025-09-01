"use client";

import Image from "next/image";

interface CardCount {
  cardId: number;
  name: string;
  count: number;
}

interface PicksByType {
  deck: number;
  sideboard: number;
}

// Minimal shape we rely on for rendering a thumbnail
interface SimplePick {
  cardId: number;
  slug?: string | null;
}

interface CardPicksPanelProps {
  cardsTab: "deck" | "all";
  onTabChange: (tab: "deck" | "all") => void;
  yourCounts: CardCount[];
  picksByType: PicksByType;
  picksOpen: boolean;
  onToggleOpen: () => void;
  picks: Record<string, unknown>; // The picks object for finding matching cards
  onMoveCard: (cardId: number, direction: "toDeck" | "toSideboard") => void;
  feedbackMessage: string | null;
}

export default function CardPicksPanel({
  cardsTab,
  onTabChange,
  yourCounts,
  picksByType,
  picksOpen,
  onToggleOpen,
  picks,
  onMoveCard,
  feedbackMessage,
}: CardPicksPanelProps) {
  return (
    <div className="absolute right-6 max-w-7xl mx-auto px-4 pb-6 pt-2 pointer-events-none select-none">
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-8">
          {/* Empty space where pack info would be in draft */}
        </div>
        <div className="col-span-12 lg:col-span-4">
          <div className="rounded p-3 bg-black/80 ring-1 ring-white/30 shadow-lg pointer-events-none">
            <div className="font-medium mb-2 text-white flex items-center justify-between">
              <div className="flex items-center gap-4">
                {/* Tabs */}
                <div className="flex bg-white/10 rounded pointer-events-auto">
                  <button
                    onClick={() => onTabChange("deck")}
                    className={`px-3 py-1 text-sm rounded-l transition-colors ${
                      cardsTab === "deck"
                        ? "bg-blue-600 text-white"
                        : "text-white/80 hover:bg-white/10"
                    }`}
                  >
                    Your Deck ({yourCounts.reduce((sum, card) => sum + card.count, 0)})
                  </button>
                  <button
                    onClick={() => onTabChange("all")}
                    className={`px-3 py-1 text-sm rounded-r transition-colors ${
                      cardsTab === "all"
                        ? "bg-blue-600 text-white"
                        : "text-white/80 hover:bg-white/10"
                    }`}
                  >
                    All Cards ({yourCounts.reduce((sum, card) => sum + card.count, 0)})
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={onToggleOpen}
                  className="text-xs px-2 py-1 bg-white/10 rounded hover:bg-white/20 pointer-events-auto"
                >
                  {picksOpen ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {/* Deck/Sideboard Summary */}
            {cardsTab === "deck" && picksOpen && (
              <div className="mb-3 pointer-events-auto">
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-600 rounded"></div>
                    <span className="text-green-300">
                      Deck: {picksByType.deck}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-blue-600 rounded"></div>
                    <span className="text-blue-300">
                      Sideboard: {picksByType.sideboard}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Feedback Message */}
            {feedbackMessage && (
              <div className="mb-2 text-xs text-yellow-400 bg-yellow-400/10 rounded px-2 py-1 pointer-events-auto">
                {feedbackMessage}
              </div>
            )}

            {/* Cards List */}
            {picksOpen && (
              <div className="max-h-64 overflow-y-auto pointer-events-auto">
                <div className="space-y-1">
                  {yourCounts
                    .filter((c) => c.count > 0)
                    .map((card) => {
                      const matchingPick = Object.values(picks).find(
                        (p: unknown) => {
                          const pick = p as Partial<SimplePick>;
                          return (pick.cardId as number) === card.cardId;
                        }
                      ) as SimplePick | undefined;

                      return (
                        <div
                          key={card.cardId}
                          className="flex items-center justify-between text-xs bg-white/5 rounded p-2 hover:bg-white/10 transition-colors group"
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div className="w-8 h-6 bg-black/40 rounded flex-shrink-0 overflow-hidden">
                              {typeof matchingPick?.slug === "string" ? (
                                <Image
                                  src={`/api/images/${matchingPick.slug as string}`}
                                  alt={card.name}
                                  width={32}
                                  height={24}
                                  className="w-full h-full object-cover"
                                  sizes="32px"
                                />
                              ) : null}
                            </div>
                            <span className="text-white truncate font-medium">
                              {card.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-white/60">×{card.count}</span>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => onMoveCard(card.cardId, "toDeck")}
                                className="w-5 h-5 bg-green-600/20 hover:bg-green-600/40 rounded text-green-400 text-xs flex items-center justify-center transition-colors"
                                title="Move one to deck"
                              >
                                ↑
                              </button>
                              <button
                                onClick={() => onMoveCard(card.cardId, "toSideboard")}
                                className="w-5 h-5 bg-blue-600/20 hover:bg-blue-600/40 rounded text-blue-400 text-xs flex items-center justify-center transition-colors"
                                title="Move one to sideboard"
                              >
                                ↓
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export type { CardCount, PicksByType, CardPicksPanelProps };