"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import AuthButton from "@/components/auth/AuthButton";
import DeckImportCuriosa from "./DeckImportCuriosa";
import DeckImportText from "./DeckImportText";
import DeckItem from "./DeckItem";

type AvatarSummary = {
  avatarState: "none" | "single" | "multiple";
  avatarCard?: { name: string; slug: string | null } | null;
};

type MyDeck = {
  id: string;
  name: string;
  format: string;
  isPublic: boolean;
  imported?: boolean;
  updatedAt: string;
} & AvatarSummary;

type PublicDeck = {
  id: string;
  name: string;
  format: string;
  imported?: boolean;
  userName: string;
  updatedAt: string;
  isPublic: boolean;
} & AvatarSummary;

function normalizeAvatarState(value: unknown): AvatarSummary["avatarState"] {
  if (value === "single" || value === "multiple" || value === "none") {
    return value;
  }
  return "none";
}

function normalizeAvatarCard(card: unknown): AvatarSummary["avatarCard"] {
  if (!card || typeof card !== "object") return null;
  const maybeCard = card as { name?: unknown; slug?: unknown };
  const name = typeof maybeCard.name === "string" ? maybeCard.name : "";
  const slugValue = maybeCard.slug;
  const slug =
    typeof slugValue === "string"
      ? slugValue
      : slugValue === null
      ? null
      : null;
  if (!name && slug == null) {
    return null;
  }
  return { name, slug };
}

function normalizeUpdatedAt(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number" && Number.isFinite(value)) {
    const fromNumber = new Date(value);
    if (!Number.isNaN(fromNumber.getTime())) return fromNumber.toISOString();
  }
  return new Date().toISOString();
}

type RawDeck = Record<string, unknown>;

function mapAvatarSummary(deck: RawDeck): AvatarSummary {
  return {
    avatarState: normalizeAvatarState(deck["avatarState"]),
    avatarCard: normalizeAvatarCard(deck["avatarCard"]),
  };
}

function mapMyDeckFromApi(deck: RawDeck): MyDeck {
  const summary = mapAvatarSummary(deck);
  return {
    id: String(deck["id"] ?? ""),
    name: typeof deck["name"] === "string" ? (deck["name"] as string) : "Untitled Deck",
    format: typeof deck["format"] === "string" ? (deck["format"] as string) : "Unknown",
    isPublic: Boolean(deck["isPublic"]),
    imported: Boolean(deck["imported"]),
    updatedAt: normalizeUpdatedAt(deck["updatedAt"]),
    ...summary,
  };
}

function mapPublicDeckFromApi(deck: RawDeck): PublicDeck {
  const summary = mapAvatarSummary(deck);
  return {
    id: String(deck["id"] ?? ""),
    name: typeof deck["name"] === "string" ? (deck["name"] as string) : "Untitled Deck",
    format: typeof deck["format"] === "string" ? (deck["format"] as string) : "Unknown",
    imported: Boolean(deck["imported"]),
    userName: typeof deck["userName"] === "string" && deck["userName"]
      ? (deck["userName"] as string)
      : "Unknown Player",
    updatedAt: normalizeUpdatedAt(deck["updatedAt"]),
    isPublic: true,
    ...summary,
  };
}

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
      const normalizedMyDecks: MyDeck[] = Array.isArray(data?.myDecks)
        ? data.myDecks.map(mapMyDeckFromApi)
        : [];
      const normalizedPublicDecks: PublicDeck[] = Array.isArray(data?.publicDecks)
        ? data.publicDecks.map(mapPublicDeckFromApi)
        : [];
      setMyDecks(normalizedMyDecks);
      setPublicDecks(normalizedPublicDecks);
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
            <div className="space-y-3">
              <h2 className="text-xl font-semibold font-fantaisie">
                Your Decks
              </h2>
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
                      avatarState: d.avatarState,
                      avatarCard: d.avatarCard,
                      updatedAt: d.updatedAt,
                      isOwner: true,
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {publicDecks.length > 0 && (
            <div className="space-y-3">
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
                      avatarState: d.avatarState,
                      avatarCard: d.avatarCard,
                      updatedAt: d.updatedAt,
                      isPublic: Boolean(d.isPublic),
                      isOwner: false,
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
