"use client";

import React from "react";
import { RcButton } from "@/components/ui/rc-button";
import { useGameStore } from "@/lib/game/store";
import CardWithPreview, { CardGrid } from "./CardWithPreview";

export default function KingswoodPoachersOverlay() {
  const pending = useGameStore((s) => s.pendingKingswoodPoachers);
  const actorKey = useGameStore((s) => s.actorKey);
  const confirm = useGameStore((s) => s.confirmKingswoodPoachers);
  const selectSpellbook = useGameStore(
    (s) => s.selectKingswoodPoachersSpellbook,
  );
  const selectBeast = useGameStore((s) => s.selectKingswoodPoachersBeast);
  const resolve = useGameStore((s) => s.resolveKingswoodPoachers);
  const cancel = useGameStore((s) => s.cancelKingswoodPoachers);

  if (!pending) return null;

  const { phase, casterSeat, targetSeat, eligibleCards, selectedIndices } =
    pending;
  const opponentSeat = casterSeat === "p1" ? "p2" : "p1";

  // Hotseat: actorKey is null, always show caster UI.
  // Online: only show caster UI if we are the caster.
  const isCaster = actorKey === null || casterSeat === actorKey;

  const getPhaseMessage = () => {
    if (phase === "confirming") {
      return isCaster
        ? "Resolve Genesis?"
        : `${casterSeat.toUpperCase()} is deciding...`;
    }
    if (phase === "selecting_spellbook") {
      return "Choosing a spellbook to search";
    }
    if (phase === "selecting") {
      return `Select up to 3 Beasts to banish (${selectedIndices.length}/3)`;
    }
    if (phase === "resolving") return "Banishing Beasts...";
    return "Complete";
  };

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* Top status bar */}
      <div className="fixed inset-x-0 top-6 z-[201] pointer-events-none flex justify-center">
        <div className="pointer-events-auto px-5 py-3 rounded-full border border-rc-line/22 bg-[rgba(7,10,20,0.9)] font-rc-sans text-rc-fg shadow-rc-panel text-lg flex items-center gap-3">
          <span className="font-rc-display text-rc-accent-link">
            Kingswood Poachers
          </span>
          <span className="text-rc-fg-muted">{getPhaseMessage()}</span>
        </div>
      </div>

      {/* Confirmation dialog */}
      {phase === "confirming" && isCaster && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-[rgba(6,10,20,0.7)]">
          <div className="rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-6 max-w-md w-full mx-4 font-rc-sans text-rc-fg shadow-rc-panel">
            <h2 className="mb-4 text-center font-rc-display text-[26px] leading-tight text-rc-fg-strong">
              Kingswood Poachers
            </h2>
            <p className="text-rc-fg-muted text-center mb-4">
              Genesis → Search a spellbook for up to three Beasts, banish them,
              then shuffle.
            </p>
            <p className="text-rc-fg-muted text-center mb-6 text-sm">
              Auto-resolve lets you choose a spellbook and pick the Beasts.
              <br />
              <span className="text-rc-warning">
                Decline if the Genesis is silenced or you want to skip it.
              </span>
            </p>
            <div className="flex gap-4 justify-center">
              <RcButton variant="outline" onClick={cancel}>
                Decline (Skip)
              </RcButton>
              <RcButton onClick={confirm}>Auto-Resolve</RcButton>
            </div>
            <p className="text-rc-fg-subtle text-xs text-center mt-4">
              Declining keeps the minion on the board.
            </p>
          </div>
        </div>
      )}

      {/* Spellbook chooser */}
      {phase === "selecting_spellbook" && isCaster && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-[rgba(6,10,20,0.7)]">
          <div className="rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-6 max-w-md w-full mx-4 font-rc-sans text-rc-fg shadow-rc-panel">
            <h2 className="mb-4 text-center font-rc-display text-[26px] leading-tight text-rc-fg-strong">
              Search which spellbook?
            </h2>
            <p className="text-sm text-rc-fg-muted text-center mb-6">
              Look through a spellbook for up to three Beasts to banish.
            </p>
            <div className="flex gap-4 justify-center">
              <RcButton
                variant="outline"
                size="lg"
                className="h-auto whitespace-normal px-6 py-3"
                onClick={() => selectSpellbook(casterSeat)}
              >
                Your spellbook
              </RcButton>
              <RcButton
                variant="outline"
                size="lg"
                className="h-auto whitespace-normal px-6 py-3"
                onClick={() => selectSpellbook(opponentSeat)}
              >
                Opponent&apos;s spellbook
              </RcButton>
            </div>
          </div>
        </div>
      )}

      {/* Beast selection */}
      {phase === "selecting" && isCaster && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-[rgba(6,10,20,0.7)]">
          <div className="thin-scrollbar rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-6 max-w-5xl w-full mx-4 font-rc-sans text-rc-fg shadow-rc-panel max-h-[80vh] overflow-y-auto">
            <div className="mb-4">
              <h2 className="mb-2 font-rc-display text-[26px] leading-tight text-rc-fg-strong">
                Beasts in {(targetSeat ?? casterSeat).toUpperCase()}&apos;s
                spellbook
              </h2>
              <p className="text-sm text-rc-fg-muted">
                Select up to 3 Beasts to banish, then shuffle the spellbook.
              </p>
            </div>

            {eligibleCards.length === 0 ? (
              <div className="text-center py-12 text-rc-fg-subtle">
                <p className="text-lg">No Beasts found</p>
                <p className="text-sm mt-2">
                  The spellbook will still be shuffled.
                </p>
              </div>
            ) : (
              <CardGrid columns={6}>
                {eligibleCards.map((cardRef, idx) => (
                  <CardWithPreview
                    key={`${cardRef.instanceId || cardRef.cardId || idx}-${idx}`}
                    card={cardRef}
                    onClick={() => selectBeast(idx)}
                    selected={selectedIndices.includes(idx)}
                    accentColor="green"
                  />
                ))}
              </CardGrid>
            )}

            <div className="flex gap-3 justify-center mt-6">
              <RcButton variant="outline" onClick={cancel}>
                Cancel
              </RcButton>
              <RcButton onClick={resolve}>
                {selectedIndices.length > 0
                  ? `Banish (${selectedIndices.length}) & Shuffle`
                  : "Shuffle (banish none)"}
              </RcButton>
            </div>
          </div>
        </div>
      )}

      {/* Opponent waiting indicator */}
      {!isCaster && phase !== "complete" && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="rc-toast">
            {casterSeat.toUpperCase()} is resolving Kingswood Poachers...
          </div>
        </div>
      )}
    </div>
  );
}
