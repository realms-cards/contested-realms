"use client";

import { useMemo } from "react";
import { IN_PLAY_ARTIFACT_PROVIDERS } from "@/lib/game/mana-providers";
import { useGameStore } from "@/lib/game/store";
import type { PlayerKey } from "@/lib/game/store";
import {
  computeAvailableMana,
  computeThresholdTotals,
  siteProvidesMana,
} from "@/lib/game/store/utils/resourceHelpers";
import { useSmallScreen, useTouchDevice } from "@/lib/hooks/useTouchDevice";

// Element config matching Threshold3D exactly
// Use static paths from public/ folder for production compatibility
const ELEMENTS = [
  { key: "air" as const, icon: "/air.png", color: "#93c5fd" },
  { key: "water" as const, icon: "/water.png", color: "#67e8f9" },
  { key: "earth" as const, icon: "/earth.png", color: "#f59e0b" },
  { key: "fire" as const, icon: "/fire.png", color: "#f87171" },
];

// Icon size for threshold symbols (desktop)
const ICON_SIZE = 14;
const ICON_SIZE_COMPACT = 10;

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
  compact = false,
}: {
  count: number;
  icon: string;
  alt: string;
  compact?: boolean;
}) {
  if (count === 0) return null;

  // For counts 1-4, use specific layouts. For 5+, use rows of 2.
  const size = compact ? ICON_SIZE_COMPACT : ICON_SIZE;
  const Img = ({ src, alt: imgAlt }: { src: string; alt: string }) => (
    <img src={src} alt={imgAlt} width={size} height={size} />
  );

  if (count === 1) {
    return (
      <div className="flex justify-center">
        <Img src={icon} alt={alt} />
      </div>
    );
  }

  if (count === 2) {
    return (
      <div className="flex flex-col items-center -space-y-1">
        <Img src={icon} alt={alt} />
        <Img src={icon} alt={alt} />
      </div>
    );
  }

  if (count === 3) {
    return (
      <div className="flex flex-col items-center -space-y-1">
        <div className="flex -space-x-0.5">
          <Img src={icon} alt={alt} />
          <Img src={icon} alt={alt} />
        </div>
        <Img src={icon} alt={alt} />
      </div>
    );
  }

  if (count === 4) {
    return (
      <div className="flex flex-col items-center -space-y-1">
        <div className="flex -space-x-0.5">
          <Img src={icon} alt={alt} />
          <Img src={icon} alt={alt} />
        </div>
        <div className="flex -space-x-0.5">
          <Img src={icon} alt={alt} />
          <Img src={icon} alt={alt} />
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
            <Img key={j} src={icon} alt={alt} />
          ))}
        </div>
      ))}
    </div>
  );
}

interface ThresholdRowProps {
  thresholds: { air: number; earth: number; fire: number; water: number };
}

function ThresholdRow({
  thresholds,
  compact = false,
}: ThresholdRowProps & { compact?: boolean }) {
  // Only show elements that have at least 1 threshold
  const activeElements = ELEMENTS.filter((el) => (thresholds[el.key] ?? 0) > 0);

  if (activeElements.length === 0) {
    return compact ? null : (
      <div className="text-xs text-gray-500" title={JSON.stringify(thresholds)}>
        (no thresh)
      </div>
    );
  }

  // Ultra-compact mobile: tiny element icon + count number in a row
  if (compact) {
    return (
      <div className="flex items-center gap-0.5">
        {activeElements.map((el) => {
          const count = thresholds[el.key] ?? 0;
          return (
            <div
              key={el.key}
              className="flex items-center gap-px"
              title={`${el.key}: ${count}`}
            >
              <img src={el.icon} alt={el.key} width={8} height={8} />
              <span
                className="text-[8px] font-bold leading-none"
                style={{ color: el.color }}
              >
                {count}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

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
            <ThresholdSymbols
              count={count}
              icon={el.icon}
              alt={el.key}
              compact={compact}
            />
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
  compact = false,
}: ManaRowProps & { compact?: boolean }) {
  const isTouchDevice = useTouchDevice();
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
          className={`${compact ? "text-[9px] leading-none" : "text-sm"} font-bold tabular-nums font-fantaisie`}
          style={{ color: manaColor }}
        >
          {mana}/{baseMana}
        </span>
      </div>
      {/* +/- buttons - only visible on hover (always visible on touch devices) */}
      {canAdjust && (
        <div
          className={`flex gap-1 transition-opacity ${
            isTouchDevice ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          <button
            type="button"
            onClick={onDecrement}
            className={`${compact ? "w-3 h-3 text-[7px]" : "w-4 h-4 text-[10px]"} flex items-center justify-center rounded-full bg-rose-600/80 hover:bg-rose-500 text-white font-bold transition-colors`}
            title="Decrease mana"
          >
            −
          </button>
          <button
            type="button"
            onClick={onIncrement}
            className={`${compact ? "w-3 h-3 text-[7px]" : "w-4 h-4 text-[10px]"} flex items-center justify-center rounded-full bg-emerald-600/80 hover:bg-emerald-500 text-white font-bold transition-colors`}
            title="Increase mana"
          >
            +
          </button>
        </div>
      )}
    </div>
  );
}

// Player colors for visual distinction
const PLAYER_COLORS = {
  p1: "rgba(59, 130, 246, 0.35)", // blue
  p2: "rgba(239, 68, 68, 0.35)", // red
} as const;

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
  const addMana = useGameStore((s) => s.addMana);
  const actorKey = useGameStore((s) => s.actorKey);
  const manaOffset = useGameStore((s) => s.players[player]?.mana ?? 0);

  // Subscribe to granular state slices for threshold reactivity
  const boardSize = useGameStore((s) => s.board.size);
  const boardSites = useGameStore((s) => s.board.sites);
  const permanents = useGameStore((s) => s.permanents);
  const avatar = useGameStore((s) => s.avatars[player]);
  const specialSiteState = useGameStore((s) => s.specialSiteState);

  const babelTowers = useGameStore((s) => s.babelTowers);

  // Compute thresholds from subscribed state
  const thresholds = useMemo(() => {
    const result = computeThresholdTotals(
      { size: boardSize, sites: boardSites },
      permanents,
      player,
      avatar,
      specialSiteState,
      babelTowers,
    );
    return result;
  }, [
    boardSize,
    boardSites,
    permanents,
    player,
    avatar,
    specialSiteState,
    babelTowers,
  ]);

  // Compute mana from sites + permanents (including cores)
  const owner = player === "p1" ? 1 : 2;
  const zones = useGameStore((s) => s.zones);
  const { baseMana, mana } = useMemo(() => {
    // Base mana: count sites that provide mana + permanents that provide mana (cores)
    let total = 0;
    for (const site of Object.values(boardSites)) {
      if (!site || site.owner !== owner) continue;
      if (siteProvidesMana(site.card ?? null)) {
        total++;
      }
    }
    // Add mana from permanents (cores provide mana while in play)
    for (const arr of Object.values(permanents ?? {})) {
      const list = Array.isArray(arr) ? arr : [];
      for (const p of list) {
        if (!p || p.owner !== owner) continue;
        const nm = String(p.card?.name || "").toLowerCase();
        // Cores provide mana while in play
        if (IN_PLAY_ARTIFACT_PROVIDERS.has(nm)) {
          total++;
        }
      }
    }
    // Available mana: use computeAvailableMana which includes permanents (cores)
    const available = computeAvailableMana(
      { size: boardSize, sites: boardSites },
      permanents,
      player,
      zones,
      specialSiteState,
      thresholds,
      undefined,
      undefined,
      babelTowers,
    );
    return { baseMana: total, mana: Math.max(0, available + manaOffset) };
  }, [
    boardSites,
    boardSize,
    permanents,
    owner,
    player,
    zones,
    specialSiteState,
    thresholds,
    manaOffset,
    babelTowers,
  ]);

  // Can adjust if we're the actor (or offline) and not dragging
  const canAdjust =
    !readOnly &&
    (actorKey ? actorKey === player : true) &&
    !dragFromHand &&
    isMe;

  const isMobileScreen = useSmallScreen();

  return (
    <div
      className={`flex flex-col items-center ${isMobileScreen ? "gap-0 px-1 py-0.5 rounded bg-black/30" : "gap-1 p-1.5 rounded-lg bg-black/40"}`}
      style={
        isMobileScreen
          ? { borderLeft: `2px solid ${PLAYER_COLORS[player]}` }
          : { border: `1px solid ${PLAYER_COLORS[player]}` }
      }
    >
      {/* Thresholds */}
      <ThresholdRow thresholds={thresholds} compact={isMobileScreen} />
      {/* Mana */}
      <ManaRow
        mana={mana}
        baseMana={baseMana}
        canAdjust={canAdjust}
        onIncrement={() => addMana(player, 1)}
        onDecrement={() => addMana(player, -1)}
        compact={isMobileScreen}
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
 * Own player at bottom, opponent at top. Each has a subtle player-color border.
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

  const isMobileScreen = useSmallScreen();

  // Determine which player is "me" and which is opponent
  // Default to p1 as "me" if myPlayerKey is null (hotseat/spectator)
  const meKey = myPlayerKey ?? "p1";
  const opponentKey = meKey === "p1" ? "p2" : "p1";

  return (
    <div
      className={`absolute ${isMobileScreen ? "right-0.5" : "right-3"} top-1/2 -translate-y-1/2 z-10 flex flex-col ${isMobileScreen ? "gap-1" : "gap-6"} ${
        dragFromHand ? "pointer-events-none" : "pointer-events-auto"
      } text-white select-none`}
    >
      {/* Opponent resources (top) */}
      <PlayerResourceColumn
        player={opponentKey}
        isMe={false}
        readOnly={readOnly}
        dragFromHand={dragFromHand}
      />

      {/* Own resources (bottom) */}
      <PlayerResourceColumn
        player={meKey}
        isMe={true}
        readOnly={readOnly}
        dragFromHand={dragFromHand}
      />
    </div>
  );
}
