"use client";

import React from "react";

/**
 * AsciiBottomArt
 * Renders /home_bg_bot.txt as a bottom-aligned, behind-everything ASCII background.
 * - Fixed to viewport bottom, centered horizontally
 * - Non-interactive and not selectable
 * - Scales to fit viewport width and up to a max height (default 38vh)
 */
export default function AsciiBottomArt({
  className = "",
  maxVh = 38,
  opacityClass = "text-white/10",
}: {
  className?: string;
  /** Max height as percentage of viewport height */
  maxVh?: number;
  /** Tailwind color utility for the ASCII characters */
  opacityClass?: string;
}) {
  const [art, setArt] = React.useState<string>("");
  const [error, setError] = React.useState<string | null>(null);
  const preRef = React.useRef<HTMLPreElement | null>(null);
  const [scale, setScale] = React.useState<number>(1);
  const [height, setHeight] = React.useState<number | undefined>(undefined);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/home_bg_bot.txt", { cache: "force-cache" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (cancelled) return;
        const lines = text.replace(/\r\n?/g, "\n").split("\n");
        const isVisualBlank = (s: string) =>
          s.replace(/[\s\u2800]+/g, "") === "";
        while (lines.length && isVisualBlank(lines[0])) lines.shift();
        while (lines.length && isVisualBlank(lines[lines.length - 1]))
          lines.pop();
        setArt(lines.join("\n"));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const recomputeScale = React.useCallback(() => {
    const pre = preRef.current;
    if (!pre) return;
    pre.style.transform = "scale(2)";
    pre.style.transformOrigin = "bottom center";
    const vw = typeof window !== "undefined" ? window.innerWidth : 0;
    const vh = typeof window !== "undefined" ? window.innerHeight : 0;
    const availH =
      vh > 0
        ? (vh * Math.max(0, Math.min(100, maxVh))) / 100
        : Number.POSITIVE_INFINITY;
    const sw = pre.scrollWidth;
    const sh = pre.scrollHeight;
    const widthScale = sw > 0 ? vw / sw : 1;
    const heightScale = sh > 0 ? availH / sh : 1;
    const s = Math.min(1, widthScale, heightScale);
    setScale(s);
    setHeight(Math.ceil(sh * s));
  }, [maxVh]);

  React.useEffect(() => {
    recomputeScale();
  }, [art, recomputeScale]);

  React.useEffect(() => {
    const onResize = () => recomputeScale();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [recomputeScale]);

  if (error || !art) {
    return null;
  }

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-0 pointer-events-none select-none flex items-end justify-center ${className}`}
      aria-hidden
    >
      <div style={height ? { height } : undefined}>
        <pre
          ref={preRef}
          style={{
            transform: `scale(${scale})`,
            transformOrigin: "bottom center",
          }}
          className={`whitespace-pre inline-block leading-[1.0] text-[10px] sm:text-[10.5px] md:text-[11px] font-mono ${opacityClass}`}
        >
          {art}
        </pre>
      </div>
    </div>
  );
}
