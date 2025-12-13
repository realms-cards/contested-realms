"use client";

import Image from "next/image";
import { useState } from "react";
import { NumberBadge } from "@/components/game/manacost";
import type { Digit } from "@/components/game/manacost";
import type { Pick3D, CardMeta } from "@/lib/game/cardSorting";

export type YourDeckListProps = {
  cardsTab: "deck" | "sideboard" | "collection" | "all";
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
  onColumnsChange?: (columns: 2 | 3 | 4 | 5) => void;
  /** Only show collection feature when in cube draft with sideboard option enabled */
  showCollectionZone?: boolean;
  collectionCountsByCardId: Record<number, number>;
  moveOneFromSideboardToCollection: (cardId: number) => void;
  moveOneFromCollectionToSideboard: (cardId: number) => void;
};

type SortMode = "name" | "cost" | "type" | "element" | "none";

export default function YourDeckList(props: YourDeckListProps) {
  const {
    cardsTab,
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
    onColumnsChange,
    showCollectionZone = false,
    collectionCountsByCardId,
    moveOneFromSideboardToCollection,
    moveOneFromCollectionToSideboard,
  } = props;

  const [columns, setColumns] = useState<2 | 3 | 4 | 5>(2);
  const [sortMode, setSortMode] = useState<SortMode>("none");

  const handleColumnsChange = (newColumns: 2 | 3 | 4 | 5) => {
    setColumns(newColumns);
    onColumnsChange?.(newColumns);
  };

  const order = ["air", "water", "earth", "fire"] as const;

  // Prepare groups: avatar, spellbook, atlas
  const filtered = yourCounts.filter((it) => {
    if (cardsTab === "all") return true;
    if (cardsTab === "deck") {
      // Only cards in the Deck zone
      return pick3D.some(
        (p) => p.card.cardId === it.cardId && p.zone === "Deck"
      );
    }
    if (cardsTab === "sideboard") {
      // Cards in Sideboard zone only
      return pick3D.some(
        (p) => p.card.cardId === it.cardId && p.zone === "Sideboard"
      );
    }
    if (cardsTab === "collection") {
      // Cards in Collection zone only
      return (
        pick3D.some(
          (p) => p.card.cardId === it.cardId && p.zone === "Collection"
        ) || (collectionCountsByCardId[it.cardId] ?? 0) > 0
      );
    }
    return pick3D.some((p) => p.card.cardId === it.cardId);
  });

  // Apply sorting
  const sortedFiltered = [...filtered].sort((a, b) => {
    if (sortMode === "name") {
      return a.name.localeCompare(b.name);
    } else if (sortMode === "cost") {
      const costA = metaByCardId[a.cardId]?.cost ?? 0;
      const costB = metaByCardId[b.cardId]?.cost ?? 0;
      if (costA !== costB) return costA - costB;
      return a.name.localeCompare(b.name);
    } else if (sortMode === "element") {
      const thresholdsA =
        (metaByCardId[a.cardId]?.thresholds as
          | Record<string, number>
          | undefined
          | null) || {};
      const thresholdsB =
        (metaByCardId[b.cardId]?.thresholds as
          | Record<string, number>
          | undefined
          | null) || {};

      const getPrimaryElementIndex = (
        thresholds: Record<string, number>
      ): number => {
        let bestIndex: number = order.length; // colorless / no thresholds last
        let bestValue = 0;
        order.forEach((el, idx) => {
          const v = thresholds[el] || 0;
          if (v > bestValue) {
            bestValue = v;
            bestIndex = idx;
          }
        });
        return bestIndex;
      };

      const idxA = getPrimaryElementIndex(
        thresholdsA as Record<string, number>
      );
      const idxB = getPrimaryElementIndex(
        thresholdsB as Record<string, number>
      );
      if (idxA !== idxB) return idxA - idxB;
      return a.name.localeCompare(b.name);
    } else if (sortMode === "type") {
      const typeA = (pickInfoById[a.cardId]?.type || "").toLowerCase();
      const typeB = (pickInfoById[b.cardId]?.type || "").toLowerCase();
      if (typeA !== typeB) return typeA.localeCompare(typeB);
      return a.name.localeCompare(b.name);
    }
    // "none" mode: no sorting, preserve original order
    return 0;
  });

  // When sort mode is "none", skip grouping to preserve exact visual order
  const groups: Array<{
    key: "avatar" | "spellbook" | "atlas" | "all";
    items: typeof yourCounts;
  }> =
    sortMode === "none"
      ? [{ key: "all", items: sortedFiltered }]
      : [
          { key: "avatar", items: [] },
          { key: "spellbook", items: [] },
          { key: "atlas", items: [] },
        ];

  // Only group by type if not in "none" mode
  if (sortMode !== "none") {
    for (const it of sortedFiltered) {
      const pickInfo = pickInfoById[it.cardId];
      const t = (pickInfo?.type || "").toLowerCase();
      if (t.includes("avatar")) groups[0].items.push(it);
      else if (t.includes("site")) groups[2].items.push(it);
      else groups[1].items.push(it);
    }
  }

  const renderItem = (it: { cardId: number; count: number; name: string }) => {
    const meta = metaByCardId[it.cardId];
    const raw = (meta?.thresholds as Record<string, number> | undefined) || {};
    const thresholds: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw)) {
      const key = k.toLowerCase();
      if (v && ["air", "water", "earth", "fire"].includes(key))
        thresholds[key] = v;
    }
    const pickInfo = pickInfoById[it.cardId];
    const slug = pickInfo?.slug || undefined;
    const typeText = (pickInfo?.type || "").toLowerCase();
    const isSite = typeText.includes("site");

    const cardInDeck = pick3D.filter(
      (p) => p.card.cardId === it.cardId && p.zone === "Deck"
    ).length;
    // Cards in Sideboard zone (for draft picks pool)
    const cardInSideboard = pick3D.filter(
      (p) => p.card.cardId === it.cardId && p.zone === "Sideboard"
    ).length;
    // Cards in Collection zone (for constructed 10-card collection)
    const cardInCollection =
      pick3D.filter(
        (p) => p.card.cardId === it.cardId && p.zone === "Collection"
      ).length + (collectionCountsByCardId[it.cardId] ?? 0);

    const handleClick = (e: React.MouseEvent) => {
      e.preventDefault();
      const total = cardInDeck + cardInSideboard;
      if (total === 1 || cardInDeck === 0 || cardInSideboard === 0) {
        // Single zone - toggle between deck and sideboard
        if (cardInDeck > 0) {
          moveOneToSideboard(it.cardId);
          const remaining = cardInDeck - 1;
          const msg =
            remaining > 0
              ? `Moved "${it.name}" to Sideboard (${remaining} left in deck)`
              : `Moved "${it.name}" to Sideboard (no copies remain in deck)`;
          setFeedback(msg);
        } else if (cardInSideboard > 0) {
          moveOneFromSideboardToDeck(it.cardId);
          const remaining = cardInSideboard - 1;
          const msg =
            remaining > 0
              ? `Moved "${it.name}" to Deck (${remaining} left in sideboard)`
              : `Moved "${it.name}" to Deck (no copies remain in sideboard)`;
          setFeedback(msg);
        }
      } else {
        // Multiple cards in both zones - prefer moving from deck to sideboard
        if (cardInDeck > 0) {
          moveOneToSideboard(it.cardId);
          const remaining = cardInDeck - 1;
          const msg =
            remaining > 0
              ? `Moved "${it.name}" to Sideboard (${remaining} left in deck)`
              : `Moved "${it.name}" to Sideboard (no copies remain in deck)`;
          setFeedback(msg);
        }
      }
    };

    const handleContextMenu = (e: React.MouseEvent) => {
      e.preventDefault();
      openContextMenu(it.cardId, it.name, e.clientX, e.clientY);
    };

    return (
      <div
        key={it.cardId}
        className="rounded p-2 bg-black/70 ring-1 ring-white/25 text-white cursor-pointer hover:bg-black/50"
        onMouseEnter={() => {
          if (slug) onHoverPreview(slug, it.name, pickInfo?.type || null);
        }}
        onMouseLeave={() => onHoverClear()}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        title={`Left-click to move between Deck/Sideboard. Right-click for more options.`}
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
                className={`${
                  isSite ? "object-contain rotate-90" : "object-cover"
                }`}
                sizes="(max-width:640px) 20vw, (max-width:1024px) 15vw, 10vw"
                unoptimized
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
                  {cardInCollection > 0 && (
                    <span className="bg-purple-600/20 text-purple-300 px-1 py-0.5 rounded text-[10px]">
                      Collection: {cardInCollection}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right font-semibold">x{it.count}</div>
            </div>
            <div className="mt-1 flex items-center flex-wrap gap-2 opacity-90">
              <div className="flex items-center gap-2">
                {order.map((k) =>
                  thresholds[k] ? (
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
                      {thresholds[k]}
                    </span>
                  ) : null
                )}
              </div>
              {meta?.cost != null && !isSite && (
                <div className="ml-auto flex items-center gap-1">
                  {meta.cost >= 0 && meta.cost <= 9 ? (
                    <NumberBadge
                      value={meta.cost as Digit}
                      size={16}
                      strokeWidth={8}
                    />
                  ) : (
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-white text-black text-[10px] font-bold">
                      {meta.cost}
                    </span>
                  )}
                </div>
              )}
            </div>
            {showCollectionZone &&
              (cardInSideboard > 0 || cardInCollection > 0) && (
                <div className="mt-1 flex flex-wrap gap-1 text-[10px] opacity-90">
                  {cardInSideboard > 0 && (
                    <button
                      type="button"
                      className="px-1.5 py-0.5 rounded bg-purple-700/30 text-purple-200 hover:bg-purple-700/50 border border-purple-500/40"
                      onClick={(e) => {
                        e.stopPropagation();
                        moveOneFromSideboardToCollection(it.cardId);
                        setFeedback(
                          `Moved "${it.name}" from Sideboard to Collection`
                        );
                      }}
                    >
                      +1 to Collection
                    </button>
                  )}
                  {cardInCollection > 0 && (
                    <button
                      type="button"
                      className="px-1.5 py-0.5 rounded bg-purple-700/30 text-purple-200 hover:bg-purple-700/50 border border-purple-500/40"
                      onClick={(e) => {
                        e.stopPropagation();
                        moveOneFromCollectionToSideboard(it.cardId);
                        setFeedback(
                          `Moved "${it.name}" from Collection to Sideboard`
                        );
                      }}
                    >
                      -1 from Collection
                    </button>
                  )}
                </div>
              )}
          </div>
        </div>
      </div>
    );
  };

  const gridColsClass =
    columns === 2
      ? "grid-cols-2"
      : columns === 3
      ? "grid-cols-3"
      : columns === 4
      ? "grid-cols-4"
      : "grid-cols-5";

  return (
    <div className="max-h-[calc(100vh-16rem)] overflow-auto pr-2 text-xs pointer-events-auto space-y-3">
      {/* Controls */}
      <div className="sticky top-0 z-10 bg-black/90 backdrop-blur-sm p-2 rounded space-y-2 border border-white/10">
        {/* Column selector */}
        <div className="flex items-center gap-2">
          <span className="text-white/60 text-[10px] uppercase tracking-wide">
            Columns:
          </span>
          <div className="flex gap-1">
            {([2, 3, 4, 5] as const).map((col) => (
              <button
                key={col}
                onClick={() => handleColumnsChange(col)}
                className={`px-2 py-0.5 rounded text-[10px] ${
                  columns === col
                    ? "bg-blue-600 text-white"
                    : "bg-white/10 text-white/70 hover:bg-white/20"
                }`}
              >
                {col}
              </button>
            ))}
          </div>
        </div>

        {/* Sort selector */}
        <div className="flex items-center gap-2">
          <span className="text-white/60 text-[10px] uppercase tracking-wide">
            Sort:
          </span>
          <div className="flex gap-1 flex-wrap">
            {[
              { value: "none", label: "None" },
              { value: "name", label: "Name" },
              { value: "cost", label: "Cost" },
              { value: "type", label: "Type" },
              { value: "element", label: "Element" },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => setSortMode(option.value as SortMode)}
                className={`px-2 py-0.5 rounded text-[10px] ${
                  sortMode === option.value
                    ? "bg-green-600 text-white"
                    : "bg-white/10 text-white/70 hover:bg-white/20"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Card groups */}
      {groups.map((g) =>
        g.items.length > 0 ? (
          <div key={g.key}>
            {/* Only show group label when not in "none" mode */}
            {g.key !== "all" && (
              <div className="mb-1 text-white/70 text-[11px] uppercase tracking-wide">
                {g.key === "avatar"
                  ? "Avatar"
                  : g.key === "spellbook"
                  ? "Spellbook"
                  : "Atlas"}
              </div>
            )}
            <div className={`grid ${gridColsClass} gap-2`}>
              {g.items.map((it) => renderItem(it))}
            </div>
          </div>
        ) : null
      )}
    </div>
  );
}
