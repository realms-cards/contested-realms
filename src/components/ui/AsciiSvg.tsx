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
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const probeRef = React.useRef<SVGTextElement | null>(null);
  const longestRef = React.useRef<SVGTextElement | null>(null);
  const [measuredCharWidth, setMeasuredCharWidth] = React.useState<number | null>(null);
  const textRef = React.useRef<SVGTextElement | null>(null);
  const [contentViewWidth, setContentViewWidth] = React.useState<number | null>(null);

  const lines = React.useMemo(
    () => text.replace(/\r\n?/g, "\n").split("\n"),
    [text]
  );
  // Measure columns using lines with trailing whitespace trimmed so we don't
  // include empty right-side margins in the viewBox width.
  const measureLines = React.useMemo(
    () => lines.map((l) => l.replace(/[\t ]+$/g, "")),
    [lines]
  );
  const cols = React.useMemo(
    () => measureLines.reduce((m, l) => Math.max(m, l.length), 0),
    [measureLines]
  );
  const longestMeasureLine = React.useMemo(
    () => measureLines.reduce((a, b) => (b.length > a.length ? b : a), ""),
    [measureLines]
  );
  React.useEffect(() => {
    // Quick initial probe ensures we have a baseline even before BBox is available.
    const probe = probeRef.current;
    const svg = svgRef.current;
    if (probe && svg) {
      try {
        const cssLen = probe.getComputedTextLength();
        const cssSvgW = svg.getBoundingClientRect().width;
        const fallbackViewW = Math.max(1, cols) * charWidth;
        if (cssSvgW > 0 && cssLen > 0) {
          const vbPerCss = fallbackViewW / cssSvgW;
          const cw = (cssLen / PROBE_COUNT) * vbPerCss;
          if (isFinite(cw) && cw > 0) setMeasuredCharWidth((prev) => prev ?? cw);
        }
      } catch {
        // ignore
      }
    }

    // Measure actual content width in viewBox units from the real rendered text block.
    const textNode = textRef.current as unknown as SVGGraphicsElement | null;
    if (!textNode || cols === 0) return;
    try {
      const box = textNode.getBBox();
      if (box && isFinite(box.width) && box.width > 0) {
        if (Math.abs((contentViewWidth ?? 0) - box.width) > 0.5) {
          setContentViewWidth(box.width);
        }
        const cw = box.width / Math.max(1, cols);
        if (isFinite(cw) && cw > 0 && Math.abs(cw - (measuredCharWidth ?? charWidth)) > 0.05) {
          setMeasuredCharWidth(cw);
        }
      }
    } catch {
      // ignore
    }
  }, [cols, fontSize, text, charWidth, contentViewWidth, measuredCharWidth]);

  const cw = measuredCharWidth ?? charWidth;
  const rows = lines.length + padTopLines + padBottomLines;
  const fallbackWidth = Math.max(1, cols) * cw;
  const width = Math.max(1, contentViewWidth ?? fallbackWidth);
  const height = Math.max(1, rows) * lineHeight;

  if (!text) return null;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio={preserveAspectRatio}
      className={`block w-full h-auto ${className}`}
      style={style}
      aria-hidden
    >
      {/* Hidden measurement nodes */}
      <text
        ref={probeRef}
        xmlSpace="preserve"
        fontFamily={DEFAULT_FONT_STACK}
        fontSize={fontSize}
        visibility="hidden"
      >
        {PROBE_TEXT}
      </text>
      <text
        ref={longestRef}
        xmlSpace="preserve"
        fontFamily={DEFAULT_FONT_STACK}
        fontSize={fontSize}
        visibility="hidden"
      >
        {longestMeasureLine || " "}
      </text>
      <text
        xmlSpace="preserve"
        fontFamily={DEFAULT_FONT_STACK}
        fontSize={fontSize}
        fill="currentColor"
        ref={textRef}
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

const PROBE_COUNT = 100;
const PROBE_TEXT = "0".repeat(PROBE_COUNT);
