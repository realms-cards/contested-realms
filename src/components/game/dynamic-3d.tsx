"use client";

import dynamic from "next/dynamic";

/**
 * Dynamic imports for heavy 3D components.
 * These are loaded asynchronously to improve initial page load time.
 *
 * All components are rendered inside a Canvas context, so they receive
 * Three.js JSX elements. The loading state is handled by the parent.
 *
 * Usage:
 *   import { DynamicBoard, DynamicHand3D } from "@/components/game/dynamic-3d";
 *   <Canvas>
 *     <DynamicBoard />
 *   </Canvas>
 */

// Board component - main game board with tiles and positions
export const DynamicBoard = dynamic(() => import("@/lib/game/Board"), {
  ssr: false,
});

// Hand3D component - player's hand of cards
export const DynamicHand3D = dynamic(
  () => import("@/lib/game/components/Hand3D"),
  { ssr: false }
);

// Piles3D component - deck, graveyard, etc.
export const DynamicPiles3D = dynamic(
  () => import("@/lib/game/components/Piles3D"),
  { ssr: false }
);

// Hud3D component - in-canvas HUD elements
export const DynamicHud3D = dynamic(
  () => import("@/lib/game/components/Hud3D"),
  { ssr: false }
);

// TokenPile3D component - token display
export const DynamicTokenPile3D = dynamic(
  () => import("@/lib/game/components/TokenPile3D"),
  { ssr: false }
);
