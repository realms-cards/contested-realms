"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { TournamentControls } from "@/components/deck-editor";

// Stable constant for standard site names
const STANDARD_SITE_NAMES = ["Spire", "Stream", "Valley", "Wasteland"] as const;

type Zone = "Spellbook" | "Atlas" | "Sideboard";

type SearchType = "all" | "site" | "spell" | "avatar";

type SearchResult = {
  variantId: number;
  slug: string;
  finish: "Standard" | "Foil";
  product: string;
  cardId: number;
  cardName: string;
  set: string;
  type: string | null;
  rarity: string | null;
};

type DeckListItem = { id: string; name: string; format: string };

type ApiCardRef = {
  cardId: number;
  variantId?: number | null;
  name: string;
  type: string | null;
  slug?: string | null;
};

type PickKey = string; // `${cardId}:${zone}:${variantId??x}`

type PickItem = {
  cardId: number;
  variantId: number | null;
  name: string;
  type: string | null;
  slug: string | null;
  zone: Zone;
  count: number;
};

export default function DeckEditorPage() {
  const [decks, setDecks] = useState<DeckListItem[]>([]);
  const [loadingDecks, setLoadingDecks] = useState(false);

  const [deckId, setDeckId] = useState<string | null>(null);
  const [deckName, setDeckName] = useState<string>("New Deck");
  const [deckFormat, setDeckFormat] = useState<string>("Constructed");
  // Selectable set for deck editor
  const [setName, setSetName] = useState<string>("Beta");

  const [picks, setPicks] = useState<Record<PickKey, PickItem>>({});

  // Prefetched standard sites for quick-add buttons (per current set)
  type StandardSiteName = (typeof STANDARD_SITE_NAMES)[number];
  const [stdSites, setStdSites] = useState<
    Record<StandardSiteName, SearchResult | null>
  >({
    Spire: null,
    Stream: null,
    Valley: null,
    Wasteland: null,
  });

  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<SearchType>("all");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [tournamentControlsVisible, setTournamentControlsVisible] =
    useState(false);
  const [spellslingerCard, setSpellslingerCard] =
    useState<SearchResult | null>(null);

  // DnD hover states for visual feedback
  const [isOverDeck, setIsOverDeck] = useState(false);
  const [isOverSideboard, setIsOverSideboard] = useState(false);

  // Check if we're in restricted mode (Draft/Sealed)
  const isRestrictedMode = deckFormat === "Draft" || deckFormat === "Sealed";

  // Load deck list on mount
  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        setLoadingDecks(true);
        const res = await fetch("/api/decks");
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Failed to load decks");
        if (!ignore) setDecks(data as DeckListItem[]);
      } catch (e) {
        if (!ignore) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!ignore) setLoadingDecks(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  // If we arrive with ?id=... in the URL, auto-load that deck
  useEffect(() => {
    try {
      const sp = new URLSearchParams(
        typeof window !== "undefined" ? window.location.search : ""
      );
      const id = sp.get("id");
      if (id) {
        loadDeck(id);
      }
    } catch {}
  }, []);

  // Prefetch standard sites for the current set
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const entries = await Promise.all(
          STANDARD_SITE_NAMES.map(async (name) => {
            const res = await fetch(
              `/api/cards/search?q=${encodeURIComponent(
                name
              )}&set=${encodeURIComponent(setName)}&type=site`
            );
            const data = (await res.json()) as SearchResult[];
            return [name, res.ok && data[0] ? data[0] : null] as const;
          })
        );
        if (!cancelled) {
          const next: Record<StandardSiteName, SearchResult | null> = {
            Spire: null,
            Stream: null,
            Valley: null,
            Wasteland: null,
          };
          for (const [k, v] of entries) next[k] = v;
          setStdSites(next);
        }
      } catch {
        if (!cancelled) {
          setStdSites({
            Spire: null,
            Stream: null,
            Valley: null,
            Wasteland: null,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setName]);

  // Prefetch Spellslinger avatar for current set
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/cards/search?q=spellslinger&set=${encodeURIComponent(
            setName
          )}&type=avatar`
        );
        const data = (await res.json()) as SearchResult[];
        if (!cancelled) setSpellslingerCard(res.ok ? data[0] || null : null);
      } catch {
        if (!cancelled) setSpellslingerCard(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setName]);

  function clearEditor() {
    setDeckId(null);
    setDeckName("New Deck");
    setDeckFormat("Constructed");
    setPicks({});
    setSaveMsg(null);
  }

  async function loadDeck(id: string) {
    try {
      setError(null);
      setSaveMsg(null);
      const res = await fetch(`/api/decks/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load deck");
      const { name, format, spellbook, atlas, sideboard } = data as {
        id: string;
        name: string;
        format: string;
        spellbook: ApiCardRef[];
        atlas: ApiCardRef[];
        sideboard: ApiCardRef[];
      };
      const toKey = (c: ApiCardRef, zone: Zone) =>
        `${c.cardId}:${zone}:${c.variantId ?? "x"}`;
      const map: Record<PickKey, PickItem> = {};
      const push = (c: ApiCardRef, zone: Zone) => {
        const key = toKey(c, zone);
        map[key] = map[key]
          ? { ...map[key], count: map[key].count + 1 }
          : {
              cardId: c.cardId,
              variantId: c.variantId ?? null,
              name: c.name,
              type: c.type,
              slug: c.slug ?? null,
              zone,
              count: 1,
            };
      };
      for (const c of spellbook) push(c, "Spellbook");
      for (const c of atlas) push(c, "Atlas");
      for (const c of sideboard) push(c, "Sideboard");
      setDeckId(id);
      setDeckName(name);
      setDeckFormat(format || "Constructed");
      setPicks(map);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function doSearch() {
    try {
      setSearching(true);
      setError(null);
      const sp = new URLSearchParams();
      if (q.trim()) sp.set("q", q.trim());
      if (setName) sp.set("set", setName);
      if (typeFilter !== "all") sp.set("type", typeFilter);
      const res = await fetch(`/api/cards/search?${sp.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Search failed");
      setResults(data as SearchResult[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  function addCardFromResult(r: SearchResult, zone: Zone) {
    const key = `${r.cardId}:${zone}:${r.variantId ?? "x"}`;
    setPicks((prev) => {
      const it = prev[key];
      return {
        ...prev,
        [key]: it
          ? { ...it, count: it.count + 1 }
          : {
              cardId: r.cardId,
              variantId: r.variantId ?? null,
              name: r.cardName,
              type: r.type ?? null,
              slug: r.slug ?? null,
              zone,
              count: 1,
            },
      };
    });
  }

  // Auto-categorize into Atlas (sites) or Spellbook (non-sites)
  const addCardAuto = useCallback((r: SearchResult) => {
    const t = (r.type || "").toLowerCase();
    const zone: Zone = t.includes("site") ? "Atlas" : "Spellbook";
    addCardFromResult(r, zone);
  }, []);

  const addToSideboardFromSearch = useCallback((r: SearchResult) => {
    addCardFromResult(r, "Sideboard");
  }, []);

  function removeOne(key: PickKey) {
    setPicks((prev) => {
      const it = prev[key];
      if (!it) return prev;
      const next = { ...prev } as typeof prev;
      if (it.count <= 1) delete next[key];
      else next[key] = { ...it, count: it.count - 1 };
      return next;
    });
  }

  function increment(key: PickKey) {
    setPicks((prev) => ({
      ...prev,
      [key]: { ...prev[key], count: prev[key].count + 1 },
    }));
  }

  // (changeZone removed; use moveOneToSideboard/moveOneFromSideboardToDeck helpers instead)

  // Move a single copy from a deck pick (Spellbook/Atlas) to Sideboard
  const moveOneToSideboard = useCallback((key: PickKey) => {
    setPicks((prev) => {
      const it = prev[key];
      if (!it) return prev;
      const next = { ...prev } as typeof prev;
      // decrement source
      if (it.count <= 1) delete next[key];
      else next[key] = { ...it, count: it.count - 1 };
      // increment sideboard
      const sbKey = `${it.cardId}:Sideboard:${it.variantId ?? "x"}`;
      if (next[sbKey])
        next[sbKey] = { ...next[sbKey], count: next[sbKey].count + 1 };
      else next[sbKey] = { ...it, zone: "Sideboard", count: 1 };
      return next;
    });
  }, []);

  // Move a single copy from Sideboard to Deck (auto-categorize)
  const moveOneFromSideboardToDeck = useCallback((sbKey: PickKey) => {
    setPicks((prev) => {
      const it = prev[sbKey];
      if (!it) return prev;
      const next = { ...prev } as typeof prev;
      // decrement sideboard
      if (it.count <= 1) delete next[sbKey];
      else next[sbKey] = { ...it, count: it.count - 1 };
      // add to deck auto (Atlas if site, else Spellbook)
      const t = (it.type || "").toLowerCase();
      const dz: Zone = t.includes("site") ? "Atlas" : "Spellbook";
      const dk = `${it.cardId}:${dz}:${it.variantId ?? "x"}`;
      if (next[dk]) next[dk] = { ...next[dk], count: next[dk].count + 1 };
      else next[dk] = { ...it, zone: dz, count: 1 };
      return next;
    });
  }, []);

  async function setAvatarSpellslinger() {
    try {
      setError(null);
      const res = await fetch(
        `/api/cards/search?q=spellslinger&set=${encodeURIComponent(
          setName
        )}&type=avatar`
      );
      const raw = await res.json();
      if (!res.ok) {
        const apiErr = (raw as { error?: string } | null)?.error;
        throw new Error(apiErr || "Search failed");
      }
      const data = raw as SearchResult[];
      const hit = data[0];
      if (!hit) throw new Error("Spellslinger not found in this set");
      // Add spellslinger to spellbook without removing other avatars
      const key = `${hit.cardId}:Spellbook:${hit.variantId ?? "x"}`;
      setPicks((prev) => ({
        ...prev,
        [key]: prev[key]
          ? { ...prev[key], count: prev[key].count + 1 }
          : {
              cardId: hit.cardId,
              variantId: hit.variantId ?? null,
              name: hit.cardName,
              type: hit.type ?? null,
              slug: hit.slug ?? null,
              zone: "Spellbook",
              count: 1,
            },
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // (addStandardSitesOnceEach removed; use individual quick-add buttons)

  // Quick-add a specific standard site by name, using prefetched results with a network fallback
  async function addStandardSiteByName(name: StandardSiteName) {
    const hit = stdSites[name];
    if (hit) {
      addCardFromResult(hit, "Atlas");
      return;
    }
    try {
      const res = await fetch(
        `/api/cards/search?q=${encodeURIComponent(
          name
        )}&set=${encodeURIComponent(setName)}&type=site`
      );
      const data = (await res.json()) as SearchResult[];
      const r = res.ok && data[0] ? data[0] : null;
      if (r) addCardFromResult(r, "Atlas");
      else setError(`Site ${name} not found in set ${setName}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const zoneCounts = useMemo(() => {
    const res: Record<Zone, number> = { Spellbook: 0, Atlas: 0, Sideboard: 0 };
    for (const it of Object.values(picks)) res[it.zone] += it.count;
    return res;
  }, [picks]);

  const avatarCount = useMemo(() => {
    let n = 0;
    for (const it of Object.values(picks)) {
      const t = (it.type || "").toLowerCase();
      if (t.includes("avatar")) n += it.count;
    }
    return n;
  }, [picks]);

  const spellbookNonAvatar = useMemo(() => {
    let n = 0;
    for (const it of Object.values(picks)) {
      if (it.zone !== "Spellbook") continue;
      const t = (it.type || "").toLowerCase();
      if (!t.includes("avatar")) n += it.count;
    }
    return n;
  }, [picks]);

  const validation = useMemo(() => {
    return {
      avatar: avatarCount === 1,
      atlas: zoneCounts.Atlas >= 12,
      spellbook: spellbookNonAvatar >= 24,
    };
  }, [avatarCount, zoneCounts, spellbookNonAvatar]);

  // DnD helpers
  type DragPayload = {
    from: "search" | "deck" | "sideboard";
    // minimal fields to recreate the item
    cardId: number;
    variantId: number | null;
    name: string;
    type: string | null;
    slug: string | null;
    key?: string; // for deck/sideboard origin
  };

  const onDragStartFromSearch = (r: SearchResult) => (ev: React.DragEvent) => {
    const payload: DragPayload = {
      from: "search",
      cardId: r.cardId,
      variantId: r.variantId ?? null,
      name: r.cardName,
      type: r.type ?? null,
      slug: r.slug ?? null,
    };
    ev.dataTransfer.setData("application/json", JSON.stringify(payload));
    ev.dataTransfer.effectAllowed = "copy";
  };

  const onDragStartFromPick =
    (key: PickKey, it: PickItem, from: "deck" | "sideboard") =>
    (ev: React.DragEvent) => {
      const payload: DragPayload = {
        from,
        key,
        cardId: it.cardId,
        variantId: it.variantId,
        name: it.name,
        type: it.type,
        slug: it.slug,
      };
      ev.dataTransfer.setData("application/json", JSON.stringify(payload));
      ev.dataTransfer.effectAllowed = from === "deck" ? "move" : "copyMove";
    };

  const handleDropOnDeck = (ev: React.DragEvent) => {
    ev.preventDefault();
    setIsOverDeck(false);
    try {
      const raw = ev.dataTransfer.getData("application/json");
      if (!raw) return;
      const p = JSON.parse(raw) as DragPayload;
      if (p.from === "search") {
        // auto-categorize
        addCardAuto({
          variantId: p.variantId ?? 0,
          slug: p.slug || "",
          finish: "Standard",
          product: "",
          cardId: p.cardId,
          cardName: p.name,
          set: setName,
          type: p.type,
          rarity: null,
        });
      } else if (p.from === "sideboard" && p.key) {
        moveOneFromSideboardToDeck(p.key as PickKey);
      }
    } catch {}
  };

  const handleDropOnSideboard = (ev: React.DragEvent) => {
    ev.preventDefault();
    setIsOverSideboard(false);
    try {
      const raw = ev.dataTransfer.getData("application/json");
      if (!raw) return;
      const p = JSON.parse(raw) as DragPayload;
      if (p.from === "search") {
        addToSideboardFromSearch({
          variantId: p.variantId ?? 0,
          slug: p.slug || "",
          finish: "Standard",
          product: "",
          cardId: p.cardId,
          cardName: p.name,
          set: setName,
          type: p.type,
          rarity: null,
        });
      } else if (p.from === "deck" && p.key) {
        moveOneToSideboard(p.key as PickKey);
      }
    } catch {}
  };

  const preventDefault = (ev: React.DragEvent) => {
    ev.preventDefault();
  };

  async function saveDeck() {
    try {
      setSaving(true);
      setError(null);
      setSaveMsg(null);

      if (!validation.avatar || !validation.atlas || !validation.spellbook) {
        throw new Error(
          "Deck invalid. Require: 1 Avatar, Atlas >= 12, Spellbook >= 24 (excl. Avatar)"
        );
      }

      const cards = Object.values(picks).map((p) => ({
        cardId: p.cardId,
        zone: p.zone,
        count: p.count,
        variantId: p.variantId ?? undefined,
      }));

      if (deckId) {
        const res = await fetch(`/api/decks/${deckId}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: deckName || "Deck",
            set: setName,
            cards,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Failed to update deck");
        setSaveMsg(`Updated deck ${data.name} (id: ${data.id})`);
      } else {
        const res = await fetch("/api/decks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: deckName || "New Deck",
            format: "Constructed",
            set: setName,
            cards,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Failed to save deck");
        setDeckId(data.id);
        setSaveMsg(`Saved deck ${data.name} (id: ${data.id})`);
        // refresh decks list
        try {
          const res2 = await fetch("/api/decks");
          const list = await res2.json();
          if (res2.ok) setDecks(list as DeckListItem[]);
        } catch {}
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  // Derived lists for Deck vs Sideboard UI
  const entries = Object.entries(picks);
  const deckEntries = entries.filter(([, it]) => it.zone !== "Sideboard");
  const sideEntries = entries.filter(([, it]) => it.zone === "Sideboard");
  const avatars = deckEntries.filter(([, it]) =>
    (it.type || "").toLowerCase().includes("avatar")
  );
  const atlasCards = deckEntries.filter(([, it]) =>
    it.zone === "Atlas"
  );
  const spellbookCards = deckEntries.filter(
    ([, it]) =>
      it.zone === "Spellbook" &&
      !(it.type || "").toLowerCase().includes("avatar")
  );

  const CardThumb: React.FC<
    {
      slug: string | null;
      alt: string;
      isSite: boolean;
    } & React.HTMLAttributes<HTMLDivElement>
  > = ({ slug, alt, isSite, className = "", ...rest }) => (
    <div
      className={
        "relative overflow-hidden rounded bg-muted/40 " +
        (isSite ? "aspect-[4/3]" : "aspect-[3/4]") +
        (className ? " " + className : "")
      }
      {...rest}
    >
      {slug && (
        <Image
          src={`/api/images/${slug}`}
          alt={alt}
          fill
          sizes="160px"
          className={
            isSite ? "object-contain rotate-90 origin-center" : "object-cover"
          }
        />
      )}
    </div>
  );

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      <h1 className="text-2xl font-semibold">Deck Editor</h1>

      {error && <div className="text-red-500">Error: {error}</div>}

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase opacity-70">Deck</span>
          <div className="flex gap-2">
            <select
              value={deckId || ""}
              onChange={(e) => {
                const v = e.target.value;
                if (v) loadDeck(v);
                else clearEditor();
              }}
              disabled={loadingDecks}
              className="border rounded px-3 py-2 bg-transparent min-w-56 disabled:opacity-60"
            >
              <option value="">— New Deck —</option>
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} • {d.format}
                </option>
              ))}
            </select>
            <button
              onClick={clearEditor}
              disabled={loadingDecks}
              className="h-10 px-3 border rounded disabled:opacity-60"
            >
              New
            </button>
            {loadingDecks && (
              <div className="self-center text-xs opacity-70">Loading...</div>
            )}
          </div>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase opacity-70">Name</span>
          <input
            value={deckName}
            onChange={(e) => setDeckName(e.target.value)}
            className="border rounded px-3 py-2 bg-transparent"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase opacity-70">Set</span>
          <select
            value={setName}
            onChange={(e) => setSetName(e.target.value)}
            className="border rounded px-3 py-2 bg-transparent"
          >
            <option value="Alpha">Alpha</option>
            <option value="Beta">Beta</option>
            <option value="Arthurian Legends">Arthurian Legends</option>
            <option value="Dragonlord">Dragonlord</option>
          </select>
        </label>

        <div className="ml-auto flex items-center gap-3 text-sm">
          <div
            className={validation.avatar ? "text-green-600" : "text-red-600"}
          >
            Avatar: {avatarCount} / 1
          </div>
          <div className={validation.atlas ? "text-green-600" : "text-red-600"}>
            Atlas: {zoneCounts.Atlas} / 12+
          </div>
          <div
            className={validation.spellbook ? "text-green-600" : "text-red-600"}
          >
            Spellbook: {spellbookNonAvatar} / 24+
          </div>
        </div>
      </div>

      {/* Format indicator and tournament-legal quick actions */}
      <div className="flex flex-wrap items-center gap-3">
        {isRestrictedMode && (
          <div className="px-3 py-2 bg-amber-100 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded text-sm text-amber-800 dark:text-amber-200">
            📋 {deckFormat} Mode - Card pool is locked (cannot add/remove drafted cards, but can set avatar and add standard sites)
          </div>
        )}
        <button
          onClick={() => setTournamentControlsVisible(!tournamentControlsVisible)}
          className={`px-3 py-2 rounded text-sm transition-colors ${
            tournamentControlsVisible
              ? "bg-yellow-600 text-white hover:bg-yellow-500"
              : "border hover:bg-white/10"
          }`}
          title="Show tournament legal cards (Spellslinger + Standard Sites)"
        >
          Add Standard Cards
        </button>
      </div>

      {/* Main two zones */}
      <div className="grid grid-cols-12 gap-4">
        {/* Deck zone */}
        <div
          className={
            "col-span-12 lg:col-span-8 border rounded p-3 min-h-64 " +
            (isOverDeck ? "ring-2 ring-foreground/60" : "")
          }
          onDragOver={(ev) => {
            preventDefault(ev);
            setIsOverDeck(true);
          }}
          onDragLeave={() => setIsOverDeck(false)}
          onDrop={handleDropOnDeck}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="font-medium">Deck</div>
            <div className="text-xs opacity-70">
              Spellbook: {zoneCounts.Spellbook} • Atlas: {zoneCounts.Atlas}
            </div>
          </div>

          {/* Avatar */}
          <div className="space-y-2">
            {!!avatars.length && (
              <div>
                <div className="text-xs uppercase opacity-70 mb-2">Avatar</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {avatars.map(([key, it]) => (
                    <div key={key} className="relative border rounded p-2">
                      <CardThumb
                        slug={it.slug}
                        alt={it.name}
                        isSite={false}
                        className="w-full"
                        draggable
                        onDragStart={onDragStartFromPick(key, it, "deck")}
                      />
                      <div className="mt-1 text-xs font-medium line-clamp-1">
                        {it.name}
                      </div>
                      <div className="absolute top-1 right-1 text-[11px] bg-background/80 px-1 rounded">
                        x{it.count}
                      </div>
                      <div className="mt-2 flex gap-1 text-xs">
                        {!isRestrictedMode && (
                          <>
                            <button
                              className="px-2 py-1 border rounded"
                              onClick={() => removeOne(key)}
                            >
                              -
                            </button>
                            <button
                              className="px-2 py-1 border rounded"
                              onClick={() => increment(key)}
                            >
                              +
                            </button>
                          </>
                        )}
                        <button
                          className="ml-auto px-2 py-1 border rounded"
                          onClick={() => moveOneToSideboard(key)}
                        >
                          → Side
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Spellbook */}
            {!!spellbookCards.length && (
              <div>
                <div className="text-xs uppercase opacity-70 mb-2">
                  Spellbook
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {spellbookCards.map(([key, it]) => (
                    <div key={key} className="relative border rounded p-2">
                      <CardThumb
                        slug={it.slug}
                        alt={it.name}
                        isSite={false}
                        className="w-full"
                        draggable
                        onDragStart={onDragStartFromPick(key, it, "deck")}
                      />
                      <div className="mt-1 text-xs font-medium line-clamp-1">
                        {it.name}
                      </div>
                      <div className="absolute top-1 right-1 text-[11px] bg-background/80 px-1 rounded">
                        x{it.count}
                      </div>
                      <div className="mt-2 flex gap-1 text-xs">
                        {!isRestrictedMode && (
                          <>
                            <button
                              className="px-2 py-1 border rounded"
                              onClick={() => removeOne(key)}
                            >
                              -
                            </button>
                            <button
                              className="px-2 py-1 border rounded"
                              onClick={() => increment(key)}
                            >
                              +
                            </button>
                          </>
                        )}
                        <button
                          className="ml-auto px-2 py-1 border rounded"
                          onClick={() => moveOneToSideboard(key)}
                        >
                          → Side
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Atlas */}
            {!!atlasCards.length && (
              <div>
                <div className="text-xs uppercase opacity-70 mb-2">Atlas</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {atlasCards.map(([key, it]) => (
                    <div key={key} className="relative border rounded p-2">
                      <CardThumb
                        slug={it.slug}
                        alt={it.name}
                        isSite={true}
                        className="w-full"
                        draggable
                        onDragStart={onDragStartFromPick(key, it, "deck")}
                      />
                      <div className="mt-1 text-xs font-medium line-clamp-1">
                        {it.name}
                      </div>
                      <div className="absolute top-1 right-1 text-[11px] bg-background/80 px-1 rounded">
                        x{it.count}
                      </div>
                      <div className="mt-2 flex gap-1 text-xs">
                        <button
                          className="px-2 py-1 border rounded"
                          onClick={() => removeOne(key)}
                        >
                          -
                        </button>
                        <button
                          className="px-2 py-1 border rounded"
                          onClick={() => increment(key)}
                        >
                          +
                        </button>
                        <button
                          className="ml-auto px-2 py-1 border rounded"
                          onClick={() => moveOneToSideboard(key)}
                        >
                          → Side
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sideboard zone */}
        <div
          className={
            "col-span-12 lg:col-span-4 border rounded p-3 min-h-64 " +
            (isOverSideboard ? "ring-2 ring-foreground/60" : "")
          }
          onDragOver={(ev) => {
            preventDefault(ev);
            setIsOverSideboard(true);
          }}
          onDragLeave={() => setIsOverSideboard(false)}
          onDrop={handleDropOnSideboard}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="font-medium">Sideboard</div>
            <div className="text-xs opacity-70">
              {zoneCounts.Sideboard} cards
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {sideEntries.map(([key, it]) => (
              <div key={key} className="relative border rounded p-2">
                <CardThumb
                  slug={it.slug}
                  alt={it.name}
                  isSite={(it.type || "").toLowerCase().includes("site")}
                  className="w-full"
                  draggable
                  onDragStart={onDragStartFromPick(key, it, "sideboard")}
                />
                <div className="mt-1 text-xs font-medium line-clamp-1">
                  {it.name}
                </div>
                <div className="absolute top-1 right-1 text-[11px] bg-background/80 px-1 rounded">
                  x{it.count}
                </div>
                <div className="mt-2 flex gap-1 text-xs">
                  {!isRestrictedMode && (
                    <>
                      <button
                        className="px-2 py-1 border rounded"
                        onClick={() => removeOne(key)}
                      >
                        -
                      </button>
                      <button
                        className="px-2 py-1 border rounded"
                        onClick={() => increment(key)}
                      >
                        +
                      </button>
                    </>
                  )}
                  <button
                    className="ml-auto px-2 py-1 border rounded"
                    onClick={() => moveOneFromSideboardToDeck(key)}
                  >
                    → Deck
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Search within sideboard column for compactness */}
          {!isRestrictedMode && (
            <div className="mt-4 border-t pt-3">
              <div className="font-medium mb-2">Search</div>
              <div className="flex flex-wrap items-end gap-2 mb-2">
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="border rounded px-3 py-2 bg-transparent w-48"
                  placeholder="Name contains..."
                />
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as SearchType)}
                  className="border rounded px-3 py-2 bg-transparent"
                >
                  <option value="all">All</option>
                  <option value="avatar">Avatar</option>
                  <option value="site">Sites</option>
                  <option value="spell">Spellbook</option>
                </select>
                <button
                  onClick={doSearch}
                  disabled={searching}
                  className="h-10 px-3 rounded bg-foreground text-background disabled:opacity-50"
                >
                  {searching ? "Searching..." : "Search"}
                </button>
              </div>
            {!!results.length && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                {results.map((c) => {
                  const isSite = (c.type || "").toLowerCase().includes("site");
                  return (
                    <div
                      key={c.variantId}
                      className="border rounded p-2"
                      draggable
                      onDragStart={onDragStartFromSearch(c)}
                    >
                      <CardThumb
                        slug={c.slug}
                        alt={c.cardName}
                        isSite={isSite}
                        className="w-full mb-2"
                      />
                      <div className="font-semibold line-clamp-1">
                        {c.cardName}
                      </div>
                      <div className="opacity-80 line-clamp-1">
                        {c.type || ""}
                      </div>
                      <div className="mt-1 flex gap-1">
                        <button
                          className="px-2 py-1 border rounded"
                          onClick={() => addCardAuto(c)}
                        >
                          + Deck
                        </button>
                        <button
                          className="px-2 py-1 border rounded"
                          onClick={() => addToSideboardFromSearch(c)}
                        >
                          + Side
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <button
          onClick={saveDeck}
          disabled={saving}
          className="h-10 px-4 rounded bg-foreground text-background disabled:opacity-50"
        >
          {saving ? "Saving..." : deckId ? "Update Deck" : "Save Deck"}
        </button>
        {saveMsg && <div className="text-green-600 text-sm">{saveMsg}</div>}
      </div>

      {/* Tournament Legal Controls overlay */}
      <TournamentControls
        isVisible={tournamentControlsVisible}
        onClose={() => setTournamentControlsVisible(false)}
        spellslingerCard={spellslingerCard}
        standardSites={stdSites}
        onAddSpellslinger={() => {
          const hit = spellslingerCard;
          if (!hit) {
            setError("Spellslinger not found in this set");
            return;
          }
          const key = `${hit.cardId}:Spellbook:${hit.variantId ?? "x"}`;
          setPicks((prev) => ({
            ...prev,
            [key]: prev[key]
              ? { ...prev[key], count: prev[key].count + 1 }
              : {
                  cardId: hit.cardId,
                  variantId: hit.variantId ?? null,
                  name: hit.cardName,
                  type: hit.type ?? null,
                  slug: hit.slug ?? null,
                  zone: "Spellbook",
                  count: 1,
                },
          }));
        }}
        onAddStandardSite={addStandardSiteByName}
      />
    </div>
  );
}
