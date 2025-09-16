"use client";

import React from "react";

export default function AsciiLogo({ className = "" }: { className?: string }) {
  const [logo, setLogo] = React.useState<string>("");
  const [error, setError] = React.useState<string | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const preRef = React.useRef<HTMLPreElement | null>(null);
  const [scale, setScale] = React.useState<number>(1);
  const [height, setHeight] = React.useState<number | undefined>(undefined);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/realms.cards.txt", { cache: "force-cache" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (cancelled) return;
        // Trim leading/trailing visually blank lines, treating U+2800 as blank
        const lines = text.replace(/\r\n?/g, "\n").split("\n");
        const isVisualBlank = (s: string) =>
          s.replace(/[\s\u2800]+/g, "") === "";
        while (lines.length && isVisualBlank(lines[0])) lines.shift();
        while (lines.length && isVisualBlank(lines[lines.length - 1]))
          lines.pop();
        setLogo(lines.join("\n"));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);


  const recomputeScale = React.useCallback(() => {
    const container = containerRef.current;
    const pre = preRef.current;
    if (!container || !pre) return;
    // Reset to natural size to measure
    pre.style.transform = "scale(1)";
    pre.style.transformOrigin = "top center";
    const cw = container.clientWidth;
    const sw = pre.scrollWidth;
    const vh = typeof window !== "undefined" ? window.innerHeight : 0;
    const availH = vh > 0 ? vh * 0.18 : Number.POSITIVE_INFINITY; // 18vh cap
    const ch = pre.scrollHeight;
    const widthScale = sw > 0 ? cw / sw : 1;
    const heightScale = ch > 0 ? availH / ch : 1;
    const base = Math.min(1, widthScale, heightScale);
    const shrink = 2; // about one-third smaller
    const s = Math.min(1, base * shrink);
    setScale(s);
    setHeight(Math.ceil(ch * s));
  }, []);

  React.useEffect(() => {
    recomputeScale();
  }, [logo, recomputeScale]);

  React.useEffect(() => {
    const onResize = () => recomputeScale();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [recomputeScale]);

  if (error) {
    // Fallback minimal heading when fetch fails
    return (
      <div className={className}>
        <h1 className="text-4xl font-fantaisie font-bold select-none">
          Sorcery
        </h1>
      </div>
    );
  }

  return (
    <div
      className={`${className} select-none overflow-hidden`}
      ref={containerRef}
      style={height ? { height } : undefined}
    >
      <pre
        ref={preRef}
        style={{ transform: `scale(${scale})`, transformOrigin: "top center" }}
        className="
          whitespace-pre inline-block
          leading-[1.0] text-[10px] sm:text-[10.5px] md:text-[11px]
          font-mono
        "
      >
        {logo}
      </pre>
    </div>
  );
}
