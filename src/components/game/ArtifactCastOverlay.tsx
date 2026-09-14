"use client";

import React from "react";
import { RcButton } from "@/components/ui/rc-button";
import { useGameStore } from "@/lib/game/store";
import CardWithPreview, { CardGrid } from "./CardWithPreview";

/**
 * Overlay for selecting a spell from collection when using Toolbox or Silver Bullet artifacts.
 *
 * Toolbox: "Sacrifice → Bearer may cast an Ordinary spell from your collection."
 * Silver Bullet: "Tap, Sacrifice → This unit may cast an Exceptional spell from your collection."
 */
export default function ArtifactCastOverlay() {
  const pending = useGameStore((s) => s.pendingArtifactCast);
  const actorKey = useGameStore((s) => s.actorKey);
  const selectSpell = useGameStore((s) => s.selectArtifactCastSpell);
  const resolve = useGameStore((s) => s.resolveArtifactCast);
  const cancel = useGameStore((s) => s.cancelArtifactCast);

  if (!pending) return null;

  const {
    phase,
    casterSeat,
    artifactType,
    bearer,
    eligibleSpells,
    selectedSpell,
  } = pending;

  // Hotseat: actorKey is null, always show caster UI
  // Online: only show caster UI if we're the caster
  const isCaster = actorKey === null || casterSeat === actorKey;

  const displayName = artifactType === "toolbox" ? "Toolbox" : "Silver Bullet";
  const rarityLabel = artifactType === "toolbox" ? "Ordinary" : "Exceptional";
  const accentColor = artifactType === "toolbox" ? "orange" : "cyan";

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* Top status bar */}
      <div className="fixed inset-x-0 top-6 z-[201] pointer-events-none flex justify-center">
        <div className="pointer-events-auto px-5 py-3 rounded-full border border-rc-line/22 bg-[rgba(7,10,20,0.9)] font-rc-sans text-rc-fg shadow-rc-panel text-lg flex items-center gap-3">
          <span className="font-rc-display text-rc-accent-link">
            {displayName}
          </span>
          <span className="text-rc-fg-muted">
            {phase === "selecting"
              ? `${bearer.name}: Select ${rarityLabel} spell from collection`
              : phase === "casting"
                ? `Casting ${selectedSpell?.name || "spell"}...`
                : "Complete"}
          </span>
        </div>
      </div>

      {/* Caster spell selection UI */}
      {isCaster && phase === "selecting" && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-[rgba(6,10,20,0.7)]">
          <div className="rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-6 max-w-4xl w-full mx-4 font-rc-sans text-rc-fg shadow-rc-panel">
            <div className="text-center mb-4">
              <h2 className="font-rc-display text-[22px] leading-tight text-rc-fg-strong">
                Select {rarityLabel} Spell from Collection
              </h2>
              <p className="text-sm text-rc-fg-subtle mt-1">
                {bearer.name} will cast the selected spell. {displayName} will
                be sacrificed.
              </p>
            </div>

            {eligibleSpells.length === 0 ? (
              <div className="rc-hint text-center py-8">
                No {rarityLabel.toLowerCase()} spells in your collection.
              </div>
            ) : (
              <CardGrid columns={5}>
                {eligibleSpells.map((spell, idx) => (
                  <CardWithPreview
                    key={spell.instanceId || `spell-${idx}`}
                    card={spell}
                    onClick={() => selectSpell(spell)}
                    selected={selectedSpell?.instanceId === spell.instanceId}
                    accentColor={accentColor}
                    showName
                  />
                ))}
              </CardGrid>
            )}

            {/* Action buttons */}
            <div className="flex gap-3 justify-center mt-6">
              <RcButton variant="outline" onClick={cancel}>
                Cancel
              </RcButton>
              <RcButton onClick={resolve} disabled={!selectedSpell}>
                Cast {selectedSpell?.name || "Spell"}
              </RcButton>
            </div>
          </div>
        </div>
      )}

      {/* Opponent waiting indicator */}
      {!isCaster && phase !== "complete" && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="rc-toast">
            {casterSeat.toUpperCase()} is using {displayName}...
          </div>
        </div>
      )}
    </div>
  );
}
