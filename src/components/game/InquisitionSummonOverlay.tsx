"use client";

import Image from "next/image";
import React, { useCallback, useEffect } from "react";
import { RcButton } from "@/components/ui/rc-button";
import {
  useOverlaySlot,
  useOverlayRegistry,
  overlaySlotClass,
} from "@/lib/game/overlayRegistry";
import { useGameStore } from "@/lib/game/store";

export default function InquisitionSummonOverlay() {
  const pending = useGameStore((s) => s.pendingInquisitionSummon);
  const actorKey = useGameStore((s) => s.actorKey);
  const acceptInquisitionSummon = useGameStore(
    (s) => s.acceptInquisitionSummon,
  );
  const declineInquisitionSummon = useGameStore(
    (s) => s.declineInquisitionSummon,
  );

  // Only register as a full overlay during "offered" phase.
  // During "selectingCell", the board handles placement via tile highlights.
  const isOfferedPhase = !!pending && pending.phase === "offered";
  const layout = useOverlaySlot(
    "inquisitionSummon",
    50,
    isOfferedPhase,
    "Summon",
  );

  // Auto-minimize other overlays when board interaction is needed
  const setBoardInteraction = useOverlayRegistry(
    (s) => s.setBoardInteractionActive,
  );
  const isSelectingCell = !!pending && pending.phase === "selectingCell";
  useEffect(() => {
    setBoardInteraction(isSelectingCell);
    return () => setBoardInteraction(false);
  }, [isSelectingCell, setBoardInteraction]);

  const isOwner = actorKey === null || pending?.ownerSeat === actorKey;

  const handleAccept = useCallback(() => {
    acceptInquisitionSummon();
  }, [acceptInquisitionSummon]);

  const handleDecline = useCallback(() => {
    declineInquisitionSummon();
  }, [declineInquisitionSummon]);

  if (!pending) return null;

  const phase = pending.phase;
  const card = pending.card;
  const sourceZone = pending.sourceZone;

  if (phase === "complete") return null;

  // Build card image URL
  const slug = card.slug || "";
  const imageUrl = slug ? `/api/images/${slug}` : null;

  // ── "selectingCell" phase: small floating HUD (board is interactive) ──
  if (phase === "selectingCell") {
    return (
      <div className="fixed inset-x-0 bottom-6 z-[201] pointer-events-none flex justify-center">
        <div className="pointer-events-auto px-5 py-3 rounded-rc-lg border border-rc-line/22 bg-[rgba(7,10,20,0.95)] font-rc-sans text-rc-fg shadow-rc-panel flex items-center gap-3 select-none">
          <span className="font-rc-display text-rc-accent-link text-sm">
            The Inquisition
          </span>
          {isOwner ? (
            <>
              <span className="text-sm text-rc-fg-muted">
                Click a highlighted tile to summon
              </span>
              <RcButton
                variant="outline"
                size="xs"
                onClick={handleDecline}
                className="ml-1 h-6 px-3"
              >
                Cancel
              </RcButton>
            </>
          ) : (
            <span className="text-sm text-rc-fg-subtle">
              Opponent is placing The Inquisition...
            </span>
          )}
        </div>
      </div>
    );
  }

  // ── "offered" phase: full overlay with card preview + accept/decline ──
  const slotClass = overlaySlotClass(layout.slot);

  return (
    <div
      className={`${slotClass} flex items-center justify-center ${layout.tiled ? "p-2 overflow-y-auto" : ""}`}
    >
      <div
        className={`relative rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] font-rc-sans text-rc-fg shadow-rc-panel ${layout.tiled ? "w-full p-4" : "mx-4 max-w-lg p-6"}`}
      >
        {/* Header */}
        <div className="mb-4 text-center">
          <h2 className="font-rc-display text-[18px] leading-tight text-rc-fg-strong">
            The Inquisition Revealed!
          </h2>
          <p className="mt-1 text-sm text-rc-fg-muted">
            Your {sourceZone === "hand" ? "hand" : "spellbook"} was searched —
            The Inquisition was seen.
          </p>
        </div>

        {/* Card preview */}
        {imageUrl && (
          <div className="mx-auto mb-4 flex justify-center">
            <div className="relative h-48 w-36 overflow-hidden rounded-rc-md shadow-rc-md ring-1 ring-rc-line/25">
              <Image
                src={imageUrl}
                alt={card.name || "The Inquisition"}
                fill
                className="object-cover"
                sizes="144px"
              />
            </div>
          </div>
        )}

        {/* Owner: Accept / Decline */}
        {isOwner && (
          <div className="flex justify-center gap-3">
            <RcButton size="sm" onClick={handleAccept}>
              Summon It
            </RcButton>
            <RcButton variant="outline" size="sm" onClick={handleDecline}>
              Decline
            </RcButton>
          </div>
        )}

        {/* Not owner: Waiting */}
        {!isOwner && (
          <p className="text-center text-sm text-rc-fg-muted">
            Opponent is deciding whether to summon The Inquisition...
          </p>
        )}
      </div>
    </div>
  );
}
