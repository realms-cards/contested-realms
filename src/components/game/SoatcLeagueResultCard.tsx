"use client";

import { Copy, Download, Check, Trophy, ExternalLink } from "lucide-react";
import { useState } from "react";
import type { LeagueMatchResult } from "@/lib/soatc/types";

interface SoatcLeagueResultCardProps {
  result: LeagueMatchResult;
  isWinner: boolean;
}

export function SoatcLeagueResultCard({
  result,
  isWinner,
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
    <div className="bg-gradient-to-b from-amber-900/30 to-stone-900/50 rounded-lg border border-amber-600/50 p-4 max-w-md">
      <div className="flex items-center gap-2 mb-3">
        <Trophy className="w-5 h-5 text-amber-400" />
        <h3 className="font-semibold text-amber-100">Sorcerers at the Core</h3>
      </div>

      <div className="text-sm text-stone-300 mb-4 space-y-1">
        <p>
          <span className="text-stone-500">Tournament:</span>{" "}
          {result.tournamentName}
        </p>
        <p>
          <span className="text-stone-500">Result:</span>{" "}
          {result.isDraw ? (
            <span className="text-stone-300">Draw</span>
          ) : isWinner ? (
            <span className="text-green-400">You won!</span>
          ) : (
            <span className="text-red-400">You lost</span>
          )}
        </p>
        <p>
          <span className="text-stone-500">Duration:</span>{" "}
          {Math.floor(result.durationSeconds / 60)}m{" "}
          {result.durationSeconds % 60}s
        </p>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          onClick={handleCopy}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 
                     bg-amber-600 hover:bg-amber-500 rounded-lg text-sm font-medium
                     transition-colors"
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
        </button>
        <button
          onClick={handleDownload}
          className="flex items-center justify-center gap-2 px-3 py-2 
                     bg-stone-700 hover:bg-stone-600 rounded-lg text-sm font-medium
                     transition-colors"
        >
          <Download className="w-4 h-4" />
        </button>
      </div>

      {/* Direct link to add match result with prefilled data */}
      <a
        href={buildSoatcFormUrl(result)}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full text-center px-3 py-2 mb-3
                   bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 
                   rounded-lg text-sm font-semibold transition-colors"
      >
        <span className="flex items-center justify-center gap-2">
          <ExternalLink className="w-4 h-4" />
          Submit Match Result
        </span>
      </a>

      <p className="text-xs text-stone-500 text-center">
        Opens the ranking submission form with prefilled data
      </p>
    </div>
  );
}

function buildSoatcFormUrl(result: LeagueMatchResult): string {
  const baseUrl = "https://ranking.sorcerersatthecore.com/matches/add";
  const params = new URLSearchParams();

  // realmscards - matchId to identify it came from Realms.cards
  params.set("realmscards", result.matchId);

  // tournament (uuid) - optional but we always have it for league matches
  if (result.tournamentId) {
    params.set("tournament", result.tournamentId);
  }

  // gametype - required if no tournament, maps from our format
  // Our formats: "constructed" | "sealed" | "draft"
  // SOATC expects: "constructed", "sealed", "draft" (same naming)
  if (result.format) {
    params.set("gametype", result.format);
  }

  // submitter - SOATC UUID of player 1 (the one submitting)
  if (result.player1?.soatcUuid) {
    params.set("submitter", result.player1.soatcUuid);
  }

  // opponent - SOATC UUID of player 2
  if (result.player2?.soatcUuid) {
    params.set("opponent", result.player2.soatcUuid);
  }

  // winner - SOATC UUID of the winner (empty for draw, but draws not supported yet)
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

  return `${baseUrl}?${params.toString()}`;
}
