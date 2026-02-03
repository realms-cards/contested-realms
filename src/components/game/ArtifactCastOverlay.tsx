"use client";

import React from "react";
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
        <div
          className={`pointer-events-auto px-5 py-3 rounded-full bg-black/90 text-white ring-1 ${
            artifactType === "toolbox"
              ? "ring-orange-500/50"
              : "ring-cyan-500/50"
          } shadow-lg text-lg flex items-center gap-3`}
        >
          <span
            className={`${
              artifactType === "toolbox" ? "text-orange-400" : "text-cyan-400"
            } font-fantaisie`}
          >
            🔧 {displayName}
          </span>
          <span className="opacity-80">
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
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-black/70">
          <div
            className={`bg-black/95 rounded-xl p-6 max-w-4xl w-full mx-4 ring-1 ${
              artifactType === "toolbox"
                ? "ring-orange-500/30"
                : "ring-cyan-500/30"
            }`}
          >
            <div className="text-center mb-4">
              <h2 className="text-xl font-semibold text-white">
                Select {rarityLabel} Spell from Collection
              </h2>
              <p className="text-sm text-white/60 mt-1">
                {bearer.name} will cast the selected spell. {displayName} will
                be sacrificed.
              </p>
            </div>

            {eligibleSpells.length === 0 ? (
              <div className="text-center py-8 text-white/60">
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
              <button
                onClick={cancel}
                className="px-6 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={resolve}
                disabled={!selectedSpell}
                className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                  selectedSpell
                    ? artifactType === "toolbox"
                      ? "bg-orange-600 hover:bg-orange-500 text-white"
                      : "bg-cyan-600 hover:bg-cyan-500 text-white"
                    : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                }`}
              >
                Cast {selectedSpell?.name || "Spell"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Opponent waiting indicator */}
      {!isCaster && phase !== "complete" && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div
            className={`px-4 py-2 rounded-lg bg-black/90 text-sm ${
              artifactType === "toolbox" ? "text-orange-300" : "text-cyan-300"
            }`}
          >
            {casterSeat.toUpperCase()} is using {displayName}...
          </div>
        </div>
      )}
    </div>
  );
}
