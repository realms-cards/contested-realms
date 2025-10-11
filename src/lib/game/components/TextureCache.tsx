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
export default function TextureCache({
  mode = "all",
  topN = 5,
  includeOpponent = false,
}: {
  mode?: "all" | "smart";
  topN?: number;
  includeOpponent?: boolean;
}) {
  const zones = useGameStore((s) => s.zones);
  const actorKey = useGameStore((s) => s.actorKey);
  const avatars = useGameStore((s) => s.avatars);

  // Build preload set based on mode
  const preloadSlugs = useMemo(() => {
    const slugs = new Set<string>();

    if (mode === "smart") {
      const me = actorKey ?? "p1";
      const opp = me === "p1" ? "p2" : "p1";
      const meZones = zones?.[me];
      const oppZones = zones?.[opp];

      // Avatars (both)
      const a1 = avatars?.p1?.card?.slug;
      const a2 = avatars?.p2?.card?.slug;
      if (typeof a1 === "string" && a1) slugs.add(a1);
      if (typeof a2 === "string" && a2) slugs.add(a2);

      // My hand (highest priority visually)
      for (const card of meZones?.hand || []) {
        if (card?.slug) slugs.add(card.slug);
      }

      // Top N of my draw piles (spellbook/atlas)
      const takeTop = (arr: Array<{ slug?: string | null }> | undefined) =>
        (arr || []).slice(0, Math.max(0, topN));
      for (const card of takeTop(meZones?.spellbook)) {
        if (card?.slug) slugs.add(card.slug);
      }
      for (const card of takeTop(meZones?.atlas)) {
        if (card?.slug) slugs.add(card.slug);
      }

      // Optionally, a peek of opponent top N (kept small)
      if (includeOpponent) {
        for (const card of takeTop(oppZones?.spellbook)) {
          if (card?.slug) slugs.add(card.slug);
        }
        for (const card of takeTop(oppZones?.atlas)) {
          if (card?.slug) slugs.add(card.slug);
        }
      }

      return Array.from(slugs);
    }

    // Default: preload all zones for both players (legacy behavior)
    for (const player of ["p1", "p2"] as const) {
      const playerZones = zones?.[player];
      if (!playerZones) continue;

      for (const card of playerZones.spellbook) {
        if (card?.slug) slugs.add(card.slug);
      }
      for (const card of playerZones.atlas) {
        if (card?.slug) slugs.add(card.slug);
      }
      for (const card of playerZones.hand) {
        if (card?.slug) slugs.add(card.slug);
      }
      for (const card of playerZones.graveyard) {
        if (card?.slug) slugs.add(card.slug);
      }
    }

    return Array.from(slugs);
  }, [mode, zones, actorKey, avatars, topN, includeOpponent]);

  return (
    <>
      {preloadSlugs.map((slug) => (
        <PreloadTexture key={slug} slug={slug} />
      ))}
    </>
  );
}
