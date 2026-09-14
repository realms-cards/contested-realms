"use client";

import { X, Users, Hash, Eye, Check, Copy } from "lucide-react";
import { useState, useCallback } from "react";
import { RcButton } from "@/components/ui/rc-button";
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
  // Guides need both players; the local toggle is only half of it.
  const combatGuidesActive = useGameStore((s) => s.combatGuidesActive);
  const magicGuidesActive = useGameStore((s) => s.magicGuidesActive);
  const hasSeat = useGameStore((s) => s.actorKey !== null);
  const actionNotifications = useGameStore((s) => s.actionNotifications);
  const setActionNotifications = useGameStore((s) => s.setActionNotifications);
  const cardPreviewsEnabled = useGameStore((s) => s.cardPreviewsEnabled);
  const setCardPreviewsEnabled = useGameStore((s) => s.setCardPreviewsEnabled);

  const [linkCopied, setLinkCopied] = useState(false);

  /**
   * The toggle is this player's opt-in. The guided overlays only run once both
   * players have opted in over the same match, so say which of the two it is.
   */
  const guideHint = (local: boolean, active: boolean) => {
    if (!local || active) return null;
    return (
      <span className="ml-2 font-rc-mono text-[10px] uppercase tracking-[0.14em] text-rc-warning">
        {hasSeat ? "waiting for opponent" : "online only"}
      </span>
    );
  };

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
    <div className="absolute inset-0 z-30 bg-[rgba(6,10,20,0.5)] backdrop-blur-[4px] flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] text-rc-fg shadow-rc-panel">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-rc-line/12">
          <h2 className="m-0 font-rc-display text-[22px] leading-none text-rc-fg-strong">Match Info</h2>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-rc-md p-1 text-rc-fg-muted transition-colors hover:bg-rc-line/6 hover:text-rc-fg-strong"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Spectate Link */}
          {!spectatorMode && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 font-rc-sans text-sm">
                <Eye className="w-4 h-4 text-rc-fg-subtle" />
                <span className="text-rc-fg-muted">Share Spectate Link:</span>
              </div>
              <RcButton
                variant="outline"
                onClick={copySpectateLink}
                className={`w-full ${
                  linkCopied
                    ? "border-rc-success/45 bg-rc-success/15 text-rc-success-ink hover:border-rc-success/45 hover:bg-rc-success/15 hover:text-rc-success-ink"
                    : ""
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
              </RcButton>
              <p className="font-rc-sans text-xs text-rc-fg-subtle text-center">
                Anyone with this link can watch your match live
              </p>
            </div>
          )}

          {/* Match Details */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 font-rc-sans text-sm">
              <Hash className="w-4 h-4 text-rc-fg-subtle" />
              <span className="text-rc-fg-muted">Match ID:</span>
              <span className="rounded-rc-sm border border-rc-line/12 bg-black/30 px-2 py-1 font-rc-mono text-xs text-rc-fg">
                {matchId}
              </span>
            </div>

            <div className="flex items-center gap-2 font-rc-sans text-sm">
              <Users className="w-4 h-4 text-rc-fg-subtle" />
              <span className="text-rc-fg-muted">Players:</span>
            </div>
            <div className="ml-6 space-y-2 font-rc-sans text-sm">
              <div className="flex items-center gap-2">
                <span className="text-blue-400">{playerNames.p1}</span>
                {myPlayerNumber === 1 && (
                  <span className="font-rc-mono text-rc-accent-link text-xs">(You)</span>
                )}
                <span className="text-rc-fg-dim">•</span>
                <span className="font-rc-mono tabular-nums text-rc-fg-muted">
                  Life: {players.p1?.life || 20}
                </span>
                <span className="text-rc-fg-dim">•</span>
                <span className="font-rc-mono tabular-nums text-rc-fg-muted">Mana: {p1Mana}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-red-400">{playerNames.p2}</span>
                {myPlayerNumber === 2 && (
                  <span className="font-rc-mono text-rc-accent-link text-xs">(You)</span>
                )}
                <span className="text-rc-fg-dim">•</span>
                <span className="font-rc-mono tabular-nums text-rc-fg-muted">
                  Life: {players.p2?.life || 20}
                </span>
                <span className="text-rc-fg-dim">•</span>
                <span className="font-rc-mono tabular-nums text-rc-fg-muted">Mana: {p2Mana}</span>
              </div>
            </div>
          </div>

          {/* Game State */}
          <div className="space-y-2 pt-2 border-t border-rc-line/12">
            <h3 className="rc-eyebrow m-0">Game State</h3>
            <div className="font-rc-sans text-sm space-y-1 text-rc-fg-muted">
              <div className="flex justify-between">
                <span>Current Turn:</span>
                <span className="font-medium text-rc-fg">
                  {currentPlayer === 1 ? playerNames.p1 : playerNames.p2} (P
                  {currentPlayer})
                </span>
              </div>
              <div className="flex justify-between">
                <span>Phase:</span>
                <span className="font-medium text-rc-fg">{phase}</span>
              </div>
              <div className="flex justify-between">
                <span>Events:</span>
                <span className="font-rc-mono font-medium tabular-nums text-rc-fg">{eventSeq}</span>
              </div>
              <div className="flex justify-between">
                <span>Server Sync:</span>
                <span className="font-rc-mono font-medium tabular-nums text-rc-fg">{lastServerTs || 0}</span>
              </div>
              {!spectatorMode && (
                <>
                  <div className="flex items-center justify-between pt-1">
                    <span>
                      Combat Guides
                      {guideHint(interactionGuides, combatGuidesActive)}
                    </span>
                    <RcButton
                      variant="quiet"
                      size="xs"
                      tone="success"
                      className="h-[26px] rounded-full px-3 font-rc-mono tracking-[0.08em]"
                      onClick={() => setInteractionGuides(!interactionGuides)}
                      aria-pressed={interactionGuides}
                    >
                      {interactionGuides ? "On" : "Off"}
                    </RcButton>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span>
                      Magic Guides
                      {guideHint(magicGuides, magicGuidesActive)}
                    </span>
                    <RcButton
                      variant="quiet"
                      size="xs"
                      tone="moonlight"
                      className="h-[26px] rounded-full px-3 font-rc-mono tracking-[0.08em]"
                      onClick={() => setMagicGuides(!magicGuides)}
                      aria-pressed={magicGuides}
                    >
                      {magicGuides ? "On" : "Off"}
                    </RcButton>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span>Action Notifications</span>
                    <RcButton
                      variant="quiet"
                      size="xs"
                      tone="success"
                      className="h-[26px] rounded-full px-3 font-rc-mono tracking-[0.08em]"
                      onClick={() =>
                        setActionNotifications(!actionNotifications)
                      }
                      aria-pressed={actionNotifications}
                    >
                      {actionNotifications ? "On" : "Off"}
                    </RcButton>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span>Card Previews (P)</span>
                    <RcButton
                      variant="quiet"
                      size="xs"
                      tone="info"
                      className="h-[26px] rounded-full px-3 font-rc-mono tracking-[0.08em]"
                      onClick={() =>
                        setCardPreviewsEnabled(!cardPreviewsEnabled)
                      }
                      aria-pressed={cardPreviewsEnabled}
                    >
                      {cardPreviewsEnabled ? "On" : "Off"}
                    </RcButton>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Connection Status */}
          <div className="space-y-2 pt-2 border-t border-rc-line/12">
            <h3 className="rc-eyebrow m-0">Connection</h3>
            <div className="flex items-center justify-between">
              <span className="font-rc-sans text-sm text-rc-fg-muted">Status:</span>
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${
                    connected ? "bg-rc-success" : "bg-rc-danger"
                  }`}
                />
                <span className="font-rc-sans text-sm font-medium text-rc-fg">
                  {connected ? "Connected" : "Disconnected"}
                </span>
              </div>
            </div>
            {pendingCount > 0 && (
              <div className="flex items-center justify-between">
                <span className="font-rc-sans text-sm text-rc-fg-muted">Pending Updates:</span>
                <div className="flex items-center gap-2">
                  <span className="font-rc-mono text-sm font-medium tabular-nums text-rc-fg">{pendingCount}</span>
                  <RcButton
                    variant="quiet"
                    size="xs"
                    className="h-[22px] rounded-rc-sm px-2 font-rc-mono disabled:opacity-40"
                    onClick={() => flushPending()}
                    disabled={!connected || pendingCount === 0}
                  >
                    Sync
                  </RcButton>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-rc-line/12">
          <RcButton
            variant="outline"
            onClick={onClose}
            className="w-full"
          >
            Close
          </RcButton>
        </div>
      </div>
    </div>
  );
}
