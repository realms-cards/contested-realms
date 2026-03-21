"use client";

import { useState } from "react";
import YourDeckList from "@/app/decks/editor-3d/YourDeckList";
import type { Pick3D, CardMeta } from "@/lib/game/cardSorting";

type RightPanelProps = {
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
  isDraftMode: boolean;
  isSealed: boolean;
  /** When true, highlight panel sections as drop targets */
  isCardDragging?: boolean;
};

export default function RightPanel(props: RightPanelProps) {
  const {
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
    isDraftMode,
    isSealed,
    isCardDragging = false,
  } = props;

  const [deckExpanded, setDeckExpanded] = useState(false);
  const [sideboardOpen, setSideboardOpen] = useState(true);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [columns, setColumns] = useState<2 | 3 | 4 | 5>(2);

  const isDraftOrSealed = isDraftMode || isSealed;
  const collectionTotal =
    picksByType.collection + (showCollectionZone ? collectionCount : 0);

  // Calculate panel width based on columns
  const panelWidth =
    columns === 2
      ? "w-[28rem]"
      : columns === 3
      ? "w-[40rem]"
      : columns === 4
      ? "w-[52rem]"
      : "w-[64rem]";

  const dropHighlight = isCardDragging
    ? "ring-2 ring-cyan-400/60 bg-black/90"
    : "ring-1 ring-white/30 bg-black/80";

  const sharedListProps = {
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
    showCollectionZone,
    collectionCountsByCardId,
    moveOneFromSideboardToCollection,
    moveOneFromCollectionToSideboard,
    onColumnsChange: setColumns,
  };

  return (
    <div className="absolute right-6 top-24 sm:top-28 pointer-events-none select-none">
      <div
        className={`${panelWidth} transition-all duration-300 ease-in-out ml-auto space-y-2`}
      >
        {/* Deck Summary — always visible, collapsed by default */}
        <div data-drop-zone="Deck" className={`rounded p-3 ${dropHighlight} shadow-lg pointer-events-auto transition-all`}>
          <div className="font-medium text-white flex items-center justify-between">
            <span className="text-sm">Deck</span>
            <button
              onClick={() => setDeckExpanded(!deckExpanded)}
              className="text-xs px-2 py-1 bg-white/10 rounded hover:bg-white/20"
            >
              {deckExpanded ? "Collapse" : "Expand"}
            </button>
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-xs pointer-events-none">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 bg-green-600 rounded" />
              <span className="text-green-300">
                Deck: {picksByType.deck}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 bg-blue-600 rounded" />
              <span className="text-blue-300">
                Sideboard: {picksByType.sideboard}
              </span>
            </div>
            {!isDraftOrSealed && collectionTotal > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 bg-purple-600 rounded" />
                <span className="text-purple-300">
                  Collection: {collectionTotal}
                </span>
              </div>
            )}
          </div>
          {deckExpanded && (
            <div className="mt-2">
              <YourDeckList
                cardsTab="deck"
                {...sharedListProps}
              />
            </div>
          )}
        </div>

        {/* Sideboard — main panel, expanded by default */}
        <div data-drop-zone="Sideboard" className={`rounded p-3 ${dropHighlight} shadow-lg pointer-events-auto transition-all`}>
          <div className="font-medium text-white flex items-center justify-between">
            <span className="text-sm">
              {isDraftOrSealed ? "Card Pool" : "Sideboard"} (
              {isDraftOrSealed
                ? picksByType.sideboard + picksByType.collection
                : picksByType.sideboard}
              )
            </span>
            <button
              onClick={() => setSideboardOpen(!sideboardOpen)}
              className="text-xs px-2 py-1 bg-white/10 rounded hover:bg-white/20"
            >
              {sideboardOpen ? "Hide" : "Show"}
            </button>
          </div>
          {sideboardOpen && (
            <div className="mt-2">
              <YourDeckList
                cardsTab="sideboard"
                mergeCollectionIntoSideboard={isDraftOrSealed}
                {...sharedListProps}
              />
            </div>
          )}
        </div>

        {/* Collection — only when applicable and not in draft/sealed (merged into sideboard above) */}
        {!isDraftOrSealed &&
          (picksByType.collection > 0 ||
            (showCollectionZone && collectionCount > 0)) && (
            <div data-drop-zone="Collection" className={`rounded p-3 ${dropHighlight} shadow-lg pointer-events-auto transition-all`}>
              <div className="font-medium text-white flex items-center justify-between">
                <span className="text-sm">
                  Collection ({collectionTotal})
                </span>
                <button
                  onClick={() => setCollectionOpen(!collectionOpen)}
                  className="text-xs px-2 py-1 bg-white/10 rounded hover:bg-white/20"
                >
                  {collectionOpen ? "Hide" : "Show"}
                </button>
              </div>
              {collectionOpen && (
                <div className="mt-2">
                  <YourDeckList
                    cardsTab="collection"
                    {...sharedListProps}
                  />
                </div>
              )}
            </div>
          )}
      </div>
    </div>
  );
}
