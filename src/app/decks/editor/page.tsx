"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TournamentControls } from "@/components/deck-editor";
import AppShell from "@/components/ui/AppShell";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { Badge } from "@/components/ui/badge";
import { PageHeader, PanelHeader } from "@/components/ui/page-header";
import { RcButton } from "@/components/ui/rc-button";
import { RcEmpty } from "@/components/ui/rc-empty";
import {
  formatValidationErrors,
  normalizeFormat,
  validateDeck,
} from "@/lib/deck/validation-rules";

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
  const searchParams = useSearchParams();
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
  const [spellslingerCard, setSpellslingerCard] = useState<SearchResult | null>(
    null,
  );

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
        typeof window !== "undefined" ? window.location.search : "",
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
                name,
              )}&set=${encodeURIComponent(setName)}&type=site`,
            );
            const data = (await res.json()) as SearchResult[];
            return [name, res.ok && data[0] ? data[0] : null] as const;
          }),
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

  // Prefetch Spellslinger avatar (prefer current set, fallback to any set)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // 1) Try current set
        let hit: SearchResult | null = null;
        try {
          const resSet = await fetch(
            `/api/cards/search?q=spellslinger&set=${encodeURIComponent(
              setName,
            )}&type=avatar`,
          );
          const dataSet = (await resSet.json()) as SearchResult[];
          hit = resSet.ok ? dataSet[0] || null : null;
        } catch {}

        // 2) Fallback across all sets
        if (!hit) {
          try {
            const resAny = await fetch(
              `/api/cards/search?q=spellslinger&type=avatar`,
            );
            const dataAny = (await resAny.json()) as SearchResult[];
            hit = resAny.ok ? dataAny[0] || null : null;
          } catch {}
        }

        if (!cancelled) setSpellslingerCard(hit);
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
          name,
        )}&set=${encodeURIComponent(setName)}&type=site`,
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
      if (it.zone === "Sideboard") continue; // Only count main deck avatars
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

  // Avatar name drives deckbuilding exceptions (Magician has no atlas)
  const avatarName = useMemo(() => {
    for (const it of Object.values(picks)) {
      if (it.zone === "Sideboard") continue;
      const t = (it.type || "").toLowerCase();
      if (t.includes("avatar")) return it.name;
    }
    return null;
  }, [picks]);

  const deckValidation = useMemo(
    () =>
      validateDeck(
        {
          spellbookCount: spellbookNonAvatar,
          atlasCount: zoneCounts.Atlas,
          avatarCount,
        },
        normalizeFormat(deckFormat),
        avatarName,
      ),
    [avatarCount, zoneCounts, spellbookNonAvatar, deckFormat, avatarName],
  );

  const validation = useMemo(() => {
    const failed = new Set(deckValidation.errors.map((e) => e.code));
    return {
      avatar: !failed.has("AVATAR_COUNT"),
      atlas: !failed.has("ATLAS_MIN") && !failed.has("ATLAS_MAX"),
      spellbook: !failed.has("SPELLBOOK_MIN") && !failed.has("SPELLBOOK_MAX"),
    };
  }, [deckValidation]);

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

      if (!deckValidation.isValid) {
        throw new Error(
          `Deck invalid. ${formatValidationErrors(deckValidation)}`,
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
        // Generate meaningful deck name using match/lobby info when available
        const matchName = searchParams?.get("matchName");
        const lobbyName = searchParams?.get("lobbyName");
        const gameName = matchName || lobbyName;
        const finalDeckName = gameName
          ? `${gameName} (Constructed)`
          : deckName || "New Deck";

        const res = await fetch("/api/decks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: finalDeckName,
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
    (it.type || "").toLowerCase().includes("avatar"),
  );
  const atlasCards = deckEntries.filter(([, it]) => it.zone === "Atlas");
  const spellbookCards = deckEntries.filter(
    ([, it]) =>
      it.zone === "Spellbook" &&
      !(it.type || "").toLowerCase().includes("avatar"),
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
        "relative overflow-hidden rounded-rc-sm bg-black/40 " +
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
          unoptimized
        />
      )}
    </div>
  );

  /** Mono 10px column label above a zone group. */
  const ZoneLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="mb-2 font-rc-mono text-[10px] uppercase tracking-[0.22em] text-rc-fg-dim">
      {children}
    </div>
  );

  /** A single card tile inside the Deck / Sideboard columns. */
  const PickTile: React.FC<{
    pickKey: PickKey;
    it: PickItem;
    isSite: boolean;
    from: "deck" | "sideboard";
    /** Restricted (Draft/Sealed) pools hide the +/- quantity controls */
    showQuantity: boolean;
    moveLabel: string;
    onMove: (key: PickKey) => void;
  }> = ({ pickKey, it, isSite, from, showQuantity, moveLabel, onMove }) => (
    <div className="relative rounded-rc-md border border-rc-line/12 bg-black/30 p-2">
      <CardThumb
        slug={it.slug}
        alt={it.name}
        isSite={isSite}
        className="w-full"
        draggable
        onDragStart={onDragStartFromPick(pickKey, it, from)}
      />
      <div className="mt-1.5 line-clamp-1 font-rc-display text-[15px] leading-tight text-rc-fg-strong">
        {it.name}
      </div>
      <div className="rc-stat absolute right-1.5 top-1.5 rounded-rc-sm bg-black/70 px-1.5 py-0.5 text-[11px]">
        x{it.count}
      </div>
      <div className="mt-2 flex items-center gap-1">
        {showQuantity && (
          <>
            <RcButton
              variant="outline"
              size="icon"
              className="h-7 w-7"
              aria-label={`Remove one ${it.name}`}
              onClick={() => removeOne(pickKey)}
            >
              -
            </RcButton>
            <RcButton
              variant="outline"
              size="icon"
              className="h-7 w-7"
              aria-label={`Add one ${it.name}`}
              onClick={() => increment(pickKey)}
            >
              +
            </RcButton>
          </>
        )}
        <RcButton
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => onMove(pickKey)}
        >
          {moveLabel}
        </RcButton>
      </div>
    </div>
  );

  return (
    <AppShell width="wide">
      <PageHeader
        eyebrow="deck editor"
        title={deckName.trim() ? deckName : "Deck Editor"}
        actions={
          <RcButton onClick={saveDeck} disabled={saving}>
            {saving ? "Saving..." : deckId ? "Update Deck" : "Save Deck"}
          </RcButton>
        }
      />

      {error && (
        <div className="rc-alert" data-tone="danger">
          Error: {error}
        </div>
      )}

      {saveMsg && (
        <div className="rc-alert" data-tone="success">
          {saveMsg}
        </div>
      )}

      <section className="rc-panel">
        <PanelHeader title="Deck Setup" meta={deckFormat}>
          {/* Format indicator and tournament-legal quick actions */}
          <RcButton
            variant="outline"
            size="sm"
            tone="success"
            aria-pressed={tournamentControlsVisible}
            onClick={() =>
              setTournamentControlsVisible(!tournamentControlsVisible)
            }
            title="Show tournament legal cards (Spellslinger + Standard Sites)"
          >
            Add Standard Cards
          </RcButton>
        </PanelHeader>

        <div className="flex flex-wrap items-end gap-4 px-[18px] py-3.5">
          <label className="flex flex-col gap-1.5">
            <span className="rc-field-label">Deck</span>
            <div className="flex flex-wrap items-center gap-2">
              <CustomSelect
                value={deckId || ""}
                onChange={(v) => {
                  if (v) loadDeck(v);
                  else clearEditor();
                }}
                disabled={loadingDecks}
                className="min-w-56"
                placeholder="— New Deck —"
                options={decks.map((d) => ({
                  value: d.id,
                  label: `${d.name} • ${d.format}`,
                }))}
              />
              <RcButton
                variant="outline"
                className="h-9"
                onClick={clearEditor}
                disabled={loadingDecks}
              >
                New
              </RcButton>
              {loadingDecks && <span className="rc-hint">loading…</span>}
            </div>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="rc-field-label">Name</span>
            <input
              value={deckName}
              onChange={(e) => setDeckName(e.target.value)}
              className="rc-input h-9"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="rc-field-label">Set</span>
            <CustomSelect
              value={setName}
              onChange={(v) => setSetName(v)}
              options={[
                { value: "Alpha", label: "Alpha" },
                { value: "Beta", label: "Beta" },
                { value: "Arthurian Legends", label: "Arthurian Legends" },
                { value: "Dragonlord", label: "Dragonlord" },
                { value: "Promotional", label: "Promotional" },
              ]}
            />
          </label>

          <div className="ml-auto flex flex-wrap items-center gap-4 font-rc-mono text-[10px] uppercase tracking-[0.18em]">
            <div
              className={
                validation.avatar ? "text-rc-success" : "text-rc-danger"
              }
            >
              Avatar{" "}
              <span className="rc-stat text-[13px]">{avatarCount} / 1</span>
            </div>
            <div
              className={
                validation.atlas ? "text-rc-success" : "text-rc-danger"
              }
            >
              Atlas{" "}
              <span className="rc-stat text-[13px]">
                {zoneCounts.Atlas} / 12+
              </span>
            </div>
            <div
              className={
                validation.spellbook ? "text-rc-success" : "text-rc-danger"
              }
            >
              Spellbook{" "}
              <span className="rc-stat text-[13px]">
                {spellbookNonAvatar} / 24+
              </span>
            </div>
          </div>
        </div>

        {isRestrictedMode && (
          <div className="px-[18px] pb-3.5">
            <div className="rc-alert" data-tone="warning">
              {deckFormat} Mode - Card pool is locked (cannot add/remove drafted
              cards, but can set avatar and add standard sites)
            </div>
          </div>
        )}
      </section>

      {/* Main two zones */}
      <div className="grid grid-cols-12 gap-4">
        {/* Deck zone */}
        <section
          className={
            "rc-panel col-span-12 min-h-64 lg:col-span-8 " +
            (isOverDeck ? "ring-1 ring-rc-accent-ring" : "")
          }
          onDragOver={(ev) => {
            preventDefault(ev);
            setIsOverDeck(true);
          }}
          onDragLeave={() => setIsOverDeck(false)}
          onDrop={handleDropOnDeck}
        >
          <PanelHeader
            title="Deck"
            meta={`Spellbook ${zoneCounts.Spellbook} · Atlas ${zoneCounts.Atlas}`}
          />

          {/* Avatar */}
          <div className="space-y-5 px-[18px] py-3.5">
            {!!avatars.length && (
              <div>
                <ZoneLabel>Avatar</ZoneLabel>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  {avatars.map(([key, it]) => (
                    <PickTile
                      key={key}
                      pickKey={key}
                      it={it}
                      isSite={false}
                      from="deck"
                      showQuantity={!isRestrictedMode}
                      moveLabel="→ Side"
                      onMove={moveOneToSideboard}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Spellbook */}
            {!!spellbookCards.length && (
              <div>
                <ZoneLabel>Spellbook</ZoneLabel>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  {spellbookCards.map(([key, it]) => (
                    <PickTile
                      key={key}
                      pickKey={key}
                      it={it}
                      isSite={false}
                      from="deck"
                      showQuantity={!isRestrictedMode}
                      moveLabel="→ Side"
                      onMove={moveOneToSideboard}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Atlas */}
            {!!atlasCards.length && (
              <div>
                <ZoneLabel>Atlas</ZoneLabel>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  {atlasCards.map(([key, it]) => (
                    <PickTile
                      key={key}
                      pickKey={key}
                      it={it}
                      isSite={true}
                      from="deck"
                      showQuantity
                      moveLabel="→ Side"
                      onMove={moveOneToSideboard}
                    />
                  ))}
                </div>
              </div>
            )}

            {!avatars.length &&
              !spellbookCards.length &&
              !atlasCards.length && (
                <RcEmpty title="No cards in this deck yet.">
                  drag cards here or use the search
                </RcEmpty>
              )}
          </div>
        </section>

        {/* Sideboard zone */}
        <section
          className={
            "rc-panel col-span-12 min-h-64 lg:col-span-4 " +
            (isOverSideboard ? "ring-1 ring-rc-accent-ring" : "")
          }
          onDragOver={(ev) => {
            preventDefault(ev);
            setIsOverSideboard(true);
          }}
          onDragLeave={() => setIsOverSideboard(false)}
          onDrop={handleDropOnSideboard}
        >
          <PanelHeader
            title="Sideboard"
            meta={`${zoneCounts.Sideboard} cards`}
          />
          <div className="px-[18px] py-3.5">
            {sideEntries.length === 0 ? (
              <RcEmpty title="Sideboard is empty.">
                drag cards here to set them aside
              </RcEmpty>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {sideEntries.map(([key, it]) => (
                  <PickTile
                    key={key}
                    pickKey={key}
                    it={it}
                    isSite={(it.type || "").toLowerCase().includes("site")}
                    from="sideboard"
                    showQuantity={!isRestrictedMode}
                    moveLabel="→ Deck"
                    onMove={moveOneFromSideboardToDeck}
                  />
                ))}
              </div>
            )}

            {/* Search within sideboard column for compactness */}
            {!isRestrictedMode && (
              <div className="mt-4 border-t border-rc-line/12 pt-3.5">
                <ZoneLabel>Search</ZoneLabel>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <input
                    type="search"
                    name="q"
                    autoComplete="off"
                    role="searchbox"
                    inputMode="search"
                    data-1p-ignore
                    data-lpignore="true"
                    data-bwignore="true"
                    data-dashlane-ignore="true"
                    data-np-ignore="true"
                    data-keeper-lock="true"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    className="rc-input h-9 w-48"
                    placeholder="Name contains..."
                  />
                  <CustomSelect
                    value={typeFilter}
                    onChange={(v) => setTypeFilter(v as SearchType)}
                    options={[
                      { value: "all", label: "All" },
                      { value: "avatar", label: "Avatar" },
                      { value: "site", label: "Sites" },
                      { value: "spell", label: "Spellbook" },
                    ]}
                  />
                  <RcButton
                    variant="outline"
                    className="h-9"
                    onClick={doSearch}
                    disabled={searching}
                  >
                    {searching ? "Searching..." : "Search"}
                  </RcButton>
                </div>
                {searching && (
                  <div className="rc-hint py-6 text-center">searching…</div>
                )}
                {!!results.length && (
                  <div className="grid grid-cols-2 gap-2">
                    {results.map((c) => {
                      const isSite = (c.type || "")
                        .toLowerCase()
                        .includes("site");
                      return (
                        <div
                          key={c.variantId}
                          className="rounded-rc-md border border-rc-line/12 bg-black/30 p-2"
                          draggable
                          onDragStart={onDragStartFromSearch(c)}
                        >
                          <CardThumb
                            slug={c.slug}
                            alt={c.cardName}
                            isSite={isSite}
                            className="mb-2 w-full"
                          />
                          <div className="line-clamp-1 font-rc-display text-[15px] leading-tight text-rc-fg-strong">
                            {c.cardName}
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1">
                            {c.type && <Badge>{c.type}</Badge>}
                            {c.rarity && <Badge tone="gold">{c.rarity}</Badge>}
                          </div>
                          <div className="mt-2 flex gap-1">
                            <RcButton
                              variant="outline"
                              size="sm"
                              onClick={() => addCardAuto(c)}
                            >
                              + Deck
                            </RcButton>
                            <RcButton
                              variant="ghost"
                              size="sm"
                              onClick={() => addToSideboardFromSearch(c)}
                            >
                              + Side
                            </RcButton>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
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
    </AppShell>
  );
}
