"use client";

import Image from "next/image";
import { useMemo } from "react";
import { useGameStore } from "@/lib/game/store";
import type { PlayerKey } from "@/lib/game/store";
import { siteProvidesMana } from "@/lib/game/store/utils/resourceHelpers";

// Element config matching Threshold3D exactly
const ELEMENTS = [
  { key: "air" as const, icon: "/api/assets/air.png", color: "#93c5fd" },
  { key: "water" as const, icon: "/api/assets/water.png", color: "#67e8f9" },
  { key: "earth" as const, icon: "/api/assets/earth.png", color: "#f59e0b" },
  { key: "fire" as const, icon: "/api/assets/fire.png", color: "#f87171" },
];

// Icon size for threshold symbols
const ICON_SIZE = 14;

/**
 * Renders threshold symbols in arranged groups:
 * 1 = single symbol
 * 2 = two symbols stacked vertically
 * 3 = triangle pattern (2 on top, 1 below)
 * 4 = 2x2 grid
 * 5+ = 2x2 grid + additional row
 */
function ThresholdSymbols({
  count,
  icon,
  alt,
}: {
  count: number;
  icon: string;
  alt: string;
}) {
  if (count === 0) return null;

  // For counts 1-4, use specific layouts. For 5+, use rows of 2.
  if (count === 1) {
    return (
      <div className="flex justify-center">
        <Image src={icon} alt={alt} width={ICON_SIZE} height={ICON_SIZE} />
      </div>
    );
  }

  if (count === 2) {
    return (
      <div className="flex flex-col items-center -space-y-1">
        <Image src={icon} alt={alt} width={ICON_SIZE} height={ICON_SIZE} />
        <Image src={icon} alt={alt} width={ICON_SIZE} height={ICON_SIZE} />
      </div>
    );
  }

  if (count === 3) {
    return (
      <div className="flex flex-col items-center -space-y-1">
        <div className="flex -space-x-0.5">
          <Image src={icon} alt={alt} width={ICON_SIZE} height={ICON_SIZE} />
          <Image src={icon} alt={alt} width={ICON_SIZE} height={ICON_SIZE} />
        </div>
        <Image src={icon} alt={alt} width={ICON_SIZE} height={ICON_SIZE} />
      </div>
    );
  }

  if (count === 4) {
    return (
      <div className="flex flex-col items-center -space-y-1">
        <div className="flex -space-x-0.5">
          <Image src={icon} alt={alt} width={ICON_SIZE} height={ICON_SIZE} />
          <Image src={icon} alt={alt} width={ICON_SIZE} height={ICON_SIZE} />
        </div>
        <div className="flex -space-x-0.5">
          <Image src={icon} alt={alt} width={ICON_SIZE} height={ICON_SIZE} />
          <Image src={icon} alt={alt} width={ICON_SIZE} height={ICON_SIZE} />
        </div>
      </div>
    );
  }

  // For 5+, build rows of 2
  const rows: number[] = [];
  let remaining = count;
  while (remaining > 0) {
    rows.push(Math.min(2, remaining));
    remaining -= 2;
  }

  return (
    <div className="flex flex-col items-center -space-y-1">
      {rows.map((rowCount, i) => (
        <div key={i} className="flex -space-x-0.5">
          {Array.from({ length: rowCount }).map((_, j) => (
            <Image
              key={j}
              src={icon}
              alt={alt}
              width={ICON_SIZE}
              height={ICON_SIZE}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

interface ThresholdRowProps {
  thresholds: { air: number; earth: number; fire: number; water: number };
}

function ThresholdRow({ thresholds }: ThresholdRowProps) {
  // Only show elements that have at least 1 threshold
  const activeElements = ELEMENTS.filter((el) => (thresholds[el.key] ?? 0) > 0);

  if (activeElements.length === 0) return null;

  return (
    <div className="flex flex-col items-center gap-1">
      {activeElements.map((el) => {
        const count = thresholds[el.key] ?? 0;
        return (
          <div
            key={el.key}
            className="flex flex-col items-center"
            title={`${el.key}: ${count}`}
          >
            <ThresholdSymbols count={count} icon={el.icon} alt={el.key} />
          </div>
        );
      })}
    </div>
  );
}

interface ManaRowProps {
  mana: number;
  baseMana: number;
  canAdjust: boolean;
  onIncrement: () => void;
  onDecrement: () => void;
}

function ManaRow({
  mana,
  baseMana,
  canAdjust,
  onIncrement,
  onDecrement,
}: ManaRowProps) {
  const manaColor =
    mana === 0 ? "#ef4444" : mana < baseMana ? "#fbbf24" : "#ffffff";

  return (
    <div className="group flex flex-col items-center gap-0.5">
      {/* Mana display */}
      <div
        className="flex items-center gap-1"
        title={`${mana} available / ${baseMana} total mana`}
      >
        <span
          className="text-sm font-bold tabular-nums font-fantaisie"
          style={{ color: manaColor }}
        >
          {mana}/{baseMana}
        </span>
      </div>
      {/* +/- buttons - only visible on hover */}
      {canAdjust && (
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={onDecrement}
            className="w-4 h-4 flex items-center justify-center rounded-full bg-rose-600/80 hover:bg-rose-500 text-white text-[10px] font-bold transition-colors"
            title="Decrease mana"
          >
            −
          </button>
          <button
            type="button"
            onClick={onIncrement}
            className="w-4 h-4 flex items-center justify-center rounded-full bg-emerald-600/80 hover:bg-emerald-500 text-white text-[10px] font-bold transition-colors"
            title="Increase mana"
          >
            +
          </button>
        </div>
      )}
    </div>
  );
}

interface PlayerResourceColumnProps {
  player: PlayerKey;
  isMe: boolean;
  readOnly?: boolean;
  dragFromHand?: boolean;
}

/**
 * Vertical column showing thresholds and mana for a single player.
 * Designed to match the existing Threshold3D style.
 */
export function PlayerResourceColumn({
  player,
  isMe,
  readOnly = false,
  dragFromHand = false,
}: PlayerResourceColumnProps) {
  // Get mana data
  const sites = useGameStore((s) => s.board.sites);
  const manaOffset = useGameStore((s) => s.players[player]?.mana ?? 0);
  const addMana = useGameStore((s) => s.addMana);
  const actorKey = useGameStore((s) => s.actorKey);
  const thresholds = useGameStore((s) => s.getThresholdTotals(player));

  const ownerNum = player === "p1" ? 1 : 2;

  // Count sites that provide mana
  const baseMana = useMemo(() => {
    let count = 0;
    for (const site of Object.values(sites)) {
      if (site.owner === ownerNum && siteProvidesMana(site.card ?? null)) {
        count++;
      }
    }
    return count;
  }, [sites, ownerNum]);

  const mana = Math.max(0, baseMana + manaOffset);

  // Can adjust if we're the actor (or offline) and not dragging
  const canAdjust =
    !readOnly &&
    (actorKey ? actorKey === player : true) &&
    !dragFromHand &&
    isMe;

  return (
    <div className="flex flex-col items-center gap-1 p-1 rounded-lg bg-black/40">
      {/* Thresholds (vertical) */}
      <ThresholdRow thresholds={thresholds} />
      {/* Mana */}
      <ManaRow
        mana={mana}
        baseMana={baseMana}
        canAdjust={canAdjust}
        onIncrement={() => addMana(player, 1)}
        onDecrement={() => addMana(player, -1)}
      />
    </div>
  );
}

interface PlayerResourcePanelsProps {
  myPlayerKey: PlayerKey | null;
  playerNames: { p1: string; p2: string };
  showYouLabels?: boolean;
  readOnly?: boolean;
  dragFromHand?: boolean;
}

/**
 * Displays mana and threshold resources for both players.
 * Positioned at the right side of the screen, with P1 above and P2 below.
 */
export default function PlayerResourcePanels({
  myPlayerKey,
  playerNames,
  showYouLabels = false,
  readOnly = false,
  dragFromHand = false,
}: PlayerResourcePanelsProps) {
  // Suppress unused vars - kept for API compatibility
  void playerNames;
  void showYouLabels;

  return (
    <div
      className={`absolute right-3 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-6 ${
        dragFromHand ? "pointer-events-none" : "pointer-events-auto"
      } text-white select-none`}
    >
      {/* P1 resources */}
      <PlayerResourceColumn
        player="p1"
        isMe={myPlayerKey === "p1"}
        readOnly={readOnly}
        dragFromHand={dragFromHand}
      />

      {/* P2 resources */}
      <PlayerResourceColumn
        player="p2"
        isMe={myPlayerKey === "p2"}
        readOnly={readOnly}
        dragFromHand={dragFromHand}
      />
    </div>
  );
}
