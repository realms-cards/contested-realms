"use client";

import type { PlayerKey } from "@/lib/game/store";

export interface Hud3DProps {
  owner: PlayerKey; // p1 top, p2 bottom
}

/**
 * 3D HUD component - thresholds and mana have been moved to 2D PlayerResourcePanels.
 * This component is now a no-op placeholder for backwards compatibility.
 */
export default function Hud3D({ owner }: Hud3DProps) {
  // Suppress unused var warning
  void owner;

  // Thresholds moved to 2D PlayerResourcePanels component
  return null;
}
