"use client";

import React from "react";
import { RcButton } from "@/components/ui/rc-button";
import { useGameStore } from "@/lib/game/store";
import CardWithPreview, { CardGrid } from "./CardWithPreview";

export default function LegionOfGallOverlay() {
  const pending = useGameStore((s) => s.pendingLegionOfGall);
  const actorKey = useGameStore((s) => s.actorKey);
  const zones = useGameStore((s) => s.zones);
  const selectCard = useGameStore((s) => s.selectLegionOfGallCard);
  const confirm = useGameStore((s) => s.confirmLegionOfGall);
  const resolve = useGameStore((s) => s.resolveLegionOfGall);
  const cancel = useGameStore((s) => s.cancelLegionOfGall);

  if (!pending) return null;

  const { phase, casterSeat, targetSeat, selectedIndices } = pending;

  // Hotseat: actorKey is null, always show caster UI
  // Online: only show caster UI if we're the caster
  const isCaster = actorKey === null || casterSeat === actorKey;

  const targetCollection = zones[targetSeat].collection;
  const canConfirm = selectedIndices.length > 0 && selectedIndices.length <= 3;

  const getPhaseMessage = () => {
    if (phase === "confirming") {
      return isCaster
        ? "Resolve effect?"
        : `${casterSeat.toUpperCase()} is deciding...`;
    }
    if (phase === "viewing") {
      return `Viewing ${targetSeat.toUpperCase()}'s collection`;
    }
    if (phase === "selecting") {
      return `Select up to 3 cards to banish (${selectedIndices.length}/3 selected)`;
    }
    if (phase === "resolving") {
      return "Banishing cards...";
    }
    return "Complete";
  };

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* Top status bar */}
      <div className="fixed inset-x-0 top-6 z-[201] pointer-events-none flex justify-center">
        <div className="pointer-events-auto px-5 py-3 rounded-full border border-rc-line/22 bg-[rgba(7,10,20,0.9)] font-rc-sans text-rc-fg shadow-rc-panel text-lg flex items-center gap-3">
          <span className="font-rc-display text-rc-accent-link">
            Legion of Gall
          </span>
          <span className="text-rc-fg-muted">{getPhaseMessage()}</span>
        </div>
      </div>

      {/* Confirmation dialog - visible to caster */}
      {phase === "confirming" && isCaster && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-[rgba(6,10,20,0.7)]">
          <div className="rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-6 max-w-md w-full mx-4 font-rc-sans text-rc-fg shadow-rc-panel">
            <h2 className="mb-4 text-center font-rc-display text-[26px] leading-tight text-rc-fg-strong">
              Legion of Gall
            </h2>
            <p className="text-rc-fg-muted text-center mb-4">
              Look at opponent&apos;s collection and banish up to 3 cards.
            </p>

            <p className="text-rc-fg-muted text-center mb-6 text-sm">
              Auto-resolve will open the collection inspection UI.
              <br />
              <span className="text-rc-warning">
                Decline if the card is silenced or you want to skip the effect.
              </span>
            </p>

            {/* Action buttons */}
            <div className="flex gap-4 justify-center">
              <RcButton variant="outline" onClick={cancel}>
                Decline (Skip)
              </RcButton>
              <RcButton onClick={confirm}>
                Auto-Resolve
              </RcButton>
            </div>

            <p className="text-rc-fg-subtle text-xs text-center mt-4">
              Declining keeps the spell on board for manual resolution.
            </p>
          </div>
        </div>
      )}

      {/* Caster UI - Collection view */}
      {isCaster && (phase === "viewing" || phase === "selecting") && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-[rgba(6,10,20,0.7)]">
          <div className="thin-scrollbar rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-6 max-w-5xl w-full mx-4 font-rc-sans text-rc-fg shadow-rc-panel max-h-[80vh] overflow-y-auto">
            <div className="mb-4">
              <h2 className="mb-2 font-rc-display text-[26px] leading-tight text-rc-fg-strong">
                {targetSeat.toUpperCase()}&apos;s Collection
              </h2>
              <p className="text-sm text-rc-fg-muted">
                Select up to 3 cards to banish from their collection
              </p>
            </div>

            {targetCollection.length === 0 ? (
              <div className="text-center py-12 text-rc-fg-subtle">
                <p className="text-lg">Collection is empty</p>
                <p className="text-sm mt-2">No cards to banish</p>
              </div>
            ) : (
              <CardGrid columns={6}>
                {targetCollection.map((cardRef, idx) => (
                  <CardWithPreview
                    key={`${cardRef.cardId || idx}-${idx}`}
                    card={cardRef}
                    onClick={() => selectCard(idx)}
                    selected={selectedIndices.includes(idx)}
                    accentColor="purple"
                  />
                ))}
              </CardGrid>
            )}

            {/* Action buttons */}
            <div className="flex gap-3 justify-center mt-6">
              <RcButton variant="outline" onClick={cancel}>
                Cancel
              </RcButton>
              <RcButton onClick={resolve} disabled={!canConfirm}>
                Banish{" "}
                {selectedIndices.length > 0
                  ? `(${selectedIndices.length})`
                  : ""}
              </RcButton>
            </div>
          </div>
        </div>
      )}

      {/* Opponent waiting indicator */}
      {!isCaster &&
        (phase === "confirming" ||
          phase === "viewing" ||
          phase === "selecting") && (
          <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
            <div className="rc-toast">
              {casterSeat.toUpperCase()} is resolving Legion of Gall...
            </div>
          </div>
        )}
    </div>
  );
}
