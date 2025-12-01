"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative w-[min(95vw,900px)] max-h-[90vh] bg-slate-900/95 rounded-xl ring-1 ring-amber-500/40 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/60 bg-gradient-to-r from-amber-900/30 to-transparent">
          <div>
            <h2 className="text-xl font-semibold text-amber-100 font-fantaisie">
              Choose Your Champion Dragon
            </h2>
            <p className="text-sm text-slate-300 mt-1">
              As Dragonlord, select a Unique Dragon whose genesis ability you
              can invoke.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-800/80 text-slate-400 hover:text-white transition-colors"
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
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="text-center py-12 text-slate-400">
              Loading dragons...
            </div>
          ) : error ? (
            <div className="text-center py-12 text-red-400">{error}</div>
          ) : dragons.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
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
                    className={`relative rounded-xl overflow-hidden transition-all ${
                      isSelected
                        ? "ring-2 ring-amber-400 scale-105 shadow-lg shadow-amber-500/20"
                        : "ring-1 ring-slate-700/60 hover:ring-slate-500/60"
                    }`}
                  >
                    <div className="aspect-[3/4] relative bg-slate-800">
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
                        <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-amber-600/90 text-[10px] font-bold text-white">
                          CURRENT
                        </div>
                      )}
                    </div>
                    <div className="p-2 bg-slate-800/90">
                      <div className="text-sm font-medium text-slate-100 truncate">
                        {dragon.name}
                      </div>
                      {dragon.elements && (
                        <div className="text-[10px] text-slate-400 mt-0.5">
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
          <div className="px-5 py-3 border-t border-slate-700/60 bg-slate-800/50">
            <div className="flex items-start gap-4">
              <div className="w-16 h-20 relative rounded overflow-hidden flex-shrink-0">
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
                <div className="text-lg font-semibold text-amber-100">
                  {selectedDragon.name}
                </div>
                <div className="text-xs text-slate-400 mb-1">
                  {selectedDragon.typeText || "Unique Dragon"}
                </div>
                {selectedDragon.rulesText && (
                  <div className="text-sm text-slate-300 leading-snug line-clamp-3">
                    {selectedDragon.rulesText}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-700/60 bg-slate-900/80">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-700/80 hover:bg-slate-600/80 text-sm font-medium text-slate-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedDragon}
            className="px-5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold text-white transition-colors"
          >
            {currentChampion ? "Change Champion" : "Select Champion"}
          </button>
        </div>
      </div>
    </div>
  );
}
