"use client";

/**
 * TutorialHighlight — Spotlight overlay for tutorial.
 *
 * Dims the screen with a semi-transparent mask and cuts out a transparent
 * window over the target area so the player's attention is focused there.
 * A floating label describes what they're looking at.
 */

import { useMemo } from "react";
import type { TutorialHighlightTarget } from "@/lib/tutorial/types";

interface TutorialHighlightProps {
  target: TutorialHighlightTarget | undefined;
  visible: boolean;
}

/** Cutout region in viewport-relative percentages. */
interface SpotlightRegion {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Where to position the label relative to the cutout. */
interface LabelPlacement {
  style: React.CSSProperties;
}

export function TutorialHighlight({ target, visible }: TutorialHighlightProps) {
  if (!target || !visible) return null;

  // Board-relative targets (board, tile, avatar, piles) are handled by TutorialHighlight3D.
  // This 2D overlay only handles zone, card, and ui targets.
  if (target.type === "board" || target.type === "tile" || target.type === "tiles" || target.type === "avatar" || target.type === "piles") {
    return null;
  }

  return <Spotlight target={target} />;
}

function Spotlight({ target }: { target: TutorialHighlightTarget }) {
  const label = getTargetLabel(target);
  const region = useMemo(() => getSpotlightRegion(target), [target]);
  const labelPlacement = useMemo(
    () => getLabelPlacement(target, region),
    [target, region]
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-[55]">
      {/* Spotlight cutout — transparent window with dark surroundings */}
      <div
        className="absolute rounded-lg transition-all duration-500 ease-out"
        style={{
          top: `${region.top}%`,
          left: `${region.left}%`,
          width: `${region.width}%`,
          height: `${region.height}%`,
          boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.55)",
        }}
      >
        {/* Pulsing glow border */}
        <div className="absolute inset-0 rounded-lg ring-2 ring-violet-400/60 animate-pulse" />
      </div>

      {/* Label */}
      <div className="absolute" style={labelPlacement.style}>
        <div className="flex items-center gap-2 animate-pulse">
          <div className="rounded-full bg-violet-500/90 shadow-lg shadow-violet-500/40 px-3 py-1.5">
            <span className="text-xs font-semibold text-white whitespace-nowrap">
              {label}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ──────────────── Target metadata ────────────────

function getTargetLabel(target: TutorialHighlightTarget): string {
  switch (target.type) {
    case "zone":
      return `Your ${target.zone}`;
    case "card":
      return target.cardName;
    case "tile":
      return `Tile ${target.tile}`;
    case "tiles":
      return "Sites";
    case "ui":
      return getUILabel(target.element);
    case "avatar":
      return target.player === "p1" ? "Your Avatar" : "Enemy Avatar";
    case "board":
      return "The Realm";
    case "piles":
      return "Your Card Piles";
  }
}

function getUILabel(element: string): string {
  switch (element) {
    case "life_counter":
      return "Life Counter";
    case "mana_display":
      return "Mana & Thresholds";
    case "phase_indicator":
      return "Phase Indicator";
    case "end_turn_button":
      return "End Turn";
    default:
      return element;
  }
}

// ──────────────── Spotlight regions ────────────────
//
// These define the transparent cutout area in viewport-relative percentages.
// The 3D board fills the full screen; the visible grid is roughly centered.
// Values are approximate and tuned for a typical 16:9 / 16:10 viewport.

/** Approximate grid bounds (viewport %). */
const GRID = { top: 8, left: 28, right: 94, bottom: 94 } as const;
const GRID_W = GRID.right - GRID.left;
const GRID_H = GRID.bottom - GRID.top;
const COLS = 5;
const ROWS = 4;

/** Get the cutout region for a target. */
function getSpotlightRegion(target: TutorialHighlightTarget): SpotlightRegion {
  switch (target.type) {
    case "board":
      // The entire grid area
      return {
        top: GRID.top - 1,
        left: GRID.left - 1,
        width: GRID_W + 2,
        height: GRID_H + 2,
      };

    case "avatar": {
      // Avatar occupies the center column of their home row.
      // P1 is at bottom row (row 3), P2 at top row (row 0).
      const row = target.player === "p1" ? 3 : 0;
      const col = 2; // center column
      return tileRegion(col, row, 1.4, 1.4);
    }

    case "tile": {
      // Specific tile number (1-20)
      const t = target.tile - 1;
      const col = t % COLS;
      const row = Math.floor(t / COLS);
      return tileRegion(col, row, 1.2, 1.2);
    }

    case "tiles":
      // Handled by 3D highlight
      return { top: GRID.top - 1, left: GRID.left - 1, width: GRID_W + 2, height: GRID_H + 2 };

    case "zone": {
      if (target.zone === "hand") {
        // Hand area — bottom portion of the screen, wide enough for fanned cards
        return { top: 62, left: 5, width: 90, height: 36 };
      }
      if (target.zone === "spellbook" || target.zone === "atlas") {
        // Deck piles — right side near the grid
        return { top: 30, left: 85, width: 12, height: 40 };
      }
      // Graveyard / generic zone
      return { top: 60, left: 85, width: 12, height: 25 };
    }

    case "card": {
      // Card in hand or on board — bottom center spotlight
      return { top: 75, left: 35, width: 30, height: 22 };
    }

    case "ui": {
      if (target.element === "life_counter") {
        return { top: 30, left: 0, width: 10, height: 40 };
      }
      if (target.element === "mana_display") {
        return { top: 25, left: 0, width: 12, height: 50 };
      }
      if (target.element === "end_turn_button") {
        return { top: 40, left: 88, width: 10, height: 15 };
      }
      return { top: 30, left: 40, width: 20, height: 20 };
    }

    case "piles":
      // Handled by 3D highlight; 2D fallback covers the pile area
      return { top: 5, left: 82, width: 16, height: 90 };
  }
}

/** Compute a spotlight region for a specific grid cell (col 0-4, row 0-3). */
function tileRegion(
  col: number,
  row: number,
  scaleX = 1,
  scaleY = 1
): SpotlightRegion {
  const cellW = GRID_W / COLS;
  const cellH = GRID_H / ROWS;
  const cx = GRID.left + (col + 0.5) * cellW;
  const cy = GRID.top + (row + 0.5) * cellH;
  const w = cellW * scaleX;
  const h = cellH * scaleY;
  return {
    top: cy - h / 2,
    left: cx - w / 2,
    width: w,
    height: h,
  };
}

// ──────────────── Label placement ────────────────

/** Position the label near (but outside) the cutout. */
function getLabelPlacement(
  target: TutorialHighlightTarget,
  region: SpotlightRegion
): LabelPlacement {
  switch (target.type) {
    case "board":
      // Centered above the grid
      return {
        style: {
          top: `${region.top - 4}%`,
          left: `${region.left + region.width / 2}%`,
          transform: "translateX(-50%)",
        },
      };
    case "avatar":
      // To the right of the avatar spotlight
      return {
        style: {
          top: `${region.top + region.height / 2}%`,
          left: `${region.left + region.width + 1}%`,
          transform: "translateY(-50%)",
        },
      };
    case "tile":
      // Above the tile
      return {
        style: {
          top: `${region.top - 4}%`,
          left: `${region.left + region.width / 2}%`,
          transform: "translateX(-50%)",
        },
      };
    default:
      // Centered above the region
      return {
        style: {
          top: `${region.top - 4}%`,
          left: `${region.left + region.width / 2}%`,
          transform: "translateX(-50%)",
        },
      };
  }
}
