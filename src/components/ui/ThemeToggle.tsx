"use client";

import { usePathname } from "next/navigation";
import React from "react";
import { useTheme } from "@/lib/contexts/ThemeContext";

function isGameView(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const prefixes = [
    "/play",
    "/online/play",
    "/draft",
    "/draft-3d",
    "/editor-3d",
    "/decks/editor-3d",
    "/replay",
    "/sealed",
  ];
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export default function ThemeToggle() {
  const { mode, toggle } = useTheme();
  const pathname = usePathname();
  const hide = isGameView(pathname);

  if (hide) return null;

  return (
    <div className="fixed bottom-4 left-4 z-[70] pointer-events-auto">
      <button
        onClick={toggle}
        className="
          inline-flex items-center gap-2 px-3 py-1.5
          rounded-full border border-white/20 bg-white/10
          text-[13px] text-white/90 backdrop-blur-sm
          hover:bg-white/15 hover:border-white/30
          transition-colors duration-150
          focus:outline-none focus:ring-1 focus:ring-white/40
        "
        aria-label="Toggle theme mode"
        title={`Switch to ${mode === "grayscale" ? "colorful" : "grayscale"} mode`}
      >
        <span className="inline-block w-2 h-2 rounded-full bg-white/80" />
        <span>{mode === "grayscale" ? "Grayscale" : "Colorful"}</span>
      </button>
    </div>
  );
}
