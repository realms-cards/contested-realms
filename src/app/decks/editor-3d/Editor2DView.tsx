"use client";

import Image from "next/image";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorMarqueeActionBar } from "@/app/decks/editor-3d/EditorMarqueeActionBar";
import type { Pick3D, CardMeta } from "@/lib/game/cardSorting";

type Zone = "Deck" | "Sideboard" | "Collection";

type Editor2DViewProps = {
  pick3D: Pick3D[];
  metaByCardId: Record<number, CardMeta>;
  pickInfoById: Record<
    number,
    { slug: string | null; type: string | null; name: string }
  >;
  onHoverPreview: (slug: string, name: string, type: string | null) => void;
  onHoverClear: () => void;
  onMoveCard: (pickId: number, toZone: Zone) => void;
  onMoveCards: (pickIds: number[], toZone: Zone) => void;
  onRemoveCards: (pickIds: number[]) => void;
  openContextMenu: (
    cardId: number,
    cardName: string,
    clientX: number,
    clientY: number,
  ) => void;
  showCollection?: boolean;
  /** When true, identical cards are grouped into stacks with count badges */
  isSortingEnabled?: boolean;
};

type DragPayload = {
  pickId: number;
  cardId: number;
  fromZone: Zone;
};

type MarqueeRect = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
} | null;

const ZONE_STYLES: Record<Zone, { ring: string; bg: string; label: string; ringActive: string; bgActive: string }> = {
  Deck: {
    ring: "ring-green-500/40",
    bg: "bg-green-950/30",
    label: "text-green-300",
    ringActive: "ring-green-400",
    bgActive: "bg-green-900/40",
  },
  Sideboard: {
    ring: "ring-blue-500/40",
    bg: "bg-blue-950/30",
    label: "text-blue-300",
    ringActive: "ring-blue-400",
    bgActive: "bg-blue-900/40",
  },
  Collection: {
    ring: "ring-purple-500/40",
    bg: "bg-purple-950/30",
    label: "text-purple-300",
    ringActive: "ring-purple-400",
    bgActive: "bg-purple-900/40",
  },
};

// Scale presets (card min-width in px)
const SCALE_PRESETS = [40, 52, 64, 80, 100] as const;
const SCALE_LABELS = ["XS", "S", "M", "L", "XL"] as const;
const DEFAULT_SCALE_IDX = 2; // M

// ─── Card Tile ───────────────────────────────────────────────────────

function CardTile({
  pick,
  slug,
  isSite,
  isSelected,
  cardSize,
  onHoverPreview,
  onHoverClear,
  onMouseDown,
  openContextMenu,
  onDragOverCard,
  dropIndicator,
  stackCount,
}: {
  pick: Pick3D;
  slug: string | null;
  isSite: boolean;
  isSelected: boolean;
  cardSize: number;
  onHoverPreview: (slug: string, name: string, type: string | null) => void;
  onHoverClear: () => void;
  onMouseDown: (e: React.MouseEvent, pickId: number) => void;
  openContextMenu: (
    cardId: number,
    cardName: string,
    clientX: number,
    clientY: number,
  ) => void;
  /** Called when a card is dragged over this tile (for reorder) */
  onDragOverCard?: (e: React.DragEvent, targetPickId: number) => void;
  /** Show a left-side drop indicator for reorder */
  dropIndicator?: boolean;
  /** Stack count badge (when auto-sorted) */
  stackCount?: number;
}) {
  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      const payload: DragPayload = {
        pickId: pick.id,
        cardId: pick.card.cardId,
        fromZone: pick.zone,
      };
      e.dataTransfer.setData("application/json", JSON.stringify(payload));
      e.dataTransfer.effectAllowed = "move";
    },
    [pick.id, pick.card.cardId, pick.zone],
  );

  // Sites: render as landscape with proper aspect ratio
  const w = isSite ? Math.round(cardSize * 1.33) : cardSize;
  const h = isSite ? cardSize : Math.round(cardSize * 1.33);

  return (
    <div
      data-pick-id={pick.id}
      draggable
      onDragStart={handleDragStart}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDragOverCard?.(e, pick.id);
      }}
      onMouseEnter={() => {
        if (slug) onHoverPreview(slug, pick.card.cardName, pick.card.type);
      }}
      onMouseLeave={onHoverClear}
      onMouseDown={(e) => onMouseDown(e, pick.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        openContextMenu(pick.card.cardId, pick.card.cardName, e.clientX, e.clientY);
      }}
      style={{ width: w, height: h }}
      className={`relative rounded overflow-hidden cursor-pointer flex-shrink-0 transition-shadow ${
        isSelected
          ? "ring-2 ring-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.5)]"
          : "ring-1 ring-white/20 hover:ring-white/40"
      } ${dropIndicator ? "ml-3" : ""}`}
      title={pick.card.cardName}
    >
      {dropIndicator && (
        <div className="absolute -left-2 top-0 bottom-0 w-0.5 bg-cyan-400 rounded-full" />
      )}
      {slug ? (
        <Image
          src={`/api/images/${slug}`}
          alt={pick.card.cardName}
          fill
          className={
            isSite
              ? "object-cover rotate-90 scale-[1.33]"
              : "object-cover"
          }
          sizes={`${w}px`}
          unoptimized
        />
      ) : (
        <div className="absolute inset-0 bg-slate-800 flex items-center justify-center text-[9px] text-white/60 p-1 text-center leading-tight">
          {pick.card.cardName}
        </div>
      )}
      {stackCount !== undefined && stackCount > 1 && (
        <div className="absolute top-0.5 right-0.5 bg-black/80 text-white text-[10px] font-bold rounded px-1 leading-tight">
          x{stackCount}
        </div>
      )}
    </div>
  );
}

// ─── Free Position Canvas (unsorted mode) ────────────────────────────

function FreePositionCanvas({
  displayCards,
  pickInfoById,
  selectedIds,
  cardSize,
  onHoverPreview,
  onHoverClear,
  onCardMouseDown,
  openContextMenu,
  freePositions,
  onFreePositionChange,
}: {
  displayCards: { pick: Pick3D; stackCount: number; allIds: number[] }[];
  pickInfoById: Record<number, { slug: string | null; type: string | null; name: string }>;
  selectedIds: Set<number>;
  cardSize: number;
  onHoverPreview: (slug: string, name: string, type: string | null) => void;
  onHoverClear: () => void;
  onCardMouseDown: (e: React.MouseEvent, pickId: number) => void;
  openContextMenu: (cardId: number, cardName: string, clientX: number, clientY: number) => void;
  freePositions: Map<number, { x: number; y: number }>;
  onFreePositionChange?: (pickId: number, x: number, y: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    pickId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const [dragPickId, setDragPickId] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const ds = dragState.current;
      if (!ds) return;
      setDragOffset({
        x: e.clientX - ds.startX,
        y: e.clientY - ds.startY,
      });
    };
    const handleMouseUp = (e: MouseEvent) => {
      const ds = dragState.current;
      if (!ds) return;
      const finalX = ds.origX + (e.clientX - ds.startX);
      const finalY = ds.origY + (e.clientY - ds.startY);
      onFreePositionChange?.(ds.pickId, Math.max(0, finalX), Math.max(0, finalY));
      dragState.current = null;
      setDragPickId(null);
      setDragOffset({ x: 0, y: 0 });
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [onFreePositionChange]);

  const handleCardMouseDownFree = useCallback(
    (e: React.MouseEvent, pickId: number) => {
      // Only start free drag on left click without shift (shift = selection)
      if (e.button !== 0 || e.shiftKey) {
        onCardMouseDown(e, pickId);
        return;
      }
      e.stopPropagation();
      const pos = freePositions.get(pickId) ?? { x: 0, y: 0 };
      dragState.current = {
        pickId,
        startX: e.clientX,
        startY: e.clientY,
        origX: pos.x,
        origY: pos.y,
      };
      setDragPickId(pickId);
      setDragOffset({ x: 0, y: 0 });
      // Also handle selection
      onCardMouseDown(e, pickId);
    },
    [freePositions, onCardMouseDown],
  );

  // Calculate min container size to fit all cards
  const maxExtent = useMemo(() => {
    let maxX = 300;
    let maxY = 200;
    for (const { pick } of displayCards) {
      const pos = freePositions.get(pick.id);
      if (pos) {
        maxX = Math.max(maxX, pos.x + cardSize + 20);
        maxY = Math.max(maxY, pos.y + Math.round(cardSize * 1.33) + 20);
      }
    }
    return { width: maxX, height: maxY };
  }, [displayCards, freePositions, cardSize]);

  return (
    <div
      ref={containerRef}
      className="relative"
      style={{ minHeight: maxExtent.height, minWidth: maxExtent.width }}
    >
      {displayCards.map(({ pick, stackCount, allIds }) => {
        const info = pickInfoById[pick.card.cardId];
        const slug = info?.slug ?? null;
        const isSite = (info?.type ?? "").toLowerCase().includes("site");
        const isCardSelected = allIds.some((id) => selectedIds.has(id));
        const pos = freePositions.get(pick.id) ?? { x: 0, y: 0 };
        const isDragging = dragPickId === pick.id;
        const x = isDragging ? pos.x + dragOffset.x : pos.x;
        const y = isDragging ? pos.y + dragOffset.y : pos.y;
        const w = isSite ? Math.round(cardSize * 1.33) : cardSize;
        const h = isSite ? cardSize : Math.round(cardSize * 1.33);

        return (
          <div
            key={pick.id}
            data-pick-id={pick.id}
            className={`absolute cursor-grab rounded overflow-hidden transition-shadow ${
              isDragging ? "z-50 shadow-xl cursor-grabbing" : "z-10"
            } ${
              isCardSelected
                ? "ring-2 ring-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.5)]"
                : "ring-1 ring-white/20 hover:ring-white/40"
            }`}
            style={{
              left: x,
              top: y,
              width: w,
              height: h,
            }}
            onMouseEnter={() => {
              if (slug) onHoverPreview(slug, pick.card.cardName, pick.card.type);
            }}
            onMouseLeave={onHoverClear}
            onMouseDown={(e) => handleCardMouseDownFree(e, pick.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              openContextMenu(pick.card.cardId, pick.card.cardName, e.clientX, e.clientY);
            }}
          >
            {slug ? (
              <Image
                src={`/api/images/${slug}`}
                alt={pick.card.cardName}
                fill
                className={isSite ? "object-cover rotate-90 scale-[1.33]" : "object-cover"}
                sizes={`${w}px`}
                unoptimized
              />
            ) : (
              <div className="absolute inset-0 bg-slate-800 flex items-center justify-center text-[9px] text-white/60 p-1 text-center leading-tight">
                {pick.card.cardName}
              </div>
            )}
            {stackCount > 1 && (
              <div className="absolute top-0.5 right-0.5 bg-black/80 text-white text-[10px] font-bold rounded px-1 leading-tight">
                x{stackCount}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Zone Container ──────────────────────────────────────────────────

function ZoneContainer({
  zone,
  cards,
  pickInfoById,
  selectedIds,
  cardSize,
  onHoverPreview,
  onHoverClear,
  onMoveCard,
  onCardMouseDown,
  openContextMenu,
  collapsed,
  onToggleCollapse,
  className: extraClass,
  manualOrder,
  onReorder,
  isSorted,
  freePositions,
  onFreePositionChange,
}: {
  zone: Zone;
  cards: Pick3D[];
  pickInfoById: Record<
    number,
    { slug: string | null; type: string | null; name: string }
  >;
  selectedIds: Set<number>;
  cardSize: number;
  onHoverPreview: (slug: string, name: string, type: string | null) => void;
  onHoverClear: () => void;
  onMoveCard: (pickId: number, toZone: Zone) => void;
  onCardMouseDown: (e: React.MouseEvent, pickId: number) => void;
  openContextMenu: (
    cardId: number,
    cardName: string,
    clientX: number,
    clientY: number,
  ) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  className?: string;
  /** Manual ordering of pick IDs (if set, overrides alphabetical sort) */
  manualOrder?: number[];
  /** Reorder callback: move `dragPickId` before `targetPickId` in this zone */
  onReorder?: (zone: Zone, dragPickId: number, targetPickId: number) => void;
  /** When true, group identical cards into stacks with count badges */
  isSorted?: boolean;
  /** Free positions for unsorted mode */
  freePositions?: Map<number, { x: number; y: number }>;
  /** Callback when a card is freely repositioned */
  onFreePositionChange?: (pickId: number, x: number, y: number) => void;
}) {
  const [isOver, setIsOver] = useState(false);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const dragCounter = useRef(0);
  const colors = ZONE_STYLES[zone];

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    setIsOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsOver(false);
      setDropTarget(null);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dragCounter.current = 0;
      setIsOver(false);
      const curDropTarget = dropTarget;
      setDropTarget(null);
      try {
        const raw = e.dataTransfer.getData("application/json");
        const payload = JSON.parse(raw) as DragPayload;
        if (payload.fromZone !== zone) {
          onMoveCard(payload.pickId, zone);
        } else if (curDropTarget !== null && onReorder && payload.pickId !== curDropTarget) {
          // Same zone reorder
          onReorder(zone, payload.pickId, curDropTarget);
        }
      } catch {
        // Ignore invalid drag data
      }
    },
    [zone, onMoveCard, onReorder, dropTarget],
  );

  const handleDragOverCard = useCallback((_e: React.DragEvent, targetPickId: number) => {
    setDropTarget(targetPickId);
  }, []);

  // Order cards: use manual order if available, otherwise alphabetical
  const ordered = manualOrder && !isSorted
    ? (() => {
        const byId = new Map(cards.map((c) => [c.id, c]));
        const result: Pick3D[] = [];
        for (const id of manualOrder) {
          const c = byId.get(id);
          if (c) result.push(c);
        }
        // Append any cards not in manual order (newly added)
        for (const c of cards) {
          if (!manualOrder.includes(c.id)) result.push(c);
        }
        return result;
      })()
    : [...cards].sort((a, b) => a.card.cardName.localeCompare(b.card.cardName));

  // When sorted, group identical cards (by cardId) into stacks
  const displayCards: { pick: Pick3D; stackCount: number; allIds: number[] }[] = (() => {
    if (!isSorted) {
      return ordered.map((p) => ({ pick: p, stackCount: 1, allIds: [p.id] }));
    }
    const groups = new Map<number, Pick3D[]>();
    const groupOrder: number[] = [];
    for (const p of ordered) {
      const existing = groups.get(p.card.cardId);
      if (existing) {
        existing.push(p);
      } else {
        groups.set(p.card.cardId, [p]);
        groupOrder.push(p.card.cardId);
      }
    }
    return groupOrder.map((cardId) => {
      const group = groups.get(cardId) ?? [];
      return {
        pick: group[0],
        stackCount: group.length,
        allIds: group.map((g) => g.id),
      };
    });
  })();

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={`rounded-lg ring-1 transition-all ${
        isOver ? `${colors.ringActive} ${colors.bgActive}` : `${colors.ring} ${colors.bg}`
      } ${extraClass ?? ""}`}
    >
      <div
        className="flex items-center justify-between px-2 py-1 cursor-pointer select-none"
        onClick={onToggleCollapse}
      >
        <h3 className={`text-[11px] font-semibold ${colors.label} flex items-center gap-1`}>
          {onToggleCollapse && (
            <span className="text-[9px] opacity-60">{collapsed ? "▶" : "▼"}</span>
          )}
          {zone}
          <span className="text-white/40 font-normal">({cards.length})</span>
        </h3>
      </div>
      {!collapsed && (
        <div className="px-1.5 pb-1.5">
          {cards.length > 0 ? (
            !isSorted && freePositions ? (
              // Free-position mode: cards are absolutely positioned
              <FreePositionCanvas
                displayCards={displayCards}
                pickInfoById={pickInfoById}
                selectedIds={selectedIds}
                cardSize={cardSize}
                onHoverPreview={onHoverPreview}
                onHoverClear={onHoverClear}
                onCardMouseDown={onCardMouseDown}
                openContextMenu={openContextMenu}
                freePositions={freePositions}
                onFreePositionChange={onFreePositionChange}
              />
            ) : (
              <div className="flex flex-wrap gap-1 content-start">
                {displayCards.map(({ pick, stackCount, allIds }) => {
                  const info = pickInfoById[pick.card.cardId];
                  const slug = info?.slug ?? null;
                  const isSiteTile = (info?.type ?? "").toLowerCase().includes("site");
                  const isCardSelected = allIds.some((id) => selectedIds.has(id));
                  return (
                    <CardTile
                      key={pick.id}
                      pick={pick}
                      slug={slug}
                      isSite={isSiteTile}
                      isSelected={isCardSelected}
                      cardSize={cardSize}
                      onHoverPreview={onHoverPreview}
                      onHoverClear={onHoverClear}
                      onMouseDown={onCardMouseDown}
                      openContextMenu={openContextMenu}
                      onDragOverCard={handleDragOverCard}
                      dropIndicator={dropTarget === pick.id}
                      stackCount={stackCount}
                    />
                  );
                })}
              </div>
            )
          ) : (
            <div className="flex items-center justify-center h-12 text-white/25 text-[10px]">
              Drop cards here
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Marquee Overlay ─────────────────────────────────────────────────

function MarqueeOverlay2D({ rect }: { rect: MarqueeRect }) {
  if (!rect) return null;
  const left = Math.min(rect.x1, rect.x2);
  const top = Math.min(rect.y1, rect.y2);
  const width = Math.abs(rect.x2 - rect.x1);
  const height = Math.abs(rect.y2 - rect.y1);
  return (
    <div
      className="fixed pointer-events-none z-[9990] border border-cyan-400/60 bg-cyan-400/10"
      style={{ left, top, width, height }}
    />
  );
}

// ─── Main Component ──────────────────────────────────────────────────

export default function Editor2DView({
  pick3D,
  pickInfoById,
  onHoverPreview,
  onHoverClear,
  onMoveCard,
  onMoveCards,
  onRemoveCards,
  openContextMenu,
  showCollection = true,
  isSortingEnabled = false,
}: Editor2DViewProps) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect>(null);
  const [sideboardCollapsed, setSideboardCollapsed] = useState(false);
  const [collectionCollapsed, setCollectionCollapsed] = useState(true);
  const [scaleIdx, setScaleIdx] = useState(DEFAULT_SCALE_IDX);
  const cardSize = SCALE_PRESETS[scaleIdx];
  // Manual card ordering per zone (pick IDs in display order)
  const [manualOrder, setManualOrder] = useState<Record<Zone, number[]>>({
    Deck: [],
    Sideboard: [],
    Collection: [],
  });

  // Free-position tracking for unsorted mode (Deck zone only)
  const [freePositions, setFreePositions] = useState<Map<number, { x: number; y: number }>>(() => new Map());

  const marqueeStart = useRef<{ x: number; y: number } | null>(null);
  const marqueeActive = useRef(false);

  const deckCards = pick3D.filter((p) => p.zone === "Deck");
  const sideboardCards = pick3D.filter((p) => p.zone === "Sideboard");
  const collectionCards = pick3D.filter((p) => p.zone === "Collection");

  // Initialize manual order and free positions when cards change
  useEffect(() => {
    setManualOrder((prev) => {
      const next = { ...prev };
      for (const zone of ["Deck", "Sideboard", "Collection"] as Zone[]) {
        const zoneCards = pick3D.filter((p) => p.zone === zone);
        const zoneIds = new Set(zoneCards.map((c) => c.id));
        const existing = (prev[zone] || []).filter((id) => zoneIds.has(id));
        const existingSet = new Set(existing);
        const newIds = zoneCards.filter((c) => !existingSet.has(c.id)).map((c) => c.id);
        next[zone] = [...existing, ...newIds];
      }
      return next;
    });
    // Assign default grid positions for new deck cards in free-position mode
    setFreePositions((prev) => {
      const next = new Map(prev);
      // Remove cards no longer in deck
      const deckIds = new Set(pick3D.filter((p) => p.zone === "Deck").map((p) => p.id));
      for (const id of next.keys()) {
        if (!deckIds.has(id)) next.delete(id);
      }
      // Assign positions for new cards
      let idx = 0;
      for (const p of pick3D) {
        if (p.zone !== "Deck") continue;
        if (!next.has(p.id)) {
          // Grid layout: columns of cardSize+gap
          const cols = Math.max(1, Math.floor(600 / (cardSize + 6)));
          const col = idx % cols;
          const row = Math.floor(idx / cols);
          next.set(p.id, {
            x: col * (cardSize + 6),
            y: row * (Math.round(cardSize * 1.33) + 6),
          });
        }
        idx++;
      }
      return next;
    });
  }, [pick3D, cardSize]);

  // Reorder: move dragPickId before targetPickId in the specified zone
  const handleReorder = useCallback(
    (zone: Zone, dragPickId: number, targetPickId: number) => {
      setManualOrder((prev) => {
        const order = [...(prev[zone] || [])];
        const dragIdx = order.indexOf(dragPickId);
        if (dragIdx === -1) return prev;
        // Remove dragged item
        order.splice(dragIdx, 1);
        // Insert before target
        const targetIdx = order.indexOf(targetPickId);
        if (targetIdx === -1) {
          order.push(dragPickId);
        } else {
          order.splice(targetIdx, 0, dragPickId);
        }
        return { ...prev, [zone]: order };
      });
    },
    [],
  );

  const handleFreePositionChange = useCallback(
    (pickId: number, x: number, y: number) => {
      setFreePositions((prev) => {
        const next = new Map(prev);
        next.set(pickId, { x, y });
        return next;
      });
    },
    [],
  );

  // Card click: toggle selection (Shift = additive, otherwise replace)
  const handleCardMouseDown = useCallback(
    (e: React.MouseEvent, pickId: number) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      marqueeStart.current = null;
      if (e.shiftKey) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(pickId)) next.delete(pickId);
          else next.add(pickId);
          return next;
        });
      } else {
        setSelectedIds(new Set([pickId]));
      }
    },
    [],
  );

  // Background: start marquee
  const handleBackgroundMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-pick-id]")) return;
    marqueeStart.current = { x: e.clientX, y: e.clientY };
    marqueeActive.current = false;
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const start = marqueeStart.current;
      if (!start) return;
      if (!marqueeActive.current && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 6) return;
      marqueeActive.current = true;
      setMarqueeRect({ x1: start.x, y1: start.y, x2: e.clientX, y2: e.clientY });
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!marqueeStart.current) return;
      if (marqueeActive.current) {
        const rect = {
          x1: Math.min(marqueeStart.current.x, e.clientX),
          y1: Math.min(marqueeStart.current.y, e.clientY),
          x2: Math.max(marqueeStart.current.x, e.clientX),
          y2: Math.max(marqueeStart.current.y, e.clientY),
        };
        const hitIds: number[] = [];
        const cardEls = document.querySelectorAll<HTMLElement>("[data-pick-id]");
        for (const el of cardEls) {
          const r = el.getBoundingClientRect();
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          if (cx >= rect.x1 && cx <= rect.x2 && cy >= rect.y1 && cy <= rect.y2) {
            const id = Number(el.dataset.pickId);
            if (!isNaN(id)) hitIds.push(id);
          }
        }
        if (e.shiftKey) {
          setSelectedIds((prev) => {
            const next = new Set(prev);
            for (const id of hitIds) {
              if (next.has(id)) next.delete(id);
              else next.add(id);
            }
            return next;
          });
        } else {
          setSelectedIds(hitIds.length > 0 ? new Set(hitIds) : new Set());
        }
      } else {
        setSelectedIds(new Set());
      }
      marqueeStart.current = null;
      marqueeActive.current = false;
      setMarqueeRect(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedIds.size > 0) setSelectedIds(new Set());
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedIds.size]);

  const handleMoveSelected = useCallback(
    (toZone: Zone) => {
      onMoveCards([...selectedIds], toZone);
      setSelectedIds(new Set());
    },
    [selectedIds, onMoveCards],
  );

  const handleRemoveSelected = useCallback(() => {
    onRemoveCards([...selectedIds]);
    setSelectedIds(new Set());
  }, [selectedIds, onRemoveCards]);

  const sharedZoneProps = {
    pickInfoById,
    selectedIds,
    cardSize,
    onHoverPreview,
    onHoverClear,
    onMoveCard,
    onCardMouseDown: handleCardMouseDown,
    openContextMenu,
    onReorder: handleReorder,
    isSorted: isSortingEnabled,
  };

  return (
    <>
      <div
        className="absolute inset-0 pt-12 pb-16 flex"
        onMouseDown={handleBackgroundMouseDown}
      >
        {/* Main deck area */}
        <div className="flex-1 overflow-auto p-2 min-w-0">
          <ZoneContainer
            zone="Deck"
            cards={deckCards}
            className="min-h-full"
            manualOrder={manualOrder.Deck}
            freePositions={freePositions}
            onFreePositionChange={handleFreePositionChange}
            {...sharedZoneProps}
          />
        </div>

        {/* Side panels — shrink when collapsed, grow when cards are present */}
        <div className={`overflow-auto p-1.5 space-y-1.5 border-l border-white/10 transition-all ${
          sideboardCollapsed && collectionCollapsed ? "w-32 flex-none" : "w-56 flex-none"
        }`}>
          <ZoneContainer
            zone="Sideboard"
            cards={sideboardCards}
            collapsed={sideboardCollapsed}
            onToggleCollapse={() => setSideboardCollapsed((v) => !v)}
            manualOrder={manualOrder.Sideboard}
            {...sharedZoneProps}
          />
          {showCollection && (
            <ZoneContainer
              zone="Collection"
              cards={collectionCards}
              collapsed={collectionCollapsed}
              onToggleCollapse={() => setCollectionCollapsed((v) => !v)}
              manualOrder={manualOrder.Collection}
              {...sharedZoneProps}
            />
          )}
        </div>
      </div>

      {/* Scale control — bottom-left */}
      <div className="fixed bottom-4 left-4 z-[9991] flex items-center gap-1 bg-black/70 rounded px-2 py-1 ring-1 ring-white/10">
        {SCALE_PRESETS.map((_, i) => (
          <button
            key={i}
            onClick={() => setScaleIdx(i)}
            className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${
              i === scaleIdx ? "bg-white/20 text-white" : "text-white/40 hover:text-white/70"
            }`}
          >
            {SCALE_LABELS[i]}
          </button>
        ))}
      </div>

      <MarqueeOverlay2D rect={marqueeRect} />

      <EditorMarqueeActionBar
        count={selectedIds.size}
        onMoveToDeck={() => handleMoveSelected("Deck")}
        onMoveToSideboard={() => handleMoveSelected("Sideboard")}
        onMoveToCollection={() => handleMoveSelected("Collection")}
        onRemove={handleRemoveSelected}
        onClear={() => setSelectedIds(new Set())}
      />
    </>
  );
}
