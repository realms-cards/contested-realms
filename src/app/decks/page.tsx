"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import DeckImportCuriosa from "./DeckImportCuriosa";
import DeckImportText from "./DeckImportText";
import DeckItem from "./DeckItem";

type MyDeck = {
  id: string;
  name: string;
  format: string;
  isPublic: boolean;
  imported?: boolean;
};

type PublicDeck = {
  id: string;
  name: string;
  format: string;
  imported?: boolean;
  userName: string;
};

export default function DecksPage() {
  const { data: session } = useSession();
  const [myDecks, setMyDecks] = useState<MyDeck[]>([]);
  const [publicDecks, setPublicDecks] = useState<PublicDeck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDecks = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/decks");
      if (!res.ok) throw new Error("Failed to load decks");
      const data = await res.json();
      setMyDecks(data.myDecks || []);
      setPublicDecks(data.publicDecks || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load decks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session) {
      fetchDecks();
    }
  }, [session, fetchDecks]);

  // Listen for import components signaling a refresh
  useEffect(() => {
    const onRefresh = () => { void fetchDecks(); };
    window.addEventListener("decks:refresh", onRefresh);
    return () => window.removeEventListener("decks:refresh", onRefresh);
  }, [fetchDecks]);

  if (!session) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="text-center">Please sign in to view your decks.</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold font-fantaisie">Your Decks</h1>
        <Link
          href="/decks/editor-3d"
          className="ml-auto px-3 py-2 rounded bg-foreground text-background"
        >
          New Deck
        </Link>
      </div>

      {/* Curiosa import panel */}
      <DeckImportCuriosa />
      {/* Plain text import panel */}
      <DeckImportText />

      {loading ? (
        <div className="text-sm opacity-80">Loading decks...</div>
      ) : error ? (
        <div className="text-sm text-red-500">Error: {error}</div>
      ) : (
        <>
          {/* My Decks Section */}
          {myDecks.length === 0 ? (
            <div className="text-sm opacity-80">
              No decks yet. Create one from the{" "}
              <Link href="/decks/editor-3d" className="underline">
                editor
              </Link>{" "}
              or save from Draft.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
              {myDecks.map((d) => (
                <DeckItem
                  key={d.id}
                  deck={{
                    id: d.id,
                    name: d.name,
                    format: d.format,
                    isPublic: d.isPublic,
                    imported: d.imported,
                    updatedAt: new Date().toISOString(), // API doesn't return updatedAt in new structure
                    isOwner: true,
                  }}
                />
              ))}
            </div>
          )}

          {/* Public Decks Section */}
          {publicDecks.length > 0 && (
            <>
              <h2 className="text-xl font-semibold font-fantaisie mt-8">Public Decks</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                {publicDecks.map((d) => (
                  <DeckItem
                    key={d.id}
                    deck={{
                      id: d.id,
                      name: d.name,
                      format: d.format,
                      imported: d.imported,
                      userName: d.userName,
                      updatedAt: new Date().toISOString(),
                      isOwner: false,
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
