"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import AuthButton from "@/components/auth/AuthButton";
import OnlinePageShell from "@/components/online/OnlinePageShell";
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
    name:
      typeof deck["name"] === "string"
        ? (deck["name"] as string)
        : "Untitled Deck",
    format:
      typeof deck["format"] === "string"
        ? (deck["format"] as string)
        : "Unknown",
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
    name:
      typeof deck["name"] === "string"
        ? (deck["name"] as string)
        : "Untitled Deck",
    format:
      typeof deck["format"] === "string"
        ? (deck["format"] as string)
        : "Unknown",
    imported: Boolean(deck["imported"]),
    userName:
      typeof deck["userName"] === "string" && deck["userName"]
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
      const url = force ? `/api/decks?_t=${Date.now()}` : "/api/decks";

      const res = await fetch(url, {
        // Force fresh data in production
        cache: force ? "no-cache" : "default",
        headers: force ? { "Cache-Control": "no-cache" } : {},
      });

      if (!res.ok) throw new Error("Failed to load decks");
      const data = await res.json();
      const normalizedMyDecks: MyDeck[] = Array.isArray(data?.myDecks)
        ? data.myDecks.map(mapMyDeckFromApi)
        : [];
      const normalizedPublicDecks: PublicDeck[] = Array.isArray(
        data?.publicDecks
      )
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

  // Optimistic delete handler - removes deck from state immediately
  const handleDeleteDeck = useCallback((deckId: string) => {
    setMyDecks((prev) => prev.filter((d) => d.id !== deckId));
    setPublicDecks((prev) => prev.filter((d) => d.id !== deckId));
  }, []);

  if (!session) {
    return (
      <OnlinePageShell>
        <div className="pt-2">
          <div className="rounded-xl bg-slate-900/70 ring-1 ring-slate-800/80 p-6 text-center space-y-4">
            <div className="text-sm text-slate-200">
              Please sign in to view your decks.
            </div>
            <div className="flex justify-center">
              <AuthButton />
            </div>
          </div>
        </div>
      </OnlinePageShell>
    );
  }

  return (
    <OnlinePageShell>
      <div className="space-y-6 pt-2">
        <div className="rounded-xl bg-slate-900/70 ring-1 ring-slate-800/80 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold font-fantaisie text-slate-50">
                Your Decks
              </h1>
              <p className="text-sm text-slate-300/90">
                Manage your collections, import decklists, and create new
                builds.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setShowImport((prev) => !prev)}
                className="rounded-lg bg-slate-800/80 hover:bg-slate-700/80 px-4 py-2 text-sm font-medium text-slate-200 transition-colors"
              >
                {showImport ? "Hide Importers" : "Import New Deck"}
              </button>
              <Link
                href="/decks/editor-3d"
                className="rounded-lg bg-blue-600/80 hover:bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors"
              >
                Construct New Deck
              </Link>
            </div>
          </div>
        </div>

        {showImport && (
          <div className="rounded-xl bg-slate-900/70 ring-1 ring-slate-800/80 p-5 space-y-4">
            <DeckImportCuriosa />
            <DeckImportText />
          </div>
        )}

        {loading ? (
          <div className="rounded-xl bg-slate-900/70 ring-1 ring-slate-800/80 p-5 text-sm text-slate-300">
            Loading decks...
          </div>
        ) : error ? (
          <div className="rounded-xl bg-red-900/20 ring-1 ring-red-600/40 p-5 text-sm text-red-200">
            Error: {error}
          </div>
        ) : (
          <div className="space-y-6">
            {myDecks.length === 0 ? (
              <div className="rounded-xl bg-slate-900/70 ring-1 ring-slate-800/80 p-6 text-sm text-slate-300 space-y-2">
                <div>
                  No decks yet. Create one from the editor, import an existing
                  list, or save from Draft.
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-slate-400">
                  <Link
                    href="/decks/editor-3d"
                    className="underline text-slate-200 hover:text-slate-100"
                  >
                    Open Deck Editor
                  </Link>
                  <button
                    onClick={() => setShowImport(true)}
                    className="underline text-slate-200 hover:text-slate-100"
                  >
                    Show Import Tools
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold uppercase tracking-wide text-slate-200">
                  Your Decks
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
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
                      onDelete={handleDeleteDeck}
                    />
                  ))}
                </div>
              </div>
            )}

            {publicDecks.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold uppercase tracking-wide text-slate-200">
                  Public Decks
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
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
          </div>
        )}
      </div>
    </OnlinePageShell>
  );
}
