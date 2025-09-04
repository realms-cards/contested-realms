"use client";

import {
  useMemo,
  useRef,
  useState,
  useCallback,
  useEffect,
  Suspense,
} from "react";
import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import TextureCache from "@/lib/game/components/TextureCache";
import { SearchResult, SearchType, searchCards } from "@/lib/deckEditor/search";
import {
  Pick3D,
  CardMeta,
  computeStackPositions,
} from "@/lib/game/cardSorting";
import { TournamentControls, DeckValidation } from "@/components/deck-editor";
import DeckPanels from "@/app/decks/editor-3d/DeckPanels";
import DraggableCard3D from "@/app/decks/editor-3d/DraggableCard3D";
import useSealedTimer from "@/app/decks/editor-3d/hooks/useSealedTimer";
import useCardMeta from "@/app/decks/editor-3d/hooks/useCardMeta";

const RightPanel = dynamic(() => import("@/app/decks/editor-3d/RightPanel"), {
  ssr: false,
});
const BottomBar = dynamic(() => import("@/app/decks/editor-3d/BottomBar"), {
  ssr: false,
});

// Lazy load the Canvas/three stack to trim initial JS and avoid SSR
const EditorCanvas = dynamic(() => import("@/app/decks/editor-3d/EditorCanvas"), {
  ssr: false,
  // Keep simple to avoid heavy loaders on first paint
  loading: () => null,
});

// Stable constant for standard site names (tournament legal)
const STANDARD_SITE_NAMES = ["Spire", "Stream", "Valley", "Wasteland"] as const;

// --- Deck Editor data types (same as 2D editor) ---

type Zone = "Spellbook" | "Atlas" | "Sideboard";
// SearchType and SearchResult moved to '@/lib/deckEditor/search'

// Matches server shape from GET /api/decks/[id]
type ApiCardRef = {
  cardId: number;
  variantId?: number | null;
  name: string;
  type: string | null;
  slug?: string | null;
  thresholds?: Record<string, number> | null;
};

type DeckListItem = { id: string; name: string; format: string };

type StandardSiteName = (typeof STANDARD_SITE_NAMES)[number];

type PickKey = string; // `${cardId}:${zone}:${variantId??x}`

type PickItem = {
  cardId: number;
  variantId: number | null;
  name: string;
  type: string | null;
  slug: string | null;
  zone: Zone;
  count: number;
  set?: string; // Preserve set information for metadata fetching
};

// Using shared card types from '@/lib/game/cardSorting' (Pick3D, CardMeta)

// DraggableCard3D moved to its own module for clarity and bundle-splitting

function AuthenticatedDeckEditor() {
  const { status } = useSession();
  const searchParams = useSearchParams();

  // Deck editor state (same as 2D version)
  const [decks, setDecks] = useState<DeckListItem[]>([]);
  const [loadingDecks, setLoadingDecks] = useState(false);
  const [deckId, setDeckId] = useState<string | null>(null);
  const [deckName, setDeckName] = useState<string>("New Deck");
  const [setName, setSetName] = useState<string>("Beta");
  const [picks, setPicks] = useState<Record<PickKey, PickItem>>({});

  // Debug: Track picks changes
  useEffect(() => {
    const pickCount = Object.keys(picks).length;
    const totalCards = Object.values(picks).reduce(
      (sum, item) => sum + item.count,
      0
    );
    console.log(
      `Picks changed: ${pickCount} unique cards, ${totalCards} total cards`
    );
    if (pickCount === 0 && totalCards === 0) {
      console.trace("Picks were cleared - stack trace:");
    }
  }, [picks]);

  // Search state
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<SearchType>("all");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // Clear transient errors when auth status changes to authenticated
  useEffect(() => {
    if (status === "authenticated") setError(null);
  }, [status]);
  // Local set selector for search overlay (empty string means "All Sets")
  const [searchSetName, setSearchSetName] = useState<string>("");

  // Prefetched standard sites for tournament legal quick-add buttons
  const [stdSites, setStdSites] = useState<
    Record<StandardSiteName, SearchResult | null>
  >({
    Spire: null,
    Stream: null,
    Valley: null,
    Wasteland: null,
  });

  // Prefetch Spellslinger avatar
  const [spellslingerCard, setSpellslingerCard] = useState<SearchResult | null>(
    null
  );

  // (prefetch moved below after isDraftMode / isSealed declarations)

  // Exact same 3D state as draft-3d
  const [orbitLocked, setOrbitLocked] = useState(false);
  const [isSortingEnabled, setIsSortingEnabled] = useState(true);
  const [infoBoxVisible, setInfoBoxVisible] = useState(true);
  const [statsCollapsed, setStatsCollapsed] = useState(true);
  const [picksOpen, setPicksOpen] = useState(true);
  // Draft-completion mode flag (off by default)
  const [isDraftMode, setIsDraftMode] = useState(false);
  // Ensure we only initialize draft mode once per load
  const [draftInitDone, setDraftInitDone] = useState(false);

  // Sealed mode flag (similar to isDraftMode but for sealed deck construction)
  const [isSealed, setIsSealed] = useState(false);

  // Sealed mode state
  const [sealedConfig, setSealedConfig] = useState<{
    timeLimit: number; // minutes
    constructionStartTime: number; // timestamp
    packCount: number;
    setMix: string[];
    replaceAvatars: boolean;
  } | null>(null);

  const [packs, setPacks] = useState<
    Array<{
      id: string;
      set: string;
      cards: unknown[];
      opened: boolean;
    }>
  >([]);

  // Prefetch standard sites and Spellslinger for current set or all sets in sealed/draft
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Set-agnostic: always search across all sets for standard sites and Spellslinger
        const setParam = "";
        const siteEntries = await Promise.all(
          STANDARD_SITE_NAMES.map(async (name) => {
            const res = await fetch(
              `/api/cards/search?q=${encodeURIComponent(name)}${setParam}&type=site`
            );
            const data = (await res.json()) as SearchResult[];
            return [name, res.ok && data[0] ? data[0] : null] as const;
          })
        );

        let spells: SearchResult | null = null;
        try {
          const res = await fetch(
            `/api/cards/search?q=spellslinger&type=avatar`
          );
          const data = (await res.json()) as SearchResult[];
          spells = res.ok ? data[0] || null : null;
        } catch {
          spells = null;
        }

        if (!cancelled) {
          const next: Record<StandardSiteName, SearchResult | null> = {
            Spire: null,
            Stream: null,
            Valley: null,
            Wasteland: null,
          };
          for (const [k, v] of siteEntries) next[k as StandardSiteName] = v;
          setStdSites(next);
          setSpellslingerCard(spells);
        }
      } catch {
        if (!cancelled) {
          setStdSites({ Spire: null, Stream: null, Valley: null, Wasteland: null });
          setSpellslingerCard(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setName, isSealed, isDraftMode]);

  // Sealed timer managed via hook

  // Load list of decks after authentication (skip in draft/ sealed modes)
  useEffect(() => {
    if (status !== "authenticated") return;
    if (isDraftMode || isSealed) return;
    let mounted = true;
    (async () => {
      try {
        setLoadingDecks(true);
        const res = await fetch("/api/decks", { credentials: "include", cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Failed to load decks");
        if (mounted) setDecks(data as DeckListItem[]);
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (mounted) setLoadingDecks(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [status, isDraftMode, isSealed]);

  // Initialize sealed mode from URL parameters (only once)
  useEffect(() => {
    const sealed = searchParams.get("sealed");
    const matchId = searchParams.get("matchId");
    const timeLimit = searchParams.get("timeLimit");
    const constructionStartTime = searchParams.get("constructionStartTime");
    const replaceAvatars = searchParams.get("replaceAvatars") === "true";

    if (sealed === "true" && matchId && !isSealed) {
      console.log("Initializing sealed mode...");
      const config = {
        timeLimit: parseInt(timeLimit || "40"),
        constructionStartTime: parseInt(
          constructionStartTime || Date.now().toString()
        ),
        packCount: parseInt(searchParams.get("packCount") || "6"),
        setMix: searchParams.get("setMix")
          ? (searchParams.get("setMix") || "").split(",")
          : ["Beta"],
        replaceAvatars,
      };

      setSealedConfig(config);
      setIsSealed(true);
      setDeckName("Deck Editor");

      // Generate packs for sealed construction (inline to avoid TDZ on generateSealedPacks)
      const { packCount, setMix } = config;
      const generatedPacks = [] as typeof packs;
      for (let i = 0; i < packCount; i++) {
        const randomSet = setMix[Math.floor(Math.random() * setMix.length)];
        generatedPacks.push({
          id: `pack_${i}`,
          set: randomSet,
          cards: [],
          opened: false,
        });
      }
      setPacks(generatedPacks);
    }
  }, [searchParams, isSealed]); // Only initialize if not already sealed

  // Initialize draft completion mode from URL and localStorage
  useEffect(() => {
    const draft = searchParams.get("draft");
    const matchId = searchParams.get("matchId");
    if (draft !== "true" || !matchId) return;
    if (draftInitDone) return;

    setIsDraftMode(true);

    let raw: string | null = null;
    try {
      raw = localStorage.getItem(`draftedCards_${matchId}`);
    } catch (e) {
      console.warn("Failed to read drafted cards from localStorage:", e);
    }

    if (!raw) {
      setError("No drafted cards found for this match.");
      setDraftInitDone(true);
      return;
    }

    type DraftCardLike = {
      id?: string | number;
      name?: string;
      cardName?: string;
      slug?: string;
      type?: string | null;
      setName?: string;
      [k: string]: unknown;
    };

    let drafted: DraftCardLike[] = [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) drafted = parsed as DraftCardLike[];
    } catch (e) {
      console.error("Failed to parse drafted cards: ", e);
      setError("Failed to parse drafted cards.");
      setDraftInitDone(true);
      return;
    }

    if (!Array.isArray(drafted) || drafted.length === 0) {
      setDraftInitDone(true);
      return;
    }

    (async () => {
      try {
        // Resolve each drafted card to a concrete SearchResult via slug first, fallback to name
        const resolved: SearchResult[] = [];
        for (const c of drafted) {
          const slug = (c.slug || "").toString().trim();
          const name = (c.name || c.cardName || "").toString().trim();
          const cardSetName = (c.setName || "").toString().trim() || setName; // Use card's set or fallback to current setName

          let hit: SearchResult | null = null;
          if (slug) {
            try {
              const list = await searchCards({
                q: slug,
                setName: cardSetName,
                type: "all",
              });
              hit = list[0] || null;
            } catch {}
          }
          if (!hit && name) {
            try {
              const list = await searchCards({
                q: name,
                setName: cardSetName,
                type: "all",
              });
              hit = list[0] || null;
            } catch {}
          }
          if (hit) resolved.push(hit);
        }

        if (resolved.length === 0) {
          setError("Could not resolve drafted cards to known card data.");
          setDraftInitDone(true);
          return;
        }

        // Batch update picks to include all drafted cards in sideboard (not deck)
        setPicks((prev) => {
          const next = { ...prev } as Record<PickKey, PickItem>;
          for (const r of resolved) {
            // All draft picks should start in sideboard, not directly in deck zones
            const zone: Zone = "Sideboard";
            const key = `${r.cardId}:${zone}:${r.variantId ?? "x"}` as PickKey;
            const exists = next[key];
            next[key] = exists
              ? { ...exists, count: exists.count + 1 }
              : {
                  cardId: r.cardId,
                  variantId: r.variantId ?? null,
                  name: r.cardName,
                  type: r.type,
                  slug: r.slug,
                  zone,
                  count: 1,
                  set: r.set,
                };
          }
          return next;
        });

        // Infer deck set from majority of resolved hits for better metadata/search defaults
        const counts = new Map<string, number>();
        for (const r of resolved)
          counts.set(r.set, (counts.get(r.set) || 0) + 1);
        if (counts.size) {
          let best = setName;
          let bestN = -1;
          for (const [name, n] of counts.entries()) {
            if (n > bestN) {
              best = name;
              bestN = n;
            }
          }
          setSetName(best);
        }

        // Name the deck for clarity in draft completion flow
        if (!deckName || deckName === "New Deck") setDeckName("Draft Deck");
      } catch (e) {
        console.error("Draft initialization failed:", e);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setDraftInitDone(true);
      }
    })();
  }, [searchParams, draftInitDone, setPicks, setSetName, deckName, setName]);

  // Tab state for cards view - default to "Your Deck"
  const [cardsTab, setCardsTab] = useState<"deck" | "all">("deck");

  // Feedback message system
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  // Tournament legal controls visibility
  const [tournamentControlsVisible, setTournamentControlsVisible] =
    useState(false);

  // Context menu for duplicate card selection
  const [contextMenu, setContextMenu] = useState<{
    cardId: number;
    cardName: string;
    x: number;
    y: number;
    deckCards: Pick3D[];
    sideboardCards: Pick3D[];
  } | null>(null);

  const [metaByCardId, setMetaByCardId] = useState<Record<number, CardMeta>>({});

  // Convert picks to Pick3D format (exact same structure as draft-3d)
  const [pick3D, setPick3D] = useState<Pick3D[]>([]);
  const [, setNextPickId] = useState(1);

  // Open duplicate-move context menu for a given card at screen coords
  const openContextMenuForCard = useCallback(
    (cardId: number, cardName: string, clientX: number, clientY: number) => {
      const deckCards = pick3D.filter(
        (p) => p.card.cardId === cardId && p.z < 0
      );
      const sideboardCards = pick3D.filter(
        (p) => p.card.cardId === cardId && p.z >= 0
      );
      // Only open context menu if there are copies of this card in BOTH zones
      if (deckCards.length > 0 && sideboardCards.length > 0) {
        setContextMenu({
          cardId,
          cardName,
          x: clientX,
          y: clientY,
          deckCards,
          sideboardCards,
        });
      }
    },
    [pick3D]
  );

  // Hover preview (exact same as draft-3d)
  const [hoverPreview, setHoverPreview] = useState<{
    slug: string;
    name: string;
    type: string | null;
  } | null>(null);

  // (Removed unused deckItems/deckCards/sideboardCards memos)

  // Derived summaries for HUD panels
  const picksByType = useMemo(() => {
    const res = {
      deck: 0,
      sideboard: 0,
      creatures: 0,
      spells: 0,
      sites: 0,
      avatars: 0,
    };
    for (const p of pick3D) {
      if (p.z < 0) res.deck += 1;
      else res.sideboard += 1;
      const t = (p.card.type || "").toLowerCase();
      if (t.includes("avatar")) res.avatars += 1;
      else if (t.includes("site")) res.sites += 1;
      else if (t.includes("creature") || t.includes("minion"))
        res.creatures += 1;
      else if (t.includes("spell")) res.spells += 1;
    }
    return res;
  }, [pick3D]);

  const yourCounts = useMemo(() => {
    const m = new Map<
      number,
      { cardId: number; name: string; count: number }
    >();
    Object.values(picks).forEach((it) => {
      const cur = m.get(it.cardId) || {
        cardId: it.cardId,
        name: it.name,
        count: 0,
      };
      cur.count += it.count;
      m.set(it.cardId, cur);
    });
    return Array.from(m.values());
  }, [picks]);

  const manaCurve = useMemo(() => {
    const curve: Record<number, number> = {};
    for (const p of pick3D) {
      if (p.z >= 0) continue; // deck zone only
      const meta = metaByCardId[p.card.cardId];
      const c = meta?.cost;
      if (typeof c === "number") {
        // Bucket costs into 0..7, where 7 represents 7+
        const k = Math.max(0, Math.min(7, Math.floor(c)));
        curve[k] = (curve[k] || 0) + 1;
      }
    }
    return curve;
  }, [pick3D, metaByCardId]);

  const thresholdSummary = useMemo(() => {
    const summary: Record<string, number> = {};
    const elements = new Set<string>();
    for (const p of pick3D) {
      if (p.z >= 0) continue; // deck zone only
      const th = metaByCardId[p.card.cardId]?.thresholds as
        | Record<string, number>
        | undefined
        | null;
      if (!th) continue;
      for (const k of Object.keys(th)) {
        elements.add(k);
        summary[k] = (summary[k] || 0) + (th[k] || 0);
      }
    }
    return { elements: Array.from(elements), summary };
  }, [pick3D, metaByCardId]);

  // Basic add-card helpers for the search UI
  const addCardAuto = useCallback(
    (r: SearchResult) => {
      const isSite = (r.type || "").toLowerCase().includes("site");
      const zone: Zone = isSite ? "Atlas" : "Spellbook";
      const key = `${r.cardId}:${zone}:${r.variantId ?? "x"}` as PickKey;

      console.log(
        `Adding card: ${r.cardName} (${r.cardId}), key: ${key}, variantId: ${r.variantId}`
      );

      setPicks((prev) => {
        const exists = prev[key];
        const next: PickItem = exists
          ? { ...exists, count: exists.count + 1 }
          : {
              cardId: r.cardId,
              variantId: r.variantId ?? null,
              name: r.cardName,
              type: r.type,
              slug: r.slug,
              zone,
              count: 1,
              set: r.set, // Preserve set information for metadata fetching
            };

        console.log(
          `Card ${r.cardName}: ${
            exists ? "incremented to" : "added with"
          } count ${next.count}`
        );
        console.log(
          `Total picks after adding:`,
          Object.keys({ ...prev, [key]: next }).length
        );

        return { ...prev, [key]: next };
      });
    },
    [setPicks]
  );

  const addToSideboardFromSearch = useCallback(
    (r: SearchResult) => {
      const zone: Zone = "Sideboard";
      const key = `${r.cardId}:${zone}:${r.variantId ?? "x"}` as PickKey;
      setPicks((prev) => {
        const exists = prev[key];
        const next: PickItem = exists
          ? { ...exists, count: exists.count + 1 }
          : {
              cardId: r.cardId,
              variantId: r.variantId ?? null,
              name: r.cardName,
              type: r.type,
              slug: r.slug,
              zone,
              count: 1,
              set: r.set, // Preserve set information for metadata fetching
            };
        return { ...prev, [key]: next };
      });
    },
    [setPicks]
  );

  // Minimal deck actions
  const saveDeck = useCallback(async () => {
    if (status !== "authenticated") {
      setError("You must be signed in to save decks.");
      return;
    }
    try {
      setSaving(true);
      setError(null);
      setSaveMsg(null);

      // Local validation derived from current 3D layout
      let avatar = 0;
      let atlas = 0;
      let spellbookNonAvatar = 0;
      for (const p of pick3D) {
        if (p.z >= 0) continue; // only deck zone
        const t = (p.card.type || "").toLowerCase();
        if (t.includes("avatar")) avatar += 1;
        else if (t.includes("site")) atlas += 1;
        else spellbookNonAvatar += 1;
      }
      if (!(avatar === 1 && atlas >= 12 && spellbookNonAvatar >= 24)) {
        throw new Error(
          "Deck invalid. Require: 1 Avatar, Atlas >= 12, Spellbook >= 24 (excl. Avatar)"
        );
      }

      // Build cards payload from 3D picks so zones reflect current board state
      // z < 0 => Deck zone (Atlas if Site, else Spellbook); z >= 0 => Sideboard
      const agg = new Map<
        string,
        { cardId: number; zone: Zone; count: number; variantId?: number }
      >();
      for (const p of pick3D) {
        const inDeck = p.z < 0;
        const t = (p.card.type || "").toLowerCase();
        const zone: Zone = inDeck
          ? t.includes("site")
            ? "Atlas"
            : "Spellbook"
          : "Sideboard";
        const variantId = p.card.variantId || undefined; // treat 0/undefined as absent
        const key = `${p.card.cardId}:${zone}:${variantId ?? "x"}`;
        const prev = agg.get(key);
        if (prev) prev.count += 1;
        else agg.set(key, { cardId: p.card.cardId, zone, count: 1, variantId });
      }
      const cards = Array.from(agg.values());

      if (deckId) {
        const res = await fetch(`/api/decks/${deckId}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          credentials: "include",
          cache: "no-store",
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
        // Generate clean filename for sealed mode
        const finalDeckName = isSealed
          ? `Sealed Deck ${new Date().toLocaleDateString()}`
          : deckName || "New Deck";

        const res = await fetch("/api/decks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          cache: "no-store",
          body: JSON.stringify({
            name: finalDeckName,
            format: isDraftMode || isSealed ? "Sealed" : "Constructed",
            set: setName,
            cards,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Failed to save deck");
        setDeckId(data.id);
        setDeckName(data.name); // Use the name returned by the server
        setSaveMsg(`Saved deck ${data.name} (id: ${data.id})`);
        // Refresh deck list
        try {
          const res2 = await fetch("/api/decks", { credentials: "include", cache: "no-store" });
          const list = await res2.json();
          if (res2.ok) setDecks(list as DeckListItem[]);
        } catch {}
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
      // auto-clear success message after a short delay
      setTimeout(() => setSaveMsg(null), 1500);
    }
  }, [pick3D, deckId, deckName, isDraftMode, setName, isSealed, status]);

  // Submit sealed deck to match server
  const submitSealedDeck = useCallback(async () => {
    if (!isSealed || !searchParams.get("matchId")) return;

    try {
      setSaving(true);
      setError(null);
      setSaveMsg(null);

      // Validate minimum deck requirements for sealed
      // Require: 1 Avatar, Atlas >= 12, Spellbook >= 24 (excluding Avatar)
      let avatar = 0;
      let atlas = 0;
      let spellbookNonAvatar = 0;
      for (const p of pick3D) {
        if (p.z >= 0) continue; // only deck zone
        const t = (p.card.type || "").toLowerCase();
        if (t.includes("avatar")) avatar += 1;
        else if (t.includes("site")) atlas += 1;
        else spellbookNonAvatar += 1;
      }

      // Debug: log the actual counts
      console.log("[Sealed Validation]", {
        avatar,
        atlas,
        spellbookNonAvatar,
        totalDeckCards: avatar + atlas + spellbookNonAvatar,
        deckZoneCards: pick3D.filter((p) => p.z < 0).length,
      });

      if (!(avatar === 1 && atlas >= 12 && spellbookNonAvatar >= 24)) {
        throw new Error(
          `Deck invalid. Current: ${avatar} Avatar, ${atlas} Atlas, ${spellbookNonAvatar} Spellbook. Required: 1 Avatar, Atlas >= 12, Spellbook >= 24 (excl. Avatar & Sites)`
        );
      }

      // Convert 3D picks to simple card array for sealed submission
      const deckCards = pick3D
        .filter((p) => p.z < 0) // only deck zone
        .map((p) => ({
          id: p.card.cardId.toString(),
          cardId: p.card.cardId,
          name: p.card.cardName || `Card ${p.card.cardId}`,
          type: p.card.type,
          slug: p.card.slug,
          set: p.card.setName || setName,
          cost: metaByCardId[p.card.cardId]?.cost ?? 0,
          rarity: p.card.rarity || "Common",
        }));

      // Auto-save the deck with sealed naming format
      const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD format
      const sealedDeckName = `sealed_opponent_${today}`;
      setDeckName(sealedDeckName);
      await saveDeck();

      // Mark deck as submitted to prevent redirect loop
      const matchId = searchParams.get("matchId");
      if (matchId) {
        localStorage.setItem(`sealed_submitted_${matchId}`, "true");
      }

      // Submit to match server using postMessage to parent window (online match page)
      if (window.opener) {
        window.opener.postMessage(
          {
            type: "sealedDeckSubmission",
            deck: deckCards,
            matchId: matchId,
          },
          window.location.origin
        );
      } else {
        // Fallback: save to localStorage for the match page to pick up
        localStorage.setItem(
          `sealedDeck_${matchId}`,
          JSON.stringify(deckCards)
        );
      }

      setSaveMsg("Sealed deck submitted successfully!");

      // Redirect back to match after short delay
      setTimeout(() => {
        window.location.href = `/online/play/${matchId}`;
      }, 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [isSealed, pick3D, searchParams, saveDeck, setName, metaByCardId]);

  const submitDraftDeck = useCallback(async () => {
    if (!isDraftMode) return;
    setSaving(true);
    setError(null);

    try {
      // Build deck from picked cards on the board (only deck zone, same as sealed)
      const deckCards: Array<{
        id: string;
        cardId: number;
        name: string;
        type: string | null;
        slug: string;
        set: string;
        cost: number;
        rarity: string;
      }> = pick3D
        .filter((p) => p.z < 0) // only deck zone
        .map((p) => ({
          id: p.card.cardId.toString(),
          cardId: p.card.cardId,
          name: p.card.cardName || `Card ${p.card.cardId}`,
          type: p.card.type,
          slug: p.card.slug,
          set: p.card.setName || setName,
          cost: metaByCardId[p.card.cardId]?.cost ?? 0,
          rarity: p.card.rarity || "Common",
        }));

      // Auto-save the deck with draft naming format
      const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD format
      const draftDeckName = `draft_${today}`;
      setDeckName(draftDeckName);
      await saveDeck();

      // Mark deck as submitted to prevent redirect loop
      const matchId = searchParams.get("matchId");
      if (matchId) {
        localStorage.setItem(`draft_submitted_${matchId}`, "true");
      }

      // Submit to match server using postMessage to parent window (same as sealed)
      if (window.opener) {
        window.opener.postMessage(
          {
            type: "draftDeckSubmission",
            deck: deckCards,
            matchId: matchId,
          },
          window.location.origin
        );
      } else {
        // Fallback: save to localStorage for the match page to pick up
        localStorage.setItem(
          `draftDeck_${matchId}`,
          JSON.stringify(deckCards)
        );
      }

      setSaveMsg("Draft deck submitted successfully!");

      // Redirect back to match after short delay
      setTimeout(() => {
        if (matchId) {
          window.location.href = `/online/play/${matchId}`;
        }
      }, 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [isDraftMode, pick3D, searchParams, saveDeck, setName, metaByCardId]);

  const loadDeck = useCallback(
    async (id: string) => {
      if (status !== "authenticated") return;
      setDeckId(id);
      try {
        const res = await fetch(`/api/decks/${id}`, { credentials: "include", cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Failed to load deck");

        // Populate deck name
        if (typeof data?.name === "string") setDeckName(data.name);

        // Build picks from zones
        const next: Record<PickKey, PickItem> = {};
        const addZone = (zone: Zone, arr: ApiCardRef[] | undefined) => {
          if (!arr || !Array.isArray(arr)) return;
          for (const c of arr) {
            const key: PickKey = `${c.cardId}:${zone}:${c.variantId ?? "x"}`;
            const exists = next[key];
            next[key] = exists
              ? { ...exists, count: exists.count + 1 }
              : {
                  cardId: c.cardId,
                  variantId: c.variantId ?? null,
                  name: c.name,
                  type: c.type ?? null,
                  slug: c.slug ?? null,
                  zone,
                  count: 1,
                };
          }
        };
        addZone("Atlas", data?.atlas as ApiCardRef[]);
        addZone("Spellbook", data?.spellbook as ApiCardRef[]);
        addZone("Sideboard", data?.sideboard as ApiCardRef[]);
        setPicks(next);

        // Optional: prime metaByCardId with thresholds for sorting/grouping
        const meta: Record<number, CardMeta> = {};
        const all: ApiCardRef[] = [
          ...(Array.isArray(data?.atlas) ? (data.atlas as ApiCardRef[]) : []),
          ...(Array.isArray(data?.spellbook)
            ? (data.spellbook as ApiCardRef[])
            : []),
          ...(Array.isArray(data?.sideboard)
            ? (data.sideboard as ApiCardRef[])
            : []),
        ];
        for (const c of all) {
          if (c.thresholds && meta[c.cardId] == null) {
            meta[c.cardId] = {
              cardId: c.cardId,
              cost: null,
              attack: null,
              defence: null,
              thresholds: c.thresholds,
            };
          }
        }
        setMetaByCardId(meta);

        // Infer deck set from card slug prefixes (alp/bet/art/dra/drl) and update set state
        // Only apply in constructed mode; sealed remains multi-set via pack sets
        if (!isSealed) {
          const counts = new Map<string, number>();
          const codeToSet = (code: string): string | null => {
            if (code === "alp") return "Alpha";
            if (code === "bet") return "Beta";
            if (code === "art") return "Arthurian Legends";
            if (code === "dra") return "Dragonlord";
            if (code === "drl") return "Dragonlord";
            return null;
          };
          for (const c of all) {
            const slug = (c.slug || "").toLowerCase();
            if (/^[a-z]{3}_/.test(slug)) {
              const code = slug.slice(0, 3);
              const name = codeToSet(code);
              if (name) counts.set(name, (counts.get(name) || 0) + 1);
            }
          }
          if (counts.size) {
            let best = setName;
            let bestN = -1;
            for (const [name, n] of counts.entries()) {
              if (n > bestN) {
                best = name;
                bestN = n;
              }
            }
            setSetName(best);
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [isSealed, setName, status]
  );

  const clearEditor = useCallback(() => {
    setDeckId(null);
    setDeckName("New Deck");
    setPicks({});
    setPick3D([]);
    setMetaByCardId({});
    setResults([]);
  }, []);

  // Add Spellslinger as tournament avatar (just add the prefetched card normally)
  const addSpellslinger = useCallback(() => {
    (async () => {
      if (spellslingerCard) {
        addCardAuto(spellslingerCard);
        return;
      }
      // Fallback: try global search (no set constraint) for sealed/draft
      try {
        const res = await fetch(`/api/cards/search?q=spellslinger&type=avatar`);
        const data = (await res.json()) as SearchResult[];
        const hit = res.ok ? data[0] || null : null;
        if (hit) addCardAuto(hit);
        else setError("Spellslinger not found");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [spellslingerCard, addCardAuto]);

  // Quick-add a specific standard site by name
  const addStandardSiteByName = useCallback(
    async (name: StandardSiteName) => {
      const hit = stdSites[name];
      if (hit) {
        addCardAuto(hit);
        return;
      }
      try {
        // Set-agnostic lookup: always query across all sets
        const res = await fetch(
          `/api/cards/search?q=${encodeURIComponent(name)}&type=site`
        );
        const data = (await res.json()) as SearchResult[];
        const r = res.ok && data[0] ? data[0] : null;
        if (r) addCardAuto(r);
        else setError(`Site ${name} not found`);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [stdSites, addCardAuto]
  );

  // Sealed mode pack functions

  const openPack = useCallback(
    async (packId: string) => {
      const pack = packs.find((p) => p.id === packId);
      if (!pack || pack.opened) return;

      try {
        console.log(`Opening pack: ${packId}, set: ${pack.set}`);

        // Generate a real booster pack from the API (same as draft-3d)
        const avatarParam = sealedConfig?.replaceAvatars
          ? "&replaceAvatars=true"
          : "";
        const res = await fetch(
          `/api/booster?set=${encodeURIComponent(
            pack.set
          )}&count=1${avatarParam}`
        );
        const data = await res.json();

        console.log("Booster API response:", { status: res.status, data });

        if (!res.ok) {
          throw new Error(
            data?.error ||
              `Failed to generate ${pack.set} pack (status: ${res.status})`
          );
        }

        const boosterCards = data.packs?.[0] || [];
        if (!Array.isArray(boosterCards)) {
          throw new Error("Invalid pack data received from server");
        }

        // Convert booster cards to SearchResult format and add to sideboard (sealed mode)
        for (const boosterCard of boosterCards) {
          const searchCard: SearchResult = {
            variantId: boosterCard.variantId,
            slug: boosterCard.slug || "",
            finish: boosterCard.finish || "Standard",
            product: boosterCard.product || "",
            cardId: boosterCard.cardId,
            cardName: boosterCard.cardName || `Card ${boosterCard.cardId}`,
            set: pack.set, // This is the set the pack came from
            type: boosterCard.type || "Unknown",
            rarity: boosterCard.rarity || null,
          };
          console.log(
            `Adding card from ${pack.set} pack:`,
            searchCard.cardName,
            `(${searchCard.cardId})`
          );
          // In sealed mode, all pack cards go to sideboard first
          addToSideboardFromSearch(searchCard);
        }

        // Mark pack as opened
        setPacks((prev) =>
          prev.map((p) =>
            p.id === packId ? { ...p, opened: true, cards: boosterCards } : p
          )
        );

        console.log(
          `Successfully opened pack with ${boosterCards.length} cards`
        );
      } catch (e) {
        console.error("Pack opening error:", e);
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [packs, addToSideboardFromSearch, sealedConfig?.replaceAvatars]
  );

  // Removed auto-save sealed deck function - use manual save only

  // Auto-save disabled for sealed mode - use manual save only
  // useEffect(() => {
  //   if (!isSealed || pick3D.length === 0) return;
  //
  //   const timeoutId = setTimeout(() => {
  //     autoSaveSealedDeck();
  //   }, 2000); // 2 second debounce
  //
  //   return () => clearTimeout(timeoutId);
  // }, [isSealed, pick3D, autoSaveSealedDeck]);

  // Initialize sealed mode (exported for future use)
  // const initSealedMode = useCallback((config: {
  //   timeLimit: number;
  //   packCount: number;
  //   setMix: string[];
  // }) => {
  //   const sealedConfig = {
  //     ...config,
  //     constructionStartTime: Date.now(),
  //   };
  //
  //   setSealedConfig(sealedConfig);
  //   setIsSealed(true);
  //   generateSealedPacks(sealedConfig);
  // }, [generateSealedPacks]);

  // Keep track of card render orders for proper layering
  const nextRenderOrder = useRef(1500);
  const getTopRenderOrder = useCallback(() => {
    // When sorting is enabled, use much higher temporary render order for dragging
    // This ensures dragged cards appear above stacks during interaction
    if (isSortingEnabled) {
      return 9999; // High temporary order for dragging
    }
    nextRenderOrder.current += 1;
    return nextRenderOrder.current;
  }, [isSortingEnabled]);

  // Reset render orders when sorting is toggled to ensure proper stacking
  useEffect(() => {
    if (isSortingEnabled) {
      nextRenderOrder.current = 1500; // Reset base render order
    }
  }, [isSortingEnabled]); // Only reset when sorting is toggled, not when cards change

  // Create sorted stack positions using the shared utility
  const stackPositions = useMemo(() => {
    return computeStackPositions(pick3D, metaByCardId, isSortingEnabled);
  }, [pick3D, isSortingEnabled, metaByCardId]);

  // Button handler to re-trigger sorting computation
  const forceSorting = useCallback(() => {
    setPick3D((prev) => [...prev]);
  }, []);

  // Convert deck picks to Pick3D format - preserve existing positions when possible
  const positionsRef = useRef<Map<string, { z: number; x: number }>>(new Map());
  const zoneCountsRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const newPick3D: Pick3D[] = [];
    let id = 1;

    // 1) Compute total counts per card and initial deck-target based on picks
    const totalByCard = new Map<number, number>();
    const initialDeckByCard = new Map<number, number>();
    for (const item of Object.values(picks)) {
      const current = totalByCard.get(item.cardId) || 0;
      totalByCard.set(item.cardId, current + item.count);
      if (item.zone !== "Sideboard") {
        const curDeck = initialDeckByCard.get(item.cardId) || 0;
        initialDeckByCard.set(item.cardId, curDeck + item.count);
      }
    }

    // 2) Determine target deck counts per card from the current pick zones
    const remainingDeckByCard = new Map<number, number>();
    for (const [cardId, total] of totalByCard.entries()) {
      const initialDeck = initialDeckByCard.get(cardId) || 0;
      const deckTarget = Math.min(initialDeck, total);
      remainingDeckByCard.set(cardId, deckTarget);
    }

    // 3) Emit copies in the computed zones, preserving per-zone positions
    for (const item of Object.values(picks)) {
      for (let i = 0; i < item.count; i++) {
        const rem = remainingDeckByCard.get(item.cardId) || 0;
        const zoneKey = rem > 0 ? "Deck" : "Sideboard";
        if (rem > 0) remainingDeckByCard.set(item.cardId, rem - 1);

        // Use existing position if available (sealed only) and per-zone cached positions
        const existingPos = positionsRef.current.get(
          `${item.cardId}:${zoneKey}`
        );
        const shouldPreservePosition = !!existingPos && isSealed;

        const x = shouldPreservePosition
          ? existingPos.x
          : -3 + Math.random() * 6;
        const z = shouldPreservePosition
          ? existingPos.z
          : zoneKey === "Deck"
          ? -2 + Math.random() * 1.8 // Deck zone: z from -2 to -0.2
          : 0.5 + Math.random() * 3; // Sideboard zone: z from 0.5 to 3.5

        newPick3D.push({
          id: id++,
          card: {
            variantId: item.variantId || 0,
            slug: item.slug || "",
            finish: "Standard",
            product: "",
            rarity: "Ordinary",
            type: item.type,
            cardId: item.cardId,
            cardName: item.name,
            setName: item.set, // Preserve set information for metadata fetching
          },
          x,
          z,
        });
      }
    }

    setPick3D(newPick3D);
    setNextPickId(id);
  }, [picks, isSealed]);

  // Update position cache whenever pick3D changes
  useEffect(() => {
    const newPositions = new Map<string, { z: number; x: number }>();
    const newZoneCounts = new Map<string, number>();
    for (const pick of pick3D) {
      const cardId = pick.card.cardId;
      const zoneKey = pick.z < 0 ? "Deck" : "Sideboard";
      const key = `${cardId}:${zoneKey}`;
      if (!newPositions.has(key)) {
        newPositions.set(key, { z: pick.z, x: pick.x });
      }
      newZoneCounts.set(key, (newZoneCounts.get(key) || 0) + 1);
    }
    positionsRef.current = newPositions;
    zoneCountsRef.current = newZoneCounts;
  }, [pick3D]);

  // Quick lookup for card slug/type by cardId (for right panel thumbnails)
  const pickInfoById = useMemo(() => {
    const map: Record<number, { slug: string | null; type: string | null; name: string }> = {};
    for (const it of Object.values(picks)) {
      map[it.cardId] = { slug: it.slug, type: it.type, name: it.name };
    }
    return map;
  }, [picks]);

  // Sealed timer via hook
  const { timeRemaining, formatTime: formatTimeSealed } = useSealedTimer(
    isSealed,
    sealedConfig && {
      timeLimit: sealedConfig.timeLimit,
      constructionStartTime: sealedConfig.constructionStartTime,
    }
  );

  // Metadata via hook; keep state for any manual priming, then sync on change
  const fetchedMeta = useCardMeta(yourCounts, pick3D);
  useEffect(() => {
    setMetaByCardId(fetchedMeta);
  }, [fetchedMeta]);

  // (metadata loading moved to useCardMeta hook)

  // (sealed timer moved to useSealedTimer hook above)

  async function doSearch() {
    try {
      setSearching(true);
      setError(null);
      const list = await searchCards({
        q,
        setName: searchSetName,
        type: typeFilter,
      });
      setResults(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  const avatarCount = useMemo(() => {
    let n = 0;
    for (const pick of pick3D) {
      // Only count cards in deck zone (z < 0)
      if (pick.z >= 0) continue;
      const t = (pick.card.type || "").toLowerCase();
      if (t.includes("avatar")) n += 1;
    }
    return n;
  }, [pick3D]);

  const spellbookNonAvatar = useMemo(() => {
    let n = 0;
    for (const pick of pick3D) {
      // Only count non-avatar, non-site cards in deck zone (z < 0)
      if (pick.z >= 0) continue;
      const t = (pick.card.type || "").toLowerCase();
      if (!t.includes("avatar") && !t.includes("site")) n += 1;
    }
    return n;
  }, [pick3D]);

  // Count sites in deck zone for Atlas validation
  const atlasCount = useMemo(() => {
    let n = 0;
    for (const pick of pick3D) {
      // Only count sites in deck zone (z < 0)
      if (pick.z >= 0) continue;
      const t = (pick.card.type || "").toLowerCase();
      if (t.includes("site")) n += 1;
    }
    return n;
  }, [pick3D]);

  const validation = useMemo(() => {
    return {
      avatar: avatarCount === 1,
      atlas: atlasCount >= 12,
      spellbook: spellbookNonAvatar >= 24,
    };
  }, [avatarCount, atlasCount, spellbookNonAvatar]);

  // (Removed unused canModifyCard callback)

  // Close context menu when clicking elsewhere
  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [contextMenu]);

  // Helper to check if a card is a standard site (tournament legal)
  const isStandardSite = useCallback((cardName: string) => {
    return STANDARD_SITE_NAMES.some((siteName) =>
      cardName.toLowerCase().includes(siteName.toLowerCase())
    );
  }, []);

  // Convenience helpers to move any one copy by cardId between zones
  const moveOneToSideboard = useCallback(
    (cardId: number) => {
      setPick3D((prev) => {
        const updated = [...prev];
        const idx = updated.findIndex(
          (p) => p.card.cardId === cardId && p.z < 0
        );
        if (idx === -1) return prev;

        const card = updated[idx];
        // Special behavior for standard sites: remove them instead of moving to sideboard
        if (isStandardSite(card.card.cardName)) {
          // Remove the card entirely
          updated.splice(idx, 1);
          return updated;
        }

        // Normal behavior: move to sideboard
        const newZ = 1.5 + Math.random() * 0.5;
        const newX = 0.5 + Math.random() * 3;
        updated[idx] = { ...updated[idx], x: newX, z: newZ, y: undefined };
        return updated;
      });
    },
    [isStandardSite]
  );

  const moveOneFromSideboardToDeck = useCallback((cardId: number) => {
    setPick3D((prev) => {
      const updated = [...prev];
      const idx = updated.findIndex(
        (p) => p.card.cardId === cardId && p.z >= 0
      );
      if (idx === -1) return prev;
      const newZ = -1.5 - Math.random() * 0.5;
      const newX = -2 + Math.random() * 4;
      updated[idx] = { ...updated[idx], x: newX, z: newZ, y: undefined };
      return updated;
    });
  }, []);

  // Helper function to move specific card by its unique ID
  const moveSpecificCardToSideboard = useCallback(
    (pickId: number) => {
      setPick3D((prev) => {
        const updated = [...prev];
        const cardIndex = updated.findIndex((p) => p.id === pickId);

        if (cardIndex === -1) return prev;

        const card = updated[cardIndex];
        // Special behavior for standard sites: remove them instead of moving to sideboard
        if (isStandardSite(card.card.cardName)) {
          // Remove the card entirely
          updated.splice(cardIndex, 1);
          return updated;
        }

        // Normal behavior: move to sideboard
        const newZ = 1.5 + Math.random() * 0.5;
        const newX = 0.5 + Math.random() * 3;

        updated[cardIndex] = {
          ...updated[cardIndex],
          x: newX,
          z: newZ,
          y: undefined,
        };

        return updated;
      });
    },
    [isStandardSite]
  );

  const moveSpecificCardToDeck = useCallback((pickId: number) => {
    setPick3D((prev) => {
      const updated = [...prev];
      const cardIndex = updated.findIndex((p) => p.id === pickId);

      if (cardIndex === -1) return prev;

      const newZ = -1.5 - Math.random() * 0.5;
      const newX = -2 + Math.random() * 4;

      updated[cardIndex] = {
        ...updated[cardIndex],
        x: newX,
        z: newZ,
        y: undefined,
      };

      return updated;
    });
  }, []);

  return (
    <div className="fixed inset-0 w-screen h-screen">
      {/* 3D Game View as the stage - EXACT same as draft-3d */}
      <div className="absolute inset-0 w-full h-full">
        <EditorCanvas>
          {/* 3D Cards with proper stacking order */}
          <group>
              {pick3D
                .sort((a, b) => {
                  // Sort by Y position so cards with lower Y render first (appear behind)
                  const aY = isSortingEnabled ? a.y || 0.002 : 0.002;
                  const bY = isSortingEnabled ? b.y || 0.002 : 0.002;
                  return aY - bY; // Lower Y values render first (behind higher Y values)
                })
                .map((p) => {
                  const isSite = (p.card.type || "")
                    .toLowerCase()
                    .includes("site");

                  // Use sorted position if sorting is enabled, otherwise use card's position
                  const stackPos = stackPositions?.get(p.id);
                  const x = stackPos ? stackPos.x : p.x;
                  const z = stackPos ? stackPos.z : p.z;
                  const y = isSortingEnabled ? p.y || 0.002 : 0.002; // Use Y elevation only when sorting

                  // Calculate base render order from Y position for proper stacking
                  const baseRenderOrder = isSortingEnabled
                    ? 1500 + Math.floor(y * 1000)
                    : 1500;

                  return (
                    <DraggableCard3D
                      key={p.id}
                      slug={p.card.slug}
                      isSite={isSite}
                      x={x}
                      z={z}
                      y={y}
                      baseRenderOrder={baseRenderOrder}
                      onContextMenu={(cx, cy) =>
                        openContextMenuForCard(
                          p.card.cardId,
                          p.card.cardName,
                          cx,
                          cy
                        )
                      }
                      onDrop={(wx, wz) => {
                        // Move card to drop position - only sort if sorting is enabled and this is a manual drag
                        const newZone = wz < 0 ? "Deck" : "Sideboard";
                        const oldZone = p.z < 0 ? "Deck" : "Sideboard";
                        const zoneChanged = oldZone !== newZone;

                        setPick3D((prev) => {
                          const updated = [...prev];
                          const cardIndex = updated.findIndex(
                            (it) => it.id === p.id
                          );
                          if (cardIndex === -1) return prev;

                          // Move the card to the drop position
                          updated[cardIndex] = {
                            ...updated[cardIndex],
                            x: wx,
                            z: wz,
                            y: undefined,
                          };

                          // Don't auto-apply sorting on manual drags - let user control positioning
                          return updated;
                        });

                        // Show feedback message for zone changes
                        if (zoneChanged) {
                          setFeedbackMessage(
                            `Moved "${p.card.cardName}" to ${newZone}`
                          );
                          setTimeout(() => setFeedbackMessage(null), 2000);
                        }
                      }}
                      getTopRenderOrder={getTopRenderOrder}
                      lockUpright={false}
                      disabled={
                        isSortingEnabled && stackPos
                          ? !stackPos.isVisible
                          : false
                      } // Disable dragging for hidden stacked cards
                      onDragChange={(dragging) => {
                        setOrbitLocked(dragging);
                      }}
                      onHoverChange={(hover) => {
                        if (hover && !orbitLocked)
                          setHoverPreview({
                            slug: p.card.slug,
                            name: p.card.cardName,
                            type: p.card.type,
                          });
                        else setHoverPreview(null);
                      }}
                      onRelease={(wx, wz, wasDragging) => {
                        // Click to move between deck/sideboard using the same functions as sidebar
                        if (!wasDragging) {
                          const currentZone = p.z < 0 ? "Deck" : "Sideboard";

                          if (currentZone === "Deck") {
                            // Move from deck to sideboard
                            moveOneToSideboard(p.card.cardId);
                            setFeedbackMessage(
                              `Moved "${p.card.cardName}" to Sideboard`
                            );
                          } else {
                            // Move from sideboard to deck
                            moveOneFromSideboardToDeck(p.card.cardId);
                            setFeedbackMessage(
                              `Moved "${p.card.cardName}" to Deck`
                            );
                          }

                          setTimeout(() => setFeedbackMessage(null), 2000);
                        }
                      }}
                    />
                  );
                })}
          </group>
          <TextureCache />
        </EditorCanvas>
      </div>

      {/* HUD Overlay - EXACT same structure as draft-3d */}
      <div className="absolute inset-0 z-20 pointer-events-none select-none">
        <DeckPanels
          isDraftMode={isDraftMode}
          isSealed={isSealed}
          status={status}
          decks={decks}
          deckId={deckId}
          deckName={deckName}
          loadingDecks={loadingDecks}
          pick3DLength={pick3D.length}
          isSortingEnabled={isSortingEnabled}
          onToggleSort={() => setIsSortingEnabled(!isSortingEnabled)}
          onForceSort={forceSorting}
          avatarCount={avatarCount}
          atlasCount={atlasCount}
          spellbookNonAvatar={spellbookNonAvatar}
          validation={validation}
          saving={saving}
          onLoadDeck={loadDeck}
          onClearEditor={clearEditor}
          onSetDeckName={setDeckName}
          onSaveDeck={saveDeck}
          onSubmitSealed={submitSealedDeck}
          onSubmitDraft={submitDraftDeck}
        />
        {/* (Removed background usage text in favor of Help overlay) */}
        <Suspense fallback={null}>
          <RightPanel
            cardsTab={cardsTab}
            setCardsTab={setCardsTab}
            picksOpen={picksOpen}
            setPicksOpen={setPicksOpen}
            picksByType={picksByType}
            yourCounts={yourCounts}
            pick3D={pick3D}
            metaByCardId={metaByCardId}
            pickInfoById={pickInfoById}
            onHoverPreview={(slug, name, type) => setHoverPreview({ slug, name, type })}
            onHoverClear={() => setHoverPreview(null)}
            moveOneToSideboard={moveOneToSideboard}
            moveOneFromSideboardToDeck={moveOneFromSideboardToDeck}
            openContextMenu={openContextMenuForCard}
            setFeedback={(msg) => {
              setFeedbackMessage(msg);
              setTimeout(() => setFeedbackMessage(null), 2000);
            }}
          />
        </Suspense>

        {/* Deck Statistics (collapsible, minimal) */}
        {infoBoxVisible && pick3D.length > 0 && (
          <div className="top-24 left-6 absolute select-none">
            <div
              className={
                `relative rounded bg-black/80 shadow-lg w-72 max-w-[90vw] p-2 pointer-events-none ` +
                (statsCollapsed ? "" : "ring-1 ring-white/30")
              }
            >
              <button
                onClick={() => setStatsCollapsed((v) => !v)}
                className="absolute top-1 right-1 h-7 w-7 grid place-items-center rounded bg-white/10 hover:bg-white/20 text-white/60 hover:text-white opacity-40 hover:opacity-80 pointer-events-auto"
                title={statsCollapsed ? "Show details" : "Hide details"}
                aria-label={statsCollapsed ? "Show details" : "Hide details"}
              >
                {statsCollapsed ? (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                    <path d="M12 5C7 5 2.73 8.11 1 12c1.73 3.89 6 7 11 7s9.27-3.11 11-7c-1.73-3.89-6-7-11-7zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-2a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                    <path d="M12 5c-2.5 0-4.78.73-6.68 1.95L3.7 5.34 2.29 6.75l16.97 16.97 1.41-1.41-3.03-3.03C20.04 16.83 22 12 22 12S18.27 5 12 5z"/>
                  </svg>
                )}
              </button>

              {statsCollapsed ? (
                <div className="text-sm text-white/90 space-y-2">
                  <div className="flex items-end gap-1 h-14 bg-black/40 rounded p-1">
                    {Array.from({ length: 8 }, (_, cost) => {
                      const count = manaCurve[cost] || 0;
                      const maxCount = Math.max(...Object.values(manaCurve), 1);
                      const height = (count / maxCount) * 100;
                      const label = cost === 7 ? "7+" : String(cost);
                      return (
                        <div key={cost} className="flex flex-col items-center justify-end gap-0.5 flex-1 h-full">
                          <div
                            className="bg-blue-400 rounded-t min-h-[2px] w-full"
                            style={{ height: `${Math.max(height, count > 0 ? 8 : 0)}%` }}
                            title={`${label} mana: ${count} cards`}
                          />
                          <span className="text-[10px] opacity-60">{label}</span>
                        </div>
                      );
                    })}
                  </div>
                  {thresholdSummary.elements.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {thresholdSummary.elements.map((element) => (
                        <div key={element} className="flex items-center gap-1 bg-white/10 px-1 py-0.5 rounded">
                          <Image src={`/api/assets/${element}.png`} alt={element} width={12} height={12} />
                          <span className="text-[10px]">
                            {thresholdSummary.summary[element as keyof typeof thresholdSummary.summary]}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-white/90 space-y-2">
                  <div className="grid grid-cols-2 gap-1">
                    <div>Deck: {picksByType.deck}</div>
                    <div>Sideboard: {picksByType.sideboard}</div>
                    <div>Creatures: {picksByType.creatures}</div>
                    <div>Spells: {picksByType.spells}</div>
                    <div>Sites: {picksByType.sites}</div>
                    <div>Avatars: {picksByType.avatars}</div>
                  </div>
                  <div>
                    <div className="flex items-end gap-1 h-20 bg-black/40 rounded p-1">
                      {Array.from({ length: 8 }, (_, cost) => {
                        const count = manaCurve[cost] || 0;
                        const maxCount = Math.max(...Object.values(manaCurve), 1);
                        const height = (count / maxCount) * 100;
                        const label = cost === 7 ? "7+" : String(cost);
                        return (
                          <div key={cost} className="flex flex-col items-center justify-end gap-1 flex-1 h-full">
                            <div
                              className="bg-blue-400 rounded-t min-h-[2px] w-full relative"
                              style={{ height: `${Math.max(height, count > 0 ? 8 : 0)}%` }}
                              title={`${label} mana: ${count} cards`}
                            >
                              {count > 0 && (
                                <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-xs text-white opacity-75">
                                  {count}
                                </span>
                              )}
                            </div>
                            <span className="text-xs opacity-75">{label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {thresholdSummary.elements.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {thresholdSummary.elements.map((element) => (
                        <div key={element} className="flex items-center gap-1 bg-white/10 px-1 py-0.5 rounded">
                          <Image src={`/api/assets/${element}.png`} alt={element} width={14} height={14} />
                          <span className="text-xs">
                            {thresholdSummary.summary[element as keyof typeof thresholdSummary.summary]}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Card preview - exact copy from draft-3d */}
        {hoverPreview && (
          <div className="fixed bottom-6 left-6 z-50 pointer-events-none select-none">
            {(() => {
              const isSite = (hoverPreview.type || "")
                .toLowerCase()
                .includes("site");
              // Clamp size and preserve aspect; use padding-bottom to enforce aspect box
              const base = isSite
                ? "w-[30vw] max-w-[600px] min-w-[200px] aspect-[4/3]" // matches rotated site (4:3)
                : "w-[22vw] max-w-[360px] min-w-[180px] aspect-[3/4]"; // portrait cards
              return (
                <div
                  className={`relative ${base} rounded-xl overflow-hidden shadow-2xl ${
                    isSite ? "rotate-90" : ""
                  }`}
                >
                  <Image
                    src={`/api/images/${hoverPreview.slug}`}
                    alt={hoverPreview.name}
                    fill
                    sizes="(max-width:640px) 50vw, (max-width:1024px) 30vw, 25vw"
                    className={`${isSite ? "object-contain" : "object-cover"}`}
                    priority
                  />
                </div>
              );
            })()}
          </div>
        )}

        {/* Context Menu for Duplicate Cards */}
        {contextMenu && (
          <div
            className="fixed z-50 pointer-events-auto"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-black/90 backdrop-blur-sm rounded-lg shadow-xl border border-white/20 min-w-48 p-2">
              <div className="text-white text-sm font-medium mb-2 px-2">
                Move &quot;{contextMenu.cardName}&quot;
              </div>

              {contextMenu.deckCards.length > 0 && (
                <div className="mb-2">
                  <div className="text-green-300 text-xs px-2 mb-1">
                    From Deck ({contextMenu.deckCards.length}):
                  </div>
                  {contextMenu.deckCards.map((card, index) => (
                    <button
                      key={card.id}
                      className="w-full text-left px-2 py-1 text-sm text-white hover:bg-white/10 rounded"
                      onClick={() => {
                        moveSpecificCardToSideboard(card.id);
                        setFeedbackMessage(
                          `Moved "${contextMenu.cardName}" to Sideboard`
                        );
                        setTimeout(() => setFeedbackMessage(null), 2000);
                        setContextMenu(null);
                      }}
                    >
                      Copy {index + 1} → Sideboard
                    </button>
                  ))}
                </div>
              )}

              {contextMenu.sideboardCards.length > 0 && (
                <div>
                  <div className="text-blue-300 text-xs px-2 mb-1">
                    From Sideboard ({contextMenu.sideboardCards.length}):
                  </div>
                  {contextMenu.sideboardCards.map((card, index) => (
                    <button
                      key={card.id}
                      className="w-full text-left px-2 py-1 text-sm text-white hover:bg-white/10 rounded"
                      onClick={() => {
                        moveSpecificCardToDeck(card.id);
                        setFeedbackMessage(
                          `Moved "${contextMenu.cardName}" to Deck`
                        );
                        setTimeout(() => setFeedbackMessage(null), 2000);
                        setContextMenu(null);
                      }}
                    >
                      Copy {index + 1} → Deck
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Feedback Message */}
        {feedbackMessage && (
          <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none">
            <div className="bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg font-medium">
              {feedbackMessage}
            </div>
          </div>
        )}

        {/* Bottom controls */}
        <Suspense fallback={null}>
          <BottomBar
            isSealed={isSealed}
            isDraftMode={isDraftMode}
            searchExpanded={searchExpanded}
            setSearchExpanded={setSearchExpanded}
            q={q}
            setQ={setQ}
            typeFilter={typeFilter}
            setTypeFilter={setTypeFilter}
            searchSetName={searchSetName}
            setSearchSetName={setSearchSetName}
            doSearch={doSearch}
            results={results}
            addCardAuto={addCardAuto}
            addToSideboardFromSearch={addToSideboardFromSearch}
            pick3DLength={pick3D.length}
            tournamentControlsVisible={tournamentControlsVisible}
            toggleTournamentControls={() => setTournamentControlsVisible(!tournamentControlsVisible)}
            packs={packs}
            openPack={openPack}
            timeRemaining={timeRemaining}
            formatTime={formatTimeSealed}
          />
        </Suspense>
        {error && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-red-700/80 text-white px-3 py-1 rounded text-sm pointer-events-none">
            Error: {error}
          </div>
        )}
        {saveMsg && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-green-700/80 text-white px-3 py-1 rounded text-sm pointer-events-none">
            {saveMsg}
          </div>
        )}
      </div>
      
      <Suspense fallback={null}>
        <TournamentControls
          isVisible={tournamentControlsVisible}
          onClose={() => setTournamentControlsVisible(false)}
          spellslingerCard={spellslingerCard}
          standardSites={stdSites}
          onAddSpellslinger={addSpellslinger}
          onAddStandardSite={addStandardSiteByName}
        />
      </Suspense>
    </div>
  );
}

export default function DeckEditor3DPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
          Loading editor…
        </div>
      }
    >
      <AuthenticatedDeckEditor />
    </Suspense>
  );
}
