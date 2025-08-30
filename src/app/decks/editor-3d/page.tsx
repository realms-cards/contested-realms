"use client";

import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import Image from "next/image";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Physics } from "@react-three/rapier";
import Board from "@/lib/game/Board";
import TextureCache from "@/lib/game/components/TextureCache";
import CardPlane from "@/lib/game/components/CardPlane";
import { CARD_LONG, CARD_SHORT } from "@/lib/game/constants";
import type { ThreeEvent } from "@react-three/fiber";
import type { Group } from "three";
import { MOUSE } from "three";
import { NumberBadge } from "@/components/game/manacost";
import type { Digit } from "@/components/game/manacost";
import {
  Pick3D,
  CardMeta,
  computeStackPositions,
} from "@/lib/game/cardSorting";

// Stable constant for standard site names (tournament legal)
const STANDARD_SITE_NAMES = ["Spire", "Stream", "Valley", "Wasteland"] as const;

// --- Deck Editor data types (same as 2D editor) ---

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
};

// Using shared card types from '@/lib/game/cardSorting' (Pick3D, CardMeta)

// Enhanced DraggableCard3D with double-click support
function DraggableCard3D({
  slug,
  isSite,
  x,
  z,
  y = 0.002,
  onDrop,
  disabled,
  onDragChange,
  rotationZ: extraRotZ = 0,
  onDragMove,
  onRelease,
  getTopRenderOrder,
  onHoverChange,
  lockUpright,
  onDoubleClick,
  onContextMenu,
  baseRenderOrder = 1500,
}: {
  slug: string;
  isSite: boolean;
  x: number;
  z: number;
  y?: number;
  onDrop?: (wx: number, wz: number) => void;
  disabled?: boolean;
  onDragChange?: (dragging: boolean) => void;
  rotationZ?: number;
  onDragMove?: (wx: number, wz: number) => void;
  onRelease?: (wx: number, wz: number, wasDragging: boolean) => void;
  getTopRenderOrder?: () => number;
  onHoverChange?: (hovering: boolean) => void;
  lockUpright?: boolean;
  onDoubleClick?: () => void;
  onContextMenu?: (clientX: number, clientY: number) => void;
  baseRenderOrder?: number;
}) {
  const ref = useRef<Group | null>(null);
  const dragStart = useRef<{
    x: number;
    z: number;
    time: number;
    screenX: number;
    screenY: number;
  } | null>(null);
  const dragging = useRef(false);
  const upCleanupRef = useRef<(() => void) | null>(null);
  const roRef = useRef<number>(baseRenderOrder);
  const [isDragging, setIsDragging] = useState(false);
  const [uprightLocked, setUprightLocked] = useState(false);
  const lastClickTime = useRef<number>(0);

  // Reset render order to base when not dragging
  useEffect(() => {
    if (!isDragging) {
      roRef.current = baseRenderOrder;
    }
  }, [baseRenderOrder, isDragging]);

  const setPos = useCallback((wx: number, wz: number, lift = false) => {
    if (!ref.current) return;
    ref.current.position.set(wx, lift ? 0.25 : 0.002, wz);
  }, []);

  // Note: move helpers are defined in parent and used there.

  const rotZ =
    (isSite ? -Math.PI / 2 : 0) +
    (isDragging || lockUpright || uprightLocked ? 0 : extraRotZ);

  return (
    <group ref={ref} position={[x, y, z]}>
      {/* Larger invisible hitbox for easier interaction */}
      <mesh
        position={[0, 0.01, 0]}
        onPointerDown={(e: ThreeEvent<PointerEvent>) => {
          if (disabled) return;
          if (e.nativeEvent.button !== 0) return;
          e.stopPropagation();
          onHoverChange?.(false);
          // Record potential drag start in both world and screen space
          dragStart.current = {
            x: e.point.x,
            z: e.point.z,
            time: Date.now(),
            screenX: e.clientX,
            screenY: e.clientY,
          };
          // bring to front
          if (getTopRenderOrder) {
            const next = getTopRenderOrder();
            roRef.current = next;
          }
          // Don't lock orbit immediately - wait for actual drag to start
          // Ensure we always unlock if pointerup happens off the mesh before drag begins
          if (!upCleanupRef.current) {
            const earlyUp = () => {
              onDragChange?.(false);
              dragStart.current = null;
              dragging.current = false;
              setIsDragging(false);
              if (upCleanupRef.current) {
                upCleanupRef.current();
                upCleanupRef.current = null;
              }
            };
            window.addEventListener("pointerup", earlyUp, { once: true });
            upCleanupRef.current = () =>
              window.removeEventListener("pointerup", earlyUp);
          }
        }}
        onPointerMove={(e: ThreeEvent<PointerEvent>) => {
          if (disabled) return;
          const s = dragStart.current;
          if (!s) return;
          // Check threshold to start dragging
          const held = Date.now() - s.time;
          const dx = e.clientX - s.screenX;
          const dy = e.clientY - s.screenY;
          const dist = Math.hypot(dx, dy);
          const PIX_THRESH = 6;
          if (!dragging.current && held >= 50 && dist > PIX_THRESH) {
            dragging.current = true;
            setIsDragging(true);
            setUprightLocked(true);
            // Lock orbit controls when dragging actually starts
            onDragChange?.(true);
            // Bind a global pointerup fallback
            const handleUp = () => {
              // Ensure cleanup even if pointer up occurs off the mesh
              onDragChange?.(false);
              dragStart.current = null;
              dragging.current = false;
              setIsDragging(false);
              if (upCleanupRef.current) {
                upCleanupRef.current();
                upCleanupRef.current = null;
              }
            };
            window.addEventListener("pointerup", handleUp, { once: true });
            upCleanupRef.current = () =>
              window.removeEventListener("pointerup", handleUp);
          }
          if (dragging.current) {
            e.stopPropagation();
            const wx = e.point.x;
            const wz = e.point.z;
            setPos(wx, wz, true);
            onDragMove?.(wx, wz);
          }
        }}
        onPointerUp={(e: ThreeEvent<PointerEvent>) => {
          if (disabled) return;
          if (e.nativeEvent.button !== 0) return;
          e.stopPropagation();
          const wasDragging = dragging.current;
          const wx = e.point.x;
          const wz = e.point.z;

          // Detect double-click
          const now = Date.now();
          const timeSinceLastClick = now - lastClickTime.current;
          const isDoubleClick = !wasDragging && timeSinceLastClick < 300;
          lastClickTime.current = now;

          // Always settle to ground height
          setPos(wx, wz, false);
          dragStart.current = null;
          dragging.current = false;
          setIsDragging(false);
          onDragChange?.(false);
          if (upCleanupRef.current) {
            upCleanupRef.current();
            upCleanupRef.current = null;
          }

          if (isDoubleClick) {
            onDoubleClick?.();
          } else if (onDrop && wasDragging) {
            onDrop(wx, wz);
          }

          onRelease?.(wx, wz, wasDragging);
        }}
        onPointerOver={() => {
          if (disabled) return;
          onHoverChange?.(true);
        }}
        onPointerOut={() => {
          onHoverChange?.(false);
        }}
        onContextMenu={(e: ThreeEvent<PointerEvent>) => {
          if (disabled) return;
          e.stopPropagation();
          e.nativeEvent.preventDefault();
          onContextMenu?.(e.clientX, e.clientY);
        }}
      >
        <boxGeometry args={[CARD_SHORT * 1.05, 0.02, CARD_LONG * 1.05]} />
        <meshBasicMaterial
          transparent
          opacity={0}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>

      {/* Visual card */}
      <group>
        <CardPlane
          slug={slug}
          width={CARD_SHORT}
          height={CARD_LONG}
          rotationZ={rotZ}
          upright={false}
          depthWrite={false}
          depthTest={false}
          renderOrder={roRef.current}
          interactive={false}
          elevation={0.002}
        />
      </group>
    </group>
  );
}

export default function DeckEditor3DPage() {
  // Deck editor state (same as 2D version)
  const [decks, setDecks] = useState<DeckListItem[]>([]);
  const [loadingDecks, setLoadingDecks] = useState(false);
  const [deckId, setDeckId] = useState<string | null>(null);
  const [deckName, setDeckName] = useState<string>("New Deck");
  const setName = "Beta"; // Use Beta set for metadata (required by API)
  const [picks, setPicks] = useState<Record<PickKey, PickItem>>({});

  // Search state
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<SearchType>("all");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

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

  // Load list of decks on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoadingDecks(true);
        const res = await fetch("/api/decks");
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
  }, []);

  // Prefetch standard sites for the current set
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Fetch standard sites and Spellslinger in parallel
        const [siteEntries, spellslingerRes] = await Promise.all([
          Promise.all(
            STANDARD_SITE_NAMES.map(async (name) => {
              const res = await fetch(
                `/api/cards/search?q=${encodeURIComponent(
                  name
                )}&set=${encodeURIComponent(setName)}&type=site`
              );
              const data = (await res.json()) as SearchResult[];
              return [name, res.ok && data[0] ? data[0] : null] as const;
            })
          ),
          fetch(
            `/api/cards/search?q=spellslinger&set=${encodeURIComponent(
              setName
            )}&type=avatar`
          ),
        ]);

        if (!cancelled) {
          // Set standard sites
          const next: Record<StandardSiteName, SearchResult | null> = {
            Spire: null,
            Stream: null,
            Valley: null,
            Wasteland: null,
          };
          for (const [k, v] of siteEntries) next[k] = v;
          setStdSites(next);

          // Set Spellslinger
          if (spellslingerRes.ok) {
            const spellslingerData =
              (await spellslingerRes.json()) as SearchResult[];
            setSpellslingerCard(spellslingerData[0] || null);
          } else {
            setSpellslingerCard(null);
          }
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
  }, [setName]);

  // Exact same 3D state as draft-3d
  const [orbitLocked, setOrbitLocked] = useState(false);
  const [isSortingEnabled, setIsSortingEnabled] = useState(true);
  const [infoBoxVisible, setInfoBoxVisible] = useState(true);
  const [picksOpen, setPicksOpen] = useState(true);
  // Draft-completion mode flag (off by default)
  const [isDraftMode, setIsDraftMode] = useState(false);

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

  const [metaByCardId, setMetaByCardId] = useState<Record<number, CardMeta>>(
    {}
  );

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
        const k = Math.max(0, Math.min(9, Math.floor(c)));
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
            };
        return { ...prev, [key]: next };
      });
    },
    [setPicks]
  );

  // Minimal deck actions
  const saveDeck = useCallback(async () => {
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
      const agg = new Map<string, { cardId: number; zone: Zone; count: number; variantId?: number }>();
      for (const p of pick3D) {
        const inDeck = p.z < 0;
        const t = (p.card.type || "").toLowerCase();
        const zone: Zone = inDeck ? (t.includes("site") ? "Atlas" : "Spellbook") : "Sideboard";
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
            format: isDraftMode ? "Sealed" : "Constructed",
            set: setName,
            cards,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Failed to save deck");
        setDeckId(data.id);
        setSaveMsg(`Saved deck ${data.name} (id: ${data.id})`);
        // Refresh deck list
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
      // auto-clear success message after a short delay
      setTimeout(() => setSaveMsg(null), 1500);
    }
  }, [pick3D, deckId, deckName, isDraftMode, setName]);

  const loadDeck = useCallback(async (id: string) => {
    setDeckId(id);
    try {
      const res = await fetch(`/api/decks/${id}`);
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
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

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
    if (spellslingerCard) {
      addCardAuto(spellslingerCard);
    } else {
      setError("Spellslinger not found in this set");
    }
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
        const res = await fetch(
          `/api/cards/search?q=${encodeURIComponent(
            name
          )}&set=${encodeURIComponent(setName)}&type=site`
        );
        const data = (await res.json()) as SearchResult[];
        const r = res.ok && data[0] ? data[0] : null;
        if (r) addCardAuto(r);
        else setError(`Site ${name} not found in set ${setName}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [stdSites, addCardAuto, setName]
  );

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

  // Convert deck picks to Pick3D format - all start in sideboard (upper third)
  useEffect(() => {
    const newPick3D: Pick3D[] = [];
    let id = 1;

    // Check if deck is already valid/edited
    const avatarCount = Object.values(picks)
      .filter((item) => (item.type || "").toLowerCase().includes("avatar"))
      .reduce((sum, item) => sum + item.count, 0);
    const atlasCount = Object.values(picks)
      .filter((item) => item.zone === "Atlas")
      .reduce((sum, item) => sum + item.count, 0);
    const spellbookCount = Object.values(picks)
      .filter((item) => item.zone === "Spellbook")
      .reduce((sum, item) => sum + item.count, 0);

    const isDeckValid =
      avatarCount >= 1 && atlasCount >= 12 && spellbookCount >= 24;

    for (const item of Object.values(picks)) {
      for (let i = 0; i < item.count; i++) {
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
          },
          // Position cards in their correct zones based on zone classification
          x: -3 + Math.random() * 6,
          z:
            isDeckValid && item.zone !== "Sideboard"
              ? -2 + Math.random() * 1.8 // Deck zone: z from -2 to -0.2
              : 0.5 + Math.random() * 3, // Sideboard zone: z from 0.5 to 3.5
        });
      }
    }

    setPick3D(newPick3D);
    setNextPickId(id);
  }, [picks]);

  // Load deck data and meta
  useEffect(() => {
    // Get unique card IDs from pick3D array if yourCounts is empty
    const cardIds =
      yourCounts.length > 0
        ? yourCounts.map((c) => c.cardId)
        : [...new Set(pick3D.map((p) => p.card.cardId))]; // Remove duplicates

    if (!cardIds.length) {
      setMetaByCardId({});
      return;
    }

    console.log(
      "Fetching metadata for",
      cardIds.length,
      "unique card IDs:",
      cardIds
    );
    const params = new URLSearchParams();
    params.set("ids", cardIds.join(","));
    if (setName) params.set("set", setName);

    fetch(`/api/cards/meta?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        console.log("=== API Response Debug ===");
        console.log("Raw API response:", data);
        console.log("First card structure:", JSON.stringify(data[0], null, 2));

        const metaMap = data.reduce((acc: any, cardData: any) => {
          console.log(`Processing card ID ${cardData.cardId}:`, cardData);

          // API returns metadata directly in the response
          if (cardData.cardId) {
            const processedMeta = {
              cardId: cardData.cardId,
              cost: cardData.cost ?? null,
              attack: cardData.attack ?? null,
              defence: cardData.defence ?? null,
              thresholds: cardData.thresholds ?? null,
            };
            console.log(
              `Extracted metadata for card ${cardData.cardId}:`,
              processedMeta
            );
            acc[cardData.cardId] = processedMeta;
          } else {
            console.warn(`No cardId found in response:`, cardData);
          }

          return acc;
        }, {});
        console.log("Final MetaByCardId:", metaMap);
        setMetaByCardId(metaMap);
      })
      .catch((error) => {
        console.error("Metadata fetch failed:", error);
      });
  }, [yourCounts, pick3D, setName]);

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
      // Only count non-avatar cards in deck zone (z < 0)
      if (pick.z >= 0) continue;
      const t = (pick.card.type || "").toLowerCase();
      if (!t.includes("avatar")) n += 1;
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
        <Canvas
          camera={{ position: [0, 10, 0], fov: 50 }}
          shadows
          gl={{ preserveDrawingBuffer: true, antialias: true, alpha: false }}
        >
          <color attach="background" args={["#0b0b0c"]} />
          <ambientLight intensity={0.8} />
          <directionalLight
            position={[10, 12, 8]}
            intensity={1.35}
            castShadow
          />

          <Physics gravity={[0, -9.81, 0]}>
            <Board />

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
          </Physics>

          <OrbitControls
            makeDefault
            target={[0, 0, 0]}
            enabled={!orbitLocked}
            enablePan
            enableRotate={false}
            enableZoom
            enableDamping
            dampingFactor={0.08}
            screenSpacePanning
            panSpeed={1.2}
            zoomSpeed={0.75}
            minDistance={1}
            maxDistance={36}
            minPolarAngle={0}
            maxPolarAngle={Math.PI / 2.05}
            mouseButtons={{
              LEFT: MOUSE.PAN,
              MIDDLE: MOUSE.DOLLY,
              RIGHT: MOUSE.ROTATE,
            }}
          />
        </Canvas>
      </div>

      {/* HUD Overlay - EXACT same structure as draft-3d */}
      <div className="absolute inset-0 z-20 pointer-events-none select-none">
        {/* Top controls */}
        <div className="max-w-7xl mx-auto p-4 flex flex-wrap items-end gap-4 pointer-events-auto select-none">
          <div className="text-3xl font-fantaisie text-white">
            Deck Builder
            {isDraftMode && (
              <span className="text-lg text-orange-400 ml-2">
                (Draft Completion Mode)
              </span>
            )}
          </div>

          {/* Deck selector */}
          <div className="flex items-center gap-3">
            <select
              value={deckId || ""}
              onChange={(e) => {
                const v = e.target.value;
                if (v) loadDeck(v);
                else clearEditor();
              }}
              disabled={loadingDecks}
              className="border rounded px-3 py-2 bg-black/70 text-white border-white/30 min-w-48 disabled:opacity-60"
            >
              <option value="">— New Deck —</option>
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} • {d.format}
                </option>
              ))}
            </select>

            <input
              value={deckName}
              onChange={(e) => setDeckName(e.target.value)}
              className="border rounded px-3 py-2 bg-black/70 text-white border-white/30"
              placeholder="Deck name"
            />
          </div>

          {/* Enhanced sorting controls */}
          {pick3D.length > 0 && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsSortingEnabled(!isSortingEnabled)}
                className={`h-10 px-4 rounded font-medium transition-colors ${
                  isSortingEnabled
                    ? "bg-emerald-500 text-black hover:bg-emerald-400"
                    : "bg-white/10 text-white hover:bg-white/20"
                }`}
              >
                {isSortingEnabled ? "Unsort Cards" : "Sort Cards"}
              </button>

              {isSortingEnabled && (
                <>
                  <div className="text-sm text-white/80 px-3 py-2">
                    📋 Deck: Mana + Sites by Element • Sideboard: Elements
                  </div>
                  <button
                    onClick={forceSorting}
                    className="h-10 px-4 rounded bg-blue-600 text-white hover:bg-blue-500 font-medium"
                    title="Re-apply sorting to all cards"
                  >
                    Re-sort
                  </button>
                </>
              )}

              <button
                onClick={() => setInfoBoxVisible(!infoBoxVisible)}
                className="h-10 px-4 rounded bg-white/10 text-white hover:bg-white/20 font-medium"
              >
                {infoBoxVisible ? "Hide Info" : "Show Info"}
              </button>
            </div>
          )}

          {/* Validation status */}
          <div className="flex items-center gap-4 text-sm ml-auto">
            <div
              className={validation.avatar ? "text-green-400" : "text-red-400"}
            >
              Avatar: {avatarCount} / 1
            </div>
            <div
              className={validation.atlas ? "text-green-400" : "text-red-400"}
            >
              Atlas: {atlasCount} / 12+
            </div>
            <div
              className={
                validation.spellbook ? "text-green-400" : "text-red-400"
              }
            >
              Spellbook: {spellbookNonAvatar} / 24+
            </div>
          </div>
        </div>

        {/* EXACT same "Your Picks" panel as draft-3d */}
        <div className="absolute right-6 max-w-7xl mx-auto px-4 pb-6 pt-2 pointer-events-none select-none">
          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-12 lg:col-span-8">
              {/* Empty space where pack info would be in draft */}
            </div>
            <div className="col-span-12 lg:col-span-4">
              <div className="rounded p-3 bg-black/80 ring-1 ring-white/30 shadow-lg pointer-events-none">
                <div className="font-medium mb-2 text-white flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {/* Tabs */}
                    <div className="flex bg-white/10 rounded pointer-events-auto">
                      <button
                        onClick={() => setCardsTab("deck")}
                        className={`px-3 py-1 text-sm rounded-l transition-colors ${
                          cardsTab === "deck"
                            ? "bg-green-600 text-white"
                            : "text-white/80 hover:bg-white/10"
                        }`}
                      >
                        Your Deck ({picksByType.deck + picksByType.sideboard})
                      </button>
                      <button
                        onClick={() => setCardsTab("all")}
                        className={`px-3 py-1 text-sm rounded-r transition-colors ${
                          cardsTab === "all"
                            ? "bg-blue-600 text-white"
                            : "text-white/80 hover:bg-white/10"
                        }`}
                      >
                        All Cards ({yourCounts.reduce((sum, card) => sum + card.count, 0)})
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPicksOpen((v) => !v)}
                      className="text-xs px-2 py-1 bg-white/10 rounded hover:bg-white/20 pointer-events-auto"
                    >
                      {picksOpen ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>

                {/* Deck/Sideboard Summary */}
                {cardsTab === "deck" && picksOpen && (
                  <div className="mb-3 pointer-events-auto">
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-green-600 rounded"></div>
                        <span className="text-green-300">
                          Deck: {picksByType.deck}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-blue-600 rounded"></div>
                        <span className="text-blue-300">
                          Sideboard: {picksByType.sideboard}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {picksOpen && (
                  <div
                    className={`max-h-[52vh] overflow-auto pr-2 grid sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-2 gap-2 text-xs pointer-events-auto`}
                  >
                    {yourCounts
                      .filter((it) => {
                        if (cardsTab === "all") return true;
                        // For "deck" tab, show cards that are in either deck or sideboard zones
                        return pick3D.some(
                          (pick) => pick.card.cardId === it.cardId
                        );
                      })
                      .map((it) => {
                        const meta = metaByCardId[it.cardId];
                        const t =
                          (meta?.thresholds as
                            | Record<string, number>
                            | undefined) || {};
                        const order = [
                          "air",
                          "water",
                          "earth",
                          "fire",
                        ] as const;

                        // Find matching pick to get slug and type info
                        const matchingPick = Object.values(picks).find(
                          (p) => p.cardId === it.cardId
                        );
                        const slug = matchingPick?.slug;
                        const isSite = (matchingPick?.type || "")
                          .toLowerCase()
                          .includes("site");

                        // Get zone information for this card
                        const cardInDeck = pick3D.filter(
                          (p) => p.card.cardId === it.cardId && p.z < 0
                        ).length;
                        const cardInSideboard = pick3D.filter(
                          (p) => p.card.cardId === it.cardId && p.z >= 0
                        ).length;

                        // Enhanced right-click handler with context menu for duplicates
                        const handleContextMenu = (e: React.MouseEvent) => {
                          e.preventDefault();

                          const totalCopies = cardInDeck + cardInSideboard;

                          // If only one copy total, or all copies are in the same zone, use simple move
                          if (
                            totalCopies === 1 ||
                            cardInDeck === 0 ||
                            cardInSideboard === 0
                          ) {
                            if (cardInDeck > 0) {
                              moveOneToSideboard(it.cardId);
                              const remaining = cardInDeck - 1;
                              const message =
                                remaining > 0
                                  ? `Moved "${it.name}" to Sideboard (${remaining} left in deck)`
                                  : `Moved "${it.name}" to Sideboard (deck now empty)`;
                              setFeedbackMessage(message);
                              setTimeout(() => setFeedbackMessage(null), 2000);
                            } else if (cardInSideboard > 0) {
                              moveOneFromSideboardToDeck(it.cardId);
                              const remaining = cardInSideboard - 1;
                              const message =
                                remaining > 0
                                  ? `Moved "${it.name}" to Deck (${remaining} left in sideboard)`
                                  : `Moved "${it.name}" to Deck (sideboard now empty)`;
                              setFeedbackMessage(message);
                              setTimeout(() => setFeedbackMessage(null), 2000);
                            }
                          } else {
                            // Multiple copies in different zones - show context menu
                            const deckCards = pick3D.filter(
                              (p) => p.card.cardId === it.cardId && p.z < 0
                            );
                            const sideboardCards = pick3D.filter(
                              (p) => p.card.cardId === it.cardId && p.z >= 0
                            );

                            setContextMenu({
                              cardId: it.cardId,
                              cardName: it.name,
                              x: e.clientX,
                              y: e.clientY,
                              deckCards,
                              sideboardCards,
                            });
                          }
                        };

                        return (
                          <div
                            key={it.cardId}
                            className="rounded p-2 bg-black/70 ring-1 ring-white/25 text-white cursor-pointer hover:bg-black/50"
                            onMouseEnter={() => {
                              if (slug) {
                                setHoverPreview({
                                  slug,
                                  name: it.name,
                                  type: matchingPick?.type || null,
                                });
                              }
                            }}
                            onMouseLeave={() => setHoverPreview(null)}
                            onContextMenu={handleContextMenu}
                            title={`Right-click to move between Deck/Sideboard`}
                          >
                            <div className="flex items-start gap-2">
                              {slug ? (
                                <div
                                  className={`relative flex-none ${
                                    isSite
                                      ? "aspect-[4/3] w-14"
                                      : "aspect-[3/4] w-12"
                                  } rounded overflow-hidden ring-1 ring-white/10 bg-black/40`}
                                >
                                  <Image
                                    src={`/api/images/${slug}`}
                                    alt={it.name}
                                    fill
                                    className={`${
                                      isSite
                                        ? "object-cover rotate-90"
                                        : "object-cover"
                                    }`}
                                    sizes="(max-width:640px) 20vw, (max-width:1024px) 15vw, 10vw"
                                    priority={false}
                                  />
                                </div>
                              ) : null}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between">
                                  <div className="min-w-0">
                                    <div
                                      className="font-semibold truncate"
                                      title={it.name}
                                    >
                                      {it.name}
                                    </div>
                                    <div className="text-xs opacity-90 flex items-center gap-2">
                                      {cardInDeck > 0 && (
                                        <span className="bg-green-600/20 text-green-300 px-1 py-0.5 rounded text-[10px]">
                                          Deck: {cardInDeck}
                                        </span>
                                      )}
                                      {cardInSideboard > 0 && (
                                        <span className="bg-blue-600/20 text-blue-300 px-1 py-0.5 rounded text-[10px]">
                                          Sideboard: {cardInSideboard}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="text-right font-semibold">
                                    x{it.count}
                                  </div>
                                </div>
                                <div className="mt-1 flex items-center flex-wrap gap-2 opacity-90">
                                  <div className="flex items-center gap-2">
                                    {order.map((k) =>
                                      t[k] ? (
                                        <span
                                          key={k}
                                          className="inline-flex items-center gap-1"
                                        >
                                          {Array.from({ length: t[k] }).map(
                                            (_, i) => (
                                              <Image
                                                key={`${k}-${i}`}
                                                src={`/api/assets/${k}.png`}
                                                alt={k}
                                                width={16}
                                                height={16}
                                                className="pointer-events-none select-none"
                                                priority={false}
                                              />
                                            )
                                          )}
                                        </span>
                                      ) : null
                                    )}
                                  </div>
                                  {meta?.cost != null &&
                                    meta.cost > 0 &&
                                    (meta.cost >= 1 && meta.cost <= 9 ? (
                                      <NumberBadge
                                        value={meta.cost as Digit}
                                        size={24}
                                        strokeWidth={8}
                                      />
                                    ) : (
                                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-white text-black text-xs font-bold">
                                        {meta.cost}
                                      </span>
                                    ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* EXACT same Draft Statistics box as draft-3d */}
        {infoBoxVisible && pick3D.length > 0 && (
          <div className="bottom-6 left-6 pointer-events-auto select-none absolute">
            <div className="rounded p-3 bg-black/80 ring-1 ring-white/30 shadow-lg w-72">
              <div className="font-medium mb-2 text-white">Deck Statistics</div>
              <div className="text-sm text-white/90 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>Deck: {picksByType.deck}</div>
                  <div>Sideboard: {picksByType.sideboard}</div>
                  <div>Creatures: {picksByType.creatures}</div>
                  <div>Spells: {picksByType.spells}</div>
                  <div>Sites: {picksByType.sites}</div>
                  <div>Avatars: {picksByType.avatars}</div>
                </div>

                {/* Mana Curve Diagram */}
                <div>
                  <div className="font-medium mb-1">
                    Mana Curve (Deck Only):
                  </div>
                  <div className="flex items-end gap-1 h-16 bg-black/40 rounded p-2">
                    {Array.from({ length: 10 }, (_, cost) => {
                      const count = manaCurve[cost] || 0;
                      const maxCount = Math.max(...Object.values(manaCurve), 1);
                      const height = (count / maxCount) * 100;

                      return (
                        <div
                          key={cost}
                          className="flex flex-col items-center gap-1 flex-1"
                        >
                          <div
                            className="bg-blue-400 rounded-t min-h-[2px] w-full relative group"
                            style={{
                              height: `${Math.max(height, count > 0 ? 8 : 0)}%`,
                            }}
                            title={`${cost} mana: ${count} cards`}
                          >
                            {count > 0 && (
                              <span className="absolute -top-4 left-1/2 transform -translate-x-1/2 text-xs text-white opacity-75">
                                {count}
                              </span>
                            )}
                          </div>
                          <span className="text-xs opacity-75">{cost}+</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {thresholdSummary.elements.length > 0 && (
                  <div>
                    <div className="font-medium mb-1">Threshold Elements:</div>
                    <div className="flex flex-wrap gap-2">
                      {thresholdSummary.elements.map((element) => (
                        <div key={element} className="flex items-center gap-1">
                          <Image
                            src={`/api/assets/${element}.png`}
                            alt={element}
                            width={16}
                            height={16}
                            className="pointer-events-none select-none"
                          />
                          <span className="capitalize">
                            {" "}
                            {
                              thresholdSummary.summary[
                                element as keyof typeof thresholdSummary.summary
                              ]
                            }
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Card preview - exact copy from draft-3d */}
        {hoverPreview && (
          <div className="fixed bottom-6 right-6 z-50 pointer-events-none select-none">
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
        <div className="absolute bottom-0 left-0 right-0 p-4 pointer-events-auto">
          <div className="max-w-7xl mx-auto">
            <div className="bg-black/80 backdrop-blur-sm rounded-lg p-4">
              <div className="flex flex-wrap items-center gap-4">
                {/* Collapsible Search / Tournament Controls */}
                {!searchExpanded ? (
                  <div className="flex items-center gap-2">
                    {/* In draft mode (locked), show only tournament button */}
                    {isDraftMode ? (
                      pick3D.length > 0 && (
                        <button
                          onClick={() =>
                            setTournamentControlsVisible(
                              !tournamentControlsVisible
                            )
                          }
                          className={`flex items-center gap-2 h-10 px-4 rounded-lg transition-all duration-200 shadow-lg ${
                            tournamentControlsVisible
                              ? "bg-yellow-600 text-white hover:bg-yellow-500"
                              : "bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-500 hover:to-purple-500"
                          }`}
                        >
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 4v16m8-8H4"
                            />
                          </svg>
                          Add Standard Cards
                        </button>
                      )
                    ) : (
                      /* In normal mode, show search button */
                      <>
                        <button
                          onClick={() => setSearchExpanded(true)}
                          className="flex items-center gap-2 h-10 px-4 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-500 hover:to-purple-500 transition-all duration-200 shadow-lg"
                        >
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                            />
                          </svg>
                          Search Cards
                        </button>
                        {/* Tournament Legal Controls Button next to search */}
                        {pick3D.length > 0 && (
                          <button
                            onClick={() =>
                              setTournamentControlsVisible(
                                !tournamentControlsVisible
                              )
                            }
                            className={`h-10 px-4 rounded font-medium transition-colors ${
                              tournamentControlsVisible
                                ? "bg-yellow-600 text-white hover:bg-yellow-500"
                                : "bg-white/10 text-white hover:bg-white/20"
                            }`}
                            title="Show tournament legal cards"
                          >
                            Add Standard Cards
                          </button>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-gray-800/50 to-gray-700/50 rounded-lg backdrop-blur-sm border border-white/10 shadow-xl">
                    {!isDraftMode ? (
                      <>
                        <input
                          value={q}
                          onChange={(e) => setQ(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && doSearch()}
                          className="flex-1 border rounded-lg px-4 py-2 bg-black/60 text-white border-white/20 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 transition-all min-w-64"
                          placeholder="Search all cards..."
                          autoFocus
                        />
                        <select
                          value={typeFilter}
                          onChange={(e) =>
                            setTypeFilter(e.target.value as SearchType)
                          }
                          className="border rounded-lg px-3 py-2 bg-black/60 text-white border-white/20 focus:border-blue-400 focus:outline-none transition-all"
                        >
                          <option value="all">All Types</option>
                          <option value="avatar">Avatars</option>
                          <option value="site">Sites</option>
                          <option value="spell">Spells</option>
                        </select>
                      </>
                    ) : (
                      <>
                        <input
                          value={q}
                          onChange={(e) => setQ(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && doSearch()}
                          className="flex-1 border rounded-lg px-4 py-2 bg-black/60 text-white border-white/20 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 transition-all min-w-64"
                          placeholder="Search spells and sites..."
                          autoFocus
                        />
                        <select
                          value={
                            typeFilter === "all" || typeFilter === "avatar"
                              ? "spell"
                              : typeFilter
                          }
                          onChange={(e) =>
                            setTypeFilter(e.target.value as SearchType)
                          }
                          className="border rounded-lg px-3 py-2 bg-black/60 text-white border-white/20 focus:border-blue-400 focus:outline-none transition-all"
                        >
                          <option value="spell">Spells</option>
                          <option value="site">Sites</option>
                        </select>
                      </>
                    )}
                    <button
                      onClick={doSearch}
                      disabled={searching}
                      className="h-10 px-6 rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium shadow-lg"
                    >
                      {searching ? (
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                          Searching...
                        </div>
                      ) : (
                        "Search"
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setSearchExpanded(false);
                        setResults([]);
                        setQ("");
                      }}
                      className="h-10 w-10 rounded-lg bg-gray-600/50 text-white hover:bg-gray-500/50 transition-all flex items-center justify-center"
                      title="Close search"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                )}

                {/* Search Results */}
                {!!results.length && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-white font-medium">
                        Search Results ({results.length} cards)
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-96 overflow-y-auto">
                      {results.map((r) => {
                        const isSite = (r.type || "")
                          .toLowerCase()
                          .includes("site");
                        return (
                          <div
                            key={r.variantId}
                            className="border border-white/30 rounded p-2 bg-black/70 text-white text-xs"
                          >
                            <div className="relative aspect-[3/4] mb-2 rounded overflow-hidden bg-black/40">
                              <Image
                                src={`/api/images/${r.slug}`}
                                alt={r.cardName}
                                fill
                                className={
                                  isSite
                                    ? "object-contain rotate-90"
                                    : "object-cover"
                                }
                                sizes="120px"
                              />
                            </div>
                            <div className="font-semibold line-clamp-1 mb-1">
                              {r.cardName}
                            </div>
                            <div className="opacity-80 line-clamp-1 mb-2">
                              {r.type || ""}
                            </div>
                            <div className="flex gap-1">
                              <button
                                className="px-2 py-1 border border-white/30 rounded hover:bg-white/10"
                                onClick={() => addCardAuto(r)}
                              >
                                + Deck
                              </button>
                              <button
                                className="px-2 py-1 border border-white/30 rounded hover:bg-white/10"
                                onClick={() => addToSideboardFromSearch(r)}
                              >
                                + Side
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 ml-auto">
                  {isDraftMode && (
                    <button
                      onClick={() => setIsDraftMode(false)}
                      className="h-10 px-4 rounded bg-orange-600 text-white"
                      title="Enable full deck editing"
                    >
                      Exit Draft Mode
                    </button>
                  )}
                  <button
                    onClick={saveDeck}
                    disabled={
                      saving ||
                      (isDraftMode &&
                        (!validation.avatar ||
                          !validation.atlas ||
                          !validation.spellbook))
                    }
                    className="h-10 px-4 rounded bg-green-600 text-white disabled:opacity-50"
                    title={
                      isDraftMode &&
                      (!validation.avatar ||
                        !validation.atlas ||
                        !validation.spellbook)
                        ? "Cannot save invalid deck in draft mode"
                        : undefined
                    }
                  >
                    {saving
                      ? "Saving..."
                      : deckId
                      ? "Update Deck"
                      : "Save Deck"}
                  </button>
                </div>
              </div>

              {error && (
                <div className="mt-2 text-red-400 text-sm">Error: {error}</div>
              )}

              {saveMsg && (
                <div className="mt-2 text-green-400 text-sm">{saveMsg}</div>
              )}
            </div>
            {/* Usage instructions */}
            <div className="text-white text-sm opacity-30">
              {isDraftMode
                ? "📝 Draft Complete! You can only add spells & sites • Drag cards to organize your deck"
                : "💡 Drag cards between zones • Click card to toggle Deck ⟷ Sideboard"}
            </div>
          </div>
        </div>
      </div>

      {/* Tournament Legal Controls - Floating panel on left side */}
      {tournamentControlsVisible && (
        <div className="absolute top-20 left-6 z-30 pointer-events-auto">
          <div className="bg-black/90 backdrop-blur-sm rounded-lg p-4 ring-1 ring-white/30 shadow-xl max-w-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="text-white text-sm font-medium">
                Tournament Legal Cards
              </div>
              <button
                onClick={() => setTournamentControlsVisible(false)}
                className="text-white/60 hover:text-white text-xl leading-none"
                title="Close"
              >
                ×
              </button>
            </div>

            {/* Spellslinger Avatar - Display as card */}
            <div className="mb-4">
              <div className="text-xs uppercase opacity-70 text-white mb-2">
                Default Avatar
              </div>
              <div className="flex justify-center">
                <button
                  onClick={addSpellslinger}
                  className="group relative hover:bg-white/10 rounded p-1 transition-colors"
                  title="Add Spellslinger avatar to your deck"
                >
                  <div className="relative aspect-[3/4] rounded overflow-hidden bg-black/40">
                    <Image
                      src={
                        spellslingerCard?.slug
                          ? `/api/images/${spellslingerCard.slug}`
                          : "/api/assets/card-back.png"
                      }
                      alt="Spellslinger"
                      fill
                      className="object-contain"
                      sizes="120px"
                    />
                  </div>
                  <div className="mt-1 text-[10px] text-center opacity-80 text-white">
                    Spellslinger
                  </div>
                </button>
              </div>
            </div>

            {/* Standard Sites */}
            <div className="text-xs uppercase opacity-70 text-white mb-2">
              Standard Sites
            </div>
            <div className="grid grid-cols-4 gap-2">
              {STANDARD_SITE_NAMES.map((name: StandardSiteName) => {
                const hit = stdSites[name];
                const isSite = true;
                return (
                  <button
                    key={name}
                    onClick={() => addStandardSiteByName(name)}
                    className="group relative hover:bg-white/10 rounded p-1 transition-colors"
                    title={`Add ${name} to your Atlas`}
                  >
                    <div className="relative aspect-[4/3] rounded overflow-hidden bg-black/40 transform rotate-90">
                      <Image
                        src={
                          hit?.slug
                            ? `/api/images/${hit.slug}`
                            : "/api/assets/card-back.png"
                        }
                        alt={name}
                        fill
                        className="object-contain"
                        sizes="80px"
                      />
                    </div>
                    <div className="mt-1 text-[10px] text-center opacity-80 text-white">
                      {name}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
