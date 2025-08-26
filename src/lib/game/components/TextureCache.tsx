"use client";

import { useTexture } from "@react-three/drei";
import { useGameStore } from "@/lib/game/store";
import { useMemo } from "react";

// Invisible component that preloads textures for upcoming cards
export default function TextureCache() {
  const zones = useGameStore((s) => s.zones);
  
  // Get all cards that might be drawn soon
  const preloadUrls = useMemo(() => {
    const urls = new Set<string>();
    
    // Preload next 5 cards from both players' spellbooks and atlases
    for (const player of ["p1", "p2"] as const) {
      const playerZones = zones[player];
      
      // Next cards from spellbook
      for (let i = 0; i < Math.min(5, playerZones.spellbook.length); i++) {
        const card = playerZones.spellbook[i];
        if (card?.slug) {
          urls.add(`/api/images/${card.slug}`);
        }
      }
      
      // Next cards from atlas  
      for (let i = 0; i < Math.min(5, playerZones.atlas.length); i++) {
        const card = playerZones.atlas[i];
        if (card?.slug) {
          urls.add(`/api/images/${card.slug}`);
        }
      }
      
      // Cards currently in hand (in case they get reordered)
      for (const card of playerZones.hand) {
        if (card?.slug) {
          urls.add(`/api/images/${card.slug}`);
        }
      }
      
      // Top few cards from graveyard (in case they get moved)
      for (let i = 0; i < Math.min(3, playerZones.graveyard.length); i++) {
        const card = playerZones.graveyard[i];
        if (card?.slug) {
          urls.add(`/api/images/${card.slug}`);
        }
      }
    }
    
    return Array.from(urls);
  }, [zones]);
  
  // Preload all textures off-screen
  const cachedTextures = useTexture(preloadUrls);
  // Keep textures in memory by referencing them
  void cachedTextures;
  
  // This component renders nothing but keeps textures in memory
  return null;
}