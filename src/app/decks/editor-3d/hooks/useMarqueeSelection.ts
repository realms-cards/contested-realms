import { useCallback, useRef, useState } from "react";
import type { Pick3D } from "@/lib/game/cardSorting";

type ScreenPoint = { x: number; y: number };
type WorldPoint = { x: number; z: number };

export type MarqueeScreenRect = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
} | null;

type MarqueeDragState = {
  active: boolean;
  startScreen: ScreenPoint;
  startWorld: WorldPoint;
};

const DRAG_THRESHOLD_PX = 6;

/**
 * Store-independent marquee selection hook for the deck editor / draft.
 * Manages a set of selected Pick3D card IDs and the marquee drag state.
 */
export function useMarqueeSelection() {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    () => new Set<number>(),
  );
  const [marqueeRect, setMarqueeRect] = useState<MarqueeScreenRect>(null);
  const dragRef = useRef<MarqueeDragState>({
    active: false,
    startScreen: { x: 0, y: 0 },
    startWorld: { x: 0, z: 0 },
  });

  const isSelected = useCallback(
    (id: number) => selectedIds.has(id),
    [selectedIds],
  );

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set<number>());
  }, []);

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectByIds = useCallback((ids: number[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  /** Called from the invisible selection plane's onPointerDown */
  const onMarqueePointerDown = useCallback(
    (screenX: number, screenY: number, worldX: number, worldZ: number) => {
      dragRef.current = {
        active: false,
        startScreen: { x: screenX, y: screenY },
        startWorld: { x: worldX, z: worldZ },
      };
    },
    [],
  );

  /** Called from the invisible selection plane's onPointerMove */
  const onMarqueePointerMove = useCallback(
    (screenX: number, screenY: number) => {
      const m = dragRef.current;
      if (!m.startScreen.x && !m.startScreen.y && !m.active) return;

      const dx = screenX - m.startScreen.x;
      const dy = screenY - m.startScreen.y;

      if (!m.active) {
        if (Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD_PX) return;
        m.active = true;
      }

      setMarqueeRect({
        x1: m.startScreen.x,
        y1: m.startScreen.y,
        x2: screenX,
        y2: screenY,
      });
    },
    [],
  );

  /**
   * Core selection commit logic — shared by onMarqueePointerUp and commitIfActive.
   * Computes which cards fall within the marquee world rect and updates selection.
   */
  const commitSelection = useCallback(
    (worldX: number, worldZ: number, picks: Pick3D[], additive: boolean) => {
      const m = dragRef.current;
      if (m.active) {
        const minX = Math.min(m.startWorld.x, worldX);
        const maxX = Math.max(m.startWorld.x, worldX);
        const minZ = Math.min(m.startWorld.z, worldZ);
        const maxZ = Math.max(m.startWorld.z, worldZ);

        const hitIds: number[] = [];
        for (const p of picks) {
          if (p.x >= minX && p.x <= maxX && p.z >= minZ && p.z <= maxZ) {
            hitIds.push(p.id);
          }
        }

        if (hitIds.length > 0) {
          if (additive) {
            setSelectedIds((prev) => {
              const next = new Set(prev);
              for (const id of hitIds) {
                if (next.has(id)) next.delete(id);
                else next.add(id);
              }
              return next;
            });
          } else {
            setSelectedIds(new Set(hitIds));
          }
        } else if (!additive) {
          setSelectedIds(new Set<number>());
        }
      } else if (!additive) {
        // Click on empty surface without drag — clear selection
        setSelectedIds(new Set<number>());
      }

      // Reset
      dragRef.current = {
        active: false,
        startScreen: { x: 0, y: 0 },
        startWorld: { x: 0, z: 0 },
      };
      setMarqueeRect(null);
    },
    [],
  );

  /** Called from the invisible selection plane's onPointerUp */
  const onMarqueePointerUp = useCallback(
    (
      worldX: number,
      worldZ: number,
      picks: Pick3D[],
      additive: boolean,
    ) => {
      commitSelection(worldX, worldZ, picks, additive);
    },
    [commitSelection],
  );

  /**
   * Check whether a marquee drag is currently active.
   * Used by card pointerUp handlers to suppress card clicks during marquee drags.
   */
  const isMarqueeDragging = useCallback(() => dragRef.current.active, []);

  /**
   * Commit the active marquee selection from a card's pointerUp event.
   * Called when the user releases the pointer over a card while a marquee drag is active.
   * The card passes its world coordinates so the marquee rect endpoint is correct.
   */
  const commitIfActive = useCallback(
    (worldX: number, worldZ: number, picks: Pick3D[], additive: boolean) => {
      if (!dragRef.current.active) return false;
      commitSelection(worldX, worldZ, picks, additive);
      return true;
    },
    [commitSelection],
  );

  const onMarqueeCancel = useCallback(() => {
    dragRef.current = {
      active: false,
      startScreen: { x: 0, y: 0 },
      startWorld: { x: 0, z: 0 },
    };
    setMarqueeRect(null);
  }, []);

  return {
    selectedIds,
    isSelected,
    toggleSelect,
    selectByIds,
    clearSelection,
    marqueeRect,
    onMarqueePointerDown,
    onMarqueePointerMove,
    onMarqueePointerUp,
    onMarqueeCancel,
    isMarqueeDragging,
    commitIfActive,
  };
}
