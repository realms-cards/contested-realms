"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  useMemo,
  useRef,
  useState,
  useCallback,
  useEffect,
  Suspense,
} from "react";
import DeckPanels from "@/app/decks/editor-3d/DeckPanels";
import DraggableCard3D from "@/app/decks/editor-3d/DraggableCard3D";
import useCardMeta from "@/app/decks/editor-3d/hooks/useCardMeta";
import useSealedTimer from "@/app/decks/editor-3d/hooks/useSealedTimer";
import { useOnline } from "@/app/online/online-context";
import FloatingChat from "@/components/chat/FloatingChat";
import { TournamentControls } from "@/components/deck-editor";
import CardPreview from "@/components/game/CardPreview";
import { SearchResult, SearchType, searchCards } from "@/lib/deckEditor/search";
import type { CardPreviewData } from "@/lib/game/card-preview.types";
import {
  Pick3D,
  CardMeta,
  computeStackPositions,
  categorizeCard,
} from "@/lib/game/cardSorting";
import TextureCache from "@/lib/game/components/TextureCache";
import { CARD_LONG, CARD_SHORT, TILE_SIZE } from "@/lib/game/constants";
import { createInitialBoard } from "@/lib/game/store";

const RightPanel = dynamic(() => import("@/app/decks/editor-3d/RightPanel"), {
  ssr: false,
});
const BottomBar = dynamic(() => import("@/app/decks/editor-3d/BottomBar"), {
  ssr: false,
});
const TournamentPresenceOverlay = dynamic(
  () => import("@/components/tournament/TournamentPresenceOverlay"),
  { ssr: false }
);

// Lazy load the Canvas/three stack to trim initial JS and avoid SSR
const EditorCanvas = dynamic(
  () => import("@/app/decks/editor-3d/EditorCanvas"),
  {
    ssr: false,
    // Keep simple to avoid heavy loaders on first paint
    loading: () => null,
  }
);

// Stable constant for standard site names (tournament legal)
const STANDARD_SITE_NAMES = ["Spire", "Stream", "Valley", "Wasteland"] as const;

function pickStandardSiteResult(
  results: SearchResult[],
  name: (typeof STANDARD_SITE_NAMES)[number]
): SearchResult | null {
  const normalized = name.toLowerCase();
  const betaExact = results.find(
    (card) => card.cardName.toLowerCase() === normalized && card.set === "Beta"
  );
  if (betaExact) return betaExact;
  const anyExact = results.find(
    (card) => card.cardName.toLowerCase() === normalized
  );
  return anyExact ?? null;
}

// --- Deck Editor data types (same as 2D editor) ---

type Zone = "Deck" | "Sideboard" | "Collection";
type ApiZone = "Spellbook" | "Atlas" | "Collection" | "Sideboard"; // API zones for saving/loading
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

// Board-based anchor for the Collection fan layout (bottom-left of the playmat)
const INITIAL_BOARD = createInitialBoard();
const GRID_HALF_W = (INITIAL_BOARD.size.w * TILE_SIZE) / 2;
const GRID_HALF_H = (INITIAL_BOARD.size.h * TILE_SIZE) / 2;
// Place the collection fan inside the board, at the lower-left corner region.
// We keep a small margin from the true edge so cards remain fully on the mat.
const COLLECTION_ANCHOR_X = -GRID_HALF_W + CARD_SHORT * 0.6;
const COLLECTION_ANCHOR_Z = GRID_HALF_H - CARD_LONG * 0.6;

function AuthenticatedDeckEditor() {
  const { status } = useSession();
  const searchParams = useSearchParams();
  const searchParamsKey = searchParams?.toString() ?? "";
  const router = useRouter();
  const { match, me } = useOnline();

  // Deck editor state (same as 2D version)
  const [decks, setDecks] = useState<DeckListItem[]>([]);
  const [loadingDecks, setLoadingDecks] = useState(false);
  const [deckId, setDeckId] = useState<string | null>(null);
  const [deckName, setDeckName] = useState<string>("New Deck");
  const [deckIsPublic, setDeckIsPublic] = useState<boolean>(false);
  const [deckIsOwner, setDeckIsOwner] = useState<boolean>(true);
  const [deckCreatorName, setDeckCreatorName] = useState<string | null>(null);
  const [setName, setSetName] = useState<string>("Beta");
  const [picks, setPicks] = useState<Record<PickKey, PickItem>>({});

  // If the editor is launched with a tournament param, set the deck name to the tournament's name.
  useEffect(() => {
    const tournamentId = searchParams?.get("tournament");
    if (!tournamentId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/tournaments/${encodeURIComponent(String(tournamentId))}`
        );
        if (!res.ok) return;
        const detail = await res.json();
        if (!cancelled && detail?.name && typeof detail.name === "string") {
          setDeckName(detail.name);
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  // Debug: Track picks changes
  // Runs once on initial picks change logging; intentionally omits deckName/setName

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
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [waitingForOtherPlayers, setWaitingForOtherPlayers] = useState(false);
  const [waitingOverlayStage, setWaitingOverlayStage] = useState<
    "submitting" | "waiting"
  >("waiting");
  const [orbitLocked, setOrbitLocked] = useState(false);

  // Clear transient errors when auth status changes to authenticated
  // Intentionally running once per pick3D change; server batching relies on prior state

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
  const [isSortingEnabled, setIsSortingEnabled] = useState(true);
  const [statsCollapsed, setStatsCollapsed] = useState(true);
  const [infoBoxVisible] = useState(true);
  const [picksOpen, setPicksOpen] = useState(true);
  // Draft-completion mode flag (off by default)
  const [isDraftMode, setIsDraftMode] = useState(false);
  // Ensure we only initialize draft mode once per load
  const [draftInitDone, setDraftInitDone] = useState(false);

  // Sealed mode flag (similar to isDraftMode but for sealed deck construction)
  const [isSealed, setIsSealed] = useState(false);
  // Ensure we only initialize sealed mode picks once per load
  const [sealedInitDone, setSealedInitDone] = useState(false);

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

  const [packCardCache, setPackCardCache] = useState<
    Record<string, SearchResult[]>
  >({});
  const packCardCacheRef = useRef<Record<string, SearchResult[]>>({});
  const [packLoadProgress, setPackLoadProgress] = useState<{
    processed: number;
    total: number;
    inProgress: boolean;
  }>({ processed: 0, total: 0, inProgress: false });
  const cardLookupCacheRef = useRef(new Map<string, SearchResult | null>());
  // Cube draft helper: when true and a supported cube was used, expose its sideboard cards as standard options
  const [cubeStandardCards, setCubeStandardCards] = useState<SearchResult[]>(
    []
  );
  const sealedReplaceAvatars = sealedConfig?.replaceAvatars ?? false;
  const [bulkOpenInProgress, setBulkOpenInProgress] = useState(false);

  const [matchEndedBannerMessage, setMatchEndedBannerMessage] = useState<
    string | null
  >(null);
  const [matchEndedBannerVisible, setMatchEndedBannerVisible] = useState(false);
  const matchBannerPrevMatchIdRef = useRef<string | null>(null);
  const matchBannerPrevStatusRef = useRef<string | null>(null);

  // Reliable navigation helper back to the match page
  const goBackToMatch = useCallback(
    (targetId?: string | null) => {
      const id =
        typeof targetId === "string" && targetId.trim().length
          ? targetId
          : null;
      const url = id ? `/online/play/${id}` : null;
      try {
        if (url) {
          // Try hard navigation first (most reliable across contexts)
          if (typeof window !== "undefined") {
            try {
              window.location.assign(url);
            } catch {}
          }
          // Also attempt SPA replace to cover cases where client routing helps
          try {
            router.replace(url);
          } catch {}
        } else {
          // Unknown match id – try going back, then fall back to generic play page
          try {
            window.history.back();
          } catch {}
          setTimeout(() => {
            try {
              window.location.assign("/online/play");
            } catch {}
          }, 250);
        }
      } catch {
        // Last resort: go to lobby
        try {
          window.location.assign("/online/lobby");
        } catch {}
      }
    },
    [router]
  );

  // Draft picks resolution progress (when opening editor in draft mode)
  const [draftLoadProgress, setDraftLoadProgress] = useState<{
    processed: number;
    total: number;
    inProgress: boolean;
  }>({ processed: 0, total: 0, inProgress: false });
  const draftInitRef = useRef(false);

  // Track which packs are opened so we can preserve UI state across server/local updates
  const openedByIdRef = useRef<Map<string, boolean>>(new Map());
  useEffect(() => {
    openedByIdRef.current = new Map(packs.map((p) => [p.id, p.opened]));
  }, [packs]);

  const addSearchResultsToSideboard = useCallback(
    (list: SearchResult[]) => {
      if (!list.length) return;
      setPicks((prev) => {
        const next = { ...prev } as Record<PickKey, PickItem>;
        for (const r of list) {
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
    },
    [setPicks]
  );

  const fetchSearchResult = useCallback(
    async ({
      slug,
      name,
      set,
    }: {
      slug: string;
      name: string;
      set: string;
    }): Promise<SearchResult | null> => {
      const trimmedSlug = slug.trim();
      const trimmedName = name.trim();
      const lookupKey = trimmedSlug
        ? `slug:${trimmedSlug.toLowerCase()}:${set}`
        : `name:${trimmedName.toLowerCase()}:${set}`;
      if (cardLookupCacheRef.current.has(lookupKey)) {
        return cardLookupCacheRef.current.get(lookupKey) ?? null;
      }

      let hit: SearchResult | null = null;
      try {
        if (trimmedSlug) {
          const res = await fetch(
            `/api/cards/search?q=${encodeURIComponent(
              trimmedSlug
            )}&set=${encodeURIComponent(set)}&type=all`
          );
          const data = (await res.json()) as SearchResult[];
          hit = res.ok ? data[0] || null : null;
        }
        if (!hit && trimmedName) {
          const res = await fetch(
            `/api/cards/search?q=${encodeURIComponent(
              trimmedName
            )}&set=${encodeURIComponent(set)}&type=all`
          );
          const data = (await res.json()) as SearchResult[];
          hit = res.ok ? data[0] || null : null;
        }
      } catch (err) {
        console.error("Search lookup failed while resolving sealed packs", err);
      }

      cardLookupCacheRef.current.set(lookupKey, hit ?? null);
      if (hit) {
        const slugKey = `slug:${hit.slug.toLowerCase()}:${hit.set}`;
        const nameKey = `name:${hit.cardName.toLowerCase()}:${hit.set}`;
        cardLookupCacheRef.current.set(slugKey, hit);
        cardLookupCacheRef.current.set(nameKey, hit);
      }
      return hit;
    },
    []
  );

  const convertCardDataToSearchResult = useCallback(
    (
      card: Record<string, unknown>,
      fallbackSet: string
    ): SearchResult | null => {
      const slugRaw = card.slug;
      const nameRaw = (card.cardName ?? card.name) as unknown;
      if (typeof slugRaw !== "string" || typeof nameRaw !== "string") {
        return null;
      }
      const setName = typeof card.set === "string" ? card.set : fallbackSet;
      const cardId = typeof card.cardId === "number" ? card.cardId : 0;
      const variantId =
        typeof card.variantId === "number" ? card.variantId : cardId;
      const finishRaw =
        typeof card.finish === "string"
          ? card.finish.toLowerCase()
          : "standard";
      const finish: "Standard" | "Foil" =
        finishRaw === "foil" ? "Foil" : "Standard";
      const rarity = typeof card.rarity === "string" ? card.rarity : null;
      const type = typeof card.type === "string" ? card.type : null;
      const product =
        typeof card.product === "string" && card.product.trim().length
          ? card.product
          : "Booster";
      const sr: SearchResult = {
        variantId,
        slug: slugRaw,
        finish,
        product,
        cardId,
        cardName: nameRaw,
        set: setName,
        type,
        rarity,
      };
      const slugKey = `slug:${slugRaw.toLowerCase()}:${setName}`;
      const nameKey = `name:${nameRaw.toLowerCase()}:${setName}`;
      cardLookupCacheRef.current.set(slugKey, sr);
      cardLookupCacheRef.current.set(nameKey, sr);
      return sr;
    },
    []
  );

  const resolveCardsForPack = useCallback(
    async (pack: {
      id: string;
      set: string;
      cards: unknown[];
    }): Promise<SearchResult[]> => {
      const cached = packCardCacheRef.current[pack.id];
      if (cached) return cached;

      const resolved: SearchResult[] = [];
      const provided = Array.isArray(pack.cards)
        ? (pack.cards as Record<string, unknown>[])
        : [];

      if (provided.length > 0) {
        for (const card of provided) {
          const direct = convertCardDataToSearchResult(card, pack.set);
          if (direct) {
            resolved.push(direct);
            continue;
          }
          const slugVal = typeof card.slug === "string" ? card.slug : "";
          const nameVal =
            typeof card.cardName === "string"
              ? card.cardName
              : typeof card.name === "string"
              ? card.name
              : "";
          if (!slugVal && !nameVal) continue;
          const hit = await fetchSearchResult({
            slug: slugVal,
            name: nameVal,
            set: pack.set,
          });
          if (hit) resolved.push(hit);
        }
      } else {
        const avatarParam = sealedReplaceAvatars ? "&replaceAvatars=true" : "";
        try {
          const res = await fetch(
            `/api/booster?set=${encodeURIComponent(
              pack.set
            )}&count=1${avatarParam}`
          );
          const data = await res.json();
          if (res.ok) {
            const generated = Array.isArray(data.packs?.[0])
              ? (data.packs[0] as Record<string, unknown>[])
              : [];
            for (const card of generated) {
              const direct = convertCardDataToSearchResult(card, pack.set);
              if (direct) {
                resolved.push(direct);
                continue;
              }
              const slugVal = typeof card.slug === "string" ? card.slug : "";
              const nameVal =
                typeof card.cardName === "string"
                  ? card.cardName
                  : typeof card.name === "string"
                  ? card.name
                  : "";
              if (!slugVal && !nameVal) continue;
              const hit = await fetchSearchResult({
                slug: slugVal,
                name: nameVal,
                set: pack.set,
              });
              if (hit) resolved.push(hit);
            }
          }
        } catch (err) {
          console.error(
            "Booster fallback failed while resolving sealed pack",
            err
          );
        }
      }

      packCardCacheRef.current = {
        ...packCardCacheRef.current,
        [pack.id]: resolved,
      };
      setPackCardCache((prev) => ({ ...prev, [pack.id]: resolved }));
      return resolved;
    },
    [convertCardDataToSearchResult, fetchSearchResult, sealedReplaceAvatars]
  );

  useEffect(() => {
    if (!isSealed) {
      setPackLoadProgress({ processed: 0, total: 0, inProgress: false });
      return;
    }

    const packsWithCards = packs.filter(
      (p) => Array.isArray(p.cards) && p.cards.length > 0
    );
    if (!packsWithCards.length) {
      setPackLoadProgress({ processed: 0, total: 0, inProgress: false });
      return;
    }

    const alreadyReady = packsWithCards.filter((p) =>
      Boolean(packCardCacheRef.current[p.id])
    );
    const remaining = packsWithCards.filter(
      (p) => !packCardCacheRef.current[p.id]
    );

    if (!remaining.length) {
      setPackLoadProgress({
        processed: alreadyReady.length,
        total: packsWithCards.length,
        inProgress: false,
      });
      return;
    }

    let cancelled = false;
    setPackLoadProgress({
      processed: alreadyReady.length,
      total: packsWithCards.length,
      inProgress: true,
    });

    (async () => {
      let processed = alreadyReady.length;
      for (const pack of remaining) {
        if (cancelled) return;
        await resolveCardsForPack(pack);
        if (cancelled) return;
        processed += 1;
        setPackLoadProgress({
          processed,
          total: packsWithCards.length,
          inProgress: processed < packsWithCards.length,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isSealed, packs, resolveCardsForPack]);

  useEffect(() => {
    if (!match) {
      matchBannerPrevMatchIdRef.current = null;
      matchBannerPrevStatusRef.current = null;
      return;
    }

    if (!isSealed && !isDraftMode) {
      const currentId = (match as { id?: string | null }).id ?? null;
      const currentStatus =
        (match as { status?: string | null }).status ?? null;
      matchBannerPrevMatchIdRef.current = currentId;
      matchBannerPrevStatusRef.current = currentStatus;
      return;
    }

    const currentId = (match as { id?: string | null }).id ?? null;
    const currentStatus = (match as { status?: string | null }).status ?? null;
    const prevId = matchBannerPrevMatchIdRef.current;
    const prevStatus = matchBannerPrevStatusRef.current;

    if (
      currentId &&
      currentStatus === "ended" &&
      (prevId !== currentId || prevStatus !== "ended")
    ) {
      const reason = (match as { endReason?: string | null }).endReason ?? null;
      const ratedRaw = (match as { rated?: boolean | null }).rated ?? null;
      const winnerId = (match as { winnerId?: string | null }).winnerId ?? null;
      const myId = me?.id ?? null;

      let message: string | null = null;

      if (reason === "forfeit") {
        const isRated = ratedRaw !== false;
        if (!isRated) {
          if (myId && winnerId && winnerId === myId) {
            message =
              "Your opponent left early. This match will not count for global rankings.";
          } else if (myId && winnerId && winnerId !== myId) {
            message =
              "You left this match early. This result will not count for global rankings.";
          } else {
            message =
              "This match ended early and will not count for global rankings.";
          }
        } else {
          if (myId && winnerId && winnerId === myId) {
            message =
              "Your opponent forfeited. You win by forfeit and this result counts for global rankings.";
          } else if (myId && winnerId && winnerId !== myId) {
            message =
              "You forfeited the match. This result counts for global rankings.";
          } else {
            message = "This match ended due to forfeit.";
          }
        }
      } else {
        message = "Your event match has finished.";
      }

      if (message) {
        setMatchEndedBannerMessage(message);
        setMatchEndedBannerVisible(true);
      }
    }

    matchBannerPrevMatchIdRef.current = currentId;
    matchBannerPrevStatusRef.current = currentStatus;
  }, [match, me, isSealed, isDraftMode]);

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
              `/api/cards/search?q=${encodeURIComponent(
                name
              )}${setParam}&type=site`
            );
            const data = (await res.json()) as SearchResult[];
            const match = res.ok ? pickStandardSiteResult(data, name) : null;
            return [name, match] as const;
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
          setStdSites({
            Spire: null,
            Stream: null,
            Valley: null,
            Wasteland: null,
          });
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
        const res = await fetch("/api/decks", {
          credentials: "include",
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Failed to load decks");
        if (mounted) setDecks(data.myDecks || []);
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
    const sealed = searchParams?.get("sealed");
    const matchId = searchParams?.get("matchId");
    const tournamentId = searchParams?.get("tournament");
    const timeLimit = searchParams?.get("timeLimit");
    const constructionStartTime = searchParams?.get("constructionStartTime");
    const replaceAvatars = searchParams?.get("replaceAvatars") === "true";

    if (sealed === "true" && (matchId || tournamentId) && !isSealed) {
      console.log("Initializing sealed mode...");

      // Clear any existing cards from previous sessions
      setPick3D([]);
      setPicks({});
      setNextPickId(1);

      const config = {
        timeLimit: parseInt(timeLimit || "40"),
        constructionStartTime: parseInt(
          constructionStartTime || Date.now().toString()
        ),
        packCount: parseInt(searchParams?.get("packCount") || "6"),
        setMix: searchParams?.get("setMix")
          ? (searchParams?.get("setMix") || "").split(",")
          : ["Beta"],
        replaceAvatars,
      };

      setSealedConfig(config);
      setIsSealed(true);
      const matchName = searchParams?.get("matchName");
      setDeckName(matchName || "Deck Editor");

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
  }, [searchParamsKey, isSealed, searchParams]); // Only initialize if not already sealed

  // If server-provided sealed packs were persisted, load them as the authoritative packs to open.
  // We do NOT pre-seed sideboard; players add cards to their pool by opening packs here.
  useEffect(() => {
    if (!isSealed || sealedInitDone) return;
    const matchId = searchParams?.get("matchId");
    const tournamentId = searchParams?.get("tournament");
    const idKey =
      matchId || (tournamentId ? `tournament_${tournamentId}` : null);
    if (!idKey) return;

    let raw: string | null = null;
    try {
      raw = localStorage.getItem(`sealedPacks_${idKey}`);
    } catch {
      raw = null;
    }
    if (!raw) {
      setSealedInitDone(true);
      return;
    }

    type StoredCard = {
      id?: string;
      slug?: string;
      cardName?: string;
      name?: string;
      type?: string | null;
      set?: string;
      setName?: string;
      cardId?: number;
      variantId?: number;
      finish?: string;
      product?: string;
      rarity?: string | null;
    };
    type StoredPack = { id: string; set: string; cards: StoredCard[] };

    let stored: StoredPack[] = [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) stored = parsed as StoredPack[];
    } catch {
      stored = [];
    }
    if (!Array.isArray(stored) || stored.length === 0) {
      setSealedInitDone(true);
      return;
    }

    // Load exact packs (preserving opened flags from ref)
    const openedById = openedByIdRef.current;
    const serverPacks = stored.map((p) => ({
      id: p.id,
      set: p.set,
      cards: Array.isArray(p.cards)
        ? (p.cards as unknown[])
        : ([] as unknown[]),
      opened: openedById.get(p.id) ?? false,
    }));
    setPacks(serverPacks);
    setSealedInitDone(true);
  }, [isSealed, sealedInitDone, searchParams]);

  // Initialize draft completion mode from URL and localStorage
  useEffect(() => {
    const draft = searchParams?.get("draft");
    const matchId = searchParams?.get("matchId");
    const sessionId = searchParams?.get("sessionId"); // Tournament draft session
    const playerIdParam =
      searchParams?.get("playerId") || searchParams?.get("player") || null;
    const draftId = matchId || sessionId; // Support both match-based and tournament drafts

    console.log("[Draft Init] useEffect run", {
      draft,
      draftId,
      draftInitDone,
    });

    if (draft !== "true" || !draftId) return;
    if (draftInitDone) {
      console.log("[Draft Init] Already initialized, skipping");
      return;
    }
    if (draftInitRef.current) {
      console.log("[Draft Init] Guard hit - initialization already running");
      return;
    }
    draftInitRef.current = true;

    console.log("[Draft Init] Initializing draft mode for", draftId);
    setIsDraftMode(true);

    let raw: string | null = null;
    const storageSuffix = playerIdParam
      ? `${draftId}_${playerIdParam}`
      : draftId;
    try {
      raw = localStorage.getItem(`draftedCards_${storageSuffix}`);
      if (!raw && playerIdParam) {
        raw = localStorage.getItem(`draftedCards_${draftId}`);
      }
    } catch (e) {
      console.warn("Failed to read drafted cards from localStorage:", e);
    }

    // Fallback: fetch picks from server if sessionId is provided and no local data is present
    if (!raw) {
      const sessionIdParam = searchParams?.get("sessionId");
      if (sessionIdParam) {
        console.log(
          "[Draft Init] No local data, fetching from server:",
          sessionIdParam
        );
        (async () => {
          try {
            const res = await fetch(
              `/api/draft-sessions/${sessionIdParam}/state`,
              { cache: "no-store" }
            );
            if (res.ok) {
              const payload = await res.json();
              const myPicks = Array.isArray(payload?.myPicks)
                ? (payload.myPicks as Array<{
                    slug?: string;
                    cardName?: string;
                    name?: string;
                    setName?: string;
                    type?: string | null;
                    rarity?: string | null;
                  }>)
                : [];
              if (myPicks.length > 0) {
                const json = JSON.stringify(myPicks);
                try {
                  localStorage.setItem(`draftedCards_${draftId}`, json);
                } catch {}

                // Pre-resolve to SearchResult[] by grouping slugs per set and using meta-by-variant
                console.log(
                  "[Draft Init] Resolving",
                  myPicks.length,
                  "cards from server"
                );
                try {
                  const bySet = new Map<string | null, Set<string>>();
                  for (const c of myPicks) {
                    const slug = typeof c.slug === "string" ? c.slug : "";
                    if (!slug) continue;
                    const setName =
                      typeof c.setName === "string" && c.setName
                        ? c.setName
                        : null;
                    let group = bySet.get(setName);
                    if (!group) {
                      group = new Set<string>();
                      bySet.set(setName, group);
                    }
                    group.add(slug);
                  }
                  const requests: Promise<
                    Array<{ slug: string; cardId: number }>
                  >[] = [];
                  for (const [setName, slugs] of bySet.entries()) {
                    if (!slugs || slugs.size === 0) continue;
                    const params = new URLSearchParams();
                    params.set("slugs", Array.from(slugs).join(","));
                    if (setName) params.set("set", setName);
                    requests.push(
                      fetch(`/api/cards/meta-by-variant?${params.toString()}`)
                        .then((r) => r.json())
                        .catch(() => [])
                    );
                  }
                  const chunks = await Promise.all(requests);
                  const rows = chunks.flat();
                  if (Array.isArray(rows) && rows.length) {
                    const idBySlug = new Map<string, number>();
                    for (const r of rows) {
                      const cid = Number((r as { cardId: number }).cardId) || 0;
                      const slug = String((r as { slug: string }).slug || "");
                      if (slug) idBySlug.set(slug, cid);
                    }
                    const resolved: SearchResult[] = myPicks
                      .map((c) => {
                        const slug = typeof c.slug === "string" ? c.slug : "";
                        const cardId = slug ? idBySlug.get(slug) || 0 : 0;
                        const name = (c.cardName || c.name) as
                          | string
                          | undefined;
                        const setName = (c.setName || "Beta") as string;
                        return cardId > 0 && slug && name
                          ? ({
                              variantId: 0,
                              slug,
                              finish: "Standard" as "Standard" | "Foil",
                              product: "Draft",
                              cardId,
                              cardName: name,
                              set: setName,
                              type: (c.type as string | null) || null,
                              rarity:
                                (c.rarity as
                                  | "Common"
                                  | "Uncommon"
                                  | "Rare"
                                  | "Exceptional"
                                  | null) || null,
                            } as SearchResult)
                          : null;
                      })
                      .filter((x): x is SearchResult => x !== null);

                    console.log(
                      "[Draft Init] Resolved",
                      resolved.length,
                      "cards, loading into editor"
                    );

                    try {
                      localStorage.setItem(
                        `draftedCardsResolved_${storageSuffix}`,
                        JSON.stringify(resolved)
                      );
                      if (playerIdParam) {
                        localStorage.setItem(
                          `draftedCardsResolved_${draftId}`,
                          JSON.stringify(resolved)
                        );
                      }
                    } catch {}

                    // Load resolved cards directly into the editor
                    if (resolved.length > 0) {
                      setPicks((prev) => {
                        const next = { ...prev } as Record<PickKey, PickItem>;
                        for (const r of resolved) {
                          const zone: Zone = "Sideboard";
                          const key = `${r.cardId}:${zone}:${
                            r.variantId ?? "x"
                          }` as PickKey;
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

                      // Infer default set
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
                      if (!deckName || deckName === "New Deck") {
                        const matchName = searchParams?.get("matchName");
                        setDeckName(matchName || "Draft Deck");
                      }
                      setDraftInitDone(true);
                      console.log(
                        "[Draft Init] Done! Cards loaded into editor"
                      );
                      return;
                    }
                  }
                } catch (err) {
                  console.warn(
                    "[Draft Init] Failed to pre-resolve cards:",
                    err
                  );
                }
              } else {
                setError("No drafted cards found for this draft.");
                setDraftInitDone(true);
              }
            } else {
              setError("No drafted cards found for this draft.");
              setDraftInitDone(true);
            }
          } catch (err) {
            console.warn("Draft editor fallback fetch failed:", err);
            setError("No drafted cards found for this draft.");
            setDraftInitDone(true);
          }
        })();
        return;
      }
    }

    if (!raw) {
      setError("No drafted cards found for this draft.");
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

    const totalDraftedCards = drafted.length;

    // Fast path: use resolved picks if present to avoid any network lookups
    try {
      const resolvedRaw =
        localStorage.getItem(`draftedCardsResolved_${storageSuffix}`) ??
        (playerIdParam
          ? localStorage.getItem(`draftedCardsResolved_${draftId}`)
          : null);
      if (resolvedRaw) {
        const resolvedParsed = JSON.parse(resolvedRaw) as unknown;
        const resolvedList = Array.isArray(resolvedParsed)
          ? (resolvedParsed as SearchResult[])
          : [];
        const allPositiveIds = resolvedList.every(
          (r) => Number.isFinite(r.cardId) && Number(r.cardId) > 0
        );
        if (resolvedList.length > 0 && allPositiveIds) {
          if (resolvedList.length !== drafted.length) {
            console.warn("[Draft Init] Resolved card cache length mismatch", {
              cached: resolvedList.length,
              drafted: drafted.length,
            });
          }
          console.log(
            "[Draft Init] Loading",
            resolvedList.length,
            "cards from resolved cache"
          );

          setPicks((prev) => {
            const next = { ...prev } as Record<PickKey, PickItem>;
            console.log(
              "[Draft Init] Prev picks has",
              Object.keys(prev).length,
              "items"
            );

            for (const r of resolvedList) {
              const zone: Zone = "Sideboard";
              const key = `${r.cardId}:${zone}:${
                r.variantId ?? "x"
              }` as PickKey;
              const exists = next[key];
              if (exists) {
                console.warn("[Draft Init] Card already exists in picks!", {
                  cardId: r.cardId,
                  name: r.cardName,
                  existingCount: exists.count,
                  key,
                });
              }
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
            console.log(
              "[Draft Init] After adding, picks has",
              Object.keys(next).length,
              "items"
            );
            return next;
          });
          // Infer default set from resolved cards
          const counts = new Map<string, number>();
          for (const r of resolvedList)
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
          if (!deckName || deckName === "New Deck") {
            const matchName = searchParams?.get("matchName");
            setDeckName(matchName || "Draft Deck");
          }
          setDraftInitDone(true);
          return; // skip network resolution entirely
        }
      }
    } catch {}

    (async () => {
      try {
        // Resolve each drafted card to a concrete SearchResult via slug first, fallback to name
        // Optimize: dedupe identical queries and resolve in parallel with a modest concurrency cap
        type Lookup = {
          slug: string;
          name: string;
          set: string;
          count: number;
        };
        type ResolvedEntry = { lookup: Lookup; result: SearchResult | null };
        const resolvedEntries: ResolvedEntry[] = [];
        const slugPrefixToSet: Record<string, string> = {
          alp: "Alpha",
          bet: "Beta",
          art: "Arthurian Legends",
          dra: "Dragonlord",
          drl: "Dragonlord",
        };
        const deriveSetHint = (card: DraftCardLike): string => {
          const withName =
            typeof card.setName === "string" ? card.setName.trim() : "";
          if (withName) return withName;
          const withSet = (() => {
            const raw = (card as Record<string, unknown>).set;
            return typeof raw === "string" ? raw.trim() : "";
          })();
          if (withSet) return withSet;
          const slug =
            typeof card.slug === "string" ? card.slug.toLowerCase() : "";
          if (slug.length >= 4 && slugPrefixToSet[slug.slice(0, 3)]) {
            return slugPrefixToSet[slug.slice(0, 3)];
          }
          return "";
        };

        // Build unique lookup queries while tracking duplicate counts
        const dedup = new Map<string, Lookup>();
        for (const c of drafted) {
          const slug = (c.slug || "").toString().trim();
          const name = (c.name || c.cardName || "").toString().trim();
          const set = deriveSetHint(c);
          if (!slug && !name) continue;
          const key = slug ? `slug:${slug}:${set}` : `name:${name}:${set}`;
          const existing = dedup.get(key);
          if (existing) {
            existing.count += 1;
          } else {
            dedup.set(key, { slug, name, set, count: 1 });
          }
        }

        // Small concurrency runner to avoid spamming the API
        const lookupEntries = Array.from(dedup.values());
        const cumulativeCounts: number[] = [];
        lookupEntries.forEach((entry, index) => {
          const prevTotal = index > 0 ? cumulativeCounts[index - 1] : 0;
          cumulativeCounts[index] = prevTotal + Math.max(entry.count, 0);
        });

        setDraftLoadProgress({
          processed: 0,
          total: totalDraftedCards,
          inProgress: totalDraftedCards > 0,
        });

        const tasks = lookupEntries.map((q) => async () => {
          try {
            const result = await fetchSearchResult({
              slug: q.slug,
              name: q.name,
              set: q.set,
            });
            return { lookup: q, result } as ResolvedEntry;
          } catch {
            return { lookup: q, result: null } as ResolvedEntry;
          }
        });
        const runInBatches = async <T,>(
          fns: Array<() => Promise<T>>,
          limit = 8,
          onProgress?: (done: number, total: number) => void
        ) => {
          const out: T[] = [];
          let idx = 0;
          let done = 0;
          const total = fns.length;
          const workers = new Array(Math.min(limit, fns.length))
            .fill(0)
            .map(async () => {
              while (idx < fns.length) {
                const cur = idx++;
                try {
                  const v = await fns[cur]();
                  out.push(v);
                } catch {
                  // ignore individual failures
                }
                done += 1;
                if (onProgress) onProgress(done, total);
              }
            });
          await Promise.all(workers);
          return out;
        };

        const lookupConcurrencyCap = Math.max(
          4,
          Math.min(
            24,
            Number(process.env.NEXT_PUBLIC_EDITOR_LOOKUP_CONCURRENCY ?? "12")
          )
        );
        // Initialize progress indicator
        const hits = await runInBatches<ResolvedEntry>(
          tasks,
          lookupConcurrencyCap,
          (done) => {
            const cardsResolved =
              done <= 0
                ? 0
                : cumulativeCounts[
                    Math.min(done, cumulativeCounts.length) - 1
                  ] ?? 0;
            setDraftLoadProgress({
              processed: Math.min(cardsResolved, totalDraftedCards),
              total: totalDraftedCards,
              inProgress: cardsResolved < totalDraftedCards,
            });
          }
        );
        for (const entry of hits) {
          if (!entry) continue;
          if (entry.result) {
            resolvedEntries.push(entry);
          } else {
            console.warn(
              "[Draft Init] Failed to resolve drafted card lookup",
              entry.lookup
            );
          }
        }

        if (resolvedEntries.length === 0) {
          setError("Could not resolve drafted cards to known card data.");
          setDraftInitDone(true);
          return;
        }

        // Batch update picks to include all drafted cards in sideboard (not deck)
        // IMPORTANT: Preserve any existing picks (like Standard Cards) that may have been added
        const expandedResolved: SearchResult[] = [];
        setPicks((prev) => {
          const next = { ...prev } as Record<PickKey, PickItem>;
          console.log(
            `[Draft Init] Preserving ${Object.keys(prev).length} existing picks`
          );

          for (const { lookup, result } of resolvedEntries) {
            if (!result) continue;
            const copies = Math.max(lookup.count, 1);
            for (let i = 0; i < copies; i++) {
              // All draft picks should start in sideboard, not directly in deck zones
              const zone: Zone = "Sideboard";
              const key = `${result.cardId}:${zone}:${
                result.variantId ?? "x"
              }` as PickKey;
              const exists = next[key];
              next[key] = exists
                ? { ...exists, count: exists.count + 1 }
                : {
                    cardId: result.cardId,
                    variantId: result.variantId ?? null,
                    name: result.cardName,
                    type: result.type,
                    slug: result.slug,
                    zone,
                    count: 1,
                    set: result.set,
                  };
              expandedResolved.push(result);
            }
          }
          console.log(
            `[Draft Init] After adding drafted cards: ${
              Object.keys(next).length
            } total picks`
          );
          return next;
        });

        // Cache resolved results for future reloads (preserves duplicate counts)
        try {
          if (expandedResolved.length > 0) {
            const resolvedKey = `draftedCardsResolved_${storageSuffix}`;
            localStorage.setItem(resolvedKey, JSON.stringify(expandedResolved));
            if (playerIdParam) {
              localStorage.setItem(
                `draftedCardsResolved_${draftId}`,
                JSON.stringify(expandedResolved)
              );
            }
          }
        } catch (storageError) {
          console.warn(
            "[Draft Init] Unable to cache resolved draft cards",
            storageError
          );
        }

        // Infer deck set from majority of resolved hits for better metadata/search defaults
        const counts = new Map<string, number>();
        for (const r of expandedResolved)
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
        if (!deckName || deckName === "New Deck") {
          const matchName = searchParams?.get("matchName");
          setDeckName(matchName || "Draft Deck");
        }
      } catch (e) {
        console.error("Draft initialization failed:", e);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setDraftLoadProgress((p) => ({
          processed: totalDraftedCards || p.processed,
          total: totalDraftedCards || p.total,
          inProgress: false,
        }));
        setDraftInitDone(true);
      }
    })();
  }, [
    searchParams,
    draftInitDone,
    addSearchResultsToSideboard,
    deckName,
    setName,
    fetchSearchResult,
  ]);

  useEffect(() => {
    const draft = searchParams?.get("draft");
    const matchId = searchParams?.get("matchId");
    const sessionId = searchParams?.get("sessionId");
    const draftId = matchId || sessionId;

    if (draft !== "true" || !draftId) {
      setCubeStandardCards([]);
      return;
    }

    let raw: string | null = null;
    try {
      raw = localStorage.getItem(`draftConfig_${draftId}`);
    } catch {
      raw = null;
    }
    if (!raw) {
      console.log(
        "[Cube Extras] No draftConfig found in localStorage for:",
        draftId
      );
      setCubeStandardCards([]);
      return;
    }

    type StoredDraftConfig = {
      cubeId?: string | null;
      cubeName?: string | null;
      includeCubeSideboardInStandard?: boolean;
    };

    let cfg: StoredDraftConfig | null = null;
    try {
      const parsed = JSON.parse(raw) as StoredDraftConfig;
      cfg = parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      cfg = null;
    }

    console.log("[Cube Extras] Loaded draftConfig:", cfg);

    if (!cfg?.cubeId || !cfg.includeCubeSideboardInStandard) {
      console.log("[Cube Extras] Skipping cube extras:", {
        hasCubeId: !!cfg?.cubeId,
        includeCubeSideboardInStandard: cfg?.includeCubeSideboardInStandard,
      });
      setCubeStandardCards([]);
      return;
    }

    const cubeId = cfg.cubeId;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/cubes/${encodeURIComponent(cubeId)}`);
        if (!res.ok) {
          if (!cancelled) setCubeStandardCards([]);
          return;
        }
        const payload = (await res.json()) as {
          cards?: Array<{
            cardId: number;
            variantId: number | null;
            setId: number | null;
            count: number;
            name: string;
            slug: string | null;
            setName: string | null;
            type: string | null;
            rarity: string | null;
            zone?: string | null;
          }>;
        };

        const rawCards = Array.isArray(payload?.cards) ? payload.cards : [];
        const sideboardCards = rawCards.filter(
          (c) => (c.zone ?? "main").toLowerCase() === "sideboard"
        );

        const converted: SearchResult[] = [];
        for (const c of sideboardCards) {
          const sr = convertCardDataToSearchResult(
            {
              slug: typeof c.slug === "string" ? c.slug : "",
              cardName: c.name,
              set: c.setName ?? "Beta",
              cardId: c.cardId,
              variantId: c.variantId ?? undefined,
              finish: "Standard",
              product: "Draft",
              type: c.type,
              rarity: c.rarity,
            } as unknown as Record<string, unknown>,
            c.setName ?? "Beta"
          );
          if (sr) converted.push(sr);
        }

        if (!cancelled) {
          setCubeStandardCards(converted);
        }
      } catch {
        if (!cancelled) setCubeStandardCards([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParamsKey, searchParams, convertCardDataToSearchResult]);

  // (moved) Load deck from URL parameter after loadDeck is declared

  // Tab state for cards view - default to "Your Deck"
  const [cardsTab, setCardsTab] = useState<"deck" | "all">("deck");

  // Feedback message system
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  // Tournament legal controls visibility
  const [tournamentControlsMode, setTournamentControlsMode] = useState<
    "standard" | "cube" | null
  >(null);
  const tournamentControlsVisible = tournamentControlsMode !== null;

  // Context menu for card move actions (deck/sideboard/collection)
  const [contextMenu, setContextMenu] = useState<{
    cardId: number;
    cardName: string;
    x: number;
    y: number;
    deckCards: Pick3D[];
    sideboardCards: Pick3D[];
    collectionCopies: number;
    totalCollection: number;
  } | null>(null);

  const [metaByCardId, setMetaByCardId] = useState<Record<number, CardMeta>>(
    {}
  );

  // Convert picks to Pick3D format (exact same structure as draft-3d)
  const [pick3D, setPick3D] = useState<Pick3D[]>([]);
  const [, setNextPickId] = useState(1);

  // Open move context menu for a given card at screen coords
  const openContextMenuForCard = useCallback(
    (cardId: number, cardName: string, clientX: number, clientY: number) => {
      const deckCards = pick3D.filter(
        (p) => p.card.cardId === cardId && p.zone === "Deck"
      );
      const sideboardCards = pick3D.filter(
        (p) => p.card.cardId === cardId && p.zone === "Sideboard"
      );
      let collectionCopies = 0;
      let totalCollection = 0;
      for (const item of Object.values(picks)) {
        if (item.zone !== "Collection") continue;
        totalCollection += item.count;
        if (item.cardId === cardId) collectionCopies += item.count;
      }
      // Always open context menu; available actions depend on which zones have copies
      setContextMenu({
        cardId,
        cardName,
        x: clientX,
        y: clientY,
        deckCards,
        sideboardCards,
        collectionCopies,
        totalCollection,
      });
    },
    [pick3D, picks]
  );

  // Hover preview state (modeled after match Board hover behavior)
  const [hoverPreview, setHoverPreview] = useState<CardPreviewData | null>(
    null
  );
  const hoverPreviewSourceRef = useRef<string | null>(null);
  const hoverPreviewClearTimerRef = useRef<number | null>(null);

  const beginHoverPreview = useCallback(
    (card: CardPreviewData | null | undefined, sourceKey?: string | null) => {
      if (hoverPreviewClearTimerRef.current) {
        window.clearTimeout(hoverPreviewClearTimerRef.current);
        hoverPreviewClearTimerRef.current = null;
      }
      if (!card) return;
      hoverPreviewSourceRef.current = sourceKey ?? null;
      setHoverPreview(card);
    },
    []
  );

  const clearHoverPreview = useCallback((sourceKey?: string | null) => {
    if (
      sourceKey &&
      hoverPreviewSourceRef.current &&
      sourceKey !== hoverPreviewSourceRef.current
    ) {
      return;
    }
    if (hoverPreviewClearTimerRef.current) {
      window.clearTimeout(hoverPreviewClearTimerRef.current);
      hoverPreviewClearTimerRef.current = null;
    }
    hoverPreviewSourceRef.current = null;
    setHoverPreview(null);
  }, []);

  const clearHoverPreviewDebounced = useCallback(
    (sourceKey?: string | null, delay = 60) => {
      if (hoverPreviewClearTimerRef.current) {
        window.clearTimeout(hoverPreviewClearTimerRef.current);
        hoverPreviewClearTimerRef.current = null;
      }
      hoverPreviewClearTimerRef.current = window.setTimeout(() => {
        hoverPreviewClearTimerRef.current = null;
        clearHoverPreview(sourceKey);
      }, Math.max(0, delay)) as unknown as number;
    },
    [clearHoverPreview]
  );

  // Cleanup hover timer on unmount
  useEffect(() => {
    return () => {
      if (hoverPreviewClearTimerRef.current) {
        window.clearTimeout(hoverPreviewClearTimerRef.current);
        hoverPreviewClearTimerRef.current = null;
      }
    };
  }, []);

  // Stable callback refs for 3D card hover (prevents re-renders when passing to memoized cards)
  const beginHoverPreviewRef = useRef(beginHoverPreview);
  beginHoverPreviewRef.current = beginHoverPreview;
  const clearHoverPreviewDebouncedRef = useRef(clearHoverPreviewDebounced);
  clearHoverPreviewDebouncedRef.current = clearHoverPreviewDebounced;

  // Track currently hovered slug to dedupe rapid pointer move events
  const currentHoverSlugRef = useRef<string | null>(null);

  // Stable hover callbacks that don't change reference - critical for memoized DraggableCard3D
  const stableOnHoverStart = useCallback(
    (card: { slug: string; name: string; type: string | null }) => {
      // Dedupe: only update if the hovered card actually changed
      if (currentHoverSlugRef.current === card.slug) return;
      currentHoverSlugRef.current = card.slug;
      beginHoverPreviewRef.current(
        { slug: card.slug, name: card.name, type: card.type },
        `card:${card.slug}`
      );
    },
    []
  );

  const stableOnHoverEnd = useCallback(() => {
    currentHoverSlugRef.current = null;
    clearHoverPreviewDebouncedRef.current(null, 20);
  }, []);

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

    // Deck / sideboard counts from picks
    for (const item of Object.values(picks)) {
      if (item.zone === "Deck") res.deck += item.count;
      else if (item.zone === "Sideboard") res.sideboard += item.count;
    }

    // Type counts should reflect only cards currently in the deck
    for (const p of pick3D) {
      if (p.zone !== "Deck") continue;
      const meta = metaByCardId[p.card.cardId];
      const category = categorizeCard(p.card, meta);
      if (category === "creatures") res.creatures += 1;
      else if (category === "spells") res.spells += 1;
      else if (category === "sites") res.sites += 1;
      else if (category === "avatars") res.avatars += 1;
    }

    return res;
  }, [pick3D, picks, metaByCardId]);

  const { collectionCount, collectionCountsByCardId } = useMemo(() => {
    const counts: Record<number, number> = {};
    let total = 0;
    for (const item of Object.values(picks)) {
      if (item.zone !== "Collection") continue;
      const current = counts[item.cardId] ?? 0;
      const next = current + item.count;
      counts[item.cardId] = next;
      total += item.count;
    }
    return { collectionCount: total, collectionCountsByCardId: counts };
  }, [picks]);

  const yourCounts = useMemo(() => {
    // Build counts from pick3D to preserve visual order on board
    // This ensures cards appear in YourDeckList in the same order they appear on the board
    const seenCards = new Set<number>();
    const counts: Array<{ cardId: number; name: string; count: number }> = [];

    for (const p of pick3D) {
      if (!seenCards.has(p.card.cardId)) {
        seenCards.add(p.card.cardId);
        const count = pick3D.filter(
          (item) => item.card.cardId === p.card.cardId
        ).length;
        counts.push({
          cardId: p.card.cardId,
          name: p.card.cardName,
          count,
        });
      }
    }

    return counts;
  }, [pick3D]);

  const manaCurve = useMemo(() => {
    const curve: Record<number, number> = {};
    for (const p of pick3D) {
      if (p.zone !== "Deck") continue; // deck zone only
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
      if (p.zone !== "Deck") continue; // deck zone only
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

  const moveOneFromDeckToCollection = useCallback(
    (cardId: number) => {
      if (collectionCount >= 10) {
        setFeedbackMessage("Collection is full (maximum 10 cards)");
        setTimeout(() => setFeedbackMessage(null), 2000);
        return;
      }

      // Move one visible copy from Deck to Collection in 3D layout
      setPick3D((prev) => {
        const updated = [...prev];
        const idx = updated.findIndex(
          (p) => p.card.cardId === cardId && p.zone === "Deck"
        );
        if (idx === -1) return prev;
        const card = updated[idx];
        updated[idx] = {
          ...card,
          x: card.x,
          z: card.z,
          y: undefined,
          zone: "Collection",
        };
        return updated;
      });

      // Sync logical picks: Deck → Collection
      setPicks((prev) => {
        const next = { ...prev } as Record<PickKey, PickItem>;
        for (const [key, item] of Object.entries(next)) {
          if (
            item.cardId === cardId &&
            item.zone === "Deck" &&
            item.count > 0
          ) {
            const variantId = item.variantId ?? undefined;

            if (item.count > 1) {
              next[key] = { ...item, count: item.count - 1 };
            } else {
              delete next[key];
            }

            const collectionKey = `${cardId}:Collection:${
              variantId ?? "x"
            }` as PickKey;
            const existing = next[collectionKey];
            next[collectionKey] = existing
              ? { ...existing, count: existing.count + 1 }
              : {
                  cardId,
                  variantId: variantId ?? null,
                  name: item.name,
                  type: item.type,
                  slug: item.slug,
                  zone: "Collection" as Zone,
                  count: 1,
                  set: item.set,
                };
            break;
          }
        }
        return next;
      });
    },
    [collectionCount]
  );

  const moveOneFromSideboardToCollection = useCallback(
    (cardId: number) => {
      if (collectionCount >= 10) {
        setFeedbackMessage("Collection is full (maximum 10 cards)");
        setTimeout(() => setFeedbackMessage(null), 2000);
        return;
      }

      // Keep 3D layout in sync: move one visible copy from Sideboard to Collection
      setPick3D((prev) => {
        const updated = [...prev];
        const idx = updated.findIndex(
          (p) => p.card.cardId === cardId && p.zone === "Sideboard"
        );
        if (idx === -1) return prev;
        const card = updated[idx];
        updated[idx] = {
          ...card,
          // Precise placement will be handled by the Collection fan layout
          x: card.x,
          z: card.z,
          y: undefined,
          zone: "Collection",
        };
        return updated;
      });

      setPicks((prev) => {
        const next = { ...prev } as Record<PickKey, PickItem>;
        for (const [key, item] of Object.entries(next)) {
          if (
            item.cardId === cardId &&
            item.zone === "Sideboard" &&
            item.count > 0
          ) {
            const variantId = item.variantId ?? undefined;

            if (item.count > 1) {
              next[key] = { ...item, count: item.count - 1 };
            } else {
              delete next[key];
            }

            const collectionKey = `${cardId}:Collection:${
              variantId ?? "x"
            }` as PickKey;
            const existing = next[collectionKey];
            next[collectionKey] = existing
              ? { ...existing, count: existing.count + 1 }
              : {
                  cardId,
                  variantId: variantId ?? null,
                  name: item.name,
                  type: item.type,
                  slug: item.slug,
                  zone: "Collection" as Zone,
                  count: 1,
                  set: item.set,
                };
            break;
          }
        }
        return next;
      });
    },
    [collectionCount]
  );

  const moveOneFromCollectionToSideboard = useCallback(
    (cardId: number) => {
      // Update 3D layout: move one visible copy from Collection back to Sideboard
      setPick3D((prev) => {
        const updated = [...prev];
        const idx = updated.findIndex(
          (p) => p.card.cardId === cardId && p.zone === "Collection"
        );
        if (idx === -1) return prev;
        const card = updated[idx];
        const newZ = isSortingEnabled ? 1.5 + Math.random() * 0.5 : card.z;
        const newX = isSortingEnabled ? 0.5 + Math.random() * 3 : card.x;
        updated[idx] = {
          ...card,
          x: newX,
          z: newZ,
          y: undefined,
          zone: "Sideboard",
        };
        return updated;
      });

      setPicks((prev) => {
        const next = { ...prev } as Record<PickKey, PickItem>;
        for (const [key, item] of Object.entries(next)) {
          if (
            item.cardId === cardId &&
            item.zone === "Collection" &&
            item.count > 0
          ) {
            const variantId = item.variantId ?? undefined;

            if (item.count > 1) {
              next[key] = { ...item, count: item.count - 1 };
            } else {
              delete next[key];
            }

            const sideboardKey = `${cardId}:Sideboard:${
              variantId ?? "x"
            }` as PickKey;
            const existing = next[sideboardKey];
            next[sideboardKey] = existing
              ? { ...existing, count: existing.count + 1 }
              : {
                  cardId,
                  variantId: variantId ?? null,
                  name: item.name,
                  type: item.type,
                  slug: item.slug,
                  zone: "Sideboard" as Zone,
                  count: 1,
                  set: item.set,
                };
            break;
          }
        }
        return next;
      });
    },
    [isSortingEnabled]
  );

  const moveOneFromCollectionToDeck = useCallback(
    (cardId: number) => {
      // Update 3D layout: move one visible copy from Collection back to Deck
      setPick3D((prev) => {
        const updated = [...prev];
        const idx = updated.findIndex(
          (p) => p.card.cardId === cardId && p.zone === "Collection"
        );
        if (idx === -1) return prev;
        const card = updated[idx];
        const newZ = isSortingEnabled ? -1.5 - Math.random() * 0.5 : card.z;
        const newX = isSortingEnabled ? -2 + Math.random() * 4 : card.x;
        updated[idx] = {
          ...card,
          x: newX,
          z: newZ,
          y: undefined,
          zone: "Deck",
        };
        return updated;
      });

      setPicks((prev) => {
        const next = { ...prev } as Record<PickKey, PickItem>;
        for (const [key, item] of Object.entries(next)) {
          if (
            item.cardId === cardId &&
            item.zone === "Collection" &&
            item.count > 0
          ) {
            const variantId = item.variantId ?? undefined;

            if (item.count > 1) {
              next[key] = { ...item, count: item.count - 1 };
            } else {
              delete next[key];
            }

            const deckKey = `${cardId}:Deck:${variantId ?? "x"}` as PickKey;
            const existing = next[deckKey];
            next[deckKey] = existing
              ? { ...existing, count: existing.count + 1 }
              : {
                  cardId,
                  variantId: variantId ?? null,
                  name: item.name,
                  type: item.type,
                  slug: item.slug,
                  zone: "Deck" as Zone,
                  count: 1,
                  set: item.set,
                };
            break;
          }
        }
        return next;
      });
    },
    [isSortingEnabled]
  );

  // Basic add-card helpers for the search UI
  const addCardAuto = useCallback(
    (r: SearchResult) => {
      // Always add to deck, not sideboard
      const zone: Zone = "Deck";
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
        if (p.zone !== "Deck") continue; // only deck zone
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

      // Build cards payload from logical picks (Deck / Atlas / Spellbook / Collection / Sideboard)
      const agg = new Map<
        string,
        { cardId: number; zone: ApiZone; count: number; variantId?: number }
      >();
      for (const item of Object.values(picks)) {
        const t = (item.type || "").toLowerCase();
        let apiZone: ApiZone;
        if (item.zone === "Collection") {
          apiZone = "Collection";
        } else if (item.zone === "Sideboard") {
          apiZone = "Sideboard";
        } else {
          apiZone = t.includes("site") ? "Atlas" : "Spellbook";
        }
        const variantId = item.variantId ?? undefined; // preserve 0 as valid key
        const key = `${item.cardId}:${apiZone}:${variantId ?? "x"}`;
        const prev = agg.get(key);
        if (prev) {
          prev.count += item.count;
        } else {
          agg.set(key, {
            cardId: item.cardId,
            zone: apiZone,
            count: item.count,
            variantId,
          });
        }
      }

      // Enforce collection capacity client-side as well (server also validates)
      let collectionCount = 0;
      for (const v of agg.values()) {
        if (v.zone === "Collection") collectionCount += v.count;
      }
      if (collectionCount > 10) {
        throw new Error(
          "Collection invalid. Maximum 10 cards allowed (current: " +
            collectionCount +
            ")"
        );
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
        // Generate meaningful deck name using match/lobby info when available
        const matchName = searchParams?.get("matchName");
        const lobbyName = searchParams?.get("lobbyName");
        const gameName = matchName || lobbyName;

        const finalDeckName = isSealed
          ? gameName
            ? `${gameName} (Sealed)`
            : `Sealed Deck ${new Date().toLocaleDateString()}`
          : isDraftMode
          ? gameName
            ? `${gameName} (Draft)`
            : `Draft Deck ${new Date().toLocaleDateString()}`
          : gameName
          ? `${gameName} (Constructed)`
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
          const res2 = await fetch("/api/decks", {
            credentials: "include",
            cache: "no-store",
          });
          const list = await res2.json();
          if (res2.ok) setDecks(list.myDecks || []);
        } catch {}
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
      // auto-clear success message after a short delay
      setTimeout(() => setSaveMsg(null), 1500);
    }
  }, [
    pick3D,
    picks,
    deckId,
    deckName,
    isDraftMode,
    setName,
    isSealed,
    status,
    searchParams,
  ]);

  // Toggle deck public/private status
  const togglePublic = useCallback(
    async (isPublic: boolean) => {
      if (status !== "authenticated" || !deckId) return;
      try {
        setSaving(true);
        const res = await fetch(`/api/decks/${encodeURIComponent(deckId)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ isPublic }),
        });
        if (!res.ok) throw new Error("Failed to update deck visibility");
        setDeckIsPublic(isPublic);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setSaving(false);
      }
    },
    [deckId, status]
  );

  // Submit sealed deck to match server or tournament preparation when in tournament mode
  const submitSealedDeck = useCallback(async () => {
    if (!isSealed) return;

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
        if (p.zone !== "Deck") continue; // only deck zone
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
        deckZoneCards: pick3D.filter((p) => p.zone === "Deck").length,
      });

      if (!(avatar === 1 && atlas >= 12 && spellbookNonAvatar >= 24)) {
        throw new Error(
          `Deck invalid. Current: ${avatar} Avatar, ${atlas} Atlas, ${spellbookNonAvatar} Spellbook. Required: 1 Avatar, Atlas >= 12, Spellbook >= 24 (excl. Avatar & Sites)`
        );
      }

      // Convert 3D picks to simple card array for sealed submission
      const deckCards = pick3D
        .filter((p) => p.zone === "Deck") // only deck zone
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
      const matchName = searchParams?.get("matchName");
      const sealedDeckName = matchName
        ? `${matchName} (Sealed)`
        : `sealed_opponent_${today}`;
      setDeckName(sealedDeckName);

      // Determine submission mode (match vs tournament)
      const matchId = searchParams?.get("matchId");
      const tournamentId = searchParams?.get("tournament");

      // Ensure the "Standard cards" overlay is closed and show the submission overlay
      try {
        setTournamentControlsMode(null);
      } catch {}
      setWaitingOverlayStage("submitting");
      setWaitingForOtherPlayers(true);

      if (tournamentId && !matchId) {
        // Tournament submission workflow
        // Group by cardId to build tournament deckList format
        const counts = new Map<number, number>();
        for (const c of deckCards) {
          counts.set(c.cardId, (counts.get(c.cardId) || 0) + 1);
        }
        const deckList = Array.from(counts.entries()).map(
          ([cardId, quantity]) => ({ cardId: String(cardId), quantity })
        );

        // Submit to tournament preparation API
        const res = await fetch(
          `/api/tournaments/${encodeURIComponent(
            tournamentId
          )}/preparation/submit`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              preparationData: {
                sealed: {
                  packsOpened: true,
                  deckBuilt: true,
                  deckList,
                },
              },
            }),
          }
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(
            err?.error || "Failed to submit tournament sealed deck"
          );
        }

        // Mark local submission for UX consistency
        try {
          localStorage.setItem(
            `sealed_submitted_tournament_${tournamentId}`,
            "true"
          );
        } catch {}
        setWaitingOverlayStage("waiting");
      } else if (matchId) {
        // Match-based submission workflow
        // Mark deck as submitted to prevent redirect loop
        try {
          localStorage.setItem(`sealed_submitted_${matchId}`, "true");
        } catch {}

        // Submit to match server using postMessage to parent window (online match page)
        if (window.opener) {
          window.opener.postMessage(
            {
              type: "sealedDeckSubmission",
              deck: deckCards,
              matchId,
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
        setWaitingOverlayStage("waiting");
      } else {
        throw new Error(
          "Missing match ID or tournament ID for sealed submission"
        );
      }

      // Save to account in the background (do not block submission UX)
      saveDeck().catch(() => {});

      setSaveMsg(
        tournamentId
          ? "Submitting deck to tournament…"
          : "Sealed deck submitted successfully!"
      );

      // Toast notification
      try {
        localStorage.setItem("app:toast", "Sealed deck submitted!");
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("app:toast", {
              detail: { message: "Sealed deck submitted!" },
            })
          );
        }
      } catch {}

      // Navigate back to tournament or match page
      if (tournamentId && !matchId) {
        setTimeout(() => {
          window.location.href = `/tournaments/${encodeURIComponent(
            tournamentId
          )}`;
        }, 1200);
      } else if (matchId) {
        // Multiple attempts for match page navigation (handles popup window edge cases)
        goBackToMatch(matchId);
        window.setTimeout(() => goBackToMatch(matchId), 1200);
        window.setTimeout(() => goBackToMatch(matchId), 3500);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setWaitingForOtherPlayers(false);
    } finally {
      setSaving(false);
    }
  }, [
    isSealed,
    pick3D,
    searchParams,
    saveDeck,
    setName,
    metaByCardId,
    goBackToMatch,
  ]);

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
        .filter((p) => p.zone === "Deck") // only deck zone
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
      const matchName = searchParams?.get("matchName");
      // Prefer lobby/match name when available
      const draftDeckName = matchName
        ? `${matchName} (Draft)`
        : `Draft Deck (${today})`;
      setDeckName(draftDeckName);

      const matchId = searchParams?.get("matchId");
      const tournamentId = searchParams?.get("tournament");

      // Ensure the "Standard cards" overlay is closed and show the submission overlay
      try {
        setTournamentControlsMode(null);
      } catch {}
      setWaitingOverlayStage("submitting");
      setWaitingForOtherPlayers(true);

      if (tournamentId && !matchId) {
        // Tournament submission workflow
        // Group by cardId to build tournament deckList format
        const counts = new Map<number, number>();
        for (const c of deckCards) {
          counts.set(c.cardId, (counts.get(c.cardId) || 0) + 1);
        }
        const deckList = Array.from(counts.entries()).map(
          ([cardId, quantity]) => ({ cardId: String(cardId), quantity })
        );

        // Submit to tournament preparation API (draft)
        const res = await fetch(
          `/api/tournaments/${encodeURIComponent(
            tournamentId
          )}/preparation/submit`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              preparationData: {
                draft: {
                  draftCompleted: true,
                  deckBuilt: true,
                  deckList,
                },
              },
            }),
          }
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(
            err?.error || "Failed to submit tournament draft deck"
          );
        }
        try {
          localStorage.setItem(
            `draft_submitted_tournament_${tournamentId}`,
            "true"
          );
        } catch {}
        setWaitingOverlayStage("waiting");
      } else if (matchId) {
        // Match-based submission workflow
        // Mark deck as submitted to prevent redirect loop
        try {
          localStorage.setItem(`draft_submitted_${matchId}`, "true");
        } catch {}

        // Submit to match server using postMessage to parent window
        if (window.opener) {
          window.opener.postMessage(
            {
              type: "draftDeckSubmission",
              deck: deckCards,
              matchId,
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
        setWaitingOverlayStage("waiting");
      } else {
        throw new Error(
          "Missing match ID or tournament ID for draft submission"
        );
      }

      // Save to account in the background (do not block submission UX)
      try {
        void saveDeck();
      } catch {}

      setSaveMsg(
        tournamentId
          ? "Submitting draft deck to tournament…"
          : "Draft deck submitted successfully!"
      );

      // Toast notification
      try {
        localStorage.setItem("app:toast", "Draft deck submitted!");
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("app:toast", {
              detail: { message: "Draft deck submitted!" },
            })
          );
        }
      } catch {}

      // Navigate back to tournament or match page
      if (tournamentId && !matchId) {
        setTimeout(() => {
          window.location.href = `/tournaments/${encodeURIComponent(
            tournamentId
          )}`;
        }, 1200);
      } else if (matchId) {
        // Multiple attempts for match page navigation (handles popup window edge cases)
        goBackToMatch(matchId);
        window.setTimeout(() => goBackToMatch(matchId), 1200);
        window.setTimeout(() => goBackToMatch(matchId), 3500);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setWaitingForOtherPlayers(false);
    } finally {
      setSaving(false);
    }
  }, [
    isDraftMode,
    pick3D,
    searchParams,
    saveDeck,
    setName,
    metaByCardId,
    goBackToMatch,
  ]);

  const loadDeck = useCallback(
    async (id: string) => {
      if (status !== "authenticated") return;
      setDeckId(id);
      try {
        const res = await fetch(`/api/decks/${id}`, {
          credentials: "include",
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Failed to load deck");

        // Populate deck metadata
        if (typeof data?.name === "string") setDeckName(data.name);
        if (typeof data?.isPublic === "boolean") setDeckIsPublic(data.isPublic);
        if (typeof data?.isOwner === "boolean") setDeckIsOwner(data.isOwner);
        if (typeof data?.userName === "string")
          setDeckCreatorName(data.userName);

        // Build picks from zones (Spellbook/Atlas/Collection/Sideboard)
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
        // Map API zones to logical editor zones
        addZone("Deck", data?.atlas as ApiCardRef[]);
        addZone("Deck", data?.spellbook as ApiCardRef[]);
        addZone("Collection", data?.collection as ApiCardRef[]);
        addZone("Sideboard", data?.sideboard as ApiCardRef[]);
        setPicks(next);

        // Optional: prime metaByCardId with thresholds for sorting/grouping
        const meta: Record<number, CardMeta> = {};
        const all: ApiCardRef[] = [
          ...(Array.isArray(data?.atlas) ? (data.atlas as ApiCardRef[]) : []),
          ...(Array.isArray(data?.spellbook)
            ? (data.spellbook as ApiCardRef[])
            : []),
          ...(Array.isArray(data?.collection)
            ? (data.collection as ApiCardRef[])
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

  // Create a private copy of a public deck
  const makeCopy = useCallback(async () => {
    if (status !== "authenticated" || !deckId) {
      setError("Cannot copy deck.");
      return;
    }
    try {
      setSaving(true);
      setError(null);

      const res = await fetch(`/api/decks/${encodeURIComponent(deckId)}/copy`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to copy deck");

      // Load the new copy in the editor
      await loadDeck(data.id);
      setSaveMsg("Private copy created!");

      // Refresh deck list
      try {
        const res2 = await fetch("/api/decks", { credentials: "include" });
        if (res2.ok) {
          const data = await res2.json();
          setDecks(data.myDecks || []);
        }
      } catch {}
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [deckId, status, loadDeck]);

  // Load deck from URL parameter (for draft completion and regular editing)
  useEffect(() => {
    const deckIdParam = searchParams?.get("id");
    const fromDraft = searchParams?.get("from") === "draft";

    if (deckIdParam && status === "authenticated" && !deckId) {
      console.log("Loading deck from URL parameter:", deckIdParam, {
        fromDraft,
      });
      loadDeck(deckIdParam);
    }
  }, [searchParams, status, deckId, loadDeck]);

  const clearEditor = useCallback(() => {
    setDeckId(null);
    setDeckName("New Deck");
    setDeckIsPublic(false);
    setDeckIsOwner(true);
    setDeckCreatorName(null);
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
        const r = res.ok ? pickStandardSiteResult(data, name) : null;
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
        let resolved = packCardCacheRef.current[pack.id];
        if (!resolved) {
          resolved = await resolveCardsForPack(pack);
        }
        if (!resolved || resolved.length === 0) {
          setError("Pack data unavailable. Please try again in a moment.");
          return;
        }
        addSearchResultsToSideboard(resolved);
        // Mark pack as opened; keep existing cards array
        setPacks((prev) =>
          prev.map((p) => (p.id === packId ? { ...p, opened: true } : p))
        );
      } catch (e) {
        console.error("Pack opening error:", e);
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [packs, resolveCardsForPack, addSearchResultsToSideboard]
  );

  const openAllPacks = useCallback(async () => {
    if (bulkOpenInProgress) return;
    const unopened = packs.filter((p) => !p.opened);
    if (!unopened.length) return;

    setBulkOpenInProgress(true);
    try {
      for (const pack of unopened) {
        let resolved = packCardCacheRef.current[pack.id];
        if (!resolved) {
          resolved = await resolveCardsForPack(pack);
        }
        if (resolved && resolved.length > 0) {
          addSearchResultsToSideboard(resolved);
          setPacks((prev) =>
            prev.map((p) => (p.id === pack.id ? { ...p, opened: true } : p))
          );
        }
      }
    } catch (err) {
      console.error("Bulk pack open failed", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to open all packs. Please try again."
      );
    } finally {
      setBulkOpenInProgress(false);
    }
  }, [
    bulkOpenInProgress,
    packs,
    resolveCardsForPack,
    addSearchResultsToSideboard,
    setPacks,
  ]);

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
  const nextRenderOrder = useRef(9000);

  // Track interaction order for unstacked mode - maps cardId to layer index
  const [cardLayerOrder, setCardLayerOrder] = useState<Map<number, number>>(
    new Map()
  );
  const nextLayerIndex = useRef(0);

  const getTopRenderOrder = useCallback(() => {
    // Always use high temporary render order for dragging (both stacked and unstacked modes)
    // This ensures dragged cards appear above all other cards during interaction
    return 9999;
  }, []);

  // Bring a card to the front (highest layer)
  const bringCardToFront = useCallback(
    (cardId: number) => {
      if (isSortingEnabled) return; // Only applies to unstacked mode
      setCardLayerOrder((prev) => {
        const newMap = new Map(prev);
        newMap.set(cardId, nextLayerIndex.current++);
        return newMap;
      });
    },
    [isSortingEnabled]
  );

  // Reset render orders when sorting is toggled to ensure proper stacking
  useEffect(() => {
    if (isSortingEnabled) {
      nextRenderOrder.current = 1500; // Reset base render order
    } else {
      // Reset layer order when entering unstacked mode
      nextLayerIndex.current = 0;
      setCardLayerOrder(new Map());
    }
  }, [isSortingEnabled]); // Only reset when sorting is toggled, not when cards change

  // Click dedupe guard: avoid multiple toggles when overlapping instances receive the same click
  const cardClickGuardRef = useRef<Map<number, number>>(new Map());

  // Create sorted stack positions using the shared utility
  const stackPositions = useMemo(() => {
    return computeStackPositions(pick3D, metaByCardId, isSortingEnabled);
  }, [pick3D, isSortingEnabled, metaByCardId]);

  // Calculate stack sizes for proper hitbox handling
  const stackSizes = useMemo(() => {
    if (!stackPositions) return new Map<string, number>();

    const sizeMap = new Map<string, number>();
    const stackGroups = new Map<string, number>();

    // Group by position to find stack sizes
    for (const [, pos] of stackPositions) {
      const key = `${pos.x.toFixed(3)},${pos.z.toFixed(3)}`;
      stackGroups.set(key, (stackGroups.get(key) || 0) + 1);
    }

    // Map each position to its stack size
    for (const [, pos] of stackPositions) {
      const key = `${pos.x.toFixed(3)},${pos.z.toFixed(3)}`;
      sizeMap.set(key, stackGroups.get(key) || 1);
    }

    return sizeMap;
  }, [stackPositions]);

  // Precomputed layout for cards in the Collection zone: bottom-left horizontal stack
  const collectionLayout = useMemo(() => {
    const layout = new Map<
      number,
      { x: number; z: number; rotationZ: number }
    >();

    const collectionCards = pick3D.filter((p) => p.zone === "Collection");
    const n = collectionCards.length;
    if (n === 0) return layout;

    // Horizontal spacing smaller than card width to create overlap
    const spacing = CARD_SHORT * 0.35;

    for (let i = 0; i < n; i++) {
      const p = collectionCards[i];

      const x = COLLECTION_ANCHOR_X + i * spacing;
      const z = COLLECTION_ANCHOR_Z;

      layout.set(p.id, {
        x,
        z,
        rotationZ: 0,
      });
    }

    return layout;
  }, [pick3D]);

  // Convert deck picks to Pick3D format - preserve existing positions when possible
  const positionsRef = useRef<Map<string, { z: number; x: number }>>(new Map());
  const zoneCountsRef = useRef<Map<string, number>>(new Map());
  const lastPicksCount = useRef(0);
  const draftLayoutRef = useRef<Map<string, { x: number; z: number }> | null>(
    null
  );
  const draftLayoutLoadedRef = useRef(false);

  // Load draft-3d layout and stack preferences when arriving from draft
  useEffect(() => {
    const deckIdParam = searchParams?.get("id");
    const fromDraft = searchParams?.get("from") === "draft";
    if (!fromDraft || !deckIdParam) return;
    if (draftLayoutLoadedRef.current) return;
    draftLayoutLoadedRef.current = true;

    if (typeof window === "undefined") return;

    try {
      const layoutKey = `draftLayout_deck_${deckIdParam}`;
      const prefsKey = `draftStackPrefs_deck_${deckIdParam}`;
      const rawPrefs = window.localStorage.getItem(prefsKey);
      if (rawPrefs) {
        try {
          const prefs = JSON.parse(rawPrefs) as {
            isSortingEnabled?: boolean;
          } | null;
          if (prefs && typeof prefs.isSortingEnabled === "boolean") {
            setIsSortingEnabled(prefs.isSortingEnabled);
          }
        } catch (err) {
          try {
            console.warn("Failed to parse draft stack prefs:", err);
          } catch {}
        }
      }

      const rawLayout = window.localStorage.getItem(layoutKey);
      if (!rawLayout) return;

      try {
        const parsed = JSON.parse(rawLayout) as Array<{
          cardId: number;
          zone?: Zone;
          x: number;
          z: number;
        }>;
        const map = new Map<string, { x: number; z: number }>();
        for (const entry of parsed) {
          if (!entry || typeof entry.cardId !== "number") continue;
          const layoutZone: "Deck" | "Sideboard" =
            entry.zone === "Deck" ? "Deck" : "Sideboard";
          const key = `${entry.cardId}:${layoutZone}`;
          if (!map.has(key)) {
            map.set(key, { x: entry.x, z: entry.z });
          }
        }
        if (map.size > 0) {
          draftLayoutRef.current = map;
        }
      } catch (err) {
        try {
          console.warn("Failed to parse draft 3D layout for editor-3d:", err);
        } catch {}
      }
    } catch (err) {
      try {
        console.warn("Error reading draft 3D layout from localStorage:", err);
      } catch {}
    }
  }, [searchParams]);

  // Load 3D draft layout and stack preferences for online/tournament draft flows
  useEffect(() => {
    const draft = searchParams?.get("draft");
    const matchId = searchParams?.get("matchId");
    const sessionId = searchParams?.get("sessionId");
    const draftId = matchId || sessionId;

    if (draft !== "true" || !draftId) return;
    if (draftLayoutLoadedRef.current) return;
    draftLayoutLoadedRef.current = true;

    if (typeof window === "undefined") return;

    try {
      const layoutKey = `draftLayout_draft_${draftId}`;
      const prefsKey = `draftStackPrefs_draft_${draftId}`;
      const rawPrefs = window.localStorage.getItem(prefsKey);
      if (rawPrefs) {
        try {
          const prefs = JSON.parse(rawPrefs) as {
            isSortingEnabled?: boolean;
          } | null;
          if (prefs && typeof prefs.isSortingEnabled === "boolean") {
            setIsSortingEnabled(prefs.isSortingEnabled);
          }
        } catch (err) {
          try {
            console.warn(
              "[Draft Init] Failed to parse draft stack prefs (3D):",
              err
            );
          } catch {}
        }
      }

      const rawLayout = window.localStorage.getItem(layoutKey);
      if (!rawLayout) return;

      try {
        const parsed = JSON.parse(rawLayout) as Array<{
          cardId: number;
          zone?: Zone;
          x: number;
          z: number;
        }>;
        const map = new Map<string, { x: number; z: number }>();
        for (const entry of parsed) {
          if (!entry || typeof entry.cardId !== "number") continue;
          const layoutZone: "Deck" | "Sideboard" =
            entry.zone === "Deck" ? "Deck" : "Sideboard";
          const key = `${entry.cardId}:${layoutZone}`;
          if (!map.has(key)) {
            map.set(key, { x: entry.x, z: entry.z });
          }
        }
        if (map.size > 0) {
          draftLayoutRef.current = map;
        }
      } catch (err) {
        try {
          console.warn(
            "[Draft Init] Failed to parse draft 3D layout for editor-3d:",
            err
          );
        } catch {}
      }
    } catch (err) {
      try {
        console.warn(
          "[Draft Init] Error reading draft 3D layout from localStorage:",
          err
        );
      } catch {}
    }
  }, [searchParams]);

  useEffect(() => {
    // Calculate total card count from picks
    const totalCards = Object.values(picks).reduce(
      (sum, item) => sum + item.count,
      0
    );

    // Skip rebuilding pick3D if card count hasn't changed
    // This preserves positions when cards are just moved between zones
    if (lastPicksCount.current === totalCards && pick3D.length > 0) {
      return;
    }

    lastPicksCount.current = totalCards;

    const newPick3D: Pick3D[] = [];
    let id = 1;
    // Counter for orderly fallback grid positioning (when no saved position exists)
    let fallbackIndex = 0;
    const GRID_COLS = 10;
    const CARD_SPACING_X = 0.65; // Horizontal spacing
    const CARD_SPACING_Z = 0.9; // Vertical spacing

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

    // 2) Determine target deck counts per card - preserve existing deck positions
    const remainingDeckByCard = new Map<number, number>();
    for (const [cardId] of totalByCard.entries()) {
      const initialDeck = initialDeckByCard.get(cardId) || 0;
      // In draft/sealed mode, use picks state as the single source of truth for zones
      // Don't rely on cached zone counts as this can create circular dependencies
      remainingDeckByCard.set(cardId, initialDeck);
    }

    // 3) Emit copies in the computed zones, preserving per-zone positions
    for (const item of Object.values(picks)) {
      for (let i = 0; i < item.count; i++) {
        remainingDeckByCard.set(
          item.cardId,
          (remainingDeckByCard.get(item.cardId) ?? 0) - 1
        );

        // Use logical zone from picks, but map non-deck zones (Sideboard/Collection)
        // into the Sideboard region for initial 3D layout placement.
        let logicalZone = item.zone as Zone;
        const layoutZone: "Deck" | "Sideboard" =
          logicalZone === "Deck" ? "Deck" : "Sideboard";

        // Use existing position if available (sealed/draft) or draft-3d layout when arriving from draft.
        // When restoring from a saved draft layout, fall back to any saved position
        // for this cardId regardless of zone, since decks imported from draft may
        // normalize all cards into a single logical zone (e.g. Sideboard).
        const posKey = `${item.cardId}:${layoutZone}`;
        const existingPos = positionsRef.current.get(posKey);
        let layoutPos: { x: number; z: number } | undefined;
        if (!existingPos && draftLayoutRef.current) {
          layoutPos =
            draftLayoutRef.current.get(posKey) ??
            draftLayoutRef.current.get(`${item.cardId}:Deck`) ??
            draftLayoutRef.current.get(`${item.cardId}:Sideboard`);
        }
        const useExisting = !!existingPos && (isSealed || isDraftMode);
        const useLayout = !useExisting && !!layoutPos;

        let x: number;
        let z: number;

        if (useExisting && existingPos) {
          x = existingPos.x;
          z = existingPos.z;
        } else if (useLayout && layoutPos) {
          x = layoutPos.x;
          z = layoutPos.z;
          // For draft-mode decks built from a prior 3D draft, infer the
          // initial logical zone from the saved Z position so that
          // top-of-board cards (z < 0) start in the Deck zone and
          // bottom-of-board cards (z >= 0) start in the Sideboard zone.
          if (isDraftMode) {
            logicalZone = layoutPos.z < 0 ? "Deck" : "Sideboard";
          }
        } else {
          // Orderly grid fallback instead of random positions
          // This ensures cards are arranged neatly when auto-stack is toggled off
          // or when no saved positions exist
          const col = fallbackIndex % GRID_COLS;
          const row = Math.floor(fallbackIndex / GRID_COLS);
          // Start from left side, progress right; start from top of zone, progress down
          x = -3 + col * CARD_SPACING_X;
          z =
            layoutZone === "Deck"
              ? -2.5 + row * CARD_SPACING_Z // Deck zone: start at z=-2.5, progress down
              : 0.5 + row * CARD_SPACING_Z; // Sideboard zone: start at z=0.5, progress down
          fallbackIndex++;
        }

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
          // Keep the (possibly adjusted) logical zone so Collection cards
          // can have their own dedicated fan layout while reusing the
          // Sideboard region for initial placement.
          zone: logicalZone,
        });
      }
    }

    setPick3D(newPick3D);
    setNextPickId(id);
  }, [picks, isSealed, isDraftMode, pick3D.length]);

  // Update position cache whenever pick3D changes
  useEffect(() => {
    const newPositions = new Map<string, { z: number; x: number }>();
    const newZoneCounts = new Map<string, number>();
    for (const pick of pick3D) {
      const cardId = pick.card.cardId;
      // Map logical zones into layout buckets so that Collection shares
      // the Sideboard region for purposes of preserving positions.
      const layoutZone: "Deck" | "Sideboard" =
        pick.zone === "Deck" ? "Deck" : "Sideboard";
      const key = `${cardId}:${layoutZone}`;
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
    const map: Record<
      number,
      { slug: string | null; type: string | null; name: string }
    > = {};
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
    }
  }

  const avatarCount = useMemo(() => {
    let n = 0;
    for (const pick of pick3D) {
      // Only count cards in deck zone
      if (pick.zone !== "Deck") continue;
      const t = (pick.card.type || "").toLowerCase();
      if (t.includes("avatar")) n += 1;
    }
    return n;
  }, [pick3D]);

  const spellbookNonAvatar = useMemo(() => {
    let n = 0;
    for (const pick of pick3D) {
      // Only count non-avatar, non-site cards in deck zone
      if (pick.zone !== "Deck") continue;
      const t = (pick.card.type || "").toLowerCase();
      if (!t.includes("avatar") && !t.includes("site")) n += 1;
    }
    return n;
  }, [pick3D]);

  // Count sites in deck zone for Atlas validation
  const atlasCount = useMemo(() => {
    let n = 0;
    for (const pick of pick3D) {
      // Only count sites in deck zone
      if (pick.zone !== "Deck") continue;
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
    return undefined;
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
          (p) => p.card.cardId === cardId && p.zone === "Deck"
        );
        if (idx === -1) return prev;

        const card = updated[idx];
        // Special behavior for standard sites: remove them instead of moving to sideboard
        if (isStandardSite(card.card.cardName)) {
          // Remove the card entirely
          updated.splice(idx, 1);
          // Also decrement picks for this card from Deck zone to keep state in sync
          const variantId = card.card.variantId ?? undefined; // preserve 0
          setPicks((prevPicks) => {
            const next = { ...prevPicks } as Record<PickKey, PickItem>;
            const deckKey = `${cardId}:Deck:${variantId ?? "x"}` as PickKey;
            const deckItem = next[deckKey];
            if (deckItem) {
              if (deckItem.count > 1)
                next[deckKey] = { ...deckItem, count: deckItem.count - 1 };
              else delete next[deckKey];
            }
            return next;
          });
          return updated;
        }

        // Normal behavior: move to sideboard
        // When sorting is disabled, preserve the card's current position (just update zone)
        // When sorting is enabled, assign a new random position in the sideboard area
        const newZ = isSortingEnabled ? 1.5 + Math.random() * 0.5 : card.z;
        const newX = isSortingEnabled ? 0.5 + Math.random() * 3 : card.x;
        updated[idx] = {
          ...updated[idx],
          x: newX,
          z: newZ,
          y: undefined,
          zone: "Sideboard",
        };

        // Sync picks state for all modes (draft, sealed, and normal editor)
        const variantId = card.card.variantId ?? undefined; // preserve 0
        setPicks((prevPicks) => {
          const next = { ...prevPicks } as Record<PickKey, PickItem>;
          const deckKey = `${cardId}:Deck:${variantId ?? "x"}` as PickKey;
          const sideboardKey = `${cardId}:Sideboard:${
            variantId ?? "x"
          }` as PickKey;

          const deckItem = next[deckKey];
          if (deckItem && deckItem.count > 0) {
            // Move one from deck zone to sideboard
            if (deckItem.count > 1) {
              next[deckKey] = { ...deckItem, count: deckItem.count - 1 };
            } else {
              delete next[deckKey];
            }

            const sideboardItem = next[sideboardKey];
            next[sideboardKey] = sideboardItem
              ? { ...sideboardItem, count: sideboardItem.count + 1 }
              : {
                  cardId,
                  variantId: variantId ?? null,
                  name: card.card.cardName,
                  type: card.card.type,
                  slug: card.card.slug || "",
                  zone: "Sideboard" as Zone,
                  count: 1,
                  set: card.card.setName || "",
                };
          }
          return next;
        });

        return updated;
      });
    },
    [isStandardSite, isSortingEnabled]
  );

  const moveOneFromSideboardToDeck = useCallback(
    (cardId: number) => {
      setPick3D((prev) => {
        const updated = [...prev];
        const idx = updated.findIndex(
          (p) => p.card.cardId === cardId && p.zone === "Sideboard"
        );
        if (idx === -1) return prev;
        const card = updated[idx];
        // When sorting is disabled, preserve the card's current position (just update zone)
        // When sorting is enabled, assign a new random position in the deck area
        const newZ = isSortingEnabled ? -1.5 - Math.random() * 0.5 : card.z;
        const newX = isSortingEnabled ? -2 + Math.random() * 4 : card.x;
        updated[idx] = {
          ...updated[idx],
          x: newX,
          z: newZ,
          y: undefined,
          zone: "Deck",
        };

        // Sync picks state for all modes (draft, sealed, and normal editor)
        const variantId = card.card.variantId ?? undefined; // preserve 0
        setPicks((prevPicks) => {
          const next = { ...prevPicks } as Record<PickKey, PickItem>;
          const deckKey = `${cardId}:Deck:${variantId ?? "x"}` as PickKey;
          const sideboardKey = `${cardId}:Sideboard:${
            variantId ?? "x"
          }` as PickKey;

          const sideboardItem = next[sideboardKey];
          if (sideboardItem && sideboardItem.count > 0) {
            // Move one from sideboard to deck zone
            if (sideboardItem.count > 1) {
              next[sideboardKey] = {
                ...sideboardItem,
                count: sideboardItem.count - 1,
              };
            } else {
              delete next[sideboardKey];
            }

            const deckItem = next[deckKey];
            next[deckKey] = deckItem
              ? { ...deckItem, count: deckItem.count + 1 }
              : {
                  cardId,
                  variantId: variantId ?? null,
                  name: card.card.cardName,
                  type: card.card.type,
                  slug: card.card.slug || "",
                  zone: "Deck" as Zone,
                  count: 1,
                  set: card.card.setName || "",
                };
          }
          return next;
        });

        return updated;
      });
    },
    [isSortingEnabled]
  );

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
          // Also decrement picks for this card from Deck zone
          const variantId = card.card.variantId ?? undefined; // preserve 0
          setPicks((prevPicks) => {
            const next = { ...prevPicks } as Record<PickKey, PickItem>;
            const deckKey = `${card.card.cardId}:Deck:${
              variantId ?? "x"
            }` as PickKey;
            const deckItem = next[deckKey];
            if (deckItem) {
              if (deckItem.count > 1)
                next[deckKey] = { ...deckItem, count: deckItem.count - 1 };
              else delete next[deckKey];
            }
            return next;
          });
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
          zone: "Sideboard",
        };

        // Sync picks: move one copy from Deck to Sideboard
        const variantId = card.card.variantId ?? undefined; // preserve 0
        setPicks((prevPicks) => {
          const next = { ...prevPicks } as Record<PickKey, PickItem>;
          const deckKey = `${card.card.cardId}:Deck:${
            variantId ?? "x"
          }` as PickKey;
          const sideboardKey = `${card.card.cardId}:Sideboard:${
            variantId ?? "x"
          }` as PickKey;
          const deckItem = next[deckKey];
          if (deckItem) {
            if (deckItem.count > 1)
              next[deckKey] = { ...deckItem, count: deckItem.count - 1 };
            else delete next[deckKey];
            const sbItem = next[sideboardKey];
            next[sideboardKey] = sbItem
              ? { ...sbItem, count: sbItem.count + 1 }
              : {
                  cardId: card.card.cardId,
                  variantId: variantId ?? null,
                  name: card.card.cardName,
                  type: card.card.type,
                  slug: card.card.slug || "",
                  zone: "Sideboard" as Zone,
                  count: 1,
                  set: card.card.setName || "",
                };
          }
          return next;
        });

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
        zone: "Deck",
      };

      // Sync picks: move one copy from Sideboard to Deck
      const card = updated[cardIndex];
      const variantId = card.card.variantId ?? undefined; // preserve 0
      setPicks((prevPicks) => {
        const next = { ...prevPicks } as Record<PickKey, PickItem>;
        const deckKey = `${card.card.cardId}:Deck:${
          variantId ?? "x"
        }` as PickKey;
        const sideboardKey = `${card.card.cardId}:Sideboard:${
          variantId ?? "x"
        }` as PickKey;
        const sbItem = next[sideboardKey];
        if (sbItem) {
          if (sbItem.count > 1)
            next[sideboardKey] = { ...sbItem, count: sbItem.count - 1 };
          else delete next[sideboardKey];
          const dItem = next[deckKey];
          next[deckKey] = dItem
            ? { ...dItem, count: dItem.count + 1 }
            : {
                cardId: card.card.cardId,
                variantId: variantId ?? null,
                name: card.card.cardName,
                type: card.card.type,
                slug: card.card.slug || "",
                zone: "Deck" as Zone,
                count: 1,
                set: card.card.setName || "",
              };
        }
        return next;
      });

      return updated;
    });
  }, []);

  return (
    <div className="fixed inset-0 w-screen h-screen">
      {(() => {
        const tournamentId = searchParams?.get("tournament") || null;
        if (!tournamentId) return null;
        return <FloatingChat tournamentId={tournamentId} mode="bubble" />;
      })()}
      {/* Tournament presence overlay if launched from a tournament context */}
      {(() => {
        const tournamentId = searchParams?.get("tournament") || null;
        const draftSessionId = searchParams?.get("sessionId") || null;
        if (!tournamentId && !draftSessionId) return null;
        return (
          <TournamentPresenceOverlay
            tournamentId={tournamentId}
            draftSessionId={draftSessionId}
            position="top-right"
          />
        );
      })()}
      {/* Draft picks loading indicator */}
      {isDraftMode && !draftInitDone && pick3D.length === 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="rounded-xl bg-slate-900/90 px-6 py-4 text-center text-white shadow-2xl border border-white/10">
            <div className="text-xs uppercase tracking-widest text-white/60">
              Loading Drafted Cards
            </div>
            <div className="mt-2 text-lg font-semibold">
              {draftLoadProgress.total > 0
                ? `${draftLoadProgress.processed}/${draftLoadProgress.total}`
                : "Preparing…"}
            </div>
          </div>
        </div>
      )}

      {/* 3D Game View as the stage - EXACT same as draft-3d (minus draft hand) */}
      <div className="absolute inset-0 w-full h-full">
        <EditorCanvas orbitLocked={orbitLocked}>
          {/* 3D Cards with proper stacking order */}
          <group>
            {(() => {
              const sortedCards = [...pick3D].sort((a, b) => {
                // Sort by Y position so cards with lower Y render first (appear behind)
                const aY = isSortingEnabled ? a.y || 0.002 : 0.002;
                const bY = isSortingEnabled ? b.y || 0.002 : 0.002;
                return aY - bY; // Lower Y values render first (behind higher Y values)
              });

              return sortedCards.map((p, cardIndex) => {
                const isSite = (p.card.type || "")
                  .toLowerCase()
                  .includes("site");

                // Use sorted position if sorting is enabled, otherwise use card's position
                const stackPos = stackPositions?.get(p.id);
                // Add X offset for each card in stack for better targeting (fan effect)
                let x = stackPos
                  ? stackPos.x + stackPos.stackIndex * 0.03
                  : p.x;
                let z = stackPos ? stackPos.z : p.z;

                // Collection zone: override position with bottom-left fan layout
                let rotationZ = 0;
                if (p.zone === "Collection") {
                  const layout = collectionLayout.get(p.id);
                  if (layout) {
                    x = layout.x;
                    z = layout.z;
                    rotationZ = layout.rotationZ;
                  }
                }

                // Calculate base render order like draft-3d
                // Higher stack index = higher render order = rendered on top
                // In unstacked mode, use interaction-based layering (most recently interacted cards on top)
                const layerIndex = !stackPos
                  ? cardLayerOrder.get(p.id) ?? cardIndex
                  : 0;
                const baseRenderOrder = stackPos
                  ? 1600 + stackPos.stackIndex * 10
                  : 1500 + layerIndex;

                // Calculate Y position with very small stack height so cards "lie" on the mat
                // rather than floating in tall vertical stacks. We keep a tiny offset per
                // stackIndex/layerIndex to avoid z-fighting but visually this should look flat.
                const y = stackPos
                  ? 0.002 + stackPos.stackIndex * 0.003
                  : 0.002 + layerIndex * 0.001;

                // Calculate stack information for proper hitbox sizing
                const stackKey = stackPos
                  ? `${stackPos.x.toFixed(3)},${stackPos.z.toFixed(3)}`
                  : null;
                const totalInStack = stackKey
                  ? stackSizes.get(stackKey) || 1
                  : 1;
                const stackIndex = stackPos ? stackPos.stackIndex : 0;

                return (
                  <DraggableCard3D
                    key={p.id}
                    slug={p.card.slug}
                    isSite={isSite}
                    cardName={p.card.cardName}
                    cardType={p.card.type}
                    x={x}
                    z={z}
                    y={y}
                    baseRenderOrder={baseRenderOrder}
                    cardId={p.id}
                    stackIndex={stackIndex}
                    totalInStack={totalInStack}
                    interactive={true}
                    rotationZ={rotationZ}
                    onHoverStart={stableOnHoverStart}
                    onHoverEnd={stableOnHoverEnd}
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
                      const oldZone = p.zone; // Use explicit zone field
                      const zoneChanged = oldZone !== newZone;

                      setPick3D((prev) => {
                        const updated = [...prev];
                        const cardIndex = updated.findIndex(
                          (it) => it.id === p.id
                        );
                        if (cardIndex === -1) return prev;

                        // Move the card to the drop position and update zone
                        updated[cardIndex] = {
                          ...updated[cardIndex],
                          x: wx,
                          z: wz,
                          y: undefined,
                          zone: newZone,
                        };

                        // Don't auto-apply sorting on manual drags - let user control positioning
                        return updated;
                      });

                      // Keep picks in sync with zone changes so future updates don't revert layout
                      if (zoneChanged) {
                        // Preserve 0 as a valid variant key; only treat null/undefined as absent
                        const variantId = p.card.variantId ?? undefined;
                        setPicks((prev) => {
                          const next = { ...prev } as Record<PickKey, PickItem>;
                          const decKey = `${p.card.cardId}:${oldZone}:${
                            variantId ?? "x"
                          }` as PickKey;
                          const incKey = `${p.card.cardId}:${newZone}:${
                            variantId ?? "x"
                          }` as PickKey;
                          const dec = next[decKey];
                          if (dec) {
                            if (dec.count > 1)
                              next[decKey] = { ...dec, count: dec.count - 1 };
                            else delete next[decKey];
                          }
                          const inc = next[incKey];
                          next[incKey] = inc
                            ? { ...inc, count: inc.count + 1 }
                            : ({
                                cardId: p.card.cardId,
                                variantId: variantId ?? null,
                                name: p.card.cardName,
                                type: p.card.type,
                                slug: p.card.slug || "",
                                zone: newZone,
                                count: 1,
                                set: p.card.setName || "",
                              } as PickItem);
                          return next;
                        });
                      }

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
                      isSortingEnabled && stackPos ? !stackPos.isVisible : false
                    } // Disable dragging for hidden stacked cards
                    onDragChange={(dragging) => {
                      setOrbitLocked(dragging);
                    }}
                    onRelease={(wx, wz, wasDragging) => {
                      // Bring card to front on any interaction (click or drag)
                      bringCardToFront(p.id);

                      // Click to move between deck/sideboard using the same functions as sidebar
                      if (!wasDragging) {
                        const currentZone = p.zone; // Use explicit zone field

                        // Dedupe: if we recently toggled this cardId via click, ignore repeats briefly
                        const now = Date.now();
                        const last =
                          cardClickGuardRef.current.get(p.card.cardId) || 0;
                        if (now - last < 150) {
                          return;
                        }
                        cardClickGuardRef.current.set(p.card.cardId, now);

                        if (currentZone === "Deck") {
                          // Move from deck to sideboard
                          moveSpecificCardToSideboard(p.id);
                          setFeedbackMessage(
                            `Moved "${p.card.cardName}" to Sideboard`
                          );
                        } else {
                          // Move from sideboard to deck
                          moveSpecificCardToDeck(p.id);
                          setFeedbackMessage(
                            `Moved "${p.card.cardName}" to Deck`
                          );
                        }

                        setTimeout(() => setFeedbackMessage(null), 2000);
                      }
                    }}
                  />
                );
              });
            })()}
          </group>
          <TextureCache />
        </EditorCanvas>
      </div>

      {/* HUD Overlay - EXACT same structure as draft-3d */}
      <div className="absolute inset-0 z-20 pointer-events-none select-none">
        {/* Minimal Navigation (top-right) */}
        {status !== "authenticated" && (
          <div className="absolute top-3 right-4 z-[60] pointer-events-auto text-xs flex items-center gap-3">
            <Link href="/" className="underline text-white/80 hover:text-white">
              Home
            </Link>
            <Link
              href="/online/lobby"
              className="underline text-white/80 hover:text-white"
            >
              Lobby
            </Link>
          </div>
        )}
        <DeckPanels
          isDraftMode={isDraftMode}
          isSealed={isSealed}
          status={status}
          decks={decks}
          deckId={deckId}
          deckName={deckName}
          deckIsPublic={deckIsPublic}
          deckIsOwner={deckIsOwner}
          deckCreatorName={deckCreatorName}
          loadingDecks={loadingDecks}
          pick3DLength={pick3D.length}
          isSortingEnabled={isSortingEnabled}
          onToggleSort={() => setIsSortingEnabled(!isSortingEnabled)}
          avatarCount={avatarCount}
          atlasCount={atlasCount}
          spellbookNonAvatar={spellbookNonAvatar}
          validation={validation}
          saving={saving}
          onLoadDeck={loadDeck}
          onClearEditor={clearEditor}
          onSetDeckName={setDeckName}
          onTogglePublic={togglePublic}
          onMakeCopy={makeCopy}
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
            onHoverPreview={(slug, name, type) =>
              beginHoverPreview({ slug, name, type }, `sidebar:${slug}`)
            }
            onHoverClear={() => clearHoverPreviewDebounced()}
            moveOneToSideboard={moveOneToSideboard}
            moveOneFromSideboardToDeck={moveOneFromSideboardToDeck}
            openContextMenu={openContextMenuForCard}
            setFeedback={(msg) => {
              setFeedbackMessage(msg);
              setTimeout(() => setFeedbackMessage(null), 2000);
            }}
            showCollectionZone={cubeStandardCards.length > 0}
            collectionCount={collectionCount}
            collectionCountsByCardId={collectionCountsByCardId}
            moveOneFromSideboardToCollection={moveOneFromSideboardToCollection}
            moveOneFromCollectionToSideboard={moveOneFromCollectionToSideboard}
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
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="w-5 h-5"
                  >
                    <path d="M12 5C7 5 2.73 8.11 1 12c1.73 3.89 6 7 11 7s9.27-3.11 11-7c-1.73-3.89-6-7-11-7zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-2a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="w-5 h-5"
                  >
                    <path d="M12 5c-2.5 0-4.78.73-6.68 1.95L3.7 5.34 2.29 6.75l16.97 16.97 1.41-1.41-3.03-3.03C20.04 16.83 22 12 22 12S18.27 5 12 5z" />
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
                        <div
                          key={cost}
                          className="flex flex-col items-center justify-end gap-0.5 flex-1 h-full"
                        >
                          <div
                            className="bg-blue-400 rounded-t min-h-[2px] w-full"
                            style={{
                              height: `${Math.max(height, count > 0 ? 8 : 0)}%`,
                            }}
                            title={`${label} mana: ${count} cards`}
                          />
                          <span className="text-[10px] opacity-60">
                            {label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {thresholdSummary.elements.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {thresholdSummary.elements.map((element) => (
                        <div
                          key={element}
                          className="flex items-center gap-1 bg-white/10 px-1 py-0.5 rounded"
                        >
                          <Image
                            src={`/api/assets/${element}.png`}
                            alt={element}
                            width={12}
                            height={12}
                          />
                          <span className="text-[10px]">
                            {
                              thresholdSummary.summary[
                                element as keyof typeof thresholdSummary.summary
                              ]
                            }
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
                        const maxCount = Math.max(
                          ...Object.values(manaCurve),
                          1
                        );
                        const height = (count / maxCount) * 100;
                        const label = cost === 7 ? "7+" : String(cost);
                        return (
                          <div
                            key={cost}
                            className="flex flex-col items-center justify-end gap-1 flex-1 h-full"
                          >
                            <div
                              className="bg-blue-400 rounded-t min-h-[2px] w-full relative"
                              style={{
                                height: `${Math.max(
                                  height,
                                  count > 0 ? 8 : 0
                                )}%`,
                              }}
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
                        <div
                          key={element}
                          className="flex items-center gap-1 bg-white/10 px-1 py-0.5 rounded"
                        >
                          <Image
                            src={`/api/assets/${element}.png`}
                            alt={element}
                            width={14}
                            height={14}
                          />
                          <span className="text-xs">
                            {
                              thresholdSummary.summary[
                                element as keyof typeof thresholdSummary.summary
                              ]
                            }
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

        {/* Card preview - match match play behavior; hide when context menu is open */}
        {hoverPreview && !contextMenu && (
          <CardPreview
            card={hoverPreview}
            anchor="bottom-left"
            zIndexClass="z-50"
          />
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
                  {contextMenu.deckCards.map((card) => (
                    <button
                      key={card.id}
                      className="w-full text-left px-2 py-1 text-xs text-blue-100 hover:bg-blue-700/40 rounded"
                      onClick={() => {
                        moveSpecificCardToSideboard(card.id);
                        setFeedbackMessage(
                          `Moved "${contextMenu.cardName}" to Sideboard`
                        );
                        setTimeout(() => setFeedbackMessage(null), 2000);
                        setContextMenu(null);
                      }}
                    >
                      Move 1 copy → Sideboard
                    </button>
                  ))}

                  {/* Aggregate Deck → Collection action */}
                  <button
                    className="mt-1 w-full text-left px-2 py-1 text-xs text-purple-100 hover:bg-purple-700/40 rounded disabled:opacity-40 disabled:hover:bg-transparent"
                    disabled={collectionCount >= 10}
                    onClick={() => {
                      moveOneFromDeckToCollection(contextMenu.cardId);
                      setContextMenu(null);
                    }}
                  >
                    {collectionCount >= 10
                      ? "Collection is full (10/10)"
                      : "Move one copy → Collection"}
                  </button>
                </div>
              )}

              {contextMenu.sideboardCards.length > 0 && (
                <div className="mb-2">
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

                  {/* Aggregate Sideboard → Collection action */}
                  <button
                    className="mt-1 w-full text-left px-2 py-1 text-xs text-purple-100 hover:bg-purple-700/40 rounded disabled:opacity-40 disabled:hover:bg-transparent"
                    disabled={collectionCount >= 10}
                    onClick={() => {
                      moveOneFromSideboardToCollection(contextMenu.cardId);
                      setContextMenu(null);
                    }}
                  >
                    {collectionCount >= 10
                      ? "Collection is full (10/10)"
                      : "Move one copy → Collection"}
                  </button>
                </div>
              )}

              {contextMenu.collectionCopies > 0 && (
                <div>
                  <div className="text-purple-300 text-xs px-2 mb-1">
                    From Collection ({contextMenu.collectionCopies} copies,
                    total {contextMenu.totalCollection}/10):
                  </div>
                  <button
                    className="w-full text-left px-2 py-1 text-sm text-white hover:bg-white/10 rounded"
                    onClick={() => {
                      moveOneFromCollectionToDeck(contextMenu.cardId);
                      setFeedbackMessage(
                        `Moved "${contextMenu.cardName}" from Collection to Deck`
                      );
                      setTimeout(() => setFeedbackMessage(null), 2000);
                      setContextMenu(null);
                    }}
                  >
                    Move one copy → Deck
                  </button>
                  <button
                    className="mt-1 w-full text-left px-2 py-1 text-sm text-white hover:bg-white/10 rounded"
                    onClick={() => {
                      moveOneFromCollectionToSideboard(contextMenu.cardId);
                      setFeedbackMessage(
                        `Moved "${contextMenu.cardName}" from Collection to Sideboard`
                      );
                      setTimeout(() => setFeedbackMessage(null), 2000);
                      setContextMenu(null);
                    }}
                  >
                    Move one copy → Sideboard
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {matchEndedBannerVisible && matchEndedBannerMessage && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 pointer-events-auto">
            <div className="flex items-start gap-3 rounded-lg bg-yellow-500/90 text-black px-4 py-3 shadow-lg border border-yellow-300 max-w-xl">
              <div className="mt-0.5">
                <svg
                  className="w-4 h-4 text-black/80"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v4m0 4h.01M4.93 19h14.14c1.54 0 2.5-1.67 1.73-3L13.73 5c-.77-1.33-2.69-1.33-3.46 0L3.2 16c-.77 1.33.19 3 1.73 3z"
                  />
                </svg>
              </div>
              <div className="text-sm">
                <div className="font-semibold">Match update</div>
                <div className="mt-0.5">{matchEndedBannerMessage}</div>
                <div className="mt-1 text-xs text-black/80">
                  You can keep editing and saving this deck even though the
                  match has ended.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMatchEndedBannerVisible(false)}
                className="ml-2 text-black/60 hover:text-black focus:outline-none"
                aria-label="Dismiss match update"
              >
                ×
              </button>
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
            tournamentControlsMode={tournamentControlsMode}
            onShowStandardCards={() =>
              setTournamentControlsMode((prev) =>
                prev === "standard" ? null : "standard"
              )
            }
            onShowCubeExtras={() =>
              setTournamentControlsMode((prev) =>
                prev === "cube" ? null : "cube"
              )
            }
            packs={packs}
            openPack={openPack}
            openAllPacks={openAllPacks}
            packCardCache={packCardCache}
            packLoadProgress={{
              processed: packLoadProgress.processed,
              total: packLoadProgress.total,
              inProgress: packLoadProgress.inProgress || bulkOpenInProgress,
            }}
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

        {/* Waiting overlay for deck submission */}
        {waitingForOtherPlayers && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center px-4">
            <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 w-full max-w-md text-center">
              <div className="flex flex-col items-center gap-4">
                <div
                  className="h-10 w-10 sm:h-12 sm:w-12 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin"
                  aria-hidden="true"
                />
                <h2 className="text-xl sm:text-2xl font-semibold text-gray-900">
                  {waitingOverlayStage === "submitting"
                    ? "Submitting deck..."
                    : "Deck submitted!"}
                </h2>
                <p className="text-gray-600">
                  {waitingOverlayStage === "submitting"
                    ? "Validating your deck and syncing with the event server. Please keep this window open."
                    : searchParams?.get("tournament") &&
                      !searchParams?.get("matchId")
                    ? "Waiting for other players to submit their decks..."
                    : "Returning you to the match momentarily."}
                </p>
                {waitingOverlayStage === "waiting" && (
                  <div className="text-sm text-gray-500">
                    {searchParams?.get("tournament") &&
                    !searchParams?.get("matchId")
                      ? "The page will refresh automatically when the tournament advances."
                      : "If nothing happens, you can jump back manually."}
                  </div>
                )}
                {waitingOverlayStage === "waiting" && (
                  <div className="mt-2">
                    <button
                      type="button"
                      className="inline-flex items-center px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-60 disabled:cursor-not-allowed"
                      onClick={() => {
                        const tournamentId = searchParams?.get("tournament");
                        const matchId = searchParams?.get("matchId");
                        if (tournamentId && !matchId) {
                          window.location.href = `/tournaments/${encodeURIComponent(
                            tournamentId
                          )}`;
                        } else {
                          goBackToMatch(matchId);
                        }
                      }}
                    >
                      {searchParams?.get("tournament") &&
                      !searchParams?.get("matchId")
                        ? "Return to Tournament Now"
                        : "Return to Match Now"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <Suspense fallback={null}>
        <TournamentControls
          isVisible={tournamentControlsVisible}
          mode={tournamentControlsMode ?? undefined}
          onClose={() => setTournamentControlsMode(null)}
          spellslingerCard={spellslingerCard}
          standardSites={stdSites}
          onAddSpellslinger={addSpellslinger}
          onAddStandardSite={addStandardSiteByName}
          cubeStandardCards={cubeStandardCards}
          onAddCubeStandardCard={addToSideboardFromSearch}
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
