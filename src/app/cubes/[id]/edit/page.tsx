"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import AuthButton from "@/components/auth/AuthButton";
import OnlinePageShell from "@/components/online/OnlinePageShell";

type ApiCard = {
  cardId: number;
  variantId: number | null;
  setId: number | null;
  count: number;
  name: string;
  slug: string | null;
  setName: string | null;
  type: string | null;
  rarity: string | null;
  zone: string | null;
};

type CubeData = {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  isOwner: boolean;
  cards: ApiCard[];
};

type SearchResult = {
  cardId: number;
  variantId: number | null;
  name: string;
  slug: string | null;
  setName: string | null;
  type: string | null;
  rarity: string | null;
};

export default function CubeEditorPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session, status } = useSession();
  const cubeId = typeof params?.id === "string" ? params.id : "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cube, setCube] = useState<CubeData | null>(null);
  const [cards, setCards] = useState<ApiCard[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch cube data
  useEffect(() => {
    if (status !== "authenticated" || !cubeId) return;
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/cubes/${encodeURIComponent(cubeId)}`);
        if (!res.ok) {
          throw new Error("Failed to load cube");
        }
        const data = (await res.json()) as CubeData;
        if (!data.isOwner) {
          throw new Error("You do not have permission to edit this cube");
        }
        if (!cancelled) {
          setCube(data);
          setCards(data.cards || []);
          setName(data.name || "");
          setDescription(data.description || "");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load cube");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cubeId, status]);

  // Search cards
  const doSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    try {
      setSearching(true);
      const res = await fetch(
        `/api/cards/search?q=${encodeURIComponent(query)}&limit=20`
      );
      if (!res.ok) return;
      const data = await res.json();
      const results: SearchResult[] = (data.cards || []).map(
        (c: Record<string, unknown>) => ({
          cardId: Number(c.cardId) || 0,
          variantId: c.variantId != null ? Number(c.variantId) : null,
          name: String(c.cardName || c.name || ""),
          slug: c.slug ? String(c.slug) : null,
          setName: c.setName ? String(c.setName) : null,
          type: c.type ? String(c.type) : null,
          rarity: c.rarity ? String(c.rarity) : null,
        })
      );
      setSearchResults(results);
    } catch {
      // Ignore search errors
    } finally {
      setSearching(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      doSearch(searchQuery);
    }, 300);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery, doSearch]);

  // Add card to cube
  const addCard = useCallback(
    (card: SearchResult, zone: "main" | "sideboard") => {
      setCards((prev) => {
        const existing = prev.find(
          (c) => c.cardId === card.cardId && c.zone === zone
        );
        if (existing) {
          return prev.map((c) =>
            c.cardId === card.cardId && c.zone === zone
              ? { ...c, count: c.count + 1 }
              : c
          );
        }
        return [
          ...prev,
          {
            cardId: card.cardId,
            variantId: card.variantId,
            setId: null,
            count: 1,
            name: card.name,
            slug: card.slug,
            setName: card.setName,
            type: card.type,
            rarity: card.rarity,
            zone,
          },
        ];
      });
    },
    []
  );

  // Remove card from cube
  const removeCard = useCallback((cardId: number, zone: string | null) => {
    setCards((prev) => {
      const existing = prev.find((c) => c.cardId === cardId && c.zone === zone);
      if (existing && existing.count > 1) {
        return prev.map((c) =>
          c.cardId === cardId && c.zone === zone
            ? { ...c, count: c.count - 1 }
            : c
        );
      }
      return prev.filter((c) => !(c.cardId === cardId && c.zone === zone));
    });
  }, []);

  // Update card count
  const updateCardCount = useCallback(
    (cardId: number, zone: string | null, newCount: number) => {
      if (newCount <= 0) {
        removeCard(cardId, zone);
        return;
      }
      setCards((prev) =>
        prev.map((c) =>
          c.cardId === cardId && c.zone === zone ? { ...c, count: newCount } : c
        )
      );
    },
    [removeCard]
  );

  // Save cube
  const handleSave = useCallback(async () => {
    if (!cube || saving) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/cubes/${encodeURIComponent(cube.id)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || cube.name,
          description: description.trim() || null,
          cards: cards.map((c) => ({
            cardId: c.cardId,
            variantId: c.variantId,
            setId: c.setId,
            count: c.count,
            zone: c.zone,
          })),
        }),
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        throw new Error(msg || "Failed to save cube");
      }
      router.push("/cubes");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save cube");
    } finally {
      setSaving(false);
    }
  }, [cube, name, description, cards, saving, router]);

  // Group cards by zone
  const mainCards = cards.filter((c) => (c.zone ?? "main") === "main");
  const sideboardCards = cards.filter((c) => c.zone === "sideboard");

  const totalMain = mainCards.reduce((sum, c) => sum + c.count, 0);
  const totalSideboard = sideboardCards.reduce((sum, c) => sum + c.count, 0);

  if (status === "loading" || loading) {
    return (
      <OnlinePageShell>
        <div className="rounded-xl bg-slate-900/70 ring-1 ring-slate-800/80 p-6 text-center">
          <div className="text-sm text-slate-300">Loading...</div>
        </div>
      </OnlinePageShell>
    );
  }

  if (!session) {
    return (
      <OnlinePageShell>
        <div className="pt-2">
          <div className="rounded-xl bg-slate-900/70 ring-1 ring-slate-800/80 p-6 text-center space-y-4">
            <div className="text-sm text-slate-200">
              Please sign in to edit cubes.
            </div>
            <div className="flex justify-center">
              <AuthButton />
            </div>
          </div>
        </div>
      </OnlinePageShell>
    );
  }

  if (error) {
    return (
      <OnlinePageShell>
        <div className="pt-2 space-y-4">
          <div className="rounded-xl bg-red-900/20 ring-1 ring-red-600/40 p-5 text-sm text-red-200">
            Error: {error}
          </div>
          <Link
            href="/cubes"
            className="inline-block rounded-lg bg-slate-800/80 hover:bg-slate-700/80 px-4 py-2 text-sm font-medium text-slate-200"
          >
            Back to Cubes
          </Link>
        </div>
      </OnlinePageShell>
    );
  }

  return (
    <OnlinePageShell>
      <div className="space-y-6 pt-2">
        {/* Header */}
        <div className="rounded-xl bg-slate-900/70 ring-1 ring-slate-800/80 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Cube Name"
                className="w-full text-2xl font-semibold font-fantaisie text-slate-50 bg-transparent border-b border-slate-600 focus:border-blue-500 outline-none pb-1"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description (optional)"
                rows={2}
                className="mt-2 w-full text-sm text-slate-300/90 bg-transparent border border-slate-700 rounded px-2 py-1 focus:border-blue-500 outline-none resize-none"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/cubes"
                className="rounded-lg bg-slate-800/80 hover:bg-slate-700/80 px-4 py-2 text-sm font-medium text-slate-200"
              >
                Cancel
              </Link>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="rounded-xl bg-slate-900/70 ring-1 ring-slate-800/80 p-5">
          <div className="text-sm font-medium text-slate-200 mb-2">
            Add Cards
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search for cards..."
            className="w-full bg-slate-800/80 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100 focus:border-blue-500 outline-none"
          />
          {searching && (
            <div className="mt-2 text-xs text-slate-400">Searching...</div>
          )}
          {searchResults.length > 0 && (
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {searchResults.map((card) => (
                <div
                  key={`${card.cardId}-${card.slug}`}
                  className="relative group bg-slate-800/60 rounded-lg overflow-hidden ring-1 ring-slate-700/50"
                >
                  <div className="aspect-[3/4] relative">
                    <Image
                      src={
                        card.slug
                          ? `/api/images/${card.slug}`
                          : "/api/assets/cardback_spellbook.png"
                      }
                      alt={card.name}
                      fill
                      className="object-cover"
                      sizes="150px"
                    />
                  </div>
                  <div className="p-2">
                    <div className="text-xs text-slate-200 truncate">
                      {card.name}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {card.type || "Unknown"}
                    </div>
                  </div>
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      onClick={() => addCard(card, "main")}
                      className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-500"
                    >
                      + Main
                    </button>
                    <button
                      onClick={() => addCard(card, "sideboard")}
                      className="px-2 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-500"
                    >
                      + Side
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Main Deck */}
        <div className="rounded-xl bg-slate-900/70 ring-1 ring-slate-800/80 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-lg font-semibold text-slate-200">
              Main Deck
            </div>
            <div className="text-sm text-slate-400">{totalMain} cards</div>
          </div>
          {mainCards.length === 0 ? (
            <div className="text-sm text-slate-400">No cards in main deck</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {mainCards.map((card) => (
                <div
                  key={`main-${card.cardId}`}
                  className="relative group bg-slate-800/60 rounded-lg overflow-hidden ring-1 ring-slate-700/50"
                >
                  <div className="aspect-[3/4] relative">
                    <Image
                      src={
                        card.slug
                          ? `/api/images/${card.slug}`
                          : "/api/assets/cardback_spellbook.png"
                      }
                      alt={card.name}
                      fill
                      className="object-cover"
                      sizes="120px"
                    />
                    <div className="absolute top-1 right-1 bg-black/80 rounded px-1.5 py-0.5 text-xs text-white font-bold">
                      {card.count}x
                    </div>
                  </div>
                  <div className="p-1.5">
                    <div className="text-[10px] text-slate-200 truncate">
                      {card.name}
                    </div>
                  </div>
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                    <button
                      onClick={() =>
                        updateCardCount(card.cardId, "main", card.count - 1)
                      }
                      className="w-6 h-6 text-xs bg-rose-600 text-white rounded hover:bg-rose-500"
                    >
                      -
                    </button>
                    <span className="text-white text-sm font-bold px-1">
                      {card.count}
                    </span>
                    <button
                      onClick={() =>
                        updateCardCount(card.cardId, "main", card.count + 1)
                      }
                      className="w-6 h-6 text-xs bg-blue-600 text-white rounded hover:bg-blue-500"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sideboard */}
        <div className="rounded-xl bg-slate-900/70 ring-1 ring-slate-800/80 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-lg font-semibold text-slate-200">
              Sideboard
            </div>
            <div className="text-sm text-slate-400">{totalSideboard} cards</div>
          </div>
          <p className="text-xs text-slate-400 mb-3">
            Avatars in the sideboard will be draftable in packs. Non-avatar
            sideboard cards are available as extras during deck building.
          </p>
          {sideboardCards.length === 0 ? (
            <div className="text-sm text-slate-400">No cards in sideboard</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {sideboardCards.map((card) => (
                <div
                  key={`side-${card.cardId}`}
                  className="relative group bg-slate-800/60 rounded-lg overflow-hidden ring-1 ring-purple-700/50"
                >
                  <div className="aspect-[3/4] relative">
                    <Image
                      src={
                        card.slug
                          ? `/api/images/${card.slug}`
                          : "/api/assets/cardback_spellbook.png"
                      }
                      alt={card.name}
                      fill
                      className="object-cover"
                      sizes="120px"
                    />
                    <div className="absolute top-1 right-1 bg-purple-900/80 rounded px-1.5 py-0.5 text-xs text-white font-bold">
                      {card.count}x
                    </div>
                  </div>
                  <div className="p-1.5">
                    <div className="text-[10px] text-slate-200 truncate">
                      {card.name}
                    </div>
                  </div>
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                    <button
                      onClick={() =>
                        updateCardCount(
                          card.cardId,
                          "sideboard",
                          card.count - 1
                        )
                      }
                      className="w-6 h-6 text-xs bg-rose-600 text-white rounded hover:bg-rose-500"
                    >
                      -
                    </button>
                    <span className="text-white text-sm font-bold px-1">
                      {card.count}
                    </span>
                    <button
                      onClick={() =>
                        updateCardCount(
                          card.cardId,
                          "sideboard",
                          card.count + 1
                        )
                      }
                      className="w-6 h-6 text-xs bg-purple-600 text-white rounded hover:bg-purple-500"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </OnlinePageShell>
  );
}
