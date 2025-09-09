"use client";

import { useState, useMemo } from "react";
import { TournamentProvider, useTournaments } from "./tournament-context";
import { useRouter } from "next/navigation";

function TournamentPageContent() {
  const router = useRouter();
  const {
    tournaments,
    createTournament,
    joinTournament,
    requestTournaments,
    loading,
    error
  } = useTournaments();
  
  const [createOverlayOpen, setCreateOverlayOpen] = useState(false);
  const [tournamentName, setTournamentName] = useState("");
  const [tournamentFormat, setTournamentFormat] = useState<"swiss" | "elimination" | "round_robin">("swiss");
  const [matchType, setMatchType] = useState<"constructed" | "sealed" | "draft">("sealed");
  const [maxPlayers, setMaxPlayers] = useState(8);

  const handleCreateTournament = async () => {
    if (!tournamentName.trim()) return;
    
    await createTournament({
      name: tournamentName.trim(),
      format: tournamentFormat,
      matchType,
      maxPlayers,
    });
    
    setCreateOverlayOpen(false);
    setTournamentName("");
  };

  const formatDisplay = (format: string) => {
    switch (format) {
      case "swiss": return "Swiss";
      case "elimination": return "Single Elimination";
      case "round_robin": return "Round Robin";
      default: return format;
    }
  };

  const statusDisplay = (status: string) => {
    switch (status) {
      case "registering": return "Registration Open";
      case "draft_phase": return "Draft Phase";
      case "sealed_phase": return "Sealed Construction";
      case "playing": return "In Progress";
      case "completed": return "Completed";
      default: return status;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl bg-slate-900/60 ring-1 ring-slate-800 p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Tournaments</h1>
          <p className="text-sm text-slate-300">Multi-player competitive events</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <button
            className="rounded bg-slate-700 hover:bg-slate-600 px-3 py-2 text-sm"
            onClick={requestTournaments}
            disabled={loading}
          >
            Refresh
          </button>
          <button
            className="rounded bg-green-600/80 hover:bg-green-600 px-4 py-2 text-sm font-semibold"
            onClick={() => setCreateOverlayOpen(true)}
          >
            Create Tournament
          </button>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="rounded-xl bg-red-900/20 ring-1 ring-red-600/30 p-4">
          <div className="text-red-200 text-sm">{error}</div>
        </div>
      )}

      {/* Tournaments list */}
      <div className="rounded-xl bg-slate-900/60 ring-1 ring-slate-800 p-4">
        <div className="text-sm font-semibold opacity-90 mb-4">Active Tournaments</div>
        
        {tournaments.length === 0 ? (
          <div className="text-center py-8 text-sm text-slate-400">
            No tournaments available. Create one to get started!
          </div>
        ) : (
          <div className="space-y-3">
            {tournaments.map((tournament) => (
              <div
                key={tournament.id}
                className="flex items-center justify-between bg-black/20 rounded-lg p-3"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-white">{tournament.name}</span>
                    <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded">
                      {formatDisplay(tournament.format)}
                    </span>
                    <span className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded">
                      {tournament.matchType.charAt(0).toUpperCase() + tournament.matchType.slice(1)}
                    </span>
                  </div>
                  <div className="text-xs text-slate-300 space-x-4">
                    <span>Status: {statusDisplay(tournament.status)}</span>
                    <span>Players: {tournament.registeredPlayers.length}/{tournament.maxPlayers}</span>
                    <span>Round: {tournament.currentRound}/{tournament.totalRounds}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="rounded bg-blue-600/80 hover:bg-blue-600 px-3 py-1.5 text-sm"
                    onClick={() => joinTournament(tournament.id)}
                    disabled={loading || tournament.status !== "registering"}
                  >
                    {tournament.status === "registering" ? "Join" : "View"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Tournament Overlay */}
      {createOverlayOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setCreateOverlayOpen(false)} />
          <div className="relative bg-slate-900/95 ring-1 ring-slate-800 rounded-xl shadow-xl w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="text-base font-semibold">Create Tournament</div>
              <button
                className="text-slate-300 hover:text-white text-sm"
                onClick={() => setCreateOverlayOpen(false)}
              >
                Close
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-2">Tournament Name *</label>
                <input
                  type="text"
                  value={tournamentName}
                  onChange={(e) => setTournamentName(e.target.value)}
                  className="w-full bg-slate-800/70 ring-1 ring-slate-700 rounded px-3 py-2 text-sm"
                  placeholder="Enter tournament name"
                  maxLength={100}
                />
              </div>
              
              <div>
                <label className="block text-xs font-medium mb-2">Format</label>
                <div className="grid grid-cols-3 gap-2">
                  {["swiss", "elimination", "round_robin"].map((format) => (
                    <button
                      key={format}
                      className={`px-3 py-2 text-xs rounded transition-colors ${
                        tournamentFormat === format
                          ? "bg-blue-600/80 text-white"
                          : "bg-slate-700/60 text-slate-300 hover:bg-slate-600/60"
                      }`}
                      onClick={() => setTournamentFormat(format as any)}
                    >
                      {formatDisplay(format)}
                    </button>
                  ))}
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-medium mb-2">Match Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {["constructed", "sealed", "draft"].map((type) => (
                    <button
                      key={type}
                      className={`px-3 py-2 text-xs rounded transition-colors ${
                        matchType === type
                          ? "bg-purple-600/80 text-white"
                          : "bg-slate-700/60 text-slate-300 hover:bg-slate-600/60"
                      }`}
                      onClick={() => setMatchType(type as any)}
                    >
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-medium mb-2">Max Players</label>
                <select
                  value={maxPlayers}
                  onChange={(e) => setMaxPlayers(parseInt(e.target.value))}
                  className="w-full bg-slate-800/70 ring-1 ring-slate-700 rounded px-3 py-2 text-sm"
                >
                  <option value={4}>4 Players</option>
                  <option value={8}>8 Players</option>
                  <option value={16}>16 Players</option>
                  <option value={32}>32 Players</option>
                </select>
              </div>
            </div>
            
            <div className="flex justify-end gap-2 mt-6">
              <button
                className="rounded bg-slate-700 hover:bg-slate-600 px-3 py-1.5 text-sm"
                onClick={() => setCreateOverlayOpen(false)}
              >
                Cancel
              </button>
              <button
                className="rounded bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
                disabled={!tournamentName.trim() || loading}
                onClick={handleCreateTournament}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TournamentPage() {
  return (
    <TournamentProvider>
      <TournamentPageContent />
    </TournamentProvider>
  );
}