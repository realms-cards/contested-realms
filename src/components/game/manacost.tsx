import React from "react";
import { useTouchDevice } from "@/lib/hooks/useTouchDevice";

/**
 * NumberBadge — crisp SVG badge for digits 0–9
 * - White filled circle with black outline
 * - Black number centered
 * - Scales cleanly via `size`
 */
export type Digit = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface NumberBadgeProps {
  value: Digit;
  /** Render size in CSS pixels */
  size?: number;
  /** Stroke width (in SVG viewBox units; scales with size). Default 8. */
  strokeWidth?: number;
  /** Number font size as a fraction of the icon size (0–1). Default 0.62. */
  fontScale?: number;
  /** Optional className passthrough */
  className?: string;
  /** Background circle opacity (0–1). Default 1. */
  backgroundOpacity?: number;
  textAsSvg?: boolean;
}

export function NumberBadge({
  value,
  size = 64,
  strokeWidth = 8,
  fontScale = 0.62,
  className,
  backgroundOpacity = 1,
  textAsSvg = false,
}: NumberBadgeProps) {
  // viewBox is 100x100; compute a radius that leaves room for the stroke
  const radius = 50 - strokeWidth / 2 - 1; // 1 unit of breathing room inside

  return (
    <div
      role="img"
      aria-label={`Number ${value}`}
      className={className}
      style={{
        width: size,
        height: size,
        display: "inline-block",
        position: "relative",
      }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        style={{ display: "block" }}
      >
        <circle
          cx={50}
          cy={50}
          r={radius}
          fill="#000"
          stroke="#6B7280"
          strokeWidth={strokeWidth}
          fillOpacity={backgroundOpacity}
        />
        {textAsSvg && (
          <text
            x={50}
            y={50}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#fff"
            fontWeight={800}
            fontSize={fontScale * 100}
            className="font-fantaisie select-none"
            style={{ pointerEvents: "none", userSelect: "none" }}
          >
            {value}
          </text>
        )}
      </svg>
      {!textAsSvg && (
        <span
          className="font-fantaisie select-none"
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            color: "#fff",
            fontWeight: 800,
            fontSize: fontScale * size,
            lineHeight: 1,
            userSelect: "none",
            pointerEvents: "none",
          }}
        >
          {value}
        </span>
      )}
    </div>
  );
}

export interface ManaCounterProps {
  /** Current available (remaining) mana value */
  value: number;
  /** Total mana from untapped sites (optional, for "remaining/total" display) */
  total?: number;
  /** Increase by +1 (disabled externally if desired) */
  onIncrement?: () => void;
  /** Decrease by -1 (disabled externally if desired) */
  onDecrement?: () => void;
  /** Disable the + button */
  disableInc?: boolean;
  /** Disable the - button */
  disableDec?: boolean;
  /** Badge size in px */
  size?: number;
  className?: string;
}

/**
 * ManaCounter — displays the current available mana as NumberBadge digits
 * with +/- controls. Pure UI; pass handlers from the caller.
 */
export function ManaCounter({
  value,
  onIncrement,
  onDecrement,
  disableInc,
  disableDec,
  size = 56,
  className,
}: ManaCounterProps) {
  const digits = Math.max(0, Math.floor(value))
    .toString()
    .split("")
    .map((d) => Number(d) as Digit);

  return (
    <div className={"flex flex-col items-center gap-2 " + (className ?? "")}>
      <button
        type="button"
        aria-label="Increase available mana"
        title="Increase available mana"
        disabled={!!disableInc}
        onClick={(e) => {
          e.stopPropagation();
          if (!disableInc) onIncrement?.();
        }}
        className={`h-6 w-6 rounded-full border flex items-center justify-center text-base font-bold leading-none ${
          disableInc
            ? "bg-black/30 border-white/10 text-white/40 cursor-default"
            : "bg-black/60 border-white/30 text-white hover:bg-black/70"
        }`}
      >
        +
      </button>

      {/* Value as badges; show single 0 badge when value is 0 */}
      <div className="flex items-center gap-1 select-none font-fantaisie">
        {digits.length === 0 ? (
          <NumberBadge value={0} size={size} strokeWidth={6} />
        ) : (
          digits.map((d, i) => (
            <NumberBadge key={i} value={d} size={size} strokeWidth={6} />
          ))
        )}
      </div>

      <button
        type="button"
        aria-label="Decrease available mana"
        title="Decrease available mana"
        disabled={!!disableDec}
        onClick={(e) => {
          e.stopPropagation();
          if (!disableDec) onDecrement?.();
        }}
        className={`h-6 w-6 rounded-full border flex items-center justify-center text-base font-bold leading-none ${
          disableDec
            ? "bg-black/30 border-white/10 text-white/40 cursor-default"
            : "bg-black/60 border-white/30 text-white hover:bg-black/70"
        }`}
      >
        −
      </button>
    </div>
  );
}

/**
 * ManaCounterHUD — compact variant for in-game HUD showing available mana.
 * Displays remaining/total mana (e.g., "2/3") with visible +/- buttons on hover.
 */
export function ManaCounterHUD({
  value,
  total,
  onIncrement,
  onDecrement,
  disableInc,
  disableDec,
  size = 56,
  className,
}: ManaCounterProps) {
  const isTouchDevice = useTouchDevice();
  // Font size scales with badge size
  const fontSize = Math.round(size * 0.7);
  const slashSize = Math.round(size * 0.5);
  const btnSize = Math.max(12, Math.round(size * 0.6));
  // Show remaining/total if total is provided, otherwise just value
  const showTotal = typeof total === "number";

  return (
    <div className={"flex items-center gap-1 group " + (className ?? "")}>
      {/* Minus button - visible on hover */}
      <button
        type="button"
        aria-label="Decrease available mana"
        title="Decrease available mana"
        disabled={!!disableDec}
        onClick={(e) => {
          e.stopPropagation();
          if (!disableDec) onDecrement?.();
        }}
        style={{ width: btnSize, height: btnSize, fontSize: btnSize * 0.7 }}
        className={`flex items-center justify-center rounded-full font-bold leading-none transition-all ${
          disableDec
            ? "opacity-20 cursor-not-allowed bg-black/20 text-white/30"
            : isTouchDevice
            ? "opacity-100 bg-rose-600/80 hover:bg-rose-500 text-white cursor-pointer"
            : "opacity-0 group-hover:opacity-100 bg-rose-600/80 hover:bg-rose-500 text-white cursor-pointer"
        }`}
      >
        −
      </button>

      {/* Compact mana display: remaining/total */}
      <div
        className="flex items-center select-none font-mono tabular-nums text-white"
        style={{ fontSize, lineHeight: 1 }}
        title={
          showTotal
            ? `${value} remaining / ${total} total mana`
            : "Available mana"
        }
      >
        <span
          className={
            value === 0
              ? "text-red-500"
              : value < (total ?? value)
              ? "text-amber-400"
              : ""
          }
          style={{
            minWidth: "1ch",
            textAlign: "right",
            display: "inline-block",
          }}
        >
          {value}
        </span>
        {showTotal && (
          <>
            <span
              className="text-white/50 mx-px"
              style={{ fontSize: slashSize }}
            >
              /
            </span>
            <span
              className="text-white/70"
              style={{
                minWidth: "1ch",
                textAlign: "left",
                display: "inline-block",
              }}
            >
              {total}
            </span>
          </>
        )}
      </div>

      {/* Plus button - visible on hover */}
      <button
        type="button"
        aria-label="Increase available mana"
        title="Increase available mana"
        disabled={!!disableInc}
        onClick={(e) => {
          e.stopPropagation();
          if (!disableInc) onIncrement?.();
        }}
        style={{ width: btnSize, height: btnSize, fontSize: btnSize * 0.7 }}
        className={`flex items-center justify-center rounded-full font-bold leading-none transition-all ${
          disableInc
            ? "opacity-20 cursor-not-allowed bg-black/20 text-white/30"
            : isTouchDevice
            ? "opacity-100 bg-emerald-600/80 hover:bg-emerald-500 text-white cursor-pointer"
            : "opacity-0 group-hover:opacity-100 bg-emerald-600/80 hover:bg-emerald-500 text-white cursor-pointer"
        }`}
      >
        +
      </button>
    </div>
  );
}

// Demo for the canvas preview. In your app, import { NumberBadge } and use it directly.
export default function PreviewGrid() {
  return (
    <div className="grid grid-cols-9 gap-3 p-6 bg-black min-h-screen place-items-center">
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
        <NumberBadge key={n} value={n as Digit} size={72} strokeWidth={8} />
      ))}
    </div>
  );
}
