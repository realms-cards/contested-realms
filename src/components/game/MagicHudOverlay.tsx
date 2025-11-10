"use client";

import React from "react";
import { useGameStore } from "@/lib/game/store";
import {
  getCellNumber,
  seatFromOwner,
} from "@/lib/game/store/utils/boardHelpers";

export default function MagicHudOverlay() {
  const magicGuides = useGameStore((s) => s.magicGuides);
  const pendingMagic = useGameStore((s) => s.pendingMagic);
  const board = useGameStore((s) => s.board);
  const actorKey = useGameStore((s) => s.actorKey);
  const currentPlayer = useGameStore((s) => s.currentPlayer);

  const setMagicCasterChoice = useGameStore((s) => s.setMagicCasterChoice);
  const setMagicTargetChoice = useGameStore((s) => s.setMagicTargetChoice);
  const confirmMagic = useGameStore((s) => s.confirmMagic);
  const resolveMagic = useGameStore((s) => s.resolveMagic);
  const cancelMagic = useGameStore((s) => s.cancelMagic);

  if (!magicGuides || !pendingMagic) return null;

  const tileNum = pendingMagic
    ? getCellNumber(pendingMagic.tile.x, pendingMagic.tile.y, board.size.w)
    : null;
  const cardName = (() => {
    try { return pendingMagic.spell.card?.name || "Magic"; } catch { return "Magic"; }
  })();
  const status = pendingMagic.status;

  const ownerSeat = seatFromOwner(pendingMagic.spell.owner);
  const actorIsActive = ownerSeat ? ((actorKey === "p1" && currentPlayer === 1) || (actorKey === "p2" && currentPlayer === 2)) && actorKey === ownerSeat : true;

  function TopBar() {
    const stepsText = (() => {
      if (status === "choosingCaster") return `Select a Spellcaster`;
      if (status === "choosingTarget") return `Select a target`;
      if (status === "confirm") return `Cast ${cardName}`;
      if (status === "resolving") return `Resolving ${cardName}…`;
      return `Casting ${cardName}`;
    })();

    return (
      <div className="fixed inset-x-0 top-6 z-40 pointer-events-none flex justify-center">
        <div className="pointer-events-auto px-5 py-3 rounded-full bg-black/90 text-white ring-1 ring-white/20 shadow-lg text-lg md:text-xl flex items-center gap-2">
          <span className="opacity-80">
            {tileNum ? `[T${tileNum}] ` : ""}
            <span className="font-fantaisie">{stepsText}</span>
          </span>
          {actorIsActive && status === "choosingTarget" ? (
            <button
              className="mx-1 rounded bg-white/15 hover:bg-white/25 px-3 py-1"
              onClick={() => setMagicCasterChoice(null)}
            >
              Back
            </button>
          ) : null}
          {actorIsActive && status === "confirm" ? (
            <>
              <button
                className="mx-1 rounded bg-emerald-600/90 hover:bg-emerald-500 px-3 py-1"
                onClick={() => {
                  try { confirmMagic(); } catch {}
                }}
              >
                Confirm
              </button>
              <button
                className="mx-1 rounded bg-amber-600/90 hover:bg-amber-500 px-3 py-1"
                onClick={() => resolveMagic()}
              >
                Resolve
              </button>
              <button
                className="mx-1 rounded bg-white/15 hover:bg-white/25 px-3 py-1"
                onClick={() => setMagicTargetChoice(null)}
              >
                Back
              </button>
            </>
          ) : null}
          {actorIsActive ? (
            <button
              className="mx-1 rounded bg-white/15 hover:bg-white/25 px-3 py-1"
              onClick={() => cancelMagic()}
            >
              Cancel
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return <TopBar />;
}
