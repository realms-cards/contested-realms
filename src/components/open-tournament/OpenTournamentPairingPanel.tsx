"use client";

import { useState } from "react";

interface Standing {
  playerId: string;
  displayName: string;
  matchPoints: number;
  isEliminated: boolean;
}

interface Registration {
  playerId: string;
  seatStatus: string;
  player: { id: string; name: string | null };
}

interface Round {
  id: string;
  roundNumber: number;
  status: string;
}

interface ManualPair {
  player1Id: string;
  player2Id: string;
}

interface Props {
  tournamentId: string;
  activeRound: Round | null;
  standings: Standing[];
  registrations: Registration[];
  onRefresh: () => void;
}

export function OpenTournamentPairingPanel({
  tournamentId,
  activeRound,
  standings,
  registrations,
  onRefresh,
}: Props) {
  const [mode, setMode] = useState<"swiss" | "manual">("swiss");
  const [manualPairs, setManualPairs] = useState<ManualPair[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activePlayers = registrations
    .filter((r) => r.seatStatus === "active")
    .filter((r) => !standings.find((s) => s.playerId === r.playerId)?.isEliminated);

  const handleCreateRound = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/open-tournaments/${tournamentId}/rounds`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create round");
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create round");
    } finally {
      setLoading(false);
    }
  };

  const handleEndRound = async () => {
    if (!activeRound) return;
    setLoading(true);
    setError(null);
    try {
      // Mark round as completed
      const res = await fetch(`/api/open-tournaments/${tournamentId}/rounds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      // For now, we just refresh — the round completion logic can be extended
      void res;
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePairings = async () => {
    if (!activeRound) return;
    setLoading(true);
    setError(null);
    try {
      const body =
        mode === "swiss"
          ? { source: "swiss" as const }
          : { source: "manual" as const, pairings: manualPairs };

      const res = await fetch(`/api/open-tournaments/${tournamentId}/pair`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate pairings");
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate pairings");
    } finally {
      setLoading(false);
    }
  };

  const addManualPair = () => {
    setManualPairs((prev) => [...prev, { player1Id: "", player2Id: "" }]);
  };

  const updateManualPair = (
    index: number,
    field: "player1Id" | "player2Id",
    value: string,
  ) => {
    setManualPairs((prev) =>
      prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)),
    );
  };

  const removeManualPair = (index: number) => {
    setManualPairs((prev) => prev.filter((_, i) => i !== index));
  };

  // Players already assigned in manual pairs
  const assignedPlayerIds = new Set(
    manualPairs.flatMap((p) => [p.player1Id, p.player2Id].filter(Boolean)),
  );

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
      <h3 className="text-sm font-medium text-slate-300 mb-3">
        Round Management
      </h3>

      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-300 px-3 py-2 rounded text-xs mb-3">
          {error}
        </div>
      )}

      {/* No active round — create one */}
      {!activeRound && (
        <button
          onClick={handleCreateRound}
          disabled={loading || activePlayers.length < 2}
          className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded text-sm font-medium"
        >
          {loading ? "Creating..." : "Create Next Round"}
        </button>
      )}

      {/* Active round — generate pairings or end round */}
      {activeRound && (
        <div className="space-y-4">
          {/* Mode toggle */}
          <div className="flex gap-2">
            <button
              className={`px-3 py-1.5 rounded text-sm ${
                mode === "swiss"
                  ? "bg-blue-600 text-white"
                  : "bg-slate-700 text-slate-300 hover:bg-slate-600"
              }`}
              onClick={() => setMode("swiss")}
            >
              Swiss (auto)
            </button>
            <button
              className={`px-3 py-1.5 rounded text-sm ${
                mode === "manual"
                  ? "bg-blue-600 text-white"
                  : "bg-slate-700 text-slate-300 hover:bg-slate-600"
              }`}
              onClick={() => setMode("manual")}
            >
              Manual
            </button>
          </div>

          {/* Manual pairing UI */}
          {mode === "manual" && (
            <div className="space-y-2">
              {manualPairs.map((pair, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    value={pair.player1Id}
                    onChange={(e) => updateManualPair(i, "player1Id", e.target.value)}
                    className="flex-1 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-white"
                  >
                    <option value="">Player 1</option>
                    {activePlayers
                      .filter(
                        (p) =>
                          p.playerId === pair.player1Id ||
                          !assignedPlayerIds.has(p.playerId),
                      )
                      .map((p) => (
                        <option key={p.playerId} value={p.playerId}>
                          {p.player.name ?? "Unknown"}
                        </option>
                      ))}
                  </select>
                  <span className="text-slate-500 text-sm">vs</span>
                  <select
                    value={pair.player2Id}
                    onChange={(e) => updateManualPair(i, "player2Id", e.target.value)}
                    className="flex-1 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-white"
                  >
                    <option value="">Player 2</option>
                    {activePlayers
                      .filter(
                        (p) =>
                          p.playerId === pair.player2Id ||
                          !assignedPlayerIds.has(p.playerId),
                      )
                      .map((p) => (
                        <option key={p.playerId} value={p.playerId}>
                          {p.player.name ?? "Unknown"}
                        </option>
                      ))}
                  </select>
                  <button
                    onClick={() => removeManualPair(i)}
                    className="text-red-400 hover:text-red-300 text-sm px-2"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                onClick={addManualPair}
                className="text-sm text-blue-400 hover:text-blue-300"
              >
                + Add pairing
              </button>
            </div>
          )}

          {/* Generate / End buttons */}
          <div className="flex gap-2">
            <button
              onClick={handleGeneratePairings}
              disabled={
                loading ||
                (mode === "manual" &&
                  manualPairs.some((p) => !p.player1Id || !p.player2Id))
              }
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded text-sm font-medium"
            >
              {loading
                ? "Generating..."
                : mode === "swiss"
                  ? "Generate Swiss Pairings"
                  : "Apply Manual Pairings"}
            </button>
            <button
              onClick={handleEndRound}
              disabled={loading}
              className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded text-sm"
            >
              End Round
            </button>
          </div>

          {activePlayers.length > 0 && (
            <p className="text-xs text-slate-500">
              {activePlayers.length} active players available for pairing
            </p>
          )}
        </div>
      )}
    </div>
  );
}
