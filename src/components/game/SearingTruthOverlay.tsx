"use client";

import React, { useCallback, useEffect } from "react";
import { RcButton } from "@/components/ui/rc-button";
import { PLAYER_COLORS } from "@/lib/game/constants";
import { useGameStore } from "@/lib/game/store";
import type { PlayerKey } from "@/lib/game/store/types";
import CardWithPreview from "./CardWithPreview";

interface SearingTruthOverlayProps {
  playerNames?: { p1: string; p2: string };
}

export default function SearingTruthOverlay({
  playerNames = { p1: "Player 1", p2: "Player 2" },
}: SearingTruthOverlayProps) {
  const pending = useGameStore((s) => s.pendingSearingTruth);
  const actorKey = useGameStore((s) => s.actorKey);
  const selectSearingTruthTarget = useGameStore(
    (s) => s.selectSearingTruthTarget
  );
  const resolveSearingTruth = useGameStore((s) => s.resolveSearingTruth);
  const cancelSearingTruth = useGameStore((s) => s.cancelSearingTruth);

  // In hotseat mode (actorKey is null), always show caster UI
  // In online mode, only show caster UI if we're the caster
  const isCaster = actorKey === null || pending?.casterSeat === actorKey;

  // Handle selecting a target player
  const handleSelectTarget = useCallback(
    (target: PlayerKey) => {
      if (!isCaster || pending?.phase !== "selectingTarget") return;
      selectSearingTruthTarget(target);
    },
    [isCaster, pending?.phase, selectSearingTruthTarget]
  );

  // Handle confirm/resolve
  const handleResolve = useCallback(() => {
    resolveSearingTruth();
  }, [resolveSearingTruth]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    cancelSearingTruth();
  }, [cancelSearingTruth]);

  // Auto-resolve after a delay in reveal phase
  useEffect(() => {
    if (pending?.phase === "revealing" && isCaster) {
      const timer = setTimeout(() => {
        resolveSearingTruth();
      }, 3000); // 3 second reveal time
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [pending?.phase, isCaster, resolveSearingTruth]);

  if (!pending) return null;

  const phase = pending.phase;
  const targetSeat = pending.targetSeat;
  const revealedCards = pending.revealedCards;
  const damageAmount = pending.damageAmount;

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* Top bar with status */}
      <div className="fixed inset-x-0 top-6 z-[201] pointer-events-none flex justify-center">
        <div className="pointer-events-auto px-5 py-3 rounded-full border border-rc-line/22 bg-[rgba(7,10,20,0.9)] font-rc-sans text-rc-fg shadow-rc-panel text-lg md:text-xl flex items-center gap-3 select-none">
          <span className="font-rc-display text-rc-accent-link flex items-center gap-1">
            <img src="/fire.png" alt="fire" className="w-5 h-5" /> Searing Truth
          </span>
          <span className="text-rc-fg-muted">
            {phase === "selectingTarget" &&
              (isCaster
                ? "Select a player to draw and reveal two spells"
                : `${playerNames[pending.casterSeat]} is selecting a target...`)}
            {phase === "revealing" &&
              `${targetSeat ? playerNames[targetSeat] : "Target"} reveals - ${damageAmount} damage incoming!`}
            {phase === "resolving" && "Resolving..."}
          </span>
          {isCaster && phase === "selectingTarget" && (
            <RcButton
              variant="outline"
              size="xs"
              className="mx-1 select-none"
              onClick={handleCancel}
            >
              Cancel
            </RcButton>
          )}
        </div>
      </div>

      {/* Target selection - only for caster */}
      {isCaster && phase === "selectingTarget" && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-[rgba(6,10,20,0.7)]">
          <div className="rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-6 max-w-md w-full mx-4 font-rc-sans text-rc-fg shadow-rc-panel">
            <h2 className="mb-4 text-center font-rc-display text-[26px] leading-tight text-rc-fg-strong">
              Choose Target Player
            </h2>
            <p className="text-rc-fg-muted text-sm mb-6 text-center">
              Target will draw and reveal two spells, then take damage equal to
              the higher mana cost.
            </p>

            {/* Seat identity colour (P1 blue / P2 red): ring = 50% alpha border, text = solid */}
            <div className="flex gap-4 justify-center mb-6">
              <button
                className="px-8 py-4 rounded-rc-md border border-rc-line/18 bg-black/30 hover:bg-rc-accent/8 font-bold transition-colors text-lg"
                style={{ borderColor: `${PLAYER_COLORS.p1}80`, color: PLAYER_COLORS.p1 }}
                onClick={() => handleSelectTarget("p1")}
              >
                {playerNames.p1}
              </button>
              <button
                className="px-8 py-4 rounded-rc-md border border-rc-line/18 bg-black/30 hover:bg-rc-accent/8 font-bold transition-colors text-lg"
                style={{ borderColor: `${PLAYER_COLORS.p2}80`, color: PLAYER_COLORS.p2 }}
                onClick={() => handleSelectTarget("p2")}
              >
                {playerNames.p2}
              </button>
            </div>

            <div className="flex justify-center">
              <RcButton variant="outline" onClick={handleCancel}>
                Cancel
              </RcButton>
            </div>
          </div>
        </div>
      )}

      {/* Reveal phase - both players see this */}
      {phase === "revealing" && revealedCards.length > 0 && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-[rgba(6,10,20,0.7)]">
          <div className="rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-6 max-w-2xl w-full mx-4 font-rc-sans text-rc-fg shadow-rc-panel">
            <h2 className="mb-2 text-center font-rc-display text-[26px] leading-tight text-rc-fg-strong">
              {targetSeat ? playerNames[targetSeat] : "Target"} Reveals
            </h2>
            <p className="text-rc-fg-muted text-sm mb-6 text-center">
              Drawn cards revealed - Highest cost:{" "}
              <span className="font-rc-mono font-bold text-lg tabular-nums text-rc-danger">
                {damageAmount}
              </span>{" "}
              damage
            </p>

            {/* Revealed cards */}
            <div className="flex gap-4 justify-center mb-6">
              {revealedCards.map((card, index) => (
                <CardWithPreview
                  key={index}
                  card={card}
                  interactive={false}
                  accentColor="orange"
                  size="lg"
                />
              ))}
            </div>

            {/* Damage indicator */}
            <div className="flex justify-center mb-6">
              <div className="rc-alert px-6 py-3 font-bold text-xl" data-tone="danger">
                {damageAmount} Damage to {targetSeat ? playerNames[targetSeat] : "Target"}
              </div>
            </div>

            {/* Confirm button for caster */}
            {isCaster && (
              <div className="flex justify-center">
                <RcButton onClick={handleResolve}>
                  Confirm Damage
                </RcButton>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Opponent view during target selection */}
      {!isCaster && phase === "selectingTarget" && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="rc-toast pointer-events-auto">
            <span className="text-rc-fg-strong">
              {playerNames[pending.casterSeat]}
            </span>{" "}
            is casting Searing Truth...
          </div>
        </div>
      )}
    </div>
  );
}
