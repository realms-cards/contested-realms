"use client";

import Image from "next/image";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  isSortingEnabled?: boolean;
};

// Card dimensions
const CARD_RATIO = 1.4;
const GAP = 6;
const SCALE_PRESETS = [40, 52, 64, 80, 100] as const;
const SCALE_LABELS = ["XS", "S", "M", "L", "XL"] as const;
const DEFAULT_SCALE_IDX = 2;

function cardDims(size: number, isSite: boolean) {
  return isSite
    ? { w: Math.round(size * CARD_RATIO), h: size }
    : { w: size, h: Math.round(size * CARD_RATIO) };
}

// ─── Shared Card Image ──────────────────────────────────────────────────

function CardImage({
  slug,
  name,
  isSite,
  w,
}: {
  slug: string | null;
  name: string;
  isSite: boolean;
  w: number;
}) {
  if (!slug) {
    return (
      <div className="absolute inset-0 bg-slate-800 flex items-center justify-center text-[8px] text-white/50 p-0.5 text-center leading-tight">
        {name}
      </div>
    );
  }
  return (
    <Image
      src={`/api/images/${slug}`}
      alt={name}
      fill
      draggable={false}
      className={
        isSite
          ? "object-contain rotate-90 scale-[1.333] origin-center"
          : "object-cover"
      }
      sizes={`${w}px`}
      unoptimized
    />
  );
}

// ─── Main Component ─────────────────────────────────────────────────────

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
  const [scaleIdx, setScaleIdx] = useState(DEFAULT_SCALE_IDX);
  const cardSize = SCALE_PRESETS[scaleIdx];
  const prevCardSize = useRef(cardSize);

  // Free positions for deck cards (unsorted mode)
  const [positions, setPositions] = useState<
    Map<number, { x: number; y: number }>
  >(() => new Map());
  const [zOrder, setZOrder] = useState<Map<number, number>>(() => new Map());
  const zCounter = useRef(1);

  const canvasRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const dragOverSidebar = useRef(false);
  const [sidebarHighlight, setSidebarHighlight] = useState(false);

  const deckCards = useMemo(
    () => pick3D.filter((p) => p.zone === "Deck"),
    [pick3D],
  );
  const sideboardCards = useMemo(
    () => pick3D.filter((p) => p.zone === "Sideboard"),
    [pick3D],
  );
  const collectionCards = useMemo(
    () => pick3D.filter((p) => p.zone === "Collection"),
    [pick3D],
  );

  // ─── Position management ────────────────────────────────────────────

  // Assign grid positions to new deck cards
  useEffect(() => {
    if (isSortingEnabled) return;
    setPositions((prev) => {
      const next = new Map(prev);
      const deckIds = new Set(deckCards.map((p) => p.id));

      // Remove cards no longer in deck
      for (const id of next.keys()) {
        if (!deckIds.has(id)) next.delete(id);
      }

      const needsPos = deckCards.filter((p) => !next.has(p.id));
      if (needsPos.length === 0) return next.size === prev.size ? prev : next;

      const cw = canvasRef.current?.clientWidth ?? 900;

      // Find where to append: after existing cards
      let x = 8,
        y = 8,
        rowH = 0;

      if (next.size > 0) {
        let maxBottom = 0;
        for (const pos of next.values())
          maxBottom = Math.max(maxBottom, pos.y);
        y = maxBottom;
        x = 8;
        for (const [id, pos] of next) {
          if (Math.abs(pos.y - maxBottom) < 5) {
            const p = deckCards.find((c) => c.id === id);
            if (p) {
              const isSite = (pickInfoById[p.card.cardId]?.type ?? "")
                .toLowerCase()
                .includes("site");
              const d = cardDims(cardSize, isSite);
              x = Math.max(x, pos.x + d.w + GAP);
              rowH = Math.max(rowH, d.h);
            }
          }
        }
      }

      for (const p of needsPos) {
        const isSite = (pickInfoById[p.card.cardId]?.type ?? "")
          .toLowerCase()
          .includes("site");
        const d = cardDims(cardSize, isSite);
        if (x + d.w > cw - 8 && x > 8) {
          x = 8;
          y += rowH + GAP;
          rowH = 0;
        }
        next.set(p.id, { x, y });
        x += d.w + GAP;
        rowH = Math.max(rowH, d.h);
      }

      return next;
    });
  }, [deckCards, cardSize, pickInfoById, isSortingEnabled]);

  // Proportional reflow when scale changes
  useEffect(() => {
    if (prevCardSize.current === cardSize) return;
    const ratio = cardSize / prevCardSize.current;
    prevCardSize.current = cardSize;
    setPositions((prev) => {
      const next = new Map<number, { x: number; y: number }>();
      for (const [id, pos] of prev) {
        next.set(id, {
          x: Math.round(pos.x * ratio),
          y: Math.round(pos.y * ratio),
        });
      }
      return next;
    });
  }, [cardSize]);

  // ─── Direct DOM drag (zero React re-renders during movement) ────────

  const dragState = useRef<{
    pickId: number;
    el: HTMLElement;
    startX: number;
    startY: number;
    origLeft: number;
    origTop: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const ds = dragState.current;
      if (!ds) return;
      const dx = e.clientX - ds.startX;
      const dy = e.clientY - ds.startY;
      if (!ds.moved && Math.hypot(dx, dy) < 4) return;
      ds.moved = true;

      // Direct DOM — no React re-render
      ds.el.style.left = `${ds.origLeft + dx}px`;
      ds.el.style.top = `${ds.origTop + dy}px`;

      // Sidebar hit test for cross-zone drag
      if (sidebarRef.current) {
        const r = sidebarRef.current.getBoundingClientRect();
        const over =
          e.clientX >= r.left &&
          e.clientX <= r.right &&
          e.clientY >= r.top &&
          e.clientY <= r.bottom;
        if (over !== dragOverSidebar.current) {
          dragOverSidebar.current = over;
          setSidebarHighlight(over);
        }
      }
    };

    const onUp = (e: MouseEvent) => {
      const ds = dragState.current;
      if (!ds) return;
      dragState.current = null;

      // Reset visual lift
      ds.el.style.zIndex = "";
      ds.el.style.boxShadow = "";
      ds.el.style.transform = "";
      ds.el.style.transition = "box-shadow 0.2s, transform 0.2s";
      setSidebarHighlight(false);

      if (!ds.moved) return; // Was a click, not drag

      // Dropped over sidebar → move to sideboard
      if (dragOverSidebar.current) {
        dragOverSidebar.current = false;
        onMoveCard(ds.pickId, "Sideboard");
        return;
      }

      // Commit new position
      const fx = Math.max(0, ds.origLeft + (e.clientX - ds.startX));
      const fy = Math.max(0, ds.origTop + (e.clientY - ds.startY));
      setPositions((prev) => new Map(prev).set(ds.pickId, { x: fx, y: fy }));
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [onMoveCard]);

  const startDrag = useCallback(
    (e: React.MouseEvent, pickId: number) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const el = e.currentTarget as HTMLElement;
      const pos = positions.get(pickId) ?? { x: 0, y: 0 };

      // Bring to front
      const z = ++zCounter.current;
      setZOrder((prev) => new Map(prev).set(pickId, z));
      el.style.zIndex = "100";

      // Visual lift — instant on, smooth off
      el.style.transition = "none";
      el.style.boxShadow = "0 12px 40px rgba(0,0,0,0.5)";
      el.style.transform = "scale(1.05)";

      dragState.current = {
        pickId,
        el,
        startX: e.clientX,
        startY: e.clientY,
        origLeft: pos.x,
        origTop: pos.y,
        moved: false,
      };
    },
    [positions],
  );

  // ─── Canvas measurements ────────────────────────────────────────────

  const canvasMinH = useMemo(() => {
    let max = 400;
    for (const p of deckCards) {
      const pos = positions.get(p.id);
      if (pos) {
        const isSite = (pickInfoById[p.card.cardId]?.type ?? "")
          .toLowerCase()
          .includes("site");
        max = Math.max(max, pos.y + cardDims(cardSize, isSite).h + 20);
      }
    }
    return max;
  }, [deckCards, positions, cardSize, pickInfoById]);

  // ─── Sorted mode grouping ──────────────────────────────────────────

  const sortedDeckGroups = useMemo(() => {
    if (!isSortingEnabled) return null;
    const groups = new Map<number, { pick: Pick3D; count: number }>();
    const order: number[] = [];
    for (const p of deckCards) {
      const existing = groups.get(p.card.cardId);
      if (existing) {
        existing.count++;
      } else {
        groups.set(p.card.cardId, { pick: p, count: 1 });
        order.push(p.card.cardId);
      }
    }
    return order.map((cid) => groups.get(cid)!);
  }, [deckCards, isSortingEnabled]);

  // Suppress unused warnings for batch operations (available for future toolbar)
  void onMoveCards;
  void onRemoveCards;

  // ─── Render ─────────────────────────────────────────────────────────

  return (
    <>
      <div className="absolute inset-0 pt-14 pb-16 flex">
        {/* ── Deck canvas ─────────────────────────────────────────── */}
        <div ref={canvasRef} className="flex-1 overflow-auto min-w-0 p-1">
          {isSortingEnabled && sortedDeckGroups ? (
            /* Sorted mode: flow grid with stacked counts */
            <div className="flex flex-wrap gap-1 content-start p-1">
              <div className="w-full text-[10px] text-green-400/40 font-medium select-none mb-1">
                Deck ({deckCards.length})
              </div>
              {sortedDeckGroups.map(({ pick, count }) => {
                const info = pickInfoById[pick.card.cardId];
                const slug = info?.slug ?? null;
                const isSite = (info?.type ?? "")
                  .toLowerCase()
                  .includes("site");
                const d = cardDims(cardSize, isSite);
                return (
                  <div
                    key={pick.card.cardId}
                    className="relative rounded-sm overflow-hidden ring-1 ring-white/15 hover:ring-white/30 cursor-pointer flex-shrink-0"
                    style={{ width: d.w, height: d.h }}
                    onDoubleClick={() => onMoveCard(pick.id, "Sideboard")}
                    onMouseEnter={() => {
                      if (slug)
                        onHoverPreview(
                          slug,
                          pick.card.cardName,
                          pick.card.type,
                        );
                    }}
                    onMouseLeave={onHoverClear}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      openContextMenu(
                        pick.card.cardId,
                        pick.card.cardName,
                        e.clientX,
                        e.clientY,
                      );
                    }}
                  >
                    <CardImage
                      slug={slug}
                      name={pick.card.cardName}
                      isSite={isSite}
                      w={d.w}
                    />
                    {count > 1 && (
                      <div className="absolute top-0.5 right-0.5 bg-black/80 text-white text-[10px] font-bold rounded px-1 leading-tight">
                        x{count}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* Unsorted mode: free-position canvas with direct DOM drag */
            <div className="relative w-full" style={{ minHeight: canvasMinH }}>
              <div className="absolute top-1 left-2 text-[10px] text-green-400/40 font-medium select-none pointer-events-none z-0">
                Deck ({deckCards.length})
              </div>
              {deckCards.map((pick) => {
                const info = pickInfoById[pick.card.cardId];
                const slug = info?.slug ?? null;
                const isSite = (info?.type ?? "")
                  .toLowerCase()
                  .includes("site");
                const pos = positions.get(pick.id) ?? { x: 0, y: 0 };
                const d = cardDims(cardSize, isSite);
                const z = zOrder.get(pick.id) ?? 0;
                return (
                  <div
                    key={pick.id}
                    className="absolute cursor-grab rounded-sm overflow-hidden ring-1 ring-white/15 hover:ring-white/30 active:cursor-grabbing"
                    style={{
                      left: pos.x,
                      top: pos.y,
                      width: d.w,
                      height: d.h,
                      zIndex: z,
                      transition: "box-shadow 0.2s, transform 0.2s",
                    }}
                    onMouseDown={(e) => startDrag(e, pick.id)}
                    onDoubleClick={() => onMoveCard(pick.id, "Sideboard")}
                    onMouseEnter={() => {
                      if (slug)
                        onHoverPreview(
                          slug,
                          pick.card.cardName,
                          pick.card.type,
                        );
                    }}
                    onMouseLeave={onHoverClear}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      openContextMenu(
                        pick.card.cardId,
                        pick.card.cardName,
                        e.clientX,
                        e.clientY,
                      );
                    }}
                  >
                    <CardImage
                      slug={slug}
                      name={pick.card.cardName}
                      isSite={isSite}
                      w={d.w}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Sidebar: Sideboard & Collection ─────────────────────── */}
        <div
          ref={sidebarRef}
          className={`overflow-auto space-y-2 border-l transition-colors flex-none p-1.5 ${
            sidebarHighlight
              ? "border-blue-400 bg-blue-950/20 w-40"
              : "border-white/10 w-36"
          }`}
        >
          {/* Sideboard */}
          <div>
            <h3 className="text-[10px] font-semibold text-blue-300 px-1 mb-1 flex items-center justify-between">
              <span>Sideboard</span>
              <span className="text-white/40 font-normal">
                {sideboardCards.length}
              </span>
            </h3>
            {sideboardCards.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {sideboardCards.map((pick) => {
                  const info = pickInfoById[pick.card.cardId];
                  const slug = info?.slug ?? null;
                  const isSite = (info?.type ?? "")
                    .toLowerCase()
                    .includes("site");
                  const tw = isSite ? 48 : 36;
                  const th = isSite ? 36 : 48;
                  return (
                    <div
                      key={pick.id}
                      className="relative rounded-sm overflow-hidden ring-1 ring-white/15 hover:ring-white/30 cursor-pointer"
                      style={{ width: tw, height: th }}
                      onDoubleClick={() => onMoveCard(pick.id, "Deck")}
                      onMouseEnter={() => {
                        if (slug)
                          onHoverPreview(
                            slug,
                            pick.card.cardName,
                            pick.card.type,
                          );
                      }}
                      onMouseLeave={onHoverClear}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        openContextMenu(
                          pick.card.cardId,
                          pick.card.cardName,
                          e.clientX,
                          e.clientY,
                        );
                      }}
                      title={`${pick.card.cardName} — double-click to move to Deck`}
                    >
                      <CardImage
                        slug={slug}
                        name={pick.card.cardName}
                        isSite={isSite}
                        w={tw}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-[9px] text-white/20 text-center py-4">
                Drag here or double-click
              </div>
            )}
          </div>

          {/* Collection */}
          {showCollection && (
            <div>
              <h3 className="text-[10px] font-semibold text-purple-300 px-1 mb-1 flex items-center justify-between">
                <span>Collection</span>
                <span className="text-white/40 font-normal">
                  {collectionCards.length}
                </span>
              </h3>
              {collectionCards.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {collectionCards.map((pick) => {
                    const info = pickInfoById[pick.card.cardId];
                    const slug = info?.slug ?? null;
                    const isSite = (info?.type ?? "")
                      .toLowerCase()
                      .includes("site");
                    const tw = isSite ? 48 : 36;
                    const th = isSite ? 36 : 48;
                    return (
                      <div
                        key={pick.id}
                        className="relative rounded-sm overflow-hidden ring-1 ring-white/15"
                        style={{ width: tw, height: th }}
                        onMouseEnter={() => {
                          if (slug)
                            onHoverPreview(
                              slug,
                              pick.card.cardName,
                              pick.card.type,
                            );
                        }}
                        onMouseLeave={onHoverClear}
                      >
                        <CardImage
                          slug={slug}
                          name={pick.card.cardName}
                          isSite={isSite}
                          w={tw}
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-[9px] text-white/20 text-center py-3">
                  Empty
                </div>
              )}
            </div>
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
              i === scaleIdx
                ? "bg-white/20 text-white"
                : "text-white/40 hover:text-white/70"
            }`}
          >
            {SCALE_LABELS[i]}
          </button>
        ))}
      </div>
    </>
  );
}
