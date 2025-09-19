"use client";

import React from "react";

const DEFAULT_FONT_STACK =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "DejaVu Sans Mono", monospace';

type AsciiSvgProps = {
  text: string;
  className?: string;
  style?: React.CSSProperties;
  /** Width of a single character cell in the viewBox coordinate system */
  charWidth?: number;
  /** Line height (vertical advance) in the viewBox coordinate system */
  lineHeight?: number;
  /** Text font size in the viewBox coordinate system */
  fontSize?: number;
  /** Optional number of empty lines to add above the content */
  padTopLines?: number;
  /** Optional number of empty lines to add below the content to avoid cropping descenders */
  padBottomLines?: number;
  /** SVG preserveAspectRatio; defaults to 'xMidYMid meet'. */
  preserveAspectRatio?: string;
};

export default function AsciiSvg({
  text,
  className = "",
  style,
  charWidth = 7,
  lineHeight = 10,
  fontSize = 10,
  padTopLines = 0,
  padBottomLines = 0,
  preserveAspectRatio = "xMidYMid meet",
}: AsciiSvgProps) {
  const lines = React.useMemo(
    () => text.replace(/\r\n?/g, "\n").split("\n"),
    [text]
  );
  const cols = React.useMemo(
    () => lines.reduce((m, l) => Math.max(m, l.length), 0),
    [lines]
  );
  const rows = lines.length + padTopLines + padBottomLines;
  const width = Math.max(1, cols) * charWidth;
  const height = Math.max(1, rows) * lineHeight;

  if (!text) return null;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio={preserveAspectRatio}
      className={`block w-full h-auto ${className}`}
      style={style}
      aria-hidden
    >
      <text
        xmlSpace="preserve"
        fontFamily={DEFAULT_FONT_STACK}
        fontSize={fontSize}
        fill="currentColor"
      >
        {/* Top padding lines */}
        {Array.from({ length: padTopLines }).map((_, i) => (
          <tspan key={`pad-top-${i}`} x={0} y={(i + 1) * lineHeight}>
            {" "}
          </tspan>
        ))}
        {/* Content lines */}
        {lines.map((line, i) => (
          <tspan key={`line-${i}`} x={0} y={(padTopLines + i + 1) * lineHeight}>
            {line || " "}
          </tspan>
        ))}
        {/* Bottom padding lines */}
        {Array.from({ length: padBottomLines }).map((_, i) => (
          <tspan key={`pad-bot-${i}`} x={0} y={(padTopLines + lines.length + i + 1) * lineHeight}>
            {" "}
          </tspan>
        ))}
      </text>
    </svg>
  );
}
