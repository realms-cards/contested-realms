"use client";

import { useState } from "react";
import { PanelHeader } from "@/components/ui/page-header";
import { RcButton } from "@/components/ui/rc-button";

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
      // 1. Import deck from Sorcerytcg to Realms
      const importRes = await fetch("/api/decks/import/curiosa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: curiosaUrl.trim() }),
      });
      const importData = await importRes.json();
      if (!importRes.ok) {
        throw new Error(
          importData.error ?? "Failed to import deck from Sorcerytcg",
        );
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
    <section className="rc-panel">
      <PanelHeader
        title="Your Deck"
        meta={currentDeckId ? "linked" : undefined}
      />
      <div className="space-y-2.5 px-[18px] py-3.5">
        {currentDeckId && (
          <div className="font-rc-mono text-[11px] tracking-[0.1em] text-rc-success">
            Deck linked
            {currentDeckData.curiosaUrl ? (
              <span className="ml-1 text-rc-fg-subtle">(from Sorcerytcg)</span>
            ) : null}
          </div>
        )}

        {error && (
          <div className="rc-alert" data-tone="danger">
            {error}
          </div>
        )}
        {success && (
          <div className="rc-alert" data-tone="success">
            {success}
          </div>
        )}

        <input
          type="url"
          value={curiosaUrl}
          onChange={(e) => setCuriosaUrl(e.target.value)}
          placeholder="Paste Sorcerytcg deck URL..."
          className="rc-input h-9 w-full"
        />
        <RcButton
          variant="outline"
          size="sm"
          onClick={handleImportCuriosa}
          disabled={submitting || !curiosaUrl.trim()}
          className="w-full"
        >
          {submitting ? "Importing..." : "Import from Sorcerytcg"}
        </RcButton>
        <p className="rc-hint leading-relaxed">
          The deck will be imported to your Realms collection and linked to this
          event.
        </p>
      </div>
    </section>
  );
}
