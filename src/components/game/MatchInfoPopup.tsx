"use client";

import { useState, useCallback } from "react";
import { X, Users, Hash, Eye, Check, Copy } from "lucide-react";
import { useGameStore } from "@/lib/game/store";

interface MatchInfoPopupProps {
  isOpen: boolean;
  onClose: () => void;
  matchId: string;
  playerNames: { p1: string; p2: string };
  myPlayerNumber: number | null;
  connected: boolean;
  spectatorMode?: boolean;
}

export default function MatchInfoPopup({
  isOpen,
  onClose,
  matchId,
  playerNames,
  myPlayerNumber,
  connected,
  spectatorMode = false,
}: MatchInfoPopupProps) {
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const phase = useGameStore((s) => s.phase);
  const players = useGameStore((s) => s.players);
  const p1Mana = useGameStore((s) => s.getAvailableMana("p1"));
  const p2Mana = useGameStore((s) => s.getAvailableMana("p2"));
  const eventSeq = useGameStore((s) => s.eventSeq);
  const lastServerTs = useGameStore((s) => s.lastServerTs);
  const pendingCount = useGameStore((s) => s.pendingPatches.length);
  const flushPending = useGameStore((s) => s.flushPendingPatches);
  const interactionGuides = useGameStore((s) => s.interactionGuides);
  const setInteractionGuides = useGameStore((s) => s.setInteractionGuides);
  const magicGuides = useGameStore((s) => s.magicGuides);
  const setMagicGuides = useGameStore((s) => s.setMagicGuides);
  const actionNotifications = useGameStore((s) => s.actionNotifications);
  const setActionNotifications = useGameStore((s) => s.setActionNotifications);
  const cardPreviewsEnabled = useGameStore((s) => s.cardPreviewsEnabled);
  const setCardPreviewsEnabled = useGameStore((s) => s.setCardPreviewsEnabled);

  const [linkCopied, setLinkCopied] = useState(false);

  const copySpectateLink = useCallback(() => {
    if (!matchId) return;
    const url = `${window.location.origin}/online/play/${matchId}?watch=1`;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      })
      .catch(() => {
        // Fallback: select text for manual copy
        const input = document.createElement("input");
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      });
  }, [matchId]);

  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-30 bg-black/50 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="bg-zinc-900/95 text-white rounded-2xl ring-1 ring-white/10 shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-lg font-semibold">Match Info</h2>
          <button
            onClick={onClose}
            className="rounded-full bg-white/10 hover:bg-white/20 p-1 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Spectate Link */}
          {!spectatorMode && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Eye className="w-4 h-4 opacity-60" />
                <span className="opacity-70">Share Spectate Link:</span>
              </div>
              <button
                onClick={copySpectateLink}
                className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  linkCopied
                    ? "bg-green-600/90 text-white"
                    : "bg-purple-600/80 hover:bg-purple-500 text-white"
                }`}
              >
                {linkCopied ? (
                  <>
                    <Check className="w-4 h-4" />
                    Link Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy Spectate Link
                  </>
                )}
              </button>
              <p className="text-xs opacity-50 text-center">
                Anyone with this link can watch your match live
              </p>
            </div>
          )}

          {/* Match Details */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Hash className="w-4 h-4 opacity-60" />
              <span className="opacity-70">Match ID:</span>
              <span className="font-mono text-xs bg-black/30 px-2 py-1 rounded">
                {matchId}
              </span>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <Users className="w-4 h-4 opacity-60" />
              <span className="opacity-70">Players:</span>
            </div>
            <div className="ml-6 space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-blue-400">{playerNames.p1}</span>
                {myPlayerNumber === 1 && (
                  <span className="text-green-400 text-xs">(You)</span>
                )}
                <span className="opacity-50">•</span>
                <span className="opacity-70">
                  Life: {players.p1?.life || 20}
                </span>
                <span className="opacity-50">•</span>
                <span className="opacity-70">Mana: {p1Mana}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-red-400">{playerNames.p2}</span>
                {myPlayerNumber === 2 && (
                  <span className="text-green-400 text-xs">(You)</span>
                )}
                <span className="opacity-50">•</span>
                <span className="opacity-70">
                  Life: {players.p2?.life || 20}
                </span>
                <span className="opacity-50">•</span>
                <span className="opacity-70">Mana: {p2Mana}</span>
              </div>
            </div>
          </div>

          {/* Game State */}
          <div className="space-y-2 pt-2 border-t border-white/10">
            <h3 className="font-medium text-sm">Game State</h3>
            <div className="text-sm space-y-1 opacity-80">
              <div className="flex justify-between">
                <span>Current Turn:</span>
                <span className="font-medium">
                  {currentPlayer === 1 ? playerNames.p1 : playerNames.p2} (P
                  {currentPlayer})
                </span>
              </div>
              <div className="flex justify-between">
                <span>Phase:</span>
                <span className="font-medium">{phase}</span>
              </div>
              <div className="flex justify-between">
                <span>Events:</span>
                <span className="font-medium">{eventSeq}</span>
              </div>
              <div className="flex justify-between">
                <span>Server Sync:</span>
                <span className="font-medium">{lastServerTs || 0}</span>
              </div>
              {!spectatorMode && (
                <>
                  <div className="flex items-center justify-between pt-1">
                    <span>Combat Guides</span>
                    <button
                      className={`rounded-full px-3 py-1 text-xs transition-colors ${
                        interactionGuides
                          ? "bg-emerald-600/90 hover:bg-emerald-500"
                          : "bg-white/15 hover:bg-white/25"
                      }`}
                      onClick={() => setInteractionGuides(!interactionGuides)}
                      aria-pressed={interactionGuides}
                    >
                      {interactionGuides ? "On" : "Off"}
                    </button>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span>Magic Guides</span>
                    <button
                      className={`rounded-full px-3 py-1 text-xs transition-colors ${
                        magicGuides
                          ? "bg-indigo-600/90 hover:bg-indigo-500"
                          : "bg-white/15 hover:bg-white/25"
                      }`}
                      onClick={() => setMagicGuides(!magicGuides)}
                      aria-pressed={magicGuides}
                    >
                      {magicGuides ? "On" : "Off"}
                    </button>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span>Action Notifications</span>
                    <button
                      className={`rounded-full px-3 py-1 text-xs transition-colors ${
                        actionNotifications
                          ? "bg-amber-600/90 hover:bg-amber-500"
                          : "bg-white/15 hover:bg-white/25"
                      }`}
                      onClick={() =>
                        setActionNotifications(!actionNotifications)
                      }
                      aria-pressed={actionNotifications}
                    >
                      {actionNotifications ? "On" : "Off"}
                    </button>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span>Card Previews (P)</span>
                    <button
                      className={`rounded-full px-3 py-1 text-xs transition-colors ${
                        cardPreviewsEnabled
                          ? "bg-cyan-600/90 hover:bg-cyan-500"
                          : "bg-white/15 hover:bg-white/25"
                      }`}
                      onClick={() =>
                        setCardPreviewsEnabled(!cardPreviewsEnabled)
                      }
                      aria-pressed={cardPreviewsEnabled}
                    >
                      {cardPreviewsEnabled ? "On" : "Off"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Connection Status */}
          <div className="space-y-2 pt-2 border-t border-white/10">
            <h3 className="font-medium text-sm">Connection</h3>
            <div className="flex items-center justify-between">
              <span className="text-sm opacity-80">Status:</span>
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${
                    connected ? "bg-green-400" : "bg-red-400"
                  }`}
                />
                <span className="text-sm font-medium">
                  {connected ? "Connected" : "Disconnected"}
                </span>
              </div>
            </div>
            {pendingCount > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm opacity-80">Pending Updates:</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{pendingCount}</span>
                  <button
                    className="px-2 py-0.5 text-xs rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-40 transition-colors"
                    onClick={() => flushPending()}
                    disabled={!connected || pendingCount === 0}
                  >
                    Sync
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10">
          <button
            onClick={onClose}
            className="w-full bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
