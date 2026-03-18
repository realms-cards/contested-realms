"use client";

import { useState } from "react";
import { generateTournamentName } from "@/lib/random-name-generator";

interface Props {
  onCreated: (tournamentId: string) => void;
}

export function OpenTournamentCreateForm({ onCreated }: Props) {
  const [name, setName] = useState(() => generateTournamentName());
  const [maxPlayers, setMaxPlayers] = useState(16);
  const [isPrivate, setIsPrivate] = useState(false);
  const [playNetworkUrl, setPlayNetworkUrl] = useState("");
  const [pairingSource, setPairingSource] = useState<"swiss" | "manual">("swiss");
  const [allowRealms, setAllowRealms] = useState(true);
  const [allowManualReport, setAllowManualReport] = useState(true);
  const [requireHostApproval, setRequireHostApproval] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const body = {
        name: name.trim(),
        maxPlayers,
        isPrivate,
        ...(playNetworkUrl.trim() ? { playNetworkUrl: playNetworkUrl.trim() } : {}),
        pairing: { source: pairingSource },
        matchResolution: {
          allowRealms,
          allowManualReport,
          requireHostApproval,
        },
      };

      const res = await fetch("/api/open-tournaments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create tournament");

      onCreated(data.tournament.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-300 px-3 py-2 rounded text-sm">
          {error}
        </div>
      )}

      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">
          Event Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
          minLength={3}
          maxLength={100}
        />
      </div>

      {/* Max Players */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">
          Max Players
        </label>
        <input
          type="number"
          value={maxPlayers}
          onChange={(e) => setMaxPlayers(Number(e.target.value))}
          min={2}
          max={128}
          className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-xs text-slate-500 mt-1">Soft limit — host can add more players</p>
      </div>

      {/* Play Network URL */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">
          Play Network Event URL
          <span className="text-slate-500 font-normal ml-1">(optional)</span>
        </label>
        <input
          type="url"
          value={playNetworkUrl}
          onChange={(e) => setPlayNetworkUrl(e.target.value)}
          placeholder="https://playnetwork.gg/event/..."
          className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-xs text-slate-500 mt-1">
          Players can click this link to register on Play Network
        </p>
      </div>

      {/* Pairing Mode */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">
          Default Pairing Mode
        </label>
        <div className="flex gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="radio"
              name="pairingSource"
              value="swiss"
              checked={pairingSource === "swiss"}
              onChange={() => setPairingSource("swiss")}
              className="accent-blue-500"
            />
            Swiss (auto)
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="radio"
              name="pairingSource"
              value="manual"
              checked={pairingSource === "manual"}
              onChange={() => setPairingSource("manual")}
              className="accent-blue-500"
            />
            Manual
          </label>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          You can always override per round
        </p>
      </div>

      {/* Match Resolution */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Match Resolution
        </label>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={allowRealms}
              onChange={(e) => setAllowRealms(e.target.checked)}
              className="accent-blue-500"
            />
            Allow playing on Realms
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={allowManualReport}
              onChange={(e) => setAllowManualReport(e.target.checked)}
              className="accent-blue-500"
            />
            Allow manual result reporting (TTS, paper)
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={requireHostApproval}
              onChange={(e) => setRequireHostApproval(e.target.checked)}
              className="accent-blue-500"
            />
            Require host approval for manual results
          </label>
        </div>
      </div>

      {/* Private */}
      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={isPrivate}
          onChange={(e) => setIsPrivate(e.target.checked)}
          className="accent-blue-500"
        />
        Private event (only visible to invited players)
      </label>

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting || !name.trim()}
        className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-medium transition-colors"
      >
        {submitting ? "Creating..." : "Create Event"}
      </button>
    </form>
  );
}
