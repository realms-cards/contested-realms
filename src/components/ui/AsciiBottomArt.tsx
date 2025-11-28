"use client";

import Image from "next/image";
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
  maxVh = null,
  opacityClass = "text-white/10",
}: {
  className?: string;
  /** Max height as percentage of viewport height */
  maxVh?: number | null;
  /** Tailwind color utility for the ASCII characters */
  opacityClass?: string;
}) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  const imgStyle: React.CSSProperties = {
    width: "100%",
    height: "auto",
  };

  if (typeof maxVh === "number" && maxVh > 0) {
    imgStyle.maxHeight = `${maxVh}vh`;
  }
  try {
    const m = opacityClass.match(/text-white\/(\d{1,3})/);
    if (m) {
      const n = Math.max(0, Math.min(100, parseInt(m[1], 10)));
      imgStyle.opacity = n / 100;
    }
  } catch {}

  return (
    <div
      className={`fixed inset-0 z-[5] pointer-events-none select-none flex items-end justify-center ${className}`}
      aria-hidden
    >
      <Image
        src="/home_bg_bot.svg"
        alt=""
        width={818}
        height={399}
        className={`block w-full h-auto ${opacityClass}`}
        style={imgStyle}
        draggable={false}
        priority
      />
    </div>
  );
}
