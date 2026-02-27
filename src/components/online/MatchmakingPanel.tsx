"use client";

import { Loader2, X, Users } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { useOnline } from "@/app/online/online-context";
import { isFeatureEnabled } from "@/lib/config/features";

interface MatchmakingPanelProps {
  onCreateMatch?: () => void;
}

export default function MatchmakingPanel({
  onCreateMatch,
}: MatchmakingPanelProps) {
  const {
    matchmaking,
    joinMatchmaking,
    leaveMatchmaking,
    leaveLobby,
    lobby,
    match,
    players,
    lobbies,
  } = useOnline();

  const isSearching = matchmaking.status === "searching";
  const matchFound = matchmaking.status === "found";

  // Disable matchmaking when in a lobby or match
  const disabled = !!lobby || !!match;

  // Count online players
  const onlineCount = players.length;
  const queueSize = matchmaking.queueSize ?? 0;

  // Count precon matches (lobbies with precon type that are open or started)
  const preconStats = useMemo(() => {
    let waiting = 0;
    let playing = 0;
    for (const l of lobbies) {
      // Check if it's a precon/matchmaking lobby (no planned match type or constructed with precon name pattern)
      const isPrecon =
        l.isMatchmakingLobby || l.name?.toLowerCase().includes("precon");
      if (isPrecon) {
        if (l.status === "open") waiting += l.players.length;
        else if (l.status === "started") playing += l.players.length;
      }
    }
    return { waiting: waiting + queueSize, playing };
  }, [lobbies, queueSize]);

  const handleSearchClick = () => {
    if (disabled) return;
    if (isSearching || matchFound) {
      leaveMatchmaking();
      if (lobby) {
        leaveLobby();
      }
    } else {
      joinMatchmaking(["precon"]);
    }
  };

  if (disabled) {
    return null;
  }

  return (
    <div className="flex gap-3">
      {/* Card 1: Online Count (smaller, non-interactive) */}
      <div className="rounded-lg bg-gradient-to-br from-emerald-950/40 to-slate-900/60 ring-1 ring-emerald-500/20 flex flex-col items-center justify-center px-4 py-2">
        <div className="text-2xl font-bold text-white leading-none">
          {onlineCount}
        </div>
        <div className="flex items-center gap-1 mt-1">
          <Users className="w-3 h-3 text-emerald-400" />
          <div className="text-[10px] text-emerald-300/80">online</div>
        </div>
      </div>

      {/* Card 2: Quick Play with Precons */}
      <button
        onClick={handleSearchClick}
        className="flex-1 rounded-xl bg-gradient-to-br from-violet-950/40 to-slate-900/60 ring-1 ring-violet-500/20 flex flex-col items-center justify-center p-3 hover:bg-white/5 transition-colors group"
      >
        {isSearching || matchFound ? (
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold text-white">
              {matchFound ? "Match Found!" : "Searching..."}
            </div>
            {isSearching && (
              <Loader2 className="w-4 h-4 text-violet-300 animate-spin" />
            )}
            <X className="w-4 h-4 text-red-400 opacity-60 group-hover:opacity-100" />
          </div>
        ) : (
          <div>
            <div className="text-sm font-semibold text-white">
              Quick Play Precons
            </div>
            <div className="text-[10px] text-violet-300/80">
              {preconStats.waiting > 0
                ? `${preconStats.waiting} waiting`
                : "Click to find match"}
            </div>
          </div>
        )}
      </button>

      {/* Card 3: Tutorial - shown when feature-gated */}
      {isFeatureEnabled("tutorialMode") && (
        <Link
          href="/tutorial"
          className="rounded-xl bg-gradient-to-br from-amber-950/40 to-slate-900/60 ring-1 ring-amber-500/20 flex flex-col items-center justify-center px-4 py-3 hover:bg-white/5 transition-colors"
        >
          <div className="text-sm font-semibold text-white">Learn to Play</div>
          <div className="text-[10px] text-amber-300/80">Interactive Tutorial</div>
        </Link>
      )}

      {/* Card 4: Create Match */}
      <button
        onClick={onCreateMatch}
        className="flex-1 rounded-xl bg-gradient-to-br from-green-600/80 to-green-700/60 ring-1 ring-green-500/40 flex flex-col items-center justify-center p-3 hover:from-green-600 hover:to-green-700 transition-colors"
      >
        <div className="text-sm font-semibold text-white">Create Match</div>
        <div className="text-[10px] text-green-100/80">
          Constructed • Sealed • Draft
        </div>
      </button>
    </div>
  );
}
