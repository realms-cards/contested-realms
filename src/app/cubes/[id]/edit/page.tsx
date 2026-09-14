"use client";

import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import AuthButton from "@/components/auth/AuthButton";
import OnlinePageShell from "@/components/online/OnlinePageShell";
import { PanelHeader } from "@/components/ui/page-header";
import { RcButton, RcLinkButton } from "@/components/ui/rc-button";

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
        <div className="rc-hint py-6 text-center">loading…</div>
      </OnlinePageShell>
    );
  }

  if (!session) {
    return (
      <OnlinePageShell>
        <section className="rc-panel px-[18px] py-8 text-center">
          <div className="font-rc-sans text-sm text-rc-fg-muted">
            Please sign in to edit cubes.
          </div>
          <div className="mt-4 flex justify-center">
            <AuthButton />
          </div>
        </section>
      </OnlinePageShell>
    );
  }

  if (error) {
    return (
      <OnlinePageShell>
        <div className="space-y-4">
          <div className="rc-alert" data-tone="danger">
            Error: {error}
          </div>
          <RcLinkButton href="/cubes" variant="outline">
            Back to Cubes
          </RcLinkButton>
        </div>
      </OnlinePageShell>
    );
  }

  return (
    <OnlinePageShell>
      <>
        {/* Header */}
        <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 flex-1">
            <div className="rc-eyebrow mb-1.5">edit cube</div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Cube Name"
              className="w-full border-0 border-b border-rc-line/22 bg-transparent pb-1 font-rc-display text-[clamp(26px,2.4vw,34px)] leading-none text-rc-fg-strong outline-none focus:border-rc-accent-ring"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="rc-textarea mt-3 w-full resize-none"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <RcLinkButton href="/cubes" variant="outline">
              Cancel
            </RcLinkButton>
            <RcButton onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </RcButton>
          </div>
        </header>

        {/* Search */}
        <section className="rc-panel">
          <PanelHeader title="Add Cards" />
          <div className="px-[18px] py-3.5">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search for cards..."
            className="rc-input h-10 w-full"
          />
          {searching && <div className="rc-hint mt-2">searching…</div>}
          {searchResults.length > 0 && (
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {searchResults.map((card) => (
                <div
                  key={`${card.cardId}-${card.slug}`}
                  className="group relative overflow-hidden rounded-rc-md border border-rc-line/12 bg-black/30"
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
                      unoptimized
                    />
                  </div>
                  <div className="p-2">
                    <div className="truncate font-rc-sans text-xs text-rc-fg">
                      {card.name}
                    </div>
                    <div className="rc-hint">{card.type || "Unknown"}</div>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center gap-2 bg-[rgba(6,10,20,0.82)] opacity-0 transition-opacity group-hover:opacity-100">
                    <RcButton
                      variant="outline"
                      size="sm"
                      className="bg-black/35"
                      onClick={() => addCard(card, "main")}
                    >
                      + Main
                    </RcButton>
                    <RcButton
                      variant="outline"
                      size="sm"
                      className="bg-black/35"
                      onClick={() => addCard(card, "sideboard")}
                    >
                      + Side
                    </RcButton>
                  </div>
                </div>
              ))}
            </div>
          )}
          </div>
        </section>

        {/* Main Deck */}
        <section className="rc-panel">
          <PanelHeader title="Main Deck" meta={`${totalMain} cards`} />
          <div className="px-[18px] py-3.5">
          {mainCards.length === 0 ? (
            <div className="rc-hint">No cards in main deck</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {mainCards.map((card) => (
                <div
                  key={`main-${card.cardId}`}
                  className="group relative overflow-hidden rounded-rc-md border border-rc-line/12 bg-black/30"
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
                      unoptimized
                    />
                    <div className="absolute top-1 right-1 rounded-rc-sm bg-black/80 px-1.5 py-0.5 font-rc-mono text-xs text-rc-fg-strong">
                      {card.count}x
                    </div>
                  </div>
                  <div className="p-1.5">
                    <div className="truncate font-rc-sans text-[10px] text-rc-fg">
                      {card.name}
                    </div>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center gap-1 bg-[rgba(6,10,20,0.82)] opacity-0 transition-opacity group-hover:opacity-100">
                    <RcButton
                      variant="outline"
                      size="icon"
                      className="h-6 w-6 bg-black/35"
                      aria-label="Remove one copy"
                      onClick={() =>
                        updateCardCount(card.cardId, "main", card.count - 1)
                      }
                    >
                      -
                    </RcButton>
                    <span className="rc-stat px-1 text-sm">{card.count}</span>
                    <RcButton
                      variant="outline"
                      size="icon"
                      className="h-6 w-6 bg-black/35"
                      aria-label="Add one copy"
                      onClick={() =>
                        updateCardCount(card.cardId, "main", card.count + 1)
                      }
                    >
                      +
                    </RcButton>
                  </div>
                </div>
              ))}
            </div>
          )}
          </div>
        </section>

        {/* Sideboard */}
        <section className="rc-panel">
          <PanelHeader title="Sideboard" meta={`${totalSideboard} cards`} />
          <div className="px-[18px] py-3.5">
          <p className="rc-hint mb-3">
            Avatars in the sideboard will be draftable in packs. Non-avatar
            sideboard cards are available as extras during deck building.
          </p>
          {sideboardCards.length === 0 ? (
            <div className="rc-hint">No cards in sideboard</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {sideboardCards.map((card) => (
                <div
                  key={`side-${card.cardId}`}
                  className="group relative overflow-hidden rounded-rc-md border border-rc-accent/25 bg-black/30"
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
                      unoptimized
                    />
                    <div className="absolute top-1 right-1 rounded-rc-sm border border-rc-accent/60 bg-black/80 px-1.5 py-0.5 font-rc-mono text-xs text-rc-spark">
                      {card.count}x
                    </div>
                  </div>
                  <div className="p-1.5">
                    <div className="truncate font-rc-sans text-[10px] text-rc-fg">
                      {card.name}
                    </div>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center gap-1 bg-[rgba(6,10,20,0.82)] opacity-0 transition-opacity group-hover:opacity-100">
                    <RcButton
                      variant="outline"
                      size="icon"
                      className="h-6 w-6 bg-black/35"
                      aria-label="Remove one copy"
                      onClick={() =>
                        updateCardCount(
                          card.cardId,
                          "sideboard",
                          card.count - 1
                        )
                      }
                    >
                      -
                    </RcButton>
                    <span className="rc-stat px-1 text-sm">{card.count}</span>
                    <RcButton
                      variant="outline"
                      size="icon"
                      className="h-6 w-6 bg-black/35"
                      aria-label="Add one copy"
                      onClick={() =>
                        updateCardCount(
                          card.cardId,
                          "sideboard",
                          card.count + 1
                        )
                      }
                    >
                      +
                    </RcButton>
                  </div>
                </div>
              ))}
            </div>
          )}
          </div>
        </section>
      </>
    </OnlinePageShell>
  );
}
