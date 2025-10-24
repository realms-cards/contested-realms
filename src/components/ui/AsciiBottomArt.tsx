"use client";

import React from "react";
import { createPortal } from "react-dom";
import AsciiSvg from "@/components/ui/AsciiSvg";

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
  maxVh?: number | null;
  /** Tailwind color utility for the ASCII characters */
  opacityClass?: string;
}) {
  const [art, setArt] = React.useState<string>("");
  const [error, setError] = React.useState<string | null>(null);

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

  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || error || !art) {
    return null;
  }

  const containerStyle: React.CSSProperties = {
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: "hidden",
    display: "flex",
    alignItems: "flex-end",
    width: "100%",
    height: "100%",
  };
  if (typeof maxVh === "number" && maxVh > 0) {
    containerStyle.maxHeight = `${maxVh}vh`;
  } else {
    containerStyle.height = "100vh";
  }

  return createPortal(
    <div
      className={`fixed inset-0 z-0 pointer-events-none select-none ${className}`}
      aria-hidden
      style={containerStyle}
    >
      <AsciiSvg
        text={art}
        className={`w-full h-auto ${opacityClass}`}
        padBottomLines={0}
        preserveAspectRatio="xMidYMax meet"
        style={{ display: "block", width: "100%", height: "auto" }}
      />
    </div>,
    document.body
  );
}
