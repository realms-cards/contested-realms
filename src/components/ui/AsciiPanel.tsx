"use client";

import React from "react";

interface AsciiPanelProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * AsciiPanel
 * Lightweight wrapper that gives content a gritty ASCII-style frame using
 * block characters at the corners and dotted rules. Pure CSS/DOM, no layout thrash.
 */
export default function AsciiPanel({ children, className = "" }: AsciiPanelProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const measureRef = React.useRef<HTMLSpanElement | null>(null);
  const [hovered, setHovered] = React.useState(false);
  const [frame, setFrame] = React.useState(0);
  const [counts, setCounts] = React.useState({ h: 0, v: 0 });

  const H = ["─", "╌", "·", "-", "—", "*"];
  const V = ["│", "┆", ":", "|", "¦", "+"]; // vertical-like
  const C = ["✶", "✷", "✺", "✹", "✵", "✧", "✦", "*"]; // corners

  // Recompute how many characters we can fit along edges
  const recomputeCounts = React.useCallback(() => {
    const el = containerRef.current;
    const meas = measureRef.current;
    if (!el || !meas) return;
    const charW = Math.max(1, meas.offsetWidth);
    const charH = Math.max(1, meas.offsetHeight);
    const pad = 24; // inner padding to keep text away from edges
    const w = Math.max(0, el.clientWidth - pad);
    const h = Math.max(0, el.clientHeight - pad);
    const hCount = Math.max(0, Math.floor(w / charW));
    const vCount = Math.max(0, Math.floor(h / charH));
    setCounts({ h: hCount, v: vCount });
  }, []);

  React.useEffect(() => {
    recomputeCounts();
  }, [recomputeCounts]);

  React.useEffect(() => {
    const onResize = () => recomputeCounts();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [recomputeCounts]);

  // Hover animation: mix characters by advancing a frame index
  React.useEffect(() => {
    if (!hovered) return;
    const id = window.setInterval(() => setFrame((f) => (f + 1) % 1024), 140);
    return () => window.clearInterval(id);
  }, [hovered]);

  const hChar = H[frame % H.length];
  const vChar = V[Math.floor(frame / 2) % V.length];
  const cChar = C[Math.floor(frame / 3) % C.length];

  // Build edge strings (minimal and lightweight)
  const topStr = counts.h > 2 ? hChar.repeat(counts.h) : "";
  const botStr = topStr;
  const leftStr = counts.v > 2 ? Array.from({ length: counts.v }, () => vChar).join("\n") : "";
  const rightStr = leftStr;

  return (
    <div
      ref={containerRef}
      className={`relative p-6 overflow-hidden ${className}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Minimal ASCII-like border (pure characters) */}
      <span ref={measureRef} className="invisible absolute font-mono text-[10px] leading-[1]">─</span>
      <div className="pointer-events-none select-none absolute inset-0 font-mono text-[10px] leading-[1] text-white/60" aria-hidden>
        {/* Corners */}
        <div className="absolute top-1 left-1">{cChar}</div>
        <div className="absolute top-1 right-1">{cChar}</div>
        <div className="absolute bottom-1 left-1">{cChar}</div>
        <div className="absolute bottom-1 right-1">{cChar}</div>
        {/* Horizontal */}
        {topStr && (
          <div className="absolute left-4 right-4 top-1 overflow-hidden whitespace-nowrap">{topStr}</div>
        )}
        {botStr && (
          <div className="absolute left-4 right-4 bottom-1 overflow-hidden whitespace-nowrap">{botStr}</div>
        )}
        {/* Vertical */}
        {leftStr && (
          <pre className="absolute top-3 bottom-3 left-1 whitespace-pre leading-[1]">{leftStr}</pre>
        )}
        {rightStr && (
          <pre className="absolute top-3 bottom-3 right-1 whitespace-pre leading-[1] text-right">{rightStr}</pre>
        )}
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  );
}
