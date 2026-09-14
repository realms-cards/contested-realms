"use client";

import React from "react";
import { RcButton } from "@/components/ui/rc-button";
import { useGameStore } from "@/lib/game/store";
import CardWithPreview, { CardGrid } from "./CardWithPreview";

const RARITY_LABELS: Record<number, string> = {
  1: "Ordinary",
  2: "Exceptional",
  3: "Elite",
  4: "Unique",
};

export default function DemonicContractOverlay() {
  const pending = useGameStore((s) => s.pendingDemonicContract);
  const actorKey = useGameStore((s) => s.actorKey);
  const players = useGameStore((s) => s.players);
  const chooseCost = useGameStore((s) => s.chooseDemonicContractCost);
  const selectSacrifice = useGameStore((s) => s.selectDemonicContractSacrifice);
  const selectCard = useGameStore((s) => s.selectDemonicContractCard);
  const resolve = useGameStore((s) => s.resolveDemonicContract);
  const cancel = useGameStore((s) => s.cancelDemonicContract);

  if (!pending) return null;

  const {
    phase,
    casterSeat,
    maxRarity,
    highestDemonName,
    sacrificeOptions,
    eligibleCards,
    selectedCard,
  } = pending;
  const isOwner = actorKey === null || casterSeat === actorKey;
  const currentLife = players[casterSeat]?.life || 0;
  const canPayLife = currentLife > 4;
  const hasSacrificeOptions = sacrificeOptions.length > 0;

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* Top bar with status */}
      <div className="fixed inset-x-0 top-6 z-[201] pointer-events-none flex justify-center">
        <div className="pointer-events-auto px-5 py-3 rounded-full border border-rc-line/22 bg-[rgba(7,10,20,0.9)] font-rc-sans text-rc-fg shadow-rc-panel text-lg md:text-xl flex items-center gap-3 select-none">
          <span className="font-rc-display text-rc-accent-link">
            Demonic Contract
          </span>
          <span className="text-rc-fg-muted">
            {phase === "choosing_cost" && "Choose payment method"}
            {phase === "choosing_sacrifice" && "Select token to sacrifice"}
            {phase === "loading" && "Searching spellbook..."}
            {phase === "selecting" &&
              (selectedCard ? "Confirm selection" : "Select a card")}
            {phase === "complete" && "Done!"}
          </span>
        </div>
      </div>

      {/* Cost selection phase */}
      {phase === "choosing_cost" && isOwner && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-[rgba(6,10,20,0.7)]">
          <div className="rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-6 max-w-lg w-full mx-4 font-rc-sans text-rc-fg shadow-rc-panel">
            <h2 className="mb-4 text-center font-rc-display text-[26px] leading-tight text-rc-fg-strong">
              Demonic Contract
            </h2>

            <p className="text-rc-fg-muted text-center mb-2">
              Highest Demon:{" "}
              <span className="font-rc-display text-rc-accent-link">
                {highestDemonName}
              </span>
            </p>
            <p className="text-rc-fg-subtle text-sm text-center mb-6">
              Can search for cards up to {RARITY_LABELS[maxRarity] || "Unknown"}{" "}
              rarity
            </p>

            <p className="text-rc-fg-strong text-center mb-4">
              Choose your payment:
            </p>

            <div className="space-y-3">
              <button
                onClick={() => chooseCost("life")}
                disabled={!canPayLife}
                className={`w-full p-4 rounded-rc-md border transition-colors ${
                  canPayLife
                    ? "border-rc-line/18 bg-black/30 hover:border-rc-accent/60 hover:bg-rc-accent/8"
                    : "border-rc-line/10 bg-black/20 cursor-not-allowed opacity-50"
                }`}
              >
                <div className="text-lg font-medium text-rc-fg-strong">
                  Pay 4 Life
                </div>
                <div className="font-rc-mono text-sm tabular-nums text-rc-fg-muted">
                  Current: {currentLife} → {currentLife - 4}
                  {!canPayLife && " (Not enough life)"}
                </div>
              </button>

              <button
                onClick={() => chooseCost("sacrifice")}
                disabled={!hasSacrificeOptions}
                className={`w-full p-4 rounded-rc-md border transition-colors ${
                  hasSacrificeOptions
                    ? "border-rc-line/18 bg-black/30 hover:border-rc-accent/60 hover:bg-rc-accent/8"
                    : "border-rc-line/10 bg-black/20 cursor-not-allowed opacity-50"
                }`}
              >
                <div className="text-lg font-medium text-rc-fg-strong">
                  Sacrifice Token
                </div>
                <div className="text-sm text-rc-fg-muted">
                  {hasSacrificeOptions
                    ? `${sacrificeOptions.length} valid token(s) available`
                    : "No valid tokens to sacrifice"}
                </div>
              </button>
            </div>

            <RcButton
              variant="outline"
              onClick={cancel}
              className="w-full mt-4"
            >
              Cancel
            </RcButton>
          </div>
        </div>
      )}

      {/* Sacrifice selection phase */}
      {phase === "choosing_sacrifice" && isOwner && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-[rgba(6,10,20,0.7)]">
          <div className="rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-6 max-w-lg w-full mx-4 font-rc-sans text-rc-fg shadow-rc-panel">
            <h2 className="mb-4 text-center font-rc-display text-[26px] leading-tight text-rc-fg-strong">
              Select Token to Sacrifice
            </h2>

            <div className="thin-scrollbar space-y-2 max-h-64 overflow-y-auto">
              {sacrificeOptions.map((opt) => (
                <button
                  key={`${opt.at}-${opt.index}`}
                  onClick={() => selectSacrifice(opt.at, opt.index)}
                  className="w-full p-3 rounded-rc-md border border-rc-line/18 bg-black/30 hover:border-rc-accent/60 hover:bg-rc-accent/8 text-left transition-colors"
                >
                  <span className="font-rc-display text-rc-fg-strong">
                    {opt.name}
                  </span>
                </button>
              ))}
            </div>

            <RcButton
              variant="outline"
              onClick={cancel}
              className="w-full mt-4"
            >
              Cancel
            </RcButton>
          </div>
        </div>
      )}

      {/* Card selection phase */}
      {phase === "selecting" && isOwner && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-[rgba(6,10,20,0.7)]">
          <div className="thin-scrollbar rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-6 max-w-3xl w-full mx-4 font-rc-sans text-rc-fg shadow-rc-panel max-h-[90vh] overflow-y-auto">
            <h2 className="mb-4 text-center font-rc-display text-[26px] leading-tight text-rc-fg-strong">
              Select Card (up to {RARITY_LABELS[maxRarity]} rarity)
            </h2>

            {eligibleCards.length === 0 ? (
              <p className="text-rc-fg-subtle text-center py-8">
                No eligible cards found in spellbook
              </p>
            ) : (
              <CardGrid columns={5}>
                {eligibleCards.map((card, idx) => (
                  <CardWithPreview
                    key={`${card.cardId}-${idx}`}
                    card={card}
                    onClick={() => selectCard(card)}
                    selected={selectedCard?.cardId === card.cardId}
                    interactive={true}
                    accentColor="red"
                  />
                ))}
              </CardGrid>
            )}

            <div className="flex justify-center gap-4">
              <RcButton onClick={resolve} disabled={!selectedCard}>
                Draw Card
              </RcButton>
              <RcButton variant="outline" onClick={cancel}>
                Cancel
              </RcButton>
            </div>
          </div>
        </div>
      )}

      {/* Opponent view */}
      {!isOwner && phase !== "complete" && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="rc-toast pointer-events-auto">
            {casterSeat.toUpperCase()} is resolving Demonic Contract...
          </div>
        </div>
      )}
    </div>
  );
}
