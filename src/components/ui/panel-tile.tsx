"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PanelTileProps {
  children: ReactNode;
  className?: string;
  /** Render as a link */
  href?: string;
  onClick?: () => void;
}

/**
 * PanelTile: the large navigational card used on the home route. Panel chrome
 * from the design system - hairline border, inset ink, and a warm gold glow
 * with a 1px lift on hover. It replaces the old AsciiPanel: the character
 * frame and star corners were dropped because they read as a second edge next
 * to the real border.
 */
const TILE =
  "relative block w-full rounded-rc-lg border border-rc-line/7 bg-[rgba(17,24,43,0.45)] p-7 font-rc-sans text-rc-fg no-underline shadow-[inset_0_1px_0_rgba(251,246,232,0.04),inset_0_-1px_0_rgba(0,0,0,0.35)] transition-[background-color,border-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:border-rc-accent/30 hover:bg-rc-accent/6 hover:shadow-[0_0_18px_rgba(243,207,106,0.28),inset_0_1px_0_rgba(251,246,232,0.04),inset_0_-1px_0_rgba(0,0,0,0.35)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rc-accent-ring";

export default function PanelTile({
  children,
  className,
  href,
  onClick,
}: PanelTileProps) {
  if (href) {
    return (
      <Link href={href} className={cn(TILE, "cursor-pointer", className)}>
        {children}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(TILE, "cursor-pointer text-left", className)}
      >
        {children}
      </button>
    );
  }
  return <div className={cn(TILE, className)}>{children}</div>;
}
