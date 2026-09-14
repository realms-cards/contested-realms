"use client";

import React from "react";
import { RcButton } from "@/components/ui/rc-button";
import { useGameStore } from "@/lib/game/store";
import CardWithPreview from "./CardWithPreview";

export default function KettletopLeprechaunOverlay() {
  const pending = useGameStore((s) => s.pendingKettletopLeprechaun);
  const actorKey = useGameStore((s) => s.actorKey);
  const resolve = useGameStore((s) => s.resolveKettletopLeprechaun);
  const cancel = useGameStore((s) => s.cancelKettletopLeprechaun);

  if (!pending) return null;

  const { phase, ownerSeat, drawnCard } = pending;
  const isOwner = actorKey === null || ownerSeat === actorKey;

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* Top bar with status */}
      <div className="fixed inset-x-0 top-6 z-[201] pointer-events-none flex justify-center">
        <div className="pointer-events-auto px-5 py-3 rounded-full border border-rc-line/22 bg-[rgba(7,10,20,0.9)] font-rc-sans text-rc-fg shadow-rc-panel text-lg md:text-xl flex items-center gap-3 select-none">
          <span className="font-rc-display text-rc-accent-link">
            Kettletop Leprechaun
          </span>
          <span className="text-rc-fg-muted">
            {phase === "confirming" && "Deathrite — Draw a site?"}
            {phase === "complete" && "Site drawn!"}
          </span>
        </div>
      </div>

      {/* Confirmation dialog — only owner can act */}
      {isOwner && phase === "confirming" && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-[rgba(6,10,20,0.7)]">
          <div className="rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-6 max-w-md w-full mx-4 font-rc-sans text-rc-fg shadow-rc-panel">
            <h2 className="mb-2 text-center font-rc-display text-[26px] leading-tight text-rc-fg-strong">
              Kettletop Leprechaun
            </h2>
            <p className="text-rc-fg-muted text-center mb-2">
              Deathrite &mdash; Draw a site from your atlas.
            </p>
            <p className="text-rc-warning text-sm text-center mb-6">
              Decline if silenced or you want to skip the effect.
            </p>

            <div className="flex gap-3 justify-center">
              <RcButton variant="outline" onClick={cancel}>
                Decline
              </RcButton>
              <RcButton onClick={resolve}>
                Draw Site
              </RcButton>
            </div>
          </div>
        </div>
      )}

      {/* Complete phase — show drawn card briefly */}
      {isOwner && phase === "complete" && drawnCard && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-[rgba(6,10,20,0.7)]">
          <div className="rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-6 max-w-md w-full mx-4 font-rc-sans text-rc-fg shadow-rc-panel">
            <h2 className="mb-4 text-center font-rc-display text-[22px] leading-tight text-rc-fg-strong">
              Site Drawn
            </h2>
            <div className="flex justify-center mb-4">
              <CardWithPreview
                card={drawnCard}
                interactive={false}
                accentColor="green"
                size="md"
              />
            </div>
            <p className="text-rc-fg-muted text-sm text-center">
              Added to your hand.
            </p>
          </div>
        </div>
      )}

      {/* Opponent waiting indicator */}
      {!isOwner && phase === "confirming" && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="rc-toast pointer-events-auto">
            <span className="text-rc-fg-strong">
              {ownerSeat.toUpperCase()}
            </span>{" "}
            is resolving Kettletop Leprechaun Deathrite...
          </div>
        </div>
      )}
    </div>
  );
}
