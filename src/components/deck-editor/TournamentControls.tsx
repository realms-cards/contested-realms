"use client";

import Image from "next/image";
import type { SearchResult } from "@/lib/game/types";

type StandardSiteName = "Spire" | "Stream" | "Valley" | "Wasteland";

interface TournamentControlsProps {
  isVisible: boolean;
  mode?: "standard" | "cube";
  onClose: () => void;
  spellslingerCard: SearchResult | null;
  standardSites: Record<StandardSiteName, SearchResult | null>;
  onAddSpellslinger: () => void;
  onAddStandardSite: (name: StandardSiteName) => void;
  cubeStandardCards?: SearchResult[];
  onAddCubeStandardCard?: (card: SearchResult) => void;
}

const STANDARD_SITE_NAMES: StandardSiteName[] = [
  "Spire",
  "Stream",
  "Valley",
  "Wasteland",
];

export default function TournamentControls({
  isVisible,
  mode,
  onClose,
  spellslingerCard,
  standardSites,
  onAddSpellslinger,
  onAddStandardSite,
  cubeStandardCards,
  onAddCubeStandardCard,
}: TournamentControlsProps) {
  if (!isVisible) return null;

  const showStandardSections = !mode || mode === "standard";
  const showCubeExtras =
    (!mode || mode === "cube") &&
    Array.isArray(cubeStandardCards) &&
    cubeStandardCards.length > 0;

  return (
    <div className="absolute bottom-6 right-6 z-30 pointer-events-auto">
      <div className="bg-black/90 backdrop-blur-sm rounded-lg p-4 ring-1 ring-white/30 shadow-xl max-w-sm">
        <div className="flex items-center justify-end mb-3">
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white text-xl leading-none mr-2"
            title="Close"
          >
            ×
          </button>
        </div>

        {showStandardSections && (
          <>
            {/* Spellslinger Avatar - Display as card */}
            <div className="mb-4">
              <div className="text-xs uppercase opacity-70 text-white mb-2">
                Default Avatar
              </div>
              <div className="flex justify-center">
                <button
                  onClick={onAddSpellslinger}
                  className="group relative hover:bg-white/10 rounded p-1 transition-colors"
                  title="Add Spellslinger avatar to your deck"
                >
                  <div className="relative aspect-[3/4] rounded overflow-hidden bg-black/40">
                    <Image
                      src={
                        spellslingerCard?.slug
                          ? `/api/images/${spellslingerCard.slug}`
                          : "/api/assets/cardback_spellbook.png"
                      }
                      alt="Spellslinger"
                      fill
                      className="object-contain"
                      sizes="120px"
                    />
                  </div>
                  <div className="mt-1 text-[10px] text-center opacity-80 text-white">
                    Spellslinger
                  </div>
                </button>
              </div>
            </div>

            {/* Standard Sites */}
            <div className="text-xs uppercase opacity-70 text-white mb-2">
              Standard Sites
            </div>
            <div className="grid grid-cols-4 gap-2">
              {STANDARD_SITE_NAMES.map((name: StandardSiteName) => {
                const hit = standardSites[name];
                return (
                  <button
                    key={name}
                    onClick={() => onAddStandardSite(name)}
                    className="group relative hover:bg-white/10 rounded p-1 transition-colors"
                    title={`Add ${name} to your Atlas`}
                  >
                    <div className="relative aspect-[4/3] rounded overflow-hidden bg-black/40 transform rotate-90">
                      <Image
                        src={
                          hit?.slug
                            ? `/api/images/${hit.slug}`
                            : "/api/assets/cardback_atlas.png"
                        }
                        alt={name}
                        fill
                        className="object-contain"
                        sizes="80px"
                      />
                    </div>
                    <div className="mt-1 text-[10px] text-center opacity-80 text-white">
                      {name}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Cube standard cards (optional) */}
        {showCubeExtras && Array.isArray(cubeStandardCards) && (
          <div className="mt-4">
            <div className="text-xs uppercase opacity-70 text-white mb-2">
              Cube Extras
            </div>
            <div className="grid grid-cols-4 gap-2">
              {cubeStandardCards.map((card) => (
                <button
                  key={`${card.cardId}:${card.slug}`}
                  onClick={() => onAddCubeStandardCard?.(card)}
                  className="group relative hover:bg-white/10 rounded p-1 transition-colors"
                  title={`Add ${card.cardName} to your deck`}
                >
                  <div className="relative aspect-[3/4] rounded overflow-hidden bg-black/40">
                    <Image
                      src={
                        card.slug
                          ? `/api/images/${card.slug}`
                          : "/api/assets/cardback_spellbook.png"
                      }
                      alt={card.cardName}
                      fill
                      className="object-contain"
                      sizes="120px"
                    />
                  </div>
                  <div className="mt-1 text-[10px] text-center opacity-80 text-white line-clamp-2">
                    {card.cardName}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export type { TournamentControlsProps, StandardSiteName };
