"use client";

import { Copy, Download, Check, Trophy, ExternalLink } from "lucide-react";
import { useState } from "react";
import { RcButton, rcButtonVariants } from "@/components/ui/rc-button";
import type { LeagueMatchResult } from "@/lib/soatc/types";

interface SoatcLeagueResultCardProps {
  result: LeagueMatchResult;
  isWinner: boolean;
  viewerSoatcUuid?: string;
}

export function SoatcLeagueResultCard({
  result,
  isWinner,
  viewerSoatcUuid,
}: SoatcLeagueResultCardProps) {
  const [copied, setCopied] = useState(false);

  const resultJson = JSON.stringify(result, null, 2);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(resultJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([resultJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `soatc-result-${result.matchId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-rc-md border border-rc-accent/35 bg-rc-accent/8 p-4 max-w-md">
      <div className="flex items-center gap-2 mb-3">
        <Trophy className="w-5 h-5 text-rc-accent" />
        <h3 className="m-0 font-rc-display text-[18px] leading-none text-rc-fg-strong">Sorcerers at the Core</h3>
      </div>

      <div className="font-rc-sans text-sm text-rc-fg-muted mb-4 space-y-1">
        <p>
          <span className="text-rc-fg-subtle">Tournament:</span>{" "}
          {result.tournamentName}
        </p>
        <p>
          <span className="text-rc-fg-subtle">Result:</span>{" "}
          {result.isDraw ? (
            <span className="text-rc-fg-muted">Draw</span>
          ) : isWinner ? (
            <span className="text-rc-success">You won!</span>
          ) : (
            <span className="text-rc-danger">You lost</span>
          )}
        </p>
        <p>
          <span className="text-rc-fg-subtle">Duration:</span>{" "}
          <span className="font-rc-mono tabular-nums">
            {Math.floor(result.durationSeconds / 60)}m{" "}
            {result.durationSeconds % 60}s
          </span>
        </p>
      </div>

      <div className="flex gap-2 mb-4">
        <RcButton
          variant="outline"
          onClick={handleCopy}
          className="flex-1 px-3"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              Copy to Clipboard
            </>
          )}
        </RcButton>
        <RcButton
          variant="outline"
          onClick={handleDownload}
          className="px-3"
        >
          <Download className="w-4 h-4" />
        </RcButton>
      </div>

      {/* Direct link to add match result with prefilled data */}
      <a
        href={buildSoatcFormUrl(result, viewerSoatcUuid)}
        target="_blank"
        rel="noopener noreferrer"
        className={rcButtonVariants({ className: "mb-3 w-full" })}
      >
        <span className="flex items-center justify-center gap-2">
          <ExternalLink className="w-4 h-4" />
          Submit Match Result
        </span>
      </a>

      <p className="font-rc-sans text-xs text-rc-fg-subtle text-center">
        Opens the ranking submission form with prefilled data
      </p>
    </div>
  );
}

function buildSoatcFormUrl(
  result: LeagueMatchResult,
  viewerSoatcUuid?: string
): string {
  const baseUrl = "https://ranking.sorcerersatthecore.com/matches/add";
  const params = new URLSearchParams();

  // realmscards - matchId prefixed with "match_" to identify it came from Realms.cards (undocumented but supported)
  if (result.matchId) {
    params.set("realmscards", `match_${result.matchId}`);
  }

  // tournament (uuid) - optional but we always have it for league matches
  if (result.tournamentId) {
    params.set("tournament", result.tournamentId);
  }

  // game_type - required if no tournament
  // Our formats: "constructed" | "sealed" | "draft" (same naming as SOATC)
  if (result.format) {
    params.set("game_type", result.format);
  }

  // Determine submitter and opponent based on who is viewing
  // The submitter should be the current player viewing the result
  const viewerIsPlayer1 =
    viewerSoatcUuid && viewerSoatcUuid === result.player1?.soatcUuid;
  const submitter = viewerIsPlayer1 ? result.player1 : result.player2;
  const opponent = viewerIsPlayer1 ? result.player2 : result.player1;

  // submitter - SOATC UUID of the player submitting (current viewer)
  if (submitter?.soatcUuid) {
    params.set("submitter", submitter.soatcUuid);
  }

  // opponent - SOATC UUID of the other player
  if (opponent?.soatcUuid) {
    params.set("opponent", opponent.soatcUuid);
  }

  // winner - SOATC UUID of the winner (empty for draw)
  // If it's a draw, don't set winner (or set empty string if needed)
  if (!result.isDraw && result.winnerId) {
    // winnerId could be either soatcUuid or realmsUserId, need to resolve to soatcUuid
    if (
      result.winnerId === result.player1?.soatcUuid ||
      result.winnerId === result.player1?.realmsUserId
    ) {
      if (result.player1?.soatcUuid) {
        params.set("winner", result.player1.soatcUuid);
      }
    } else if (
      result.winnerId === result.player2?.soatcUuid ||
      result.winnerId === result.player2?.realmsUserId
    ) {
      if (result.player2?.soatcUuid) {
        params.set("winner", result.player2.soatcUuid);
      }
    }
  }
  // For draws: winner param is simply not set (or empty), which tells SOATC no winner yet

  return `${baseUrl}?${params.toString()}`;
}
