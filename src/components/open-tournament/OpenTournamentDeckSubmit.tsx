"use client";

import { useState } from "react";

interface Props {
  tournamentId: string;
  playerId: string;
  currentDeckData: Record<string, unknown>;
  onRefresh: () => void;
}

export function OpenTournamentDeckSubmit({
  tournamentId,
  playerId,
  currentDeckData,
  onRefresh,
}: Props) {
  const [curiosaUrl, setCuriosaUrl] = useState(
    (currentDeckData.curiosaUrl as string) ?? "",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const currentDeckId = currentDeckData.deckId as string | undefined;

  const handleImportCuriosa = async () => {
    if (!curiosaUrl.trim()) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      // 1. Import deck from Curiosa to Realms
      const importRes = await fetch("/api/decks/import/curiosa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: curiosaUrl.trim() }),
      });
      const importData = await importRes.json();
      if (!importRes.ok) {
        throw new Error(importData.error ?? "Failed to import deck from Curiosa");
      }

      const deckId = importData.deck?.id ?? importData.id;
      if (!deckId) throw new Error("No deck ID returned from import");

      // 2. Link deck to tournament registration
      const linkRes = await fetch(
        `/api/open-tournaments/${tournamentId}/players/${playerId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deckId, curiosaUrl: curiosaUrl.trim() }),
        },
      );
      const linkData = await linkRes.json();
      if (!linkRes.ok) throw new Error(linkData.error ?? "Failed to link deck");

      setSuccess("Deck imported and linked successfully");
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to import deck");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
      <h3 className="text-sm font-medium text-slate-300 mb-3">Your Deck</h3>

      {currentDeckId && (
        <div className="text-xs text-green-400 mb-2">
          Deck linked
          {currentDeckData.curiosaUrl ? (
            <span className="ml-1 text-blue-400">(from Curiosa)</span>
          ) : null}
        </div>
      )}

      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-300 px-3 py-2 rounded text-xs mb-2">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-900/50 border border-green-700 text-green-300 px-3 py-2 rounded text-xs mb-2">
          {success}
        </div>
      )}

      <div className="space-y-2">
        <input
          type="url"
          value={curiosaUrl}
          onChange={(e) => setCuriosaUrl(e.target.value)}
          placeholder="Paste Curiosa deck URL..."
          className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={handleImportCuriosa}
          disabled={submitting || !curiosaUrl.trim()}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-1.5 rounded text-xs font-medium"
        >
          {submitting ? "Importing..." : "Import from Curiosa"}
        </button>
        <p className="text-xs text-slate-500">
          The deck will be imported to your Realms collection and linked to this event.
        </p>
      </div>
    </div>
  );
}
