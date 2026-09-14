"use client";

import Image from "next/image";
import React, { useState } from "react";
import { NumberBadge } from "@/components/game/manacost";
import type { Digit } from "@/components/game/manacost";
import { RcButton } from "@/components/ui/rc-button";
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
  /** When true, sideboard tab includes both Sideboard and Collection zones (draft/sealed) */
  mergeCollectionIntoSideboard?: boolean;
};

type SortMode = "name" | "cost" | "type" | "element" | "none";
type ViewMode = "list" | "card";

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
    mergeCollectionIntoSideboard = false,
  } = props;

  const [columns, setColumns] = useState<2 | 3 | 4 | 5>(2);
  const [sortMode, setSortMode] = useState<SortMode>("none");
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  const handleColumnsChange = (newColumns: 2 | 3 | 4 | 5) => {
    setColumns(newColumns);
    onColumnsChange?.(newColumns);
  };

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    if (mode === "list") {
      // Keep panel narrow in list view
      setColumns(2);
      onColumnsChange?.(2);
    }
  };

  const order = ["air", "water", "earth", "fire"] as const;

  // Prepare groups: avatar, spellbook, atlas
  const filtered = yourCounts.filter((it) => {
    if (cardsTab === "all") return true;
    if (cardsTab === "deck") {
      return pick3D.some(
        (p) => p.card.cardId === it.cardId && p.zone === "Deck"
      );
    }
    if (cardsTab === "sideboard") {
      if (mergeCollectionIntoSideboard) {
        // Draft/sealed: include both Sideboard and Collection zones
        return pick3D.some(
          (p) =>
            p.card.cardId === it.cardId &&
            (p.zone === "Sideboard" || p.zone === "Collection")
        );
      }
      return pick3D.some(
        (p) => p.card.cardId === it.cardId && p.zone === "Sideboard"
      );
    }
    if (cardsTab === "collection") {
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
        let bestIndex: number = order.length;
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

  if (sortMode !== "none") {
    for (const it of sortedFiltered) {
      const pickInfo = pickInfoById[it.cardId];
      const t = (pickInfo?.type || "").toLowerCase();
      if (t.includes("avatar")) groups[0].items.push(it);
      else if (t.includes("site")) groups[2].items.push(it);
      else groups[1].items.push(it);
    }
  }

  // Shared data extraction for both view modes
  const getCardData = (it: { cardId: number; count: number; name: string }) => {
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
    const cardInSideboard = pick3D.filter(
      (p) => p.card.cardId === it.cardId && p.zone === "Sideboard"
    ).length;
    const cardInCollection = pick3D.filter(
      (p) => p.card.cardId === it.cardId && p.zone === "Collection"
    ).length;

    // Zone-specific count for the active tab
    const zoneCount =
      cardsTab === "deck"
        ? cardInDeck
        : cardsTab === "sideboard"
        ? mergeCollectionIntoSideboard
          ? cardInSideboard + cardInCollection
          : cardInSideboard
        : cardsTab === "collection"
        ? cardInCollection
        : it.count;

    return { meta, thresholds, pickInfo, slug, isSite, cardInDeck, cardInSideboard, cardInCollection, zoneCount };
  };

  const handleCardClick = (it: { cardId: number; name: string }) => {
    // Always move exactly 1 copy to the opposite zone based on which tab we're viewing
    if (cardsTab === "deck") {
      moveOneToSideboard(it.cardId);
      setFeedback(`Moved "${it.name}" to Sideboard`);
    } else if (cardsTab === "sideboard" || cardsTab === "collection") {
      moveOneFromSideboardToDeck(it.cardId);
      setFeedback(`Moved "${it.name}" to Deck`);
    }
  };

  // Compact list view: single-row per card
  const renderListItem = (it: { cardId: number; count: number; name: string }) => {
    const { meta, thresholds, pickInfo, slug, isSite, cardInDeck, cardInSideboard, cardInCollection, zoneCount } = getCardData(it);

    return (
      <div
        key={it.cardId}
        className="flex items-center gap-2 px-2 py-1 rounded-rc-sm bg-black/45 ring-1 ring-rc-line/15 text-rc-fg text-xs cursor-pointer transition-colors hover:bg-rc-accent/8 hover:ring-rc-accent/35"
        onMouseEnter={() => {
          if (slug) onHoverPreview(slug, it.name, pickInfo?.type || null);
        }}
        onMouseLeave={() => onHoverClear()}
        onClick={(e) => {
          e.preventDefault();
          handleCardClick(it);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          openContextMenu(it.cardId, it.name, e.clientX, e.clientY);
        }}
        title="Left-click to move between Deck/Sideboard. Right-click for more options."
      >
        {/* Count before name (only when > 1) */}
        {zoneCount > 1 && (
          <span className="font-rc-mono tabular-nums text-rc-fg-subtle flex-none">{zoneCount}</span>
        )}
        {/* Name */}
        <span className="flex-1 truncate font-rc-display text-[13px] leading-4 min-w-0">{it.name}</span>
        {/* Threshold pips (clusters per element, like match display) */}
        <div className="flex items-center gap-0.5 flex-none">
          {order.map((k) =>
            thresholds[k]
              ? Array.from({ length: thresholds[k] }, (_, i) => (
                  <Image
                    key={`${k}-${i}`}
                    src={`/api/assets/${k}.png`}
                    alt={k}
                    width={10}
                    height={10}
                    unoptimized
                  />
                ))
              : null
          )}
        </div>
        {/* Mana cost */}
        {meta?.cost != null && !isSite && (
          <div className="flex-none">
            {meta.cost >= 0 && meta.cost <= 9 ? (
              <NumberBadge
                value={meta.cost as Digit}
                size={14}
                strokeWidth={6}
              />
            ) : (
              <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-white text-black text-[9px] font-bold">
                {meta.cost}
              </span>
            )}
          </div>
        )}
        {/* Zone dots */}
        <div className="flex items-center gap-0.5 flex-none">
          {cardInDeck > 0 && (
            <div
              className="w-2 h-2 rounded-full bg-green-500"
              title={`Deck: ${cardInDeck}`}
            />
          )}
          {cardInSideboard > 0 && (
            <div
              className="w-2 h-2 rounded-full bg-blue-500"
              title={`Sideboard: ${cardInSideboard}`}
            />
          )}
          {cardInCollection > 0 && (
            <div
              className="w-2 h-2 rounded-full bg-purple-500"
              title={`Collection: ${cardInCollection}`}
            />
          )}
        </div>
      </div>
    );
  };

  // Card grid view (original)
  const renderItem = (it: { cardId: number; count: number; name: string }) => {
    const { meta, thresholds, pickInfo, slug, isSite, cardInDeck, cardInSideboard, cardInCollection, zoneCount } = getCardData(it);

    return (
      <div
        key={it.cardId}
        className="rounded-rc-md p-2 bg-black/45 ring-1 ring-rc-line/18 text-rc-fg cursor-pointer transition-colors hover:bg-rc-accent/8 hover:ring-rc-accent/35"
        onMouseEnter={() => {
          if (slug) onHoverPreview(slug, it.name, pickInfo?.type || null);
        }}
        onMouseLeave={() => onHoverClear()}
        onClick={(e) => {
          e.preventDefault();
          handleCardClick(it);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          openContextMenu(it.cardId, it.name, e.clientX, e.clientY);
        }}
        title="Left-click to move between Deck/Sideboard. Right-click for more options."
      >
        <div className="flex items-start gap-2">
          {slug ? (
            <div
              className={`relative flex-none ${
                isSite ? "aspect-[4/3] w-14" : "aspect-[3/4] w-12"
              } rounded-rc-sm overflow-hidden ring-1 ring-rc-line/18 bg-black/40`}
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
                <div className="font-rc-display text-[14px] leading-4 text-rc-fg-strong truncate" title={it.name}>
                  {zoneCount > 1 && <span className="font-rc-mono tabular-nums text-rc-fg-subtle mr-1">{zoneCount}</span>}
                  {it.name}
                </div>
                <div className="text-xs opacity-90 flex items-center gap-2">
                  {cardInDeck > 0 && (
                    <span className="bg-green-600/20 text-green-300 px-1 py-0.5 rounded-rc-sm font-rc-mono text-[10px]">
                      Deck: {cardInDeck}
                    </span>
                  )}
                  {cardInSideboard > 0 && (
                    <span className="bg-blue-600/20 text-blue-300 px-1 py-0.5 rounded-rc-sm font-rc-mono text-[10px]">
                      Sideboard: {cardInSideboard}
                    </span>
                  )}
                  {cardInCollection > 0 && (
                    <span className="bg-purple-600/20 text-purple-300 px-1 py-0.5 rounded-rc-sm font-rc-mono text-[10px]">
                      Collection: {cardInCollection}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-1 flex items-center flex-wrap gap-2 opacity-90">
              <div className="flex items-center gap-1">
                {order.map((k) =>
                  thresholds[k]
                    ? Array.from({ length: thresholds[k] }, (_, i) => (
                        <Image
                          key={`${k}-${i}`}
                          src={`/api/assets/${k}.png`}
                          alt={k}
                          width={12}
                          height={12}
                          unoptimized
                        />
                      ))
                    : null
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
                    <RcButton
                      variant="quiet"
                      size="xs"
                      className="h-auto px-1.5 py-0.5 rounded-rc-sm text-[10px]"
                      onClick={(e) => {
                        e.stopPropagation();
                        moveOneFromSideboardToCollection(it.cardId);
                        setFeedback(
                          `Moved "${it.name}" from Sideboard to Collection`
                        );
                      }}
                    >
                      +1 to Collection
                    </RcButton>
                  )}
                  {cardInCollection > 0 && (
                    <RcButton
                      variant="quiet"
                      size="xs"
                      className="h-auto px-1.5 py-0.5 rounded-rc-sm text-[10px]"
                      onClick={(e) => {
                        e.stopPropagation();
                        moveOneFromCollectionToSideboard(it.cardId);
                        setFeedback(
                          `Moved "${it.name}" from Collection to Sideboard`
                        );
                      }}
                    >
                      -1 from Collection
                    </RcButton>
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
    <div className="thin-scrollbar max-h-[calc(100vh-16rem)] overflow-auto pr-2 text-xs pointer-events-auto space-y-3">
      {/* Controls */}
      <div className="sticky top-0 z-10 bg-[rgba(9,13,25,0.95)] backdrop-blur-sm p-2 rounded-rc-md space-y-2 border border-rc-line/12">
        {/* View mode + Column selector */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-rc-mono text-rc-fg-subtle text-[10px] uppercase tracking-[0.14em]">
              View:
            </span>
            <div className="flex gap-1">
              <RcButton
                variant="quiet"
                size="xs"
                onClick={() => handleViewModeChange("list")}
                aria-pressed={viewMode === "list"}
                className="h-auto px-2 py-0.5 rounded-rc-sm font-rc-mono text-[10px]"
              >
                List
              </RcButton>
              <RcButton
                variant="quiet"
                size="xs"
                onClick={() => handleViewModeChange("card")}
                aria-pressed={viewMode === "card"}
                className="h-auto px-2 py-0.5 rounded-rc-sm font-rc-mono text-[10px]"
              >
                Card
              </RcButton>
            </div>
          </div>

          {/* Column selector — only in card view */}
          {viewMode === "card" && (
            <div className="flex items-center gap-2">
              <span className="font-rc-mono text-rc-fg-subtle text-[10px] uppercase tracking-[0.14em]">
                Columns:
              </span>
              <div className="flex gap-1">
                {([2, 3, 4, 5] as const).map((col) => (
                  <RcButton
                    key={col}
                    variant="quiet"
                    size="xs"
                    onClick={() => handleColumnsChange(col)}
                    aria-pressed={columns === col}
                    className="h-auto px-2 py-0.5 rounded-rc-sm font-rc-mono text-[10px]"
                  >
                    {col}
                  </RcButton>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sort selector */}
        <div className="flex items-center gap-2">
          <span className="font-rc-mono text-rc-fg-subtle text-[10px] uppercase tracking-[0.14em]">
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
              <RcButton
                key={option.value}
                variant="quiet"
                size="xs"
                onClick={() => setSortMode(option.value as SortMode)}
                aria-pressed={sortMode === option.value}
                className="h-auto px-2 py-0.5 rounded-rc-sm font-rc-mono text-[10px]"
              >
                {option.label}
              </RcButton>
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
              <div className="rc-eyebrow mb-1">
                {g.key === "avatar"
                  ? "Avatar"
                  : g.key === "spellbook"
                  ? "Spellbook"
                  : "Atlas"}
              </div>
            )}
            {viewMode === "card" ? (
              <div className={`grid ${gridColsClass} gap-2`}>
                {g.items.map((it) => renderItem(it))}
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {g.items.map((it) => renderListItem(it))}
              </div>
            )}
          </div>
        ) : null
      )}
    </div>
  );
}
