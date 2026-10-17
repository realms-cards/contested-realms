"use client";

import { useState } from "react";
import { PanelHeader } from "@/components/ui/page-header";
import { RcButton } from "@/components/ui/rc-button";
import { top8Label, top8Title, type SummitTopDecks } from "@/lib/decks/deckCategories";

/**
 * "Top 8 — <event>": the latest offline event's top-8 lists from Sorcerers Summit. They are
 * sorcerytcg.com links, not saved decks, so each row opens the list there or imports a copy into
 * your own decks (the same importer as "Import New Deck"). The pickers play them straight from the link.
 */
export default function TopDecksSection({ top, onImported }: { top: SummitTopDecks; onImported: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);

  const importDeck = async (url: string, name: string) => {
    setBusy(url);
    setError(null);
    try {
      const res = await fetch("/api/decks/import/curiosa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, name }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: unknown };
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Import failed");
      setDone((prev) => new Set(prev).add(url));
      onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(null);
    }
  };

  const meta = [
    top.eventDate ? new Date(top.eventDate).toLocaleDateString() : null,
    top.playerCount ? `${top.playerCount} players` : null,
    `${top.decks.length} decks`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="rc-panel">
      <PanelHeader title={top8Title(top)} meta={meta} />
      <div className="divide-y divide-rc-line/8 px-[18px] py-2">
        {top.decks.map((deck) => {
          const name = deck.deckName || `${deck.player}'s deck`;
          return (
            <div key={deck.url} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="min-w-0 truncate font-rc-sans text-sm text-rc-fg">{top8Label(deck)}</span>
              <span className="flex shrink-0 items-center gap-2">
                <a
                  href={deck.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-rc-mono text-xs text-rc-fg-muted underline-offset-4 hover:text-rc-accent-link hover:underline"
                >
                  view list
                </a>
                <RcButton
                  variant="outline"
                  size="xs"
                  disabled={busy !== null || done.has(deck.url)}
                  onClick={() => void importDeck(deck.url, name)}
                >
                  {done.has(deck.url) ? "Imported" : busy === deck.url ? "Importing…" : "Import"}
                </RcButton>
              </span>
            </div>
          );
        })}
      </div>
      {error && (
        <div className="rc-alert mx-[18px] mb-3" data-tone="danger">
          {error}
        </div>
      )}
    </section>
  );
}
