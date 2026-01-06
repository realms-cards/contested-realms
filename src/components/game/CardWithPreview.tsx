"use client";

import Image from "next/image";
import React, { useCallback, useRef } from "react";
import { useGameStore } from "@/lib/game/store";
import type { CardRef } from "@/lib/game/store/types";

/**
 * Shared card display component with hover preview support.
 * Use this in all overlays that display selectable/viewable cards.
 *
 * Features:
 * - Shows card image with optional name overlay
 * - Hover triggers large card preview after 200ms delay
 * - Supports selection state and click handlers
 * - Consistent styling across all resolver overlays
 */

export type CardWithPreviewProps = {
  card: CardRef;
  onClick?: () => void;
  selected?: boolean;
  interactive?: boolean;
  /** Ring color for selection/hover (default: blue) */
  accentColor?:
    | "blue"
    | "purple"
    | "green"
    | "cyan"
    | "orange"
    | "pink"
    | "red";
  /** Show card name at bottom */
  showName?: boolean;
  /** Additional className for the container */
  className?: string;
  /** Size variant */
  size?: "sm" | "md" | "lg";
};

const accentClasses = {
  blue: {
    hover: "hover:ring-blue-400",
    selected: "ring-blue-500",
    selectedBg: "bg-blue-500/20",
  },
  purple: {
    hover: "hover:ring-purple-400",
    selected: "ring-purple-500",
    selectedBg: "bg-purple-500/20",
  },
  green: {
    hover: "hover:ring-green-400",
    selected: "ring-green-500",
    selectedBg: "bg-green-500/20",
  },
  cyan: {
    hover: "hover:ring-cyan-400",
    selected: "ring-cyan-500",
    selectedBg: "bg-cyan-500/20",
  },
  orange: {
    hover: "hover:ring-orange-400",
    selected: "ring-orange-500",
    selectedBg: "bg-orange-500/20",
  },
  pink: {
    hover: "hover:ring-pink-400",
    selected: "ring-pink-500",
    selectedBg: "bg-pink-500/20",
  },
  red: {
    hover: "hover:ring-red-400",
    selected: "ring-red-500",
    selectedBg: "bg-red-500/20",
  },
};

const sizeClasses = {
  sm: "w-16", // ~64px
  md: "w-20", // ~80px - default
  lg: "w-24", // ~96px
};

export default function CardWithPreview({
  card,
  onClick,
  selected = false,
  interactive = true,
  accentColor = "blue",
  showName = true,
  className = "",
  size = "md",
}: CardWithPreviewProps) {
  const setPreviewCard = useGameStore((s) => s.setPreviewCard);
  const hoverTimerRef = useRef<number | null>(null);

  const handleMouseEnter = useCallback(() => {
    if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = window.setTimeout(() => {
      setPreviewCard(card);
    }, 200);
  }, [card, setPreviewCard]);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setPreviewCard(null);
  }, [setPreviewCard]);

  const accent = accentClasses[accentColor];
  const sizeClass = sizeClasses[size];

  return (
    <div
      onClick={interactive ? onClick : undefined}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`relative aspect-[2.5/3.5] ${sizeClass} rounded-lg overflow-hidden transition-all ${
        interactive
          ? `cursor-pointer hover:scale-105 hover:ring-2 ${accent.hover}`
          : ""
      } ${selected ? `ring-2 ${accent.selected} scale-105` : ""} ${className}`}
    >
      <Image
        src={`/api/images/${card.slug || card.cardId}`}
        alt={card.name || "Card"}
        fill
        className="object-cover"
        unoptimized
      />
      {showName && (
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 to-transparent p-1">
          <p className="text-white text-[10px] text-center truncate">
            {card.name}
          </p>
        </div>
      )}
      {selected && (
        <div
          className={`absolute inset-0 ${accent.selectedBg} flex items-center justify-center`}
        >
          <div
            className={`${accent.selected.replace(
              "ring-",
              "bg-"
            )} text-white font-bold px-1 py-0.5 rounded text-[10px]`}
          >
            ✓
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Grid variant for displaying multiple cards with consistent spacing
 */
export function CardGrid({
  children,
  columns = 5,
  className = "",
}: {
  children: React.ReactNode;
  columns?: 3 | 4 | 5 | 6 | 7;
  className?: string;
}) {
  const colClasses = {
    3: "grid-cols-3",
    4: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4",
    5: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5",
    6: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6",
    7: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7",
  };

  return (
    <div className={`grid ${colClasses[columns]} gap-3 ${className}`}>
      {children}
    </div>
  );
}
