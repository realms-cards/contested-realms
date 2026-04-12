"use client";

import { Loader2, Users, X } from "lucide-react";
import Link from "next/link";
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
    declineMatchmaking,
    leaveLobby,
    lobby,
    match,
    players,
  } = useOnline();

  const isSearching = matchmaking.status === "searching";
  const isConfirming = matchmaking.status === "confirming";
  const matchFound = matchmaking.status === "found";

  // Disable matchmaking when in a lobby or match
  const disabled = !!lobby || !!match;

  // Count online players
  const onlineCount = players.length;
  const queueSize = matchmaking.queueSize ?? 0;
  const queueBySource = matchmaking.queueBySource;
  const queuePosition = matchmaking.queuePosition;
  const confirmSeconds =
    matchmaking.confirmExpiresAt !== null
      ? Math.max(
          0,
          Math.ceil((matchmaking.confirmExpiresAt - Date.now()) / 1000),
        )
      : null;

  const handleSearchClick = () => {
    if (disabled) return;
    if (isConfirming) {
      declineMatchmaking();
      return;
    }
    if (isSearching || matchFound) {
      leaveMatchmaking();
      if (lobby) {
        leaveLobby();
      }
    } else {
      joinMatchmaking(["constructed"]);
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

      {/* Card 2: Constructed Queue */}
      <button
        onClick={handleSearchClick}
        className={`flex-1 rounded-xl ring-1 flex flex-col items-center justify-center p-3 transition-all duration-200 group ${
          isConfirming
            ? "bg-gradient-to-br from-amber-600/20 via-rose-950/55 to-slate-950/90 ring-amber-400/50 shadow-[0_0_18px_rgba(251,191,36,0.16)]"
            : matchFound
              ? "bg-gradient-to-br from-emerald-700/25 via-emerald-950/55 to-slate-950/90 ring-emerald-400/35 shadow-[0_0_16px_rgba(16,185,129,0.12)]"
              : isSearching
                ? "bg-gradient-to-br from-violet-700/20 via-violet-950/55 to-slate-950/90 ring-violet-400/35 shadow-[0_0_16px_rgba(139,92,246,0.14)]"
                : "bg-gradient-to-br from-violet-950/40 to-slate-900/60 ring-violet-500/20 hover:ring-violet-400/35 hover:bg-white/5"
        }`}
      >
        {isConfirming || matchFound ? (
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold text-white">
              {isConfirming
                ? `Confirm${confirmSeconds !== null ? ` • ${confirmSeconds}s` : ""}`
                : "Match Ready"}
            </div>
            <X className="w-4 h-4 text-red-400 opacity-60 group-hover:opacity-100" />
          </div>
        ) : isSearching ? (
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold text-white">Searching...</div>
            <Loader2 className="w-4 h-4 text-violet-300 animate-spin" />
            <X className="w-4 h-4 text-red-400 opacity-60 group-hover:opacity-100" />
          </div>
        ) : (
          <div>
            <div className="text-sm font-semibold text-white">
              Constructed Queue
            </div>
            <div className="text-[10px] text-violet-300/80">
              {queueSize > 0 ? `${queueSize} waiting` : "Click to find match"}
            </div>
            {queueBySource ? (
              <div className="text-[10px] text-violet-200/60 mt-1">
                {queueBySource.web} web • {queueBySource.discord} discord
              </div>
            ) : null}
            {isSearching && queuePosition !== null ? (
              <div className="text-[10px] text-violet-200/60 mt-1">
                You are #{queuePosition + 1}
              </div>
            ) : null}
          </div>
        )}
      </button>

      {/* Card 3: Create Match */}
      <button
        onClick={onCreateMatch}
        className="flex-1 rounded-xl bg-gradient-to-br from-green-600/80 to-green-700/60 ring-1 ring-green-500/40 flex flex-col items-center justify-center p-3 hover:from-green-600 hover:to-green-700 transition-colors"
      >
        <div className="text-sm font-semibold text-white">Create Match</div>
        <div className="text-[10px] text-green-100/80">
          Constructed • Sealed • Draft
        </div>
      </button>

      {/* Card 4: Tutorial - shown when feature-gated */}
      {isFeatureEnabled("tutorialMode") && (
        <Link
          href="/tutorial"
          className="rounded-xl bg-gradient-to-br from-amber-950/40 to-slate-900/60 ring-1 ring-amber-500/20 flex flex-col items-center justify-center px-4 py-3 hover:bg-white/5 transition-colors"
        >
          <div className="text-sm font-semibold text-white">Learn to Play</div>
          <div className="text-[10px] text-amber-300/80">
            Interactive Tutorial
          </div>
        </Link>
      )}
    </div>
  );
}
