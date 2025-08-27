import React from "react";

/**
 * NumberBadge — crisp SVG badge for digits 1–9
 * - White filled circle with black outline
 * - Black number centered
 * - Scales cleanly via `size`
 */
export type Digit = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

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
}

export function NumberBadge({
  value,
  size = 64,
  strokeWidth = 8,
  fontScale = 0.62,
  className,
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
        fill="#fff"
        stroke="#000"
        strokeWidth={strokeWidth}
      />
      <text
        x={50}
        y={50}
        textAnchor="middle"
        dominantBaseline="central"
        fill="#000"
        fontWeight={800}
        fontSize={fontScale * 100}
        style={{
          fontFamily: "Times New Roman, serif",
          userSelect: "none",
        }}
      >
        {value}
      </text>
    </svg>
  );
}

// Demo for the canvas preview. In your app, import { NumberBadge } and use it directly.
export default function PreviewGrid() {
  return (
    <div className="grid grid-cols-9 gap-3 p-6 bg-black min-h-screen place-items-center">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
        <NumberBadge key={n} value={n as Digit} size={72} strokeWidth={8} />
      ))}
    </div>
  );
}
