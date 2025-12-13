"use client";

import { useState } from "react";
import YourDeckList from "@/app/decks/editor-3d/YourDeckList";
import type { Pick3D, CardMeta } from "@/lib/game/cardSorting";

type RightPanelProps = {
  cardsTab: "deck" | "sideboard" | "collection" | "all";
  setCardsTab: (v: "deck" | "sideboard" | "collection" | "all") => void;
  picksOpen: boolean;
  setPicksOpen: (v: boolean) => void;
  picksByType: {
    deck: number;
    sideboard: number;
    collection: number;
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
  /** Only show collection feature when in cube draft with sideboard option enabled */
  showCollectionZone?: boolean;
  collectionCount: number;
  collectionCountsByCardId: Record<number, number>;
  moveOneFromSideboardToCollection: (cardId: number) => void;
  moveOneFromCollectionToSideboard: (cardId: number) => void;
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
    showCollectionZone = false,
    collectionCount,
    collectionCountsByCardId,
    moveOneFromSideboardToCollection,
    moveOneFromCollectionToSideboard,
  } = props;

  const [columns, setColumns] = useState<2 | 3 | 4 | 5>(2);

  // Calculate panel width based on columns
  // Base card width ~200px + gaps, padding, borders
  const panelWidth =
    columns === 2
      ? "w-[28rem]" // ~448px for 2 columns
      : columns === 3
      ? "w-[40rem]" // ~640px for 3 columns
      : columns === 4
      ? "w-[52rem]" // ~832px for 4 columns
      : "w-[64rem]"; // ~1024px for 5 columns

  return (
    <div className="absolute right-6 top-24 sm:top-28 pointer-events-none select-none">
      <div
        className={`${panelWidth} transition-all duration-300 ease-in-out ml-auto`}
      >
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
                  Deck ({picksByType.deck})
                </button>
                <button
                  onClick={() => setCardsTab("sideboard")}
                  className={`px-3 py-1 text-sm transition-colors ${
                    cardsTab === "sideboard"
                      ? "bg-blue-600 text-white"
                      : "text-white/80 hover:bg-white/10"
                  }`}
                >
                  Sideboard ({picksByType.sideboard})
                </button>
                {(picksByType.collection > 0 ||
                  (showCollectionZone && collectionCount > 0)) && (
                  <button
                    onClick={() => setCardsTab("collection")}
                    className={`px-3 py-1 text-sm transition-colors ${
                      cardsTab === "collection"
                        ? "bg-purple-600 text-white"
                        : "text-white/80 hover:bg-white/10"
                    }`}
                  >
                    Collection (
                    {picksByType.collection +
                      (showCollectionZone ? collectionCount : 0)}
                    )
                  </button>
                )}
                <button
                  onClick={() => setCardsTab("all")}
                  className={`px-3 py-1 text-sm rounded-r transition-colors ${
                    cardsTab === "all"
                      ? "bg-amber-600 text-white"
                      : "text-white/80 hover:bg-white/10"
                  }`}
                >
                  All ({yourCounts.reduce((s, c) => s + c.count, 0)})
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

          {picksOpen && (
            <div className="mb-3 pointer-events-auto">
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-600 rounded" />
                  <span className="text-green-300">
                    Deck: {picksByType.deck}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-blue-600 rounded" />
                  <span className="text-blue-300">
                    Sideboard: {picksByType.sideboard}
                  </span>
                </div>
                {(picksByType.collection > 0 ||
                  (showCollectionZone && collectionCount > 0)) && (
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-purple-600 rounded" />
                    <span className="text-purple-300">
                      Collection:{" "}
                      {picksByType.collection +
                        (showCollectionZone ? collectionCount : 0)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {picksOpen && (
            <YourDeckList
              cardsTab={cardsTab}
              yourCounts={yourCounts}
              pick3D={pick3D}
              metaByCardId={metaByCardId}
              pickInfoById={pickInfoById}
              onHoverPreview={onHoverPreview}
              onHoverClear={onHoverClear}
              moveOneToSideboard={moveOneToSideboard}
              moveOneFromSideboardToDeck={moveOneFromSideboardToDeck}
              openContextMenu={openContextMenu}
              setFeedback={setFeedback}
              showCollectionZone={showCollectionZone}
              collectionCountsByCardId={collectionCountsByCardId}
              moveOneFromSideboardToCollection={
                moveOneFromSideboardToCollection
              }
              moveOneFromCollectionToSideboard={
                moveOneFromCollectionToSideboard
              }
              onColumnsChange={setColumns}
            />
          )}
        </div>
      </div>
    </div>
  );
}
