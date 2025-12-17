"use client";

import { Loader2, Search, X, Users } from "lucide-react";
import { useMemo } from "react";
import { useOnline } from "@/app/online/online-context";

export default function MatchmakingPanel() {
  const {
    matchmaking,
    joinMatchmaking,
    leaveMatchmaking,
    leaveLobby,
    lobby,
    match,
    players,
  } = useOnline();

  const isSearching = matchmaking.status === "searching";
  const matchFound = matchmaking.status === "found";

  // Disable matchmaking when in a lobby or match
  const disabled = !!lobby || !!match;

  // Count online players (excluding self)
  const onlineCount = players.length;
  const queueSize = matchmaking.queueSize ?? 0;

  const handleSearchClick = () => {
    if (disabled) return;
    if (isSearching || matchFound) {
      leaveMatchmaking();
      // Also leave any lobby created by matchmaking
      if (lobby) {
        leaveLobby();
      }
    } else {
      // Only precon mode for now
      joinMatchmaking(["precon"]);
    }
  };

  const statusText = useMemo(() => {
    if (matchFound) {
      if (matchmaking.isHost) {
        return "Match found! You are the host - configure the game settings.";
      }
      return "Match found! Waiting for host to start the game...";
    }
    if (isSearching) {
      // Don't show wait time if no other players online
      if (onlineCount <= 1) {
        return "Waiting for other players to come online...";
      }
      const posText =
        matchmaking.queuePosition != null
          ? `Position: ${matchmaking.queuePosition + 1}`
          : "";
      return posText || "Looking for opponent...";
    }
    return null;
  }, [
    matchFound,
    isSearching,
    matchmaking.queuePosition,
    matchmaking.isHost,
    onlineCount,
  ]);

  if (disabled) {
    return null; // Hide matchmaking when already in a lobby or match
  }

  return (
    <div className="rounded-xl bg-gradient-to-br from-violet-950/40 to-slate-900/60 ring-1 ring-violet-500/20 overflow-hidden">
      {/* Main Quick Play Button */}
      <button
        onClick={handleSearchClick}
        className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-violet-400" />
          {matchFound ? (
            <>
              <span className="text-lg font-semibold text-white">
                Match Found!
              </span>
              <span className="ml-2 px-2 py-0.5 rounded-full bg-emerald-600/30 text-emerald-400 text-xs font-medium">
                {matchmaking.isHost ? "You are host" : "Waiting for host"}
              </span>
            </>
          ) : isSearching ? (
            <>
              <span className="text-lg font-semibold text-white">
                Searching...
              </span>
              <Loader2 className="w-4 h-4 text-violet-400 animate-spin ml-1" />
            </>
          ) : (
            <>
              <span className="text-lg font-semibold text-white">
                Quick Matchmaking with Precons
              </span>
              <span className="ml-2 px-2 py-0.5 rounded-full bg-emerald-600/30 text-emerald-400 text-xs font-medium">
                {onlineCount} online
              </span>
              {queueSize > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-violet-600/30 text-violet-300 text-xs font-medium">
                  {queueSize} in queue
                </span>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isSearching || matchFound ? (
            <X className="w-5 h-5 text-red-400 hover:text-red-300" />
          ) : (
            <Search className="w-5 h-5 text-slate-400" />
          )}
        </div>
      </button>

      {/* Status Text */}
      {statusText && (
        <div
          className={`px-4 pb-3 text-center text-sm ${
            matchFound ? "text-emerald-400" : "text-slate-400"
          }`}
        >
          {statusText}
        </div>
      )}
    </div>
  );
}
