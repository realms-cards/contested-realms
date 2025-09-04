"use client";

import Image from "next/image";
import { NumberBadge } from "@/components/game/manacost";
import type { Digit } from "@/components/game/manacost";
import type { Pick3D, CardMeta } from "@/lib/game/cardSorting";

type RightPanelProps = {
  cardsTab: "deck" | "all";
  setCardsTab: (v: "deck" | "all") => void;
  picksOpen: boolean;
  setPicksOpen: (v: boolean) => void;
  picksByType: {
    deck: number;
    sideboard: number;
    creatures: number;
    spells: number;
    sites: number;
    avatars: number;
  };
  yourCounts: Array<{ cardId: number; count: number; name: string }>;
  pick3D: Pick3D[];
  metaByCardId: Record<number, CardMeta>;
  pickInfoById: Record<
    number,
    { slug: string | null; type: string | null; name: string }
  >;
  onHoverPreview: (slug: string, name: string, type: string | null) => void;
  onHoverClear: () => void;
  moveOneToSideboard: (cardId: number) => void;
  moveOneFromSideboardToDeck: (cardId: number) => void;
  openContextMenu: (
    cardId: number,
    cardName: string,
    clientX: number,
    clientY: number
  ) => void;
  setFeedback: (msg: string) => void;
};

export default function RightPanel(props: RightPanelProps) {
  const {
    cardsTab,
    setCardsTab,
    picksOpen,
    setPicksOpen,
    picksByType,
    yourCounts,
    pick3D,
    metaByCardId,
    pickInfoById,
    onHoverPreview,
    onHoverClear,
    moveOneToSideboard,
    moveOneFromSideboardToDeck,
    openContextMenu,
    setFeedback,
  } = props;

  return (
    <div className="absolute right-6 max-w-7xl mx-auto px-4 pb-6 pt-2 pointer-events-none select-none">
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-8" />
        <div className="col-span-12 lg:col-span-4">
          <div className="rounded p-3 bg-black/80 ring-1 ring-white/30 shadow-lg pointer-events-none">
            <div className="font-medium mb-2 text-white flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex bg-white/10 rounded pointer-events-auto">
                  <button
                    onClick={() => setCardsTab("deck")}
                    className={`px-3 py-1 text-sm rounded-l transition-colors ${
                      cardsTab === "deck"
                        ? "bg-green-600 text-white"
                        : "text-white/80 hover:bg-white/10"
                    }`}
                  >
                    Your Deck ({picksByType.deck + picksByType.sideboard})
                  </button>
                  <button
                    onClick={() => setCardsTab("all")}
                    className={`px-3 py-1 text-sm rounded-r transition-colors ${
                      cardsTab === "all"
                        ? "bg-blue-600 text-white"
                        : "text-white/80 hover:bg-white/10"
                    }`}
                  >
                    All Cards ({yourCounts.reduce((s, c) => s + c.count, 0)})
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPicksOpen(!picksOpen)}
                  className="text-xs px-2 py-1 bg-white/10 rounded hover:bg-white/20 pointer-events-auto"
                >
                  {picksOpen ? "Hide" : "Show"}
                </button>
              </div>
            </div>

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

            {picksOpen && (
              <div className="max-h-[52vh] overflow-auto pr-2 grid sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-2 gap-2 text-xs pointer-events-auto">
                {yourCounts
                  .filter((it) => {
                    if (cardsTab === "all") return true;
                    return pick3D.some((p) => p.card.cardId === it.cardId);
                  })
                  .map((it) => {
                    const meta = metaByCardId[it.cardId];
                    const t = (meta?.thresholds as Record<string, number> | undefined) || {};
                    const order = ["air", "water", "earth", "fire"] as const;

                    const pickInfo = pickInfoById[it.cardId];
                    const slug = pickInfo?.slug || undefined;
                    const isSite = (pickInfo?.type || "").toLowerCase().includes("site");

                    const cardInDeck = pick3D.filter((p) => p.card.cardId === it.cardId && p.z < 0).length;
                    const cardInSideboard = pick3D.filter((p) => p.card.cardId === it.cardId && p.z >= 0).length;

                    const handleContextMenu = (e: React.MouseEvent) => {
                      e.preventDefault();
                      const total = cardInDeck + cardInSideboard;
                      if (total === 1 || cardInDeck === 0 || cardInSideboard === 0) {
                        if (cardInDeck > 0) {
                          moveOneToSideboard(it.cardId);
                          const remaining = cardInDeck - 1;
                          const msg =
                            remaining > 0
                              ? `Moved "${it.name}" to Sideboard (${remaining} left in deck)`
                              : `Moved "${it.name}" to Sideboard (deck now empty)`;
                          setFeedback(msg);
                        } else if (cardInSideboard > 0) {
                          moveOneFromSideboardToDeck(it.cardId);
                          const remaining = cardInSideboard - 1;
                          const msg =
                            remaining > 0
                              ? `Moved "${it.name}" to Deck (${remaining} left in sideboard)`
                              : `Moved "${it.name}" to Deck (sideboard now empty)`;
                          setFeedback(msg);
                        }
                      } else {
                        openContextMenu(it.cardId, it.name, e.clientX, e.clientY);
                      }
                    };

                    return (
                      <div
                        key={it.cardId}
                        className="rounded p-2 bg-black/70 ring-1 ring-white/25 text-white cursor-pointer hover:bg-black/50"
                        onMouseEnter={() => {
                          if (slug) onHoverPreview(slug, it.name, pickInfo?.type || null);
                        }}
                        onMouseLeave={() => onHoverClear()}
                        onContextMenu={handleContextMenu}
                        title={`Right-click to move between Deck/Sideboard`}
                      >
                        <div className="flex items-start gap-2">
                          {slug ? (
                            <div
                              className={`relative flex-none ${
                                isSite ? "aspect-[4/3] w-14" : "aspect-[3/4] w-12"
                              } rounded overflow-hidden ring-1 ring-white/10 bg-black/40`}
                            >
                              <Image
                                src={`/api/images/${slug}`}
                                alt={it.name}
                                fill
                                className={`${isSite ? "object-cover rotate-90" : "object-cover"}`}
                                sizes="(max-width:640px) 20vw, (max-width:1024px) 15vw, 10vw"
                              />
                            </div>
                          ) : null}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between">
                              <div className="min-w-0">
                                <div className="font-semibold truncate" title={it.name}>
                                  {it.name}
                                </div>
                                <div className="text-xs opacity-90 flex items-center gap-2">
                                  {cardInDeck > 0 && (
                                    <span className="bg-green-600/20 text-green-300 px-1 py-0.5 rounded text-[10px]">
                                      Deck: {cardInDeck}
                                    </span>
                                  )}
                                  {cardInSideboard > 0 && (
                                    <span className="bg-blue-600/20 text-blue-300 px-1 py-0.5 rounded text-[10px]">
                                      Sideboard: {cardInSideboard}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="text-right font-semibold">x{it.count}</div>
                            </div>
                            <div className="mt-1 flex items-center flex-wrap gap-2 opacity-90">
                              <div className="flex items-center gap-2">
                                {order.map((k) =>
                                  t[k] ? (
                                    <span
                                      key={k}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/10"
                                    >
                                      <Image
                                        src={`/api/assets/${k}.png`}
                                        alt={k}
                                        width={12}
                                        height={12}
                                      />
                                      {t[k]}
                                    </span>
                                  ) : null
                                )}
                              </div>
                              {meta?.cost != null && (
                                <div className="ml-auto flex items-center gap-1">
                                  {meta.cost >= 0 && meta.cost <= 9 ? (
                                    <NumberBadge value={meta.cost as Digit} size={16} strokeWidth={8} />
                                  ) : (
                                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-white text-black text-[10px] font-bold">
                                      {meta.cost}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
