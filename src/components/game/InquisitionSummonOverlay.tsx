"use client";

import Image from "next/image";
import React, { useCallback, useEffect } from "react";
import { useGameStore } from "@/lib/game/store";
import {
  useOverlaySlot,
  useOverlayRegistry,
  overlaySlotClass,
} from "@/lib/game/overlayRegistry";

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
        <div className="pointer-events-auto px-5 py-3 rounded-xl bg-gray-900/95 text-white ring-1 ring-purple-500/50 shadow-lg flex items-center gap-3 select-none">
          <span className="text-purple-400 font-fantaisie text-sm">
            The Inquisition
          </span>
          {isOwner ? (
            <>
              <span className="text-sm opacity-80">
                Click a highlighted tile to summon
              </span>
              <button
                onClick={handleDecline}
                className="ml-1 rounded bg-gray-700 hover:bg-gray-600 px-3 py-1 text-xs font-semibold text-gray-300 transition"
              >
                Cancel
              </button>
            </>
          ) : (
            <span className="text-sm opacity-60">
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
        className={`relative rounded-xl border border-purple-500/50 bg-gray-900/95 shadow-2xl shadow-purple-900/30 ${layout.tiled ? "w-full p-4" : "mx-4 max-w-lg p-6"}`}
      >
        {/* Header */}
        <div className="mb-4 text-center">
          <h2 className="text-lg font-bold text-purple-300">
            The Inquisition Revealed!
          </h2>
          <p className="mt-1 text-sm text-gray-400">
            Your {sourceZone === "hand" ? "hand" : "spellbook"} was searched —
            The Inquisition was seen.
          </p>
        </div>

        {/* Card preview */}
        {imageUrl && (
          <div className="mx-auto mb-4 flex justify-center">
            <div className="relative h-48 w-36 overflow-hidden rounded-lg border-2 border-purple-400/60 shadow-lg shadow-purple-500/20">
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
            <button
              onClick={handleAccept}
              className="rounded-lg bg-purple-600 px-5 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-purple-500 active:scale-95"
            >
              Summon It
            </button>
            <button
              onClick={handleDecline}
              className="rounded-lg bg-gray-700 px-5 py-2 text-sm font-semibold text-gray-300 shadow-md transition hover:bg-gray-600 active:scale-95"
            >
              Decline
            </button>
          </div>
        )}

        {/* Not owner: Waiting */}
        {!isOwner && (
          <p className="text-center text-sm text-gray-400">
            Opponent is deciding whether to summon The Inquisition...
          </p>
        )}
      </div>
    </div>
  );
}
