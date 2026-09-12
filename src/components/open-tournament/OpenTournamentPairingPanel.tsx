"use client";

import { useState } from "react";
import { PanelHeader } from "@/components/ui/page-header";
import { RcButton } from "@/components/ui/rc-button";

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
    .filter(
      (r) => !standings.find((s) => s.playerId === r.playerId)?.isEliminated,
    );

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
    <section className="rc-panel">
      <PanelHeader
        title="Round Management"
        meta={
          activeRound ? `round ${activeRound.roundNumber}` : "no active round"
        }
      />
      <div className="px-[18px] py-3.5">
        {error && (
          <div className="rc-alert mb-3" data-tone="danger">
            {error}
          </div>
        )}

        {/* No active round — create one */}
        {!activeRound && (
          <RcButton
            onClick={handleCreateRound}
            disabled={loading || activePlayers.length < 2}
            className="w-full"
          >
            {loading ? "Creating..." : "Create Next Round"}
          </RcButton>
        )}

        {/* Active round — generate pairings or end round */}
        {activeRound && (
          <div className="space-y-4">
            {/* Mode toggle */}
            <div className="rc-segment">
              <button
                type="button"
                aria-pressed={mode === "swiss"}
                onClick={() => setMode("swiss")}
              >
                Swiss (auto)
              </button>
              <button
                type="button"
                aria-pressed={mode === "manual"}
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
                      onChange={(e) =>
                        updateManualPair(i, "player1Id", e.target.value)
                      }
                      className="rc-select h-9 min-w-0 flex-1"
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
                    <span className="font-rc-mono text-[11px] tracking-[0.14em] text-rc-fg-dim">
                      vs
                    </span>
                    <select
                      value={pair.player2Id}
                      onChange={(e) =>
                        updateManualPair(i, "player2Id", e.target.value)
                      }
                      className="rc-select h-9 min-w-0 flex-1"
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
                    <RcButton
                      variant="ghost"
                      size="sm"
                      onClick={() => removeManualPair(i)}
                      aria-label="Remove pairing"
                      title="Remove pairing"
                      className="text-rc-danger hover:text-rc-danger-hover"
                    >
                      ×
                    </RcButton>
                  </div>
                ))}
                <RcButton variant="outline" size="sm" onClick={addManualPair}>
                  Add pairing
                </RcButton>
              </div>
            )}

            {/* Generate / End buttons */}
            <div className="flex flex-wrap gap-2">
              <RcButton
                onClick={handleGeneratePairings}
                disabled={
                  loading ||
                  (mode === "manual" &&
                    manualPairs.some((p) => !p.player1Id || !p.player2Id))
                }
                className="flex-1"
              >
                {loading
                  ? "Generating..."
                  : mode === "swiss"
                    ? "Generate Swiss Pairings"
                    : "Apply Manual Pairings"}
              </RcButton>
              <RcButton
                variant="outline"
                onClick={handleEndRound}
                disabled={loading}
              >
                End Round
              </RcButton>
            </div>

            {activePlayers.length > 0 && (
              <p className="rc-hint">
                {activePlayers.length} active players available for pairing
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
