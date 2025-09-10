"use client";

import { useMemo } from "react";
import { useGameStore } from "@/lib/game/store";
import { useCardTexture } from "@/lib/game/textures/useCardTexture";

interface PreloadTextureProps {
  slug?: string;
  textureUrl?: string;
}

function PreloadTexture({ slug, textureUrl }: PreloadTextureProps) {
  const tex = useCardTexture({ slug, textureUrl });
  // Keep textures in memory by referencing them
  void tex;
  return null;
}

// Invisible component that preloads textures for ALL cards in the match
export default function TextureCache() {
  const zones = useGameStore((s) => s.zones);
  
  // Get ALL cards in the match to keep textures loaded
  const preloadSlugs = useMemo(() => {
    const slugs = new Set<string>();
    
    // Load ALL cards from both players' zones
    for (const player of ["p1", "p2"] as const) {
      const playerZones = zones[player];
      
      // ALL cards from spellbook
      for (const card of playerZones.spellbook) {
        if (card?.slug) {
          slugs.add(card.slug);
        }
      }
      
      // ALL cards from atlas  
      for (const card of playerZones.atlas) {
        if (card?.slug) {
          slugs.add(card.slug);
        }
      }
      
      // ALL cards currently in hand
      for (const card of playerZones.hand) {
        if (card?.slug) {
          slugs.add(card.slug);
        }
      }
      
      // ALL cards from graveyard
      for (const card of playerZones.graveyard) {
        if (card?.slug) {
          slugs.add(card.slug);
        }
      }
      
      // Tokens are ad-hoc; no dedicated pile in zones
    }
    
    return Array.from(slugs);
  }, [zones]);
  
  return (
    <>
      {/* Preload all card textures */}
      {preloadSlugs.map((slug) => (
        <PreloadTexture key={slug} slug={slug} />
      ))}
      {/* Cardback textures are now handled by CardbackTextureProvider */}
    </>
  );
}
