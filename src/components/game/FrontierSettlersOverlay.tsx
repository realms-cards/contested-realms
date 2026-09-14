"use client";

import { Icon } from "@iconify/react";
import Image from "next/image";
import React from "react";
import { RcButton } from "@/components/ui/rc-button";
import { useGameStore } from "@/lib/game/store";
import {
  parseCellKey,
  getCellNumber,
} from "@/lib/game/store/utils/boardHelpers";

/**
 * FrontierSettlersOverlay — compact floating panel for Frontier Settlers ability.
 *
 * Shows the revealed site card and target tile buttons without blocking the
 * board view. Mobile-friendly layout anchored to the bottom-left.
 */
export default function FrontierSettlersOverlay() {
  const pending = useGameStore((s) => s.pendingFrontierSettlers);
  const actorKey = useGameStore((s) => s.actorKey);
  const board = useGameStore((s) => s.board);
  const permanents = useGameStore((s) => s.permanents);
  const selectTarget = useGameStore((s) => s.selectFrontierSettlersTarget);
  const resolve = useGameStore((s) => s.resolveFrontierSettlers);
  const cancel = useGameStore((s) => s.cancelFrontierSettlers);

  if (!pending) return null;

  const { phase, ownerSeat, revealedSite, validTargets, selectedTarget } =
    pending;
  const isOwner = actorKey === null || ownerSeat === actorKey;

  // Opponent view — small indicator
  if (!isOwner && phase === "selecting_target") {
    return (
      <div className="fixed left-4 bottom-28 z-[201] pointer-events-none">
        <div className="rc-toast px-3 py-2">
          <div className="font-rc-display text-rc-accent-link text-sm">
            Frontier Settlers
          </div>
          <div className="text-rc-fg-muted text-[11px]">
            {ownerSeat.toUpperCase()} is placing{" "}
            {revealedSite?.name || "a site"}…
          </div>
        </div>
      </div>
    );
  }

  // Owner view — compact floating panel
  if (!isOwner || (phase !== "revealing" && phase !== "selecting_target"))
    return null;

  return (
    <div className="fixed left-4 bottom-28 z-[201] pointer-events-auto">
      <div
        className="rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.9)] backdrop-blur-sm font-rc-sans text-rc-fg shadow-rc-panel overflow-hidden"
        style={{ width: 190 }}
      >
        {/* Revealed site card image */}
        {revealedSite && (
          <div className="relative w-full">
            <Image
              src={`/api/images/${revealedSite.slug || revealedSite.cardId}`}
              alt={revealedSite.name || "Site"}
              width={190}
              height={136}
              className="w-full h-auto object-cover"
              unoptimized
            />
          </div>
        )}

        <div className="px-3 py-2 flex flex-col gap-1.5">
          {/* Site name */}
          <div className="font-rc-display text-rc-accent-link text-sm truncate">
            {revealedSite?.name || "Site"}
          </div>

          {/* Target selection */}
          {phase === "selecting_target" && (
            <>
              <div className="text-rc-fg-muted text-[11px] leading-tight">
                Select a tile:
              </div>
              <div className="flex flex-wrap gap-1">
                {validTargets.map((cellKey) => {
                  const { x, y } = parseCellKey(cellKey);
                  const cellNum = getCellNumber(x, y, board.size.w, board.size.h);
                  // Rubble is a permanent token on a site-less cell, not a
                  // board.sites entry — that is what tells it apart from a void
                  const isRubble = (permanents[cellKey] || []).some(
                    (perm) =>
                      (perm.card?.name || "").toLowerCase() === "rubble",
                  );
                  const isSelected = selectedTarget === cellKey;

                  return (
                    <RcButton
                      key={cellKey}
                      variant="quiet"
                      size="xs"
                      tone="success"
                      aria-pressed={isSelected}
                      onClick={() => selectTarget(cellKey)}
                      className="h-auto gap-1 rounded-rc-sm px-2 py-1 font-rc-mono text-[11px] tabular-nums"
                    >
                      #{cellNum}{" "}
                      <Icon
                        icon={isRubble ? "game-icons:stone-pile" : "game-icons:hole"}
                        width={12}
                        height={12}
                      />
                    </RcButton>
                  );
                })}
              </div>

              {/* Action buttons */}
              <RcButton
                size="xs"
                onClick={resolve}
                disabled={!selectedTarget}
                className="w-full mt-1 h-6 px-2"
              >
                Place & Move
              </RcButton>
            </>
          )}

          {/* Revealing phase — just waiting */}
          {phase === "revealing" && (
            <div className="text-rc-fg-muted text-[11px]">
              Revealing from atlas…
            </div>
          )}

          <RcButton
            variant="outline"
            size="xs"
            onClick={cancel}
            className="w-full h-6 px-2"
          >
            Cancel
          </RcButton>
        </div>
      </div>
    </div>
  );
}
