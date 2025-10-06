"use client";

import { usePathname } from "next/navigation";
import React from "react";
import { useTheme } from "@/lib/contexts/ThemeContext";

function isGameView(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  // Treat these routes as game views and exempt them from grayscale
  const prefixes = [
    "/play",
    "/online/play",
    "/draft",
    "/draft-3d",
    "/editor-3d",
    "/decks/editor-3d",
    "/replay/",
    "/sealed",
  ];
  return prefixes.some((p) => pathname.startsWith(p));
}

export default function ThemeScope({
  children,
}: {
  children: React.ReactNode;
}) {
  const { mode } = useTheme();
  const pathname = usePathname();
  const exempt = isGameView(pathname);

  const applyGrayscale = mode === "grayscale" && !exempt;

  const classNames: string[] = [];
  if (applyGrayscale) classNames.push("grayscale-ui");
  if (exempt) classNames.push("game-font");
  // Even in colorful mode, lower color intensity slightly for a cohesive look (but NOT on game views)
  if (mode === "colorful" && !exempt) classNames.push("color-dim");

  return (
    <div className={classNames.length ? classNames.join(" ") : undefined}>
      {children}
    </div>
  );
}
