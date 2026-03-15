"use client";

import React, { useCallback, useMemo, useState } from "react";
import { useGameStore } from "@/lib/game/store";
import CardWithPreview from "./CardWithPreview";

/** Eye icon — open/closed toggle for Merlin's scrying */
function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={18}
      height={18}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-opacity duration-200 ${open ? "text-blue-400" : "text-blue-300/50"}`}
    >
      {open ? (
        <>
          {/* Open eye */}
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <>
          {/* Closed eye */}
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
          {/* Strike-through line */}
          <line x1="4" y1="4" x2="20" y2="20" />
        </>
      )}
    </svg>
  );
}

/**
 * MerlinOverlay — persistent, non-blocking widget.
 *
 * When Merlin is on the board and it's the owner's turn, this shows the top
 * spellbook card in a small floating panel. If the card is a magic spell and
 * the phase is Main, a "Cast" button lets the owner move it to hand.
 *
 * Design: positioned bottom-left so it doesn't conflict with other overlays
 * or the main board area. Pointer-events only on the widget itself.
 */
export default function MerlinOverlay() {
  const merlinInstances = useGameStore((s) => s.merlinInstances);
  const actorKey = useGameStore((s) => s.actorKey);
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const phase = useGameStore((s) => s.phase);
  const zones = useGameStore((s) => s.zones);
  const permanents = useGameStore((s) => s.permanents);
  const castFromMerlin = useGameStore((s) => s.castFromMerlin);
  const resolversDisabled = useGameStore((s) => s.resolversDisabled);

  // Determine which seat(s) have active Merlins — verify still on the board
  const activeMerlin = useMemo(() => {
    if (resolversDisabled || merlinInstances.length === 0) return null;

    const turnSeat = currentPlayer === 1 ? "p1" : "p2";

    for (const entry of merlinInstances) {
      if (entry.ownerSeat !== turnSeat) continue;
      if (actorKey !== null && actorKey !== entry.ownerSeat) continue;

      // Verify Merlin still exists on the board
      const cellPerms = permanents[entry.location as keyof typeof permanents];
      if (cellPerms) {
        const stillOnBoard = cellPerms.some(
          (p) => p.instanceId === entry.instanceId,
        );
        if (stillOnBoard) return entry;
      }
    }
    return null;
  }, [merlinInstances, actorKey, currentPlayer, resolversDisabled, permanents]);

  // Get top spellbook card for the active Merlin's owner
  const topCard = useMemo(() => {
    if (!activeMerlin) return null;
    const spellbook = zones[activeMerlin.ownerSeat]?.spellbook;
    if (!spellbook || spellbook.length === 0) return null;
    return spellbook[0];
  }, [activeMerlin, zones]);

  // Check if the top card is a magic spell — use CardRef.type directly
  const isMagic = useMemo(() => {
    if (!topCard) return false;
    return (topCard.type || "").toLowerCase().includes("magic");
  }, [topCard]);

  const canCast = isMagic && phase === "Main";
  const [peekOpen, setPeekOpen] = useState(true);

  const handleCast = useCallback(() => {
    if (!activeMerlin || !canCast) return;
    castFromMerlin(activeMerlin.ownerSeat);
  }, [activeMerlin, canCast, castFromMerlin]);

  const togglePeek = useCallback(() => {
    setPeekOpen((prev) => !prev);
  }, []);

  if (!activeMerlin || !topCard) return null;

  return (
    <div className="fixed bottom-28 left-4 z-[180] pointer-events-none">
      <div className="pointer-events-auto bg-black/90 rounded-xl p-3 ring-1 ring-blue-500/40 shadow-lg backdrop-blur-sm max-w-[200px]">
        {/* Header with scrying toggle */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-blue-400 font-fantaisie text-sm">
              Merlin
            </span>
            <span className="text-[10px] text-blue-300/60 uppercase tracking-wider">
              Spellcaster
            </span>
          </div>
          <button
            onClick={togglePeek}
            className="p-1 rounded-md hover:bg-blue-500/20 transition-colors"
            title={peekOpen ? "Hide scrying" : "Scry top spell"}
          >
            <EyeIcon open={peekOpen} />
          </button>
        </div>

        {/* Collapsed state — just the spellbook count */}
        {!peekOpen && (
          <p className="text-[10px] text-gray-400 text-center">
            {zones[activeMerlin.ownerSeat]?.spellbook?.length || 0} spells in spellbook
          </p>
        )}

        {/* Expanded: top spell peek */}
        {peekOpen && (
          <>
            <div className="flex justify-center mb-2">
              <CardWithPreview
                card={topCard}
                interactive={false}
                accentColor="blue"
                size="sm"
              />
            </div>

            {/* Card name */}
            <p className="text-white text-xs text-center mb-1 truncate">
              {topCard.name}
            </p>

            {/* Type indicator */}
            <p
              className={`text-[10px] text-center mb-2 ${
                isMagic ? "text-blue-400" : "text-gray-400"
              }`}
            >
              {isMagic ? "Magic spell" : "Not a magic spell"}
            </p>

            {/* Cast button — only when it's a magic spell and Main phase */}
            {canCast && (
              <button
                onClick={handleCast}
                className="w-full px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg font-medium transition-colors"
              >
                Cast from Spellbook
              </button>
            )}

            {/* Info when magic but not Main phase */}
            {isMagic && phase !== "Main" && (
              <p className="text-[10px] text-center text-yellow-400/70">
                Cast during Main phase
              </p>
            )}

            {/* Spellbook count */}
            <p className="text-[10px] text-gray-500 text-center mt-1">
              {zones[activeMerlin.ownerSeat]?.spellbook?.length || 0} spells remaining
            </p>
          </>
        )}
      </div>
    </div>
  );
}
