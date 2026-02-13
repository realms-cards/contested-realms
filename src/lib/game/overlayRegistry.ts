/**
 * Overlay Registry — lightweight Zustand store for coordinating multiple
 * game overlays that may be active simultaneously.
 *
 * Each overlay calls `useOverlaySlot(id, priority, isActive)` which:
 *   1. Registers/unregisters itself in the global registry
 *   2. Returns layout hints (slot position, total count) so the overlay
 *      can position itself correctly when tiled with others.
 *
 * Priority determines ordering: lower numbers render on the LEFT,
 * higher numbers on the RIGHT.  The highest-priority overlay is
 * considered the "interrupting" one (per the Storyline rule).
 *
 * Overlays can be minimized (manually or auto via boardInteractionActive)
 * to a small pill bar so the 3D board remains accessible.
 *
 * Usage inside an overlay component:
 *
 *   const isActive = !!pending && pending.phase !== "complete";
 *   const layout = useOverlaySlot("accusation", 10, isActive);
 *   // layout.minimized — true if this overlay should render as a pill
 *   // layout.toggleMinimize() — toggle manual minimize
 */

import { useCallback, useEffect, useRef } from "react";
import { create } from "zustand";

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

type OverlayEntry = {
  id: string;
  priority: number;
  /** Human-readable label shown in the storyline indicator */
  label?: string;
};

type OverlayRegistryState = {
  overlays: OverlayEntry[];
  /** Per-overlay manual minimize state */
  minimized: Record<string, boolean>;
  /** When true, all overlays are auto-minimized (e.g. board cell selection) */
  boardInteractionActive: boolean;
  register: (id: string, priority: number, label?: string) => void;
  unregister: (id: string) => void;
  toggleMinimize: (id: string) => void;
  setBoardInteractionActive: (active: boolean) => void;
};

export const useOverlayRegistry = create<OverlayRegistryState>((set) => ({
  overlays: [],
  minimized: {},
  boardInteractionActive: false,
  register: (id, priority, label) => {
    set((s) => ({
      overlays: [
        ...s.overlays.filter((o) => o.id !== id),
        { id, priority, label },
      ],
    }));
  },
  unregister: (id) => {
    set((s) => ({
      overlays: s.overlays.filter((o) => o.id !== id),
      minimized: { ...s.minimized, [id]: false },
    }));
  },
  toggleMinimize: (id) => {
    set((s) => ({
      minimized: { ...s.minimized, [id]: !s.minimized[id] },
    }));
  },
  setBoardInteractionActive: (active) => {
    set({ boardInteractionActive: active });
  },
}));

// ---------------------------------------------------------------------------
// Layout types
// ---------------------------------------------------------------------------

export type OverlaySlot = "full" | "left" | "right";

export type OverlayLayout = {
  /** How many overlays are currently active */
  count: number;
  /** Whether this overlay is tiled alongside others */
  tiled: boolean;
  /** Assigned position slot */
  slot: OverlaySlot;
  /** True if this is the highest-priority (interrupting) overlay */
  isTop: boolean;
  /** Index in the sorted list (0-based, sorted by ascending priority) */
  index: number;
  /** True when overlay should render as a minimized pill bar */
  minimized: boolean;
  /** Toggle the manual minimize state for this overlay */
  toggleMinimize: () => void;
};

// ---------------------------------------------------------------------------
// CSS helpers
// ---------------------------------------------------------------------------

/** Tailwind classes for each slot position (static strings for JIT) */
const SLOT_CLASSES: Record<OverlaySlot, string> = {
  full: "fixed inset-0",
  left: "fixed top-0 left-0 bottom-0 w-1/2 border-r border-white/10",
  right: "fixed top-0 right-0 bottom-0 w-1/2",
};

/** Returns the container className for a given slot at z-[200] */
export function overlaySlotClass(slot: OverlaySlot): string {
  return `${SLOT_CLASSES[slot]} z-[200]`;
}

// ---------------------------------------------------------------------------
// Layout hook
// ---------------------------------------------------------------------------

export function useOverlaySlot(
  id: string,
  priority: number,
  isActive: boolean,
  label?: string,
): OverlayLayout {
  const register = useOverlayRegistry((s) => s.register);
  const unregister = useOverlayRegistry((s) => s.unregister);
  const overlays = useOverlayRegistry((s) => s.overlays);
  const minimizedMap = useOverlayRegistry((s) => s.minimized);
  const boardInteraction = useOverlayRegistry((s) => s.boardInteractionActive);
  const toggle = useOverlayRegistry((s) => s.toggleMinimize);

  // Stable ref so the effect doesn't re-run on every overlays change
  const idRef = useRef(id);
  idRef.current = id;

  useEffect(() => {
    if (isActive) {
      register(id, priority, label);
    } else {
      unregister(id);
    }
    return () => unregister(idRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, id, priority, label]);

  const toggleMinimize = useCallback(() => toggle(id), [toggle, id]);

  const isMinimized = !!(minimizedMap[id] || boardInteraction);

  // Compute layout
  const sorted = [...overlays].sort((a, b) => a.priority - b.priority);
  const count = sorted.length;
  const myIndex = sorted.findIndex((o) => o.id === id);

  if (!isActive || count <= 1) {
    return {
      count: Math.max(count, isActive ? 1 : 0),
      tiled: false,
      slot: "full",
      isTop: true,
      index: 0,
      minimized: isMinimized,
      toggleMinimize,
    };
  }

  // 2 overlays: lower priority = left, higher = right
  // 3+: first = left, last = right, middle = right (rare edge case)
  const slot: OverlaySlot = myIndex === 0 ? "left" : "right";
  const isLast = myIndex === count - 1;

  return {
    count,
    tiled: true,
    slot,
    isTop: isLast,
    index: myIndex,
    minimized: isMinimized,
    toggleMinimize,
  };
}
