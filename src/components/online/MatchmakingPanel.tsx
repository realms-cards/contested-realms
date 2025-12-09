"use client";

import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Search,
  X,
  Users,
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { useOnline } from "@/app/online/online-context";

type MatchType = "constructed" | "sealed" | "draft" | "precon";

const MATCH_TYPE_LABELS: Record<
  MatchType,
  { label: string; description: string }
> = {
  precon: {
    label: "Precon Match",
    description: "Play with prebuilt decks",
  },
  constructed: {
    label: "Constructed",
    description: "Bring your own deck",
  },
  sealed: {
    label: "Sealed",
    description: "Build from booster packs",
  },
  draft: {
    label: "Draft",
    description: "Pick cards from rotating packs",
  },
};

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
  const [selectedTypes, setSelectedTypes] = useState<Set<MatchType>>(
    () => new Set<MatchType>(["precon"])
  );
  // Start collapsed by default
  const [expanded, setExpanded] = useState(false);

  const isSearching = matchmaking.status === "searching";
  const matchFound = matchmaking.status === "found";

  // Auto-expand when searching or match found
  useEffect(() => {
    if (isSearching || matchFound) {
      setExpanded(true);
    }
  }, [isSearching, matchFound]);

  // Disable matchmaking when in a lobby or match
  const disabled = !!lobby || !!match;

  // Count online players (excluding self)
  const onlineCount = players.length;

  const toggleMatchType = (type: MatchType) => {
    if (isSearching) return; // Can't change while searching
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        // Don't allow deselecting if it's the only one
        if (next.size > 1) {
          next.delete(type);
        }
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const handleSearchClick = () => {
    if (disabled) return;
    if (isSearching || matchFound) {
      leaveMatchmaking();
      // Also leave any lobby created by matchmaking
      if (lobby) {
        leaveLobby();
      }
    } else {
      const types = Array.from(selectedTypes) as MatchType[];
      joinMatchmaking(types);
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
      {/* Collapsible Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-violet-400" />
          <h2 className="text-lg font-semibold text-white">Quick Play</h2>
          {/* Online player count badge */}
          <span className="ml-2 px-2 py-0.5 rounded-full bg-emerald-600/30 text-emerald-400 text-xs font-medium">
            {onlineCount} online
          </span>
          {/* Queue size badge - show when there are players in queue */}
          {(matchmaking.queueSize ?? 0) > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-violet-600/30 text-violet-300 text-xs font-medium">
              {matchmaking.queueSize} in queue
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isSearching && (
            <span className="text-xs text-violet-400 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              Searching...
            </span>
          )}
          {matchFound && (
            <span className="text-xs text-emerald-400">Match found!</span>
          )}
          {expanded ? (
            <ChevronUp className="w-5 h-5 text-slate-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-slate-400" />
          )}
        </div>
      </button>

      {/* Expandable Content */}
      {expanded && (
        <div className="px-5 pb-5 pt-1">
          <p className="text-sm text-slate-400 mb-4">
            Search for an opponent with matching preferences. You&apos;ll be
            automatically paired and the match will start.
          </p>

          {/* Match Type Selection */}
          <div className="space-y-2 mb-5">
            <div className="text-xs text-slate-500 uppercase tracking-wide mb-2">
              Game Types
            </div>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(MATCH_TYPE_LABELS) as MatchType[]).map((type) => {
                const selected = selectedTypes.has(type);
                const info = MATCH_TYPE_LABELS[type];
                return (
                  <button
                    key={type}
                    onClick={() => toggleMatchType(type)}
                    disabled={isSearching || matchFound}
                    className={`flex flex-col items-start px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      selected
                        ? "bg-violet-600/40 ring-1 ring-violet-400/50 text-violet-200"
                        : "bg-slate-800/60 text-slate-400 hover:bg-slate-800 hover:text-slate-300"
                    } ${
                      isSearching || matchFound
                        ? "opacity-60 cursor-not-allowed"
                        : "cursor-pointer"
                    }`}
                  >
                    <span className="font-semibold">{info.label}</span>
                    <span className="text-xs opacity-70">
                      {info.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Search Button */}
          <button
            onClick={handleSearchClick}
            disabled={disabled}
            className={`w-full flex items-center justify-center gap-2 px-5 py-3 rounded-lg text-base font-semibold transition-all ${
              isSearching || matchFound
                ? "bg-red-600/80 hover:bg-red-600 text-white"
                : "bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 text-white shadow-lg shadow-violet-500/25"
            }`}
          >
            {matchFound ? (
              <>
                <X className="w-5 h-5" />
                Cancel (Match Found)
              </>
            ) : isSearching ? (
              <>
                <X className="w-5 h-5" />
                Cancel Search
              </>
            ) : (
              <>
                <Search className="w-5 h-5" />
                Search for Match
              </>
            )}
          </button>

          {/* Status Text */}
          {statusText && (
            <div
              className={`mt-3 text-center text-sm ${
                matchFound ? "text-emerald-400" : "text-slate-400"
              }`}
            >
              {isSearching && !matchFound && (
                <Loader2 className="w-4 h-4 inline-block mr-2 animate-spin" />
              )}
              {statusText}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
