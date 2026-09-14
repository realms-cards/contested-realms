"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { RcButton } from "@/components/ui/rc-button";

type UniqueDragon = {
  cardId: number;
  name: string;
  elements: string | null;
  slug: string | null;
  variantId: number | null;
  typeText: string | null;
  rulesText: string | null;
  thresholds: Record<string, number> | null;
};

type ChampionInfo = {
  cardId: number;
  name: string;
  slug: string | null;
  rulesText: string | null;
};

interface DragonlordChampionModalProps {
  isOpen: boolean;
  currentChampion: ChampionInfo | null;
  onSelect: (dragon: UniqueDragon) => void;
  onClose: () => void;
}

export default function DragonlordChampionModal({
  isOpen,
  currentChampion,
  onSelect,
  onClose,
}: DragonlordChampionModalProps) {
  const [dragons, setDragons] = useState<UniqueDragon[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDragon, setSelectedDragon] = useState<UniqueDragon | null>(
    null
  );

  // Fetch unique dragons when modal opens
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/cards/unique-dragons");
        if (!res.ok) throw new Error("Failed to fetch dragons");
        const data = await res.json();
        if (!cancelled) {
          setDragons(data.dragons || []);
          // Pre-select current champion if it exists
          if (currentChampion) {
            const match = (data.dragons || []).find(
              (d: UniqueDragon) => d.cardId === currentChampion.cardId
            );
            if (match) setSelectedDragon(match);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, currentChampion]);

  const handleConfirm = useCallback(() => {
    if (selectedDragon) {
      onSelect(selectedDragon);
    }
  }, [selectedDragon, onSelect]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(6,10,20,0.82)] backdrop-blur-[4px]">
      <div className="relative w-[min(95vw,900px)] max-h-[90vh] rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] text-rc-fg shadow-[0_18px_40px_rgba(0,0,0,0.55),0_0_18px_rgba(243,207,106,0.2)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-rc-line/12 bg-gradient-to-r from-rc-accent/8 to-transparent">
          <div>
            <h2 className="m-0 font-rc-display text-[28px] leading-[1.1] text-rc-fg-strong">
              Choose Your Champion Dragon
            </h2>
            <p className="mt-1 font-rc-sans text-sm text-rc-fg-muted">
              As Dragonlord, select a Unique Dragon whose genesis ability you
              can invoke.
            </p>
          </div>
          <button
            onClick={onClose}
            className="cursor-pointer p-2 rounded-rc-md text-rc-fg-muted transition-colors hover:bg-rc-line/6 hover:text-rc-fg-strong"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="thin-scrollbar flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="rc-hint text-center py-12">
              Loading dragons...
            </div>
          ) : error ? (
            <div className="text-center py-12 font-rc-sans text-sm text-rc-danger-ink">{error}</div>
          ) : dragons.length === 0 ? (
            <div className="rc-hint text-center py-12">
              No dragons found
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {dragons.map((dragon) => {
                const isSelected = selectedDragon?.cardId === dragon.cardId;
                const isCurrent = currentChampion?.cardId === dragon.cardId;
                return (
                  <button
                    key={dragon.cardId}
                    onClick={() => setSelectedDragon(dragon)}
                    className={`relative cursor-pointer rounded-rc-md overflow-hidden transition-all ${
                      isSelected
                        ? "ring-2 ring-rc-accent scale-105 shadow-[0_0_14px_rgba(243,207,106,0.25)]"
                        : "ring-1 ring-rc-line/18 hover:ring-rc-accent/40"
                    }`}
                  >
                    <div className="aspect-[3/4] relative bg-black/45">
                      <Image
                        src={
                          dragon.slug
                            ? `/api/images/${dragon.slug}`
                            : "/api/assets/cardback_spellbook.png"
                        }
                        alt={dragon.name}
                        fill
                        className="object-cover"
                        sizes="200px"
                      />
                      {isCurrent && (
                        <Badge
                          tone="gold"
                          className="absolute top-2 left-2 bg-[rgba(9,13,25,0.92)] shadow-rc-sm"
                        >
                          CURRENT
                        </Badge>
                      )}
                    </div>
                    <div className="p-2 bg-[rgba(7,10,20,0.9)]">
                      <div className="truncate font-rc-display text-[15px] leading-tight text-rc-fg-strong">
                        {dragon.name}
                      </div>
                      {dragon.elements && (
                        <div className="mt-0.5 font-rc-mono text-[10px] tracking-[0.08em] text-rc-fg-subtle">
                          {dragon.elements}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected dragon details */}
        {selectedDragon && (
          <div className="px-5 py-3 border-t border-rc-line/12 bg-black/30">
            <div className="flex items-start gap-4">
              <div className="w-16 h-20 relative rounded-rc-sm overflow-hidden ring-1 ring-rc-line/18 flex-shrink-0">
                <Image
                  src={
                    selectedDragon.slug
                      ? `/api/images/${selectedDragon.slug}`
                      : "/api/assets/cardback_spellbook.png"
                  }
                  alt={selectedDragon.name}
                  fill
                  className="object-cover"
                  sizes="64px"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-rc-display text-[20px] leading-tight text-rc-fg-strong">
                  {selectedDragon.name}
                </div>
                <div className="rc-hint mb-1">
                  {selectedDragon.typeText || "Unique Dragon"}
                </div>
                {selectedDragon.rulesText && (
                  <div className="font-rc-sans text-sm text-rc-fg-muted leading-snug line-clamp-3">
                    {selectedDragon.rulesText}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-rc-line/12">
          <RcButton variant="outline" onClick={onClose}>
            Cancel
          </RcButton>
          <RcButton onClick={handleConfirm} disabled={!selectedDragon}>
            {currentChampion ? "Change Champion" : "Select Champion"}
          </RcButton>
        </div>
      </div>
    </div>
  );
}
