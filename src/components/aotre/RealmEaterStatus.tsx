"use client";

/**
 * Attack of the Realm Eater - Realm Eater Status Panel
 *
 * Shows the Realm Eater's health, power pool, and other stats
 * Compact version with collapsible details for overlay display
 */

import { useState } from "react";
import { AOTRE_COLORS } from "@/lib/aotre/constants";
import { useAotreStore } from "@/lib/aotre/store";

interface RealmEaterStatusProps {
  compact?: boolean;
}

export function RealmEaterStatus({ compact }: RealmEaterStatusProps) {
  const realmEater = useAotreStore((s) => s.realmEater);
  const minions = useAotreStore((s) => s.minions);
  const destination = useAotreStore((s) => s.destination);
  const aiPhase = useAotreStore((s) => s.aiPhase);
  const phase = useAotreStore((s) => s.phase);

  // Collapsible state for compact mode
  const [isExpanded, setIsExpanded] = useState(false);

  const healthPercent = (realmEater.health / realmEater.maxHealth) * 100;

  if (compact) {
    return (
      <div className="rounded-xl bg-black/60 backdrop-blur-md p-3 ring-1 ring-red-500/20 shadow-xl">
        {/* Header with game font - clickable to toggle */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex w-full items-center justify-between group"
        >
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-lg shadow-red-500/50" />
            <h2
              className="font-fantaisie text-sm"
              style={{ color: AOTRE_COLORS.realmEater }}
            >
              Realm Eater
            </h2>
          </div>
          <span className="text-xs text-gray-500 group-hover:text-gray-400 transition-colors">
            {isExpanded ? "▼" : "▶"}
          </span>
        </button>

        {/* Health Bar - always visible */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-400">Health</span>
            <span className="font-fantaisie text-white">
              {realmEater.health} / {realmEater.maxHealth}
            </span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-gray-800 ring-1 ring-white/5">
            <div
              className="h-full transition-all duration-500 rounded-full"
              style={{
                width: `${healthPercent}%`,
                background:
                  healthPercent > 50
                    ? "linear-gradient(90deg, #22c55e, #4ade80)"
                    : healthPercent > 25
                      ? "linear-gradient(90deg, #f59e0b, #fbbf24)"
                      : "linear-gradient(90deg, #dc2626, #ef4444)",
                boxShadow:
                  healthPercent > 50
                    ? "0 0 10px rgba(34,197,94,0.5)"
                    : healthPercent > 25
                      ? "0 0 10px rgba(245,158,11,0.5)"
                      : "0 0 10px rgba(239,68,68,0.5)",
              }}
            />
          </div>
        </div>

        {/* Phase indicator - always visible when RE turn */}
        {phase === "RealmEaterTurn" && aiPhase && (
          <div className="mt-3 rounded-lg bg-red-500/20 px-2 py-1.5 text-xs font-fantaisie text-red-300 ring-1 ring-red-500/30">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              {aiPhase}
            </div>
          </div>
        )}

        {/* Collapsible details */}
        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-white/5 space-y-2">
            {/* Resources */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-white/5 px-2 py-1.5 text-center">
                <div className="text-[10px] text-gray-500">Power</div>
                <div className="font-fantaisie text-sm text-purple-400">
                  {realmEater.powerPool}
                </div>
              </div>
              <div className="rounded-lg bg-white/5 px-2 py-1.5 text-center">
                <div className="text-[10px] text-gray-500">Mana</div>
                <div className="font-fantaisie text-sm text-blue-400">
                  {realmEater.manaPool}
                </div>
              </div>
            </div>

            {/* Position */}
            <div className="text-xs bg-white/5 rounded-lg px-2 py-1.5">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Position</span>
                <div>
                  <span className="font-fantaisie text-white">
                    {realmEater.position}
                  </span>
                  <span className="text-gray-500 mx-1">→</span>
                  <span
                    className="font-fantaisie"
                    style={{ color: AOTRE_COLORS.destinationMarker }}
                  >
                    {destination.cellKey}
                  </span>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="flex justify-between text-xs text-gray-400">
              <span>Minions: {minions.length}</span>
              <span>Deck: {realmEater.minionDeck.length}</span>
              <span>Consumed: {realmEater.hand.length}</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Full-size version
  return (
    <div className="flex h-full flex-col rounded-lg bg-gray-900/90 p-4 backdrop-blur-sm">
      {/* Header with game font */}
      <h2
        className="mb-4 font-fantaisie text-lg"
        style={{ color: AOTRE_COLORS.realmEater }}
      >
        The Realm Eater
      </h2>

      {/* Health Bar */}
      <div className="mb-4">
        <div className="mb-1 flex justify-between text-sm">
          <span className="text-gray-400">Health</span>
          <span className="font-fantaisie text-white">
            {realmEater.health} / {realmEater.maxHealth}
          </span>
        </div>
        <div className="h-4 w-full overflow-hidden rounded-full bg-gray-700">
          <div
            className="h-full transition-all duration-300"
            style={{
              width: `${healthPercent}%`,
              backgroundColor:
                healthPercent > 50
                  ? "#22c55e"
                  : healthPercent > 25
                    ? "#f59e0b"
                    : "#ef4444",
            }}
          />
        </div>
      </div>

      {/* Resources */}
      <div className="mb-4 grid grid-cols-2 gap-2">
        <div className="rounded bg-gray-800 p-2 text-center">
          <div className="text-xs text-gray-400">Power Pool</div>
          <div className="font-fantaisie text-xl text-purple-400">
            {realmEater.powerPool}
          </div>
        </div>
        <div className="rounded bg-gray-800 p-2 text-center">
          <div className="text-xs text-gray-400">Mana Pool</div>
          <div className="font-fantaisie text-xl text-blue-400">
            {realmEater.manaPool}
          </div>
        </div>
      </div>

      {/* Position Info */}
      <div className="mb-4 rounded bg-gray-800 p-2">
        <div className="mb-1 text-xs text-gray-400">Position</div>
        <div className="flex justify-between font-fantaisie text-sm">
          <span className="text-white">{realmEater.position}</span>
          <span className="text-gray-400">→</span>
          <span style={{ color: AOTRE_COLORS.destinationMarker }}>
            {destination.cellKey}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-4 space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-400">Minions</span>
          <span className="font-fantaisie text-white">{minions.length}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Sites Consumed</span>
          <span className="font-fantaisie text-white">
            {realmEater.hand.length}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Magic Deck</span>
          <span className="font-fantaisie text-white">
            {realmEater.magicDeck.length}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Minion Deck</span>
          <span className="font-fantaisie text-white">
            {realmEater.minionDeck.length}
          </span>
        </div>
      </div>

      {/* Current Phase */}
      {phase === "RealmEaterTurn" && aiPhase && (
        <div className="mb-4 rounded bg-red-900/30 p-2">
          <div className="text-xs text-gray-400">Current Phase</div>
          <div className="font-fantaisie text-red-400">{aiPhase}</div>
        </div>
      )}
    </div>
  );
}
