import React from "react";

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
}

export function NumberBadge({
  value,
  size = 64,
  strokeWidth = 8,
  fontScale = 0.62,
  className,
  backgroundOpacity = 1,
}: NumberBadgeProps) {
  // viewBox is 100x100; compute a radius that leaves room for the stroke
  const radius = 50 - strokeWidth / 2 - 1; // 1 unit of breathing room inside

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={`Number ${value}`}
      className={className}
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
      <text
        x={50}
        y={50}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#fff"
        fontWeight={800}
        fontSize={fontScale * 100}
        className="font-fantaisie select-none"
        dy="0.1em"
        style={{ userSelect: "none" }}
      >
        {value}
      </text>
    </svg>
  );
}

export interface ManaCounterProps {
  /** Current available mana value */
  value: number;
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
 * ManaCounterHUD — compact variant for in-game HUD with smaller +/- buttons.
 * API mirrors ManaCounter to avoid breaking callers.
 */
export function ManaCounterHUD({
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
    <div className={"flex flex-col items-center " + (className ?? "")}>
      <div className="relative inline-flex group">
        <div className="flex items-center gap-1 select-none font-fantaisie">
          {digits.length === 0 ? (
            <NumberBadge value={0} size={size} strokeWidth={6} />
          ) : (
            digits.map((d, i) => (
              <NumberBadge key={i} value={d} size={size} strokeWidth={6} />
            ))
          )}
        </div>

        {/* Overlay click zones: top half = increment, bottom half = decrement */}
        <div className="absolute inset-0 flex flex-col opacity-80">
          <button
            type="button"
            aria-label="Increase available mana"
            title="Increase available mana"
            disabled={!!disableInc}
            onClick={(e) => {
              e.stopPropagation();
              if (!disableInc) onIncrement?.();
            }}
            className={`flex-1 transition-opacity rounded-t-xl ${
              disableInc ? "cursor-not-allowed" : "cursor-pointer"
            } ${
              disableInc ? "opacity-40" : "opacity-0 group-hover:opacity-100"
            } bg-transparent group-hover:bg-emerald-500/20 hover:bg-emerald-500/30`}
          >
            <span className="sr-only">+</span>
          </button>
          <button
            type="button"
            aria-label="Decrease available mana"
            title="Decrease available mana"
            disabled={!!disableDec}
            onClick={(e) => {
              e.stopPropagation();
              if (!disableDec) onDecrement?.();
            }}
            className={`flex-1 transition-opacity rounded-b-xl ${
              disableDec ? "cursor-not-allowed" : "cursor-pointer"
            } ${
              disableDec ? "opacity-40" : "opacity-0 group-hover:opacity-100"
            } bg-transparent group-hover:bg-rose-500/20 hover:bg-rose-500/30`}
          >
            <span className="sr-only">−</span>
          </button>
        </div>
      </div>
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
