"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import AuthButton from "@/components/auth/AuthButton";
import DeckImportCuriosa from "./DeckImportCuriosa";
import DeckImportText from "./DeckImportText";
import DeckItem from "./DeckItem";

type MyDeck = {
  id: string;
  name: string;
  format: string;
  isPublic: boolean;
  imported?: boolean;
  avatarName?: string | null;
};

type PublicDeck = {
  id: string;
  name: string;
  format: string;
  imported?: boolean;
  userName: string;
  avatarName?: string | null;
};

export default function DecksPage() {
  const { data: session } = useSession();
  const [myDecks, setMyDecks] = useState<MyDeck[]>([]);
  const [publicDecks, setPublicDecks] = useState<PublicDeck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);

  const fetchDecks = useCallback(async (force = false) => {
    try {
      setLoading(true);
      // Add cache-busting for production
      const url = force
        ? `/api/decks?_t=${Date.now()}`
        : "/api/decks";

      const res = await fetch(url, {
        // Force fresh data in production
        cache: force ? 'no-cache' : 'default',
        headers: force ? { 'Cache-Control': 'no-cache' } : {}
      });

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
    const onRefresh = () => {
      void fetchDecks(true); // Force fresh data after import
      setShowImport(false); // Close import panel on successful import
    };
    window.addEventListener("decks:refresh", onRefresh);
    return () => window.removeEventListener("decks:refresh", onRefresh);
  }, [fetchDecks]);

  if (!session) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="text-center space-y-4">
          <div>Please sign in to view your decks.</div>
          <div className="flex justify-center">
            <AuthButton />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold font-fantaisie">Your Decks</h1>
        <div className="ml-auto flex items-center gap-3">
          <Link
            href="/"
            className="text-xs underline text-foreground/70 hover:text-foreground"
          >
            Home
          </Link>
          <Link
            href="/online/lobby"
            className="text-xs underline text-foreground/70 hover:text-foreground"
          >
            Lobby
          </Link>
          <button
            onClick={() => setShowImport(!showImport)}
            className="px-3 py-2 rounded bg-foreground/10 hover:bg-foreground/20 text-foreground border border-foreground/20"
          >
            Import Deck
          </button>
          <Link
            href="/decks/editor-3d"
            className="px-3 py-2 rounded bg-foreground text-background"
          >
            New Deck
          </Link>
        </div>
      </div>

      {/* Import panels - shown when Import Deck is clicked */}
      {showImport && (
        <div className="grid gap-4 p-4 bg-zinc-900/30 rounded-lg">
          <DeckImportCuriosa />
          <DeckImportText />
        </div>
      )}

      {/* Import panels appear inline in the empty-state below to emphasize onboarding */}

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
              , import an existing deck, or save from Draft.
            </div>
          ) : (
            <div>
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
                      avatarName: d.avatarName ?? undefined,
                      updatedAt: new Date().toISOString(), // API doesn't return updatedAt in new structure
                      isOwner: true,
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Public Decks Section */}
          {publicDecks.length > 0 && (
            <>
              <h2 className="text-xl font-semibold font-fantaisie mt-8">
                Public Decks
              </h2>
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
                      avatarName: d.avatarName ?? undefined,
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
