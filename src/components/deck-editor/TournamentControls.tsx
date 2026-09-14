"use client";

import Image from "next/image";
import { cardbackAtlasUrl } from "@/lib/assets";
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
      <div className="max-w-sm rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.9)] p-4 text-rc-fg shadow-rc-panel backdrop-blur-sm">
        <div className="flex items-center justify-end mb-3">
          <button
            onClick={onClose}
            className="mr-2 cursor-pointer rounded-rc-md px-2 py-0.5 text-xl leading-none text-rc-fg-muted transition-colors hover:bg-rc-line/6 hover:text-rc-fg-strong"
            title="Close"
          >
            ×
          </button>
        </div>

        {showStandardSections && (
          <>
            {/* Spellslinger Avatar - Display as card */}
            <div className="mb-4">
              <div className="rc-eyebrow mb-2">
                Default Avatar
              </div>
              <div className="flex justify-center">
                <button
                  onClick={onAddSpellslinger}
                  className="group relative cursor-pointer rounded-rc-md p-1 transition-colors hover:bg-rc-accent/8 hover:ring-1 hover:ring-rc-accent/35"
                  title="Add Spellslinger avatar to your deck"
                >
                  <div className="relative aspect-[3/4] rounded-rc-sm overflow-hidden bg-black/40">
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
                  <div className="mt-1 text-center font-rc-sans text-[10px] text-rc-fg-muted transition-colors group-hover:text-rc-fg-strong">
                    Spellslinger
                  </div>
                </button>
              </div>
            </div>

            {/* Standard Sites */}
            <div className="rc-eyebrow mb-2">
              Standard Sites
            </div>
            <div className="grid grid-cols-4 gap-2">
              {STANDARD_SITE_NAMES.map((name: StandardSiteName) => {
                const hit = standardSites[name];
                return (
                  <button
                    key={name}
                    onClick={() => onAddStandardSite(name)}
                    className="group relative cursor-pointer rounded-rc-md p-1 transition-colors hover:bg-rc-accent/8 hover:ring-1 hover:ring-rc-accent/35"
                    title={`Add ${name} to your Atlas`}
                  >
                    <div className="relative aspect-[4/3] rounded-rc-sm overflow-hidden bg-black/40 transform rotate-90">
                      <Image
                        src={
                          hit?.slug
                            ? `/api/images/${hit.slug}`
                            : cardbackAtlasUrl()
                        }
                        alt={name}
                        fill
                        className="object-contain"
                        sizes="80px"
                      />
                    </div>
                    <div className="mt-1 text-center font-rc-sans text-[10px] text-rc-fg-muted transition-colors group-hover:text-rc-fg-strong">
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
            <div className="rc-eyebrow mb-2">
              Cube Extras
            </div>
            <div className="grid grid-cols-4 gap-2">
              {cubeStandardCards.map((card) => (
                <button
                  key={`${card.cardId}:${card.slug}`}
                  onClick={() => onAddCubeStandardCard?.(card)}
                  className="group relative cursor-pointer rounded-rc-md p-1 transition-colors hover:bg-rc-accent/8 hover:ring-1 hover:ring-rc-accent/35"
                  title={`Add ${card.cardName} to your deck`}
                >
                  <div className="relative aspect-[3/4] rounded-rc-sm overflow-hidden bg-black/40">
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
                  <div className="mt-1 text-center font-rc-sans text-[10px] text-rc-fg-muted transition-colors line-clamp-2 group-hover:text-rc-fg-strong">
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
