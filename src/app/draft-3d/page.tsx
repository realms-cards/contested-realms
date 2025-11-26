"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { MOUSE, TOUCH } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import DraggableCard3D from "@/app/decks/editor-3d/DraggableCard3D";
import CardPreviewOverlay from "@/components/game/CardPreviewOverlay";
import { DynamicBoard as Board } from "@/components/game/dynamic-3d";
import { NumberBadge } from "@/components/game/manacost";
import type { Digit } from "@/components/game/manacost";
import {
  BoosterCard,
  Pick3D,
  Rarity,
  categorizeCard,
  computeStackPositions,
  weightForRarity,
  choiceWeighted,
} from "@/lib/game/cardSorting";
import DraftPackHand3D from "@/lib/game/components/DraftPackHand3D";
import MouseTracker from "@/lib/game/components/MouseTracker";
import TextureCache from "@/lib/game/components/TextureCache";
import { CARD_LONG } from "@/lib/game/constants";
import { Physics } from "@/lib/game/physics";
import { createStackHoverState } from "@/lib/game/stackHover";
import { useOrbitKeyboardPan } from "@/lib/hooks/useOrbitKeyboardPan";

// --- Draft data types (mirrors /draft 2D) ---
// Types moved to src/lib/game/cardSorting.ts

export default function Draft3DPage() {
  const router = useRouter();
  const { status } = useSession();
  // --- Draft state (mirrors /draft 2D page) ---
  // Multi-set support: choose a set per pack column
  const [setNames, setSetNames] = useState<string[]>([
    "Alpha",
    "Alpha",
    "Alpha",
  ]);
  const [players, setPlayers] = useState(8);
  const [replaceAvatars, setReplaceAvatars] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cube draft support
  const [useCube, setUseCube] = useState(false);
  const [cubeId, setCubeId] = useState<string>("");
  const [cubes, setCubes] = useState<Array<{ id: string; name: string }>>([]);

  // Fetch available cubes on mount
  useEffect(() => {
    async function loadCubes() {
      try {
        const resp = await fetch("/api/cubes");
        if (!resp.ok) return;
        const data = await resp.json();
        const allCubes = [
          ...(data.myCubes || []).map((c: { id: string; name: string }) => ({
            id: c.id,
            name: c.name,
          })),
          ...(data.publicCubes || []).map(
            (c: { id: string; name: string }) => ({ id: c.id, name: c.name })
          ),
        ];
        setCubes(allCubes);
        if (allCubes.length > 0) {
          setCubeId(allCubes[0].id);
        }
      } catch (e) {
        console.warn("Failed to load cubes:", e);
      }
    }
    loadCubes();
  }, []);

  const [seatPacks, setSeatPacks] = useState<BoosterCard[][][]>([]); // [seat][packIndex][cards]
  const [currentPacks, setCurrentPacks] = useState<BoosterCard[][]>([]); // [seat][cards]
  const [packIndex, setPackIndex] = useState(0); // 0..2
  const [pickNumber, setPickNumber] = useState(1); // 1..15

  const [yourPicks, setYourPicks] = useState<BoosterCard[]>([]);
  const [botPicks, setBotPicks] = useState<BoosterCard[][]>([]); // [botIndex][cards]
  const [saving, setSaving] = useState(false);
  const [deckName, setDeckName] = useState("Draft Deck");
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  // Disable orbit while dragging any draft card
  const [orbitLocked, setOrbitLocked] = useState(false);
  // Render order counter for stacking
  const roCounterRef = useRef(1500);
  const getTopRenderOrder = useCallback(() => {
    roCounterRef.current += 1;
    return roCounterRef.current;
  }, []);

  // 3D state for your arranged picks on the board
  // Using shared Pick3D type from src/lib/game/cardSorting.ts
  const [pick3D, setPick3D] = useState<Pick3D[]>([]);
  const [nextPickId, setNextPickId] = useState(1);

  // Hover preview timer to prevent immediate clearing
  const clearHoverTimerRef = useRef<number | null>(null);
  const currentHoverCardRef = useRef<string | null>(null);

  // Stack hover tracking for better navigation
  const stackHoverRef = useRef(createStackHoverState());

  // Global mouse tracking for stack navigation
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      stackHoverRef.current.lastMouseY = e.clientY;
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (clearHoverTimerRef.current) {
        window.clearTimeout(clearHoverTimerRef.current);
      }
    };
  }, []);

  const dir = useMemo(() => (packIndex === 1 ? -1 : 1), [packIndex]); // L-R-L
  const inProgress = useMemo(
    () => currentPacks.length > 0 && packIndex < 3,
    [currentPacks, packIndex]
  );

  async function startDraft() {
    try {
      setStarting(true);
      setError(null);
      setSaveMsg(null);

      // Validate cube selection if cube mode is enabled
      if (useCube && !cubeId) {
        setError("Please select a cube for cube draft mode");
        setStarting(false);
        return;
      }

      setYourPicks([]);
      setPick3D([]);
      setNextPickId(1);
      setBotPicks([]);
      setSeatPacks([]);
      setCurrentPacks([]);
      setPackIndex(0);
      setPickNumber(1);
      setPackChoice([null, null, null]);

      let packsA: BoosterCard[][],
        packsB: BoosterCard[][],
        packsC: BoosterCard[][];

      // Cube draft mode - generate all packs from the same cube
      if (useCube && cubeId) {
        const resp = await fetch(
          `/api/booster?cube=${encodeURIComponent(cubeId)}&count=${players * 3}`
        );
        const data = await resp.json();
        if (!resp.ok) {
          throw new Error(data?.error || "Failed to generate cube boosters");
        }

        const allPacks: BoosterCard[][] = data.packs || [];
        // Split into 3 rounds
        packsA = allPacks.slice(0, players);
        packsB = allPacks.slice(players, players * 2);
        packsC = allPacks.slice(players * 2, players * 3);
      } else {
        // Regular set-based draft mode
        const [setA, setB, setC] = setNames;
        const avatarParam = replaceAvatars ? "&replaceAvatars=true" : "";
        const [respA, respB, respC] = await Promise.all([
          fetch(
            `/api/booster?set=${encodeURIComponent(
              setA
            )}&count=${players}${avatarParam}`
          ),
          fetch(
            `/api/booster?set=${encodeURIComponent(
              setB
            )}&count=${players}${avatarParam}`
          ),
          fetch(
            `/api/booster?set=${encodeURIComponent(
              setC
            )}&count=${players}${avatarParam}`
          ),
        ]);
        const [dataA, dataB, dataC] = await Promise.all([
          respA.json(),
          respB.json(),
          respC.json(),
        ]);
        if (!respA.ok)
          throw new Error(
            dataA?.error || `Failed to generate boosters for ${setA}`
          );
        if (!respB.ok)
          throw new Error(
            dataB?.error || `Failed to generate boosters for ${setB}`
          );
        if (!respC.ok)
          throw new Error(
            dataC?.error || `Failed to generate boosters for ${setC}`
          );

        packsA = (dataA.packs || []).map((pack: BoosterCard[]) =>
          (pack || []).map((c) => ({ ...c, setName: setA }))
        );
        packsB = (dataB.packs || []).map((pack: BoosterCard[]) =>
          (pack || []).map((c) => ({ ...c, setName: setB }))
        );
        packsC = (dataC.packs || []).map((pack: BoosterCard[]) =>
          (pack || []).map((c) => ({ ...c, setName: setC }))
        );
      }

      // Assign 3 packs per seat
      const seats: BoosterCard[][][] = Array.from({ length: players }, () => [
        [],
        [],
        [],
      ]);
      for (let s = 0; s < players; s++) {
        seats[s][0] = packsA[s] ?? [];
        seats[s][1] = packsB[s] ?? [];
        seats[s][2] = packsC[s] ?? [];
      }
      setSeatPacks(seats);
      setCurrentPacks(seats.map((seat) => [...seat[0]]));
      setBotPicks(Array.from({ length: Math.max(0, players - 1) }, () => []));
      setPackIndex(0);
      setPickNumber(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  }

  const rotatePacks = useCallback(
    (packs: BoosterCard[][], direction: number): BoosterCard[][] => {
      if (!packs.length) return packs;
      const n = packs.length;
      const out = Array.from({ length: n }, () => [] as BoosterCard[]);
      for (let i = 0; i < n; i++) {
        const j = (i + direction + n) % n; // pass to neighbor
        out[j] = packs[i];
      }
      return out;
    },
    []
  );

  const botPickFrom = useCallback((pack: BoosterCard[]): number => {
    if (!pack.length) return -1;
    const weighted = pack.map((c, idx) => ({
      item: idx,
      weight: weightForRarity(c.rarity),
    }));
    const choice = choiceWeighted(weighted);
    return typeof choice === "number" ? choice : 0;
  }, []);

  // removed unused makeHumanPick (staged pick + pass flow replaces it)

  // Pack cards are rendered via DraftPackHand3D anchored to camera (no fan)

  // Staged pick flow
  const [readyIdx, setReadyIdx] = useState<number | null>(null);
  const [staged, setStaged] = useState<{
    idx: number;
    x: number;
    z: number;
  } | null>(null);
  const [pickedThisTurn, setPickedThisTurn] = useState(false);
  const PICK_CENTER = { x: 0, z: 0 };
  const PICK_RADIUS = CARD_LONG * 0.6;
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const STAGE_CLICK_POS = { x: 0, z: 1.7 };
  const STAGE_X = STAGE_CLICK_POS.x;
  const STAGE_Z = STAGE_CLICK_POS.z;
  // Pack selection per round (choose which of your 3 to open for this packIndex)
  const [packChoice, setPackChoice] = useState<(number | null)[]>([
    null,
    null,
    null,
  ]);
  const needsPackChoice =
    inProgress && pickNumber === 1 && packChoice[packIndex] == null;

  const choosePackToCrack = useCallback(
    (choiceIdx: number) => {
      if (choiceIdx < 0 || choiceIdx > 2) return;
      // prevent choosing a pack already used in a previous round
      if (packChoice.some((v, i) => i !== packIndex && v === choiceIdx)) return;
      const seats = seatPacks.map((seat) => [
        [...(seat[0] ?? [])],
        [...(seat[1] ?? [])],
        [...(seat[2] ?? [])],
      ]);
      if (choiceIdx !== packIndex) {
        const tmp = seats[0][packIndex];
        seats[0][packIndex] = seats[0][choiceIdx];
        seats[0][choiceIdx] = tmp;
      }
      setSeatPacks(seats);
      setCurrentPacks(seats.map((s) => [...s[packIndex]]));
      setPackChoice((prev) => {
        const out = [...prev];
        out[packIndex] = choiceIdx;
        return out;
      });
    },
    [seatPacks, packChoice, packIndex]
  );

  // commitPickOnly/passAfterPick removed; using staged Pick & Pass flow via commitPickAndPass

  // Pick + pass in a single action using the current state snapshot
  const commitPickAndPass = useCallback(
    (cardIdx: number, wx: number, wz: number) => {
      if (!inProgress) return;
      const cur = currentPacks.map((p) => [...p]);
      const myPack = cur[0];
      if (!myPack || cardIdx < 0 || cardIdx >= myPack.length) return;
      const picked = myPack.splice(cardIdx, 1)[0];
      // Commit your pick
      setYourPicks((prev) => [...prev, picked]);
      setPick3D((prev) => [
        ...prev,
        {
          id: nextPickId,
          card: picked,
          x: wx,
          z: wz,
          zone: wz < 0 ? "Deck" : "Sideboard",
        },
      ]);
      setNextPickId((n) => n + 1);

      // Bots pick
      const botChosen: { botIdx: number; card: BoosterCard | null }[] = [];
      for (let s = 1; s < cur.length; s++) {
        const idx = botPickFrom(cur[s]);
        let chosen: BoosterCard | null = null;
        if (idx >= 0 && idx < cur[s].length) {
          chosen = cur[s].splice(idx, 1)[0];
        }
        botChosen.push({ botIdx: s - 1, card: chosen });
      }
      if (botChosen.length) {
        setBotPicks((prev) => {
          const out =
            prev.length === botChosen.length
              ? prev.map((arr) => [...arr])
              : Array.from({ length: botChosen.length }, (_, i) =>
                  prev[i] ? [...prev[i]] : []
                );
          for (const { botIdx, card } of botChosen) {
            if (card) out[botIdx].push(card);
          }
          return out;
        });
      }

      // Rotate packs
      const passed = rotatePacks(cur, dir);
      const myNewPack = passed[0];
      let nextPi = packIndex;
      let nextPn = pickNumber + 1;
      if (myNewPack.length === 0) {
        const np = packIndex + 1;
        nextPi = np;
        if (np >= 3) {
          setCurrentPacks([]);
        } else {
          setCurrentPacks(seatPacks.map((seat) => [...seat[np]]));
        }
        nextPn = 1;
      } else {
        setCurrentPacks(passed);
      }
      setPackIndex(nextPi);
      setPickNumber(nextPn);
      // Cleanup staged state
      setPickedThisTurn(false);
      setStaged(null);
      setReadyIdx(null);
    },
    [
      inProgress,
      currentPacks,
      rotatePacks,
      dir,
      packIndex,
      pickNumber,
      seatPacks,
      botPickFrom,
      nextPickId,
    ]
  );

  const yourCounts = useMemo(() => {
    const map = new Map<
      number,
      { name: string; rarity: Rarity; count: number }
    >();
    for (const c of yourPicks) {
      const it = map.get(c.cardId) || {
        name: c.cardName,
        rarity: c.rarity,
        count: 0,
      };
      it.count += 1;
      map.set(c.cardId, it);
    }
    return Array.from(map.entries())
      .map(([cardId, v]) => ({ cardId, ...v }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [yourPicks]);

  // Auto-pick the last remaining card in a pack
  useEffect(() => {
    if (!inProgress) return;
    if (needsPackChoice) return;
    const mine = currentPacks[0] || [];
    if (mine.length !== 1) return;
    const guardKey = `${packIndex}-${pickNumber}`;
    if (autoPickGuardRef.current === guardKey) return;
    autoPickGuardRef.current = guardKey;
    // Commit the only remaining card immediately
    const idx = 0;
    commitPickAndPass(idx, STAGE_X, STAGE_Z);
  }, [
    inProgress,
    needsPackChoice,
    currentPacks,
    packIndex,
    pickNumber,
    commitPickAndPass,
    STAGE_X,
    STAGE_Z,
  ]);

  // Spacebar Pick & Pass (only when draft in progress and a card is staged)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!inProgress) return;
      if (e.code !== "Space") return;
      const ae = document.activeElement as HTMLElement | null;
      const isTyping =
        ae &&
        (ae.tagName === "INPUT" ||
          ae.tagName === "TEXTAREA" ||
          ae.isContentEditable);
      if (isTyping) return;

      // Stop the event from being processed by other handlers (like OrbitControls)
      e.preventDefault();
      e.stopPropagation();

      if (staged) {
        commitPickAndPass(staged.idx, staged.x, staged.z);
      }
    };
    // Use capture phase to get the event before other handlers
    window.addEventListener("keydown", onKey, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKey, { capture: true });
  }, [inProgress, staged, commitPickAndPass]);

  // Map cardId -> { slug, type } for quick lookup (for previews in picks panel)
  const cardInfoById = useMemo(() => {
    const m: Record<number, { slug: string; type: string | null }> = {};
    for (const c of yourPicks) {
      if (!m[c.cardId]) m[c.cardId] = { slug: c.slug, type: c.type };
    }
    return m;
  }, [yourPicks]);

  // Collapsible picks panel + metadata (cost/thresholds) for your picks
  const [picksOpen, setPicksOpen] = useState(true);
  const [compactPicks, setCompactPicks] = useState(true);
  // Hover preview card (like play page previewCard without magnifier logic)
  const [hoverPreview, setHoverPreview] = useState<{
    slug: string;
    name: string;
    type: string | null;
  } | null>(null);

  // Helper functions for consistent hover management
  const showCardPreview = useCallback(
    (card: { slug: string; name: string; type: string | null }) => {
      // Clear any pending hide timer - we're actively showing a card
      if (clearHoverTimerRef.current) {
        window.clearTimeout(clearHoverTimerRef.current);
        clearHoverTimerRef.current = null;
      }

      // Show preview immediately and keep it shown while hovering
      currentHoverCardRef.current = card.slug;
      setHoverPreview(card);
    },
    []
  ); // setHoverPreview is stable, no need to include it

  const hideCardPreview = useCallback(() => {
    // Small delay before hiding to handle quick mouse movements between cards
    if (clearHoverTimerRef.current) {
      window.clearTimeout(clearHoverTimerRef.current);
    }

    clearHoverTimerRef.current = window.setTimeout(() => {
      currentHoverCardRef.current = null;
      setHoverPreview(null);
      clearHoverTimerRef.current = null;
    }, 120);
  }, []); // setHoverPreview is stable, no need to include it
  const [metaByCardId, setMetaByCardId] = useState<
    Record<
      number,
      {
        cost: number | null;
        thresholds: Record<string, number> | null;
        attack: number | null;
        defence: number | null;
      }
    >
  >({});

  // Sorting state
  const [isSortingEnabled, setIsSortingEnabled] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("draft3d_sorting_pref");
      if (raw === "on") setIsSortingEnabled(true);
      else if (raw === "off") setIsSortingEnabled(false);
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        "draft3d_sorting_pref",
        isSortingEnabled ? "on" : "off"
      );
    } catch {}
  }, [isSortingEnabled]);
  const autoPickGuardRef = useRef<string | null>(null);
  useEffect(() => {
    if (!yourPicks.length) {
      setMetaByCardId({});
      return;
    }
    // Group cardIds by set for mixed-set meta queries
    const groups = new Map<string, Set<number>>();
    for (const c of yourPicks) {
      const s = c.setName || setNames[0] || "Alpha";
      const setIds = groups.get(s) || new Set<number>();
      setIds.add(c.cardId);
      groups.set(s, setIds);
    }
    const requests = Array.from(groups.entries()).map(([s, ids]) => {
      const params = new URLSearchParams();
      params.set("set", s);
      params.set("ids", Array.from(ids).join(","));
      return fetch(`/api/cards/meta?${params.toString()}`)
        .then((r) => r.json())
        .then(
          (
            rows: {
              cardId: number;
              cost: number | null;
              thresholds: Record<string, number> | null;
              attack: number | null;
              defence: number | null;
            }[]
          ) => rows
        )
        .catch(
          () =>
            [] as {
              cardId: number;
              cost: number | null;
              thresholds: Record<string, number> | null;
              attack: number | null;
              defence: number | null;
            }[]
        );
    });
    Promise.all(requests).then((chunks) => {
      const next: Record<
        number,
        {
          cost: number | null;
          thresholds: Record<string, number> | null;
          attack: number | null;
          defence: number | null;
        }
      > = {};
      for (const rows of chunks) {
        for (const m of rows)
          next[m.cardId] = {
            cost: m.cost,
            thresholds: m.thresholds,
            attack: m.attack,
            defence: m.defence,
          };
      }
      setMetaByCardId(next);
    });
  }, [yourPicks, setNames]);

  // Card categorization helpers moved to shared module

  // Sorting is handled by computeStackPositions when enabled

  // Calculate threshold summary
  const thresholdSummary = useMemo(() => {
    const summary = { air: 0, water: 0, earth: 0, fire: 0 };
    const elements = new Set<string>();

    for (const pick of yourPicks) {
      const meta = metaByCardId[pick.cardId];
      if (meta?.thresholds) {
        Object.keys(meta.thresholds).forEach((element) => {
          const value = meta.thresholds?.[element] ?? 0;
          if (value > 0) {
            elements.add(element);
            summary[element as keyof typeof summary] = Math.max(
              summary[element as keyof typeof summary],
              value
            );
          }
        });
      }
    }

    return { summary, elements: Array.from(elements) };
  }, [yourPicks, metaByCardId]);

  // Calculate picks by type
  const picksByType = useMemo(() => {
    const counts = { creatures: 0, spells: 0, sites: 0, avatars: 0 };

    for (const pick of yourPicks) {
      const meta = metaByCardId[pick.cardId];
      const category = categorizeCard(pick, meta);
      counts[category as keyof typeof counts]++;
    }

    return counts;
  }, [yourPicks, metaByCardId]);

  // Create sorted stack positions (treat all as deck for draft positioning)
  const stackPositions = useMemo(() => {
    return computeStackPositions(pick3D, metaByCardId, isSortingEnabled, true);
  }, [pick3D, isSortingEnabled, metaByCardId]);

  // Calculate stack sizes for hitbox optimization
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

  async function saveDeck() {
    try {
      setSaving(true);
      setError(null);
      setSaveMsg(null);
      const cards = yourPicks.map((c) => ({
        cardId: c.cardId,
        variantId: c.variantId,
        zone: "Sideboard" as const,
        count: 1,
      }));
      const uniqueSets = Array.from(
        new Set(yourPicks.map((c) => c.setName).filter(Boolean))
      );
      const topLevelSet =
        uniqueSets.length === 1 ? String(uniqueSets[0]) : undefined;
      const res = await fetch("/api/decks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: deckName || "Draft Deck",
          format: "Draft",
          ...(topLevelSet ? { set: topLevelSet } : {}),
          cards,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to save deck");

      // Auto-save first bot's deck if available
      let botMsg = "";
      const firstBot = botPicks[0] || [];
      if (firstBot.length) {
        const botCards = firstBot.map((c) => ({
          cardId: c.cardId,
          variantId: c.variantId,
          zone: "Sideboard" as const,
          count: 1,
        }));
        const resBot = await fetch("/api/decks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: `${deckName || "Draft Deck"} (Bot)`,
            format: "Draft",
            // Omit top-level set for mixed bot picks; server will infer via variantId
            cards: botCards,
          }),
        });
        const dataBot = await resBot.json();
        if (resBot.ok)
          botMsg = ` and bot deck ${dataBot.name} (id: ${dataBot.id})`;
      }
      setSaveMsg(`Saved deck ${data.name} (id: ${data.id})${botMsg}`);
      try {
        if (typeof window !== "undefined" && Array.isArray(pick3D)) {
          const layout = !isSortingEnabled
            ? pick3D.map((p) => ({
                cardId: p.card.cardId,
                zone: p.zone,
                x: p.x,
                z: p.z,
              }))
            : [];
          const layoutKey = `draftLayout_deck_${String(data.id)}`;
          const prefsKey = `draftStackPrefs_deck_${String(data.id)}`;
          window.localStorage.setItem(layoutKey, JSON.stringify(layout));
          window.localStorage.setItem(
            prefsKey,
            JSON.stringify({ isSortingEnabled })
          );
        }
      } catch (err) {
        try {
          console.warn("Failed to persist draft 3D layout:", err);
        } catch {}
      }
      // Navigate to 3D deck editor with new deck loaded in draft completion mode
      console.log("Navigating to editor-3d with deck:", data.id);
      const editorUrl = `/decks/editor-3d?id=${encodeURIComponent(
        data.id
      )}&from=draft`;
      console.log("Editor URL:", editorUrl);

      // Use window.location.href as a fallback if router.push fails
      try {
        await router.push(editorUrl);
        // If navigation succeeds, don't reset saving state - let the next page handle it
        return;
      } catch (navError) {
        console.error(
          "Router navigation failed, using window.location:",
          navError
        );
        window.location.href = editorUrl;
        return; // Don't reset saving state on redirect
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 w-screen h-screen">
      {/* 3D Game View as the stage */}
      <Canvas
        camera={{ position: [0, 10, 0], fov: 50 }}
        shadows
        gl={{ preserveDrawingBuffer: true, antialias: true, alpha: false }}
      >
        <color attach="background" args={["#0b0b0c"]} />
        <ambientLight intensity={0.8} />
        <directionalLight position={[10, 12, 8]} intensity={1.35} castShadow />

        <Physics gravity={[0, -9.81, 0]}>
          {/* Board re-enabled for proper playmat, with raycast disabled for draft mode */}
          <Board noRaycast={true} />
        </Physics>

        <TextureCache />

        {/* Mouse tracking for precise card hover detection */}
        <MouseTracker
          cards={pick3D}
          onHover={(card) => {
            if (card) {
              showCardPreview({
                slug: card.slug,
                name: card.name,
                type: card.type,
              });
            } else {
              hideCardPreview();
            }
          }}
        />

        {/* Threshold ring and per-card glow removed for cleaner draft UI */}

        {/* 3D Draft: current pack cards displayed as a straight hand row (no fan) */}
        {inProgress && !needsPackChoice && (
          <DraftPackHand3D
            cards={currentPacks[0] || []}
            disabled={pickedThisTurn}
            hiddenIndex={staged?.idx ?? null}
            onDragChange={setOrbitLocked}
            getTopRenderOrder={getTopRenderOrder}
            transitionEnabled
            transitionKey={`${packIndex}:${pickNumber}`}
            passDirection={dir === 1 ? "right" : "left"}
            transitionDurationMs={480}
            onHoverInfo={(info) => {
              if (info) {
                showCardPreview(info);
              } else {
                hideCardPreview();
              }
            }}
            onDragMove={(idx, wx, wz) => {
              const d = Math.hypot(wx - PICK_CENTER.x, wz - PICK_CENTER.z);
              if (d > PICK_RADIUS) setReadyIdx(idx);
              else if (readyIdx === idx) setReadyIdx(null);
            }}
            onRelease={(idx, wx, wz) => {
              const d = Math.hypot(wx - PICK_CENTER.x, wz - PICK_CENTER.z);
              if (d > PICK_RADIUS) {
                setStaged({ idx, x: wx, z: wz });
                setSelectedRowIndex(null);
                const c = currentPacks[0]?.[idx];
                if (c)
                  showCardPreview({
                    slug: c.slug,
                    name: c.cardName,
                    type: c.type ?? null,
                  });
              } else if (staged && staged.idx === idx) {
                setStaged(null);
              }
            }}
            selectedIndex={selectedRowIndex}
            onSelectIndex={(idx) => {
              setSelectedRowIndex(idx);
              if (idx != null) {
                // Stage on click to lower side of the board temporarily
                setStaged({
                  idx,
                  x: STAGE_CLICK_POS.x,
                  z: STAGE_CLICK_POS.z,
                });
                // Clear explicit selection to avoid preview mismatch
                setSelectedRowIndex(null);
                const c = currentPacks[0]?.[idx];
                if (c)
                  showCardPreview({
                    slug: c.slug,
                    name: c.cardName,
                    type: c.type ?? null,
                  });
              } else {
                hideCardPreview();
              }
            }}
            orbitLocked={orbitLocked}
          />
        )}

        {/* 3D Draft: staged card representation on the board (draggable to reposition or unstage) */}
        {inProgress &&
          staged &&
          !needsPackChoice &&
          currentPacks[0]?.[staged.idx] && (
            <DraggableCard3D
              key={`staged-${packIndex}-${pickNumber}-${staged.idx}`}
              slug={currentPacks[0]?.[staged.idx]?.slug ?? ""}
              isSite={(currentPacks[0]?.[staged.idx]?.type || "")
                .toLowerCase()
                .includes("site")}
              x={staged.x}
              z={staged.z}
              cardId={currentPacks[0]?.[staged.idx]?.cardId}
              cardName={
                currentPacks[0]?.[staged.idx]?.cardName ??
                currentPacks[0]?.[staged.idx]?.slug ??
                ""
              }
              cardType={currentPacks[0]?.[staged.idx]?.type ?? null}
              onDrop={(wx, wz) => {
                setStaged((prev) =>
                  prev && prev.idx === staged.idx
                    ? { ...prev, x: wx, z: wz }
                    : prev
                );
              }}
              onDragChange={setOrbitLocked}
              getTopRenderOrder={getTopRenderOrder}
              lockUpright
              onHoverStart={(preview) => {
                if (!preview || orbitLocked) return;
                showCardPreview(preview);
              }}
              onHoverEnd={() => {
                hideCardPreview();
              }}
              onRelease={(wx, wz) => {
                const d = Math.hypot(wx - PICK_CENTER.x, wz - PICK_CENTER.z);
                if (d <= PICK_RADIUS) {
                  // Move back into radius -> unstage
                  setStaged(null);
                  hideCardPreview();
                }
              }}
              // For draft session, prefer raster textures for lower cost and faster churn
              preferRaster
            />
          )}

        {/* 3D Draft: your picked cards remain on the mat and stay draggable */}
        {pick3D.length > 0 && (
          <group>
            {pick3D.map((p) => {
              const isSite = (p.card.type || "").toLowerCase().includes("site");

              // Use sorted position if sorting is enabled
              const stackPos = stackPositions?.get(p.id);
              // Add X offset for each card in stack for better targeting
              const x = stackPos
                ? stackPos.x + stackPos.stackIndex * 0.03
                : p.x;
              const z = stackPos ? stackPos.z : p.z;
              // Calculate Y position with very large spacing to prevent raycast blocking
              const y = stackPos ? 0.002 + stackPos.stackIndex * 0.05 : 0.002;
              const isVisible = stackPos ? stackPos.isVisible : true;
              // Higher stack index = higher render order = rendered on top
              const baseRO = stackPos ? 1600 + stackPos.stackIndex * 10 : 1500;

              // Calculate stack information for hitbox optimization
              const stackKey = stackPos
                ? `${stackPos.x.toFixed(3)},${stackPos.z.toFixed(3)}`
                : null;
              const totalInStack = stackKey ? stackSizes.get(stackKey) || 1 : 1;
              const stackIndex = stackPos ? stackPos.stackIndex : 0;

              return (
                <DraggableCard3D
                  key={`pick-${p.id}`}
                  slug={p.card.slug}
                  isSite={isSite}
                  x={x}
                  z={z}
                  y={y}
                  baseRenderOrder={baseRO}
                  stackIndex={stackIndex}
                  totalInStack={totalInStack}
                  cardId={p.id}
                  onDrop={(wx, wz) => {
                    if (!isSortingEnabled) {
                      setPick3D((prev) =>
                        prev.map((it) =>
                          it.id === p.id ? { ...it, x: wx, z: wz } : it
                        )
                      );
                    }
                  }}
                  onDragChange={setOrbitLocked}
                  getTopRenderOrder={getTopRenderOrder}
                  lockUpright
                  disabled={isSortingEnabled && !isVisible}
                  // Prefer raster textures for draft board
                  preferRaster
                />
              );
            })}
          </group>
        )}

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
          minDistance={2}
          maxDistance={28}
          minPolarAngle={0.05}
          maxPolarAngle={0.35}
          mouseButtons={{
            MIDDLE: MOUSE.PAN,
            RIGHT: MOUSE.ROTATE,
          }}
          touches={{ TWO: TOUCH.PAN }}
        />
        <ClampOrbitTarget bounds={{ minX: -8, maxX: 8, minZ: -6, maxZ: 6 }} />
        <KeyboardPanControls enabled={!orbitLocked} />
      </Canvas>

      {/* Overlays */}
      <div className="fixed inset-0 z-[100] pointer-events-none select-none">
        {/* Minimal Navigation (top-right) */}
        {status !== "authenticated" && (
          <div className="absolute top-3 right-4 pointer-events-auto text-xs flex items-center gap-3">
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
        {/* Top controls */}
        <div className="max-w-7xl mx-auto p-4 flex flex-wrap items-end gap-4 pointer-events-auto select-none relative">
          <div className="flex items-center gap-3">
            <div className="text-3xl font-fantaisie text-white">Draft</div>
            <button
              onClick={() => setHelpOpen(true)}
              className="h-9 w-9 grid place-items-center rounded bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 hover:text-blue-200 transition-all"
              title="How to use Draft mode"
              aria-label="How to use Draft mode"
            >
              <span className="font-fantaisie text-xl font-bold">?</span>
            </button>
          </div>

          {/* Sorting controls */}
          {pick3D.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsSortingEnabled(!isSortingEnabled)}
                title={
                  isSortingEnabled
                    ? "Disable auto-stacking"
                    : "Enable auto-stacking"
                }
                aria-label={
                  isSortingEnabled
                    ? "Disable auto-stacking"
                    : "Enable auto-stacking"
                }
                className={`h-9 w-9 rounded-full grid place-items-center ring-1 transition ${
                  isSortingEnabled
                    ? "bg-emerald-500 text-black ring-emerald-400 hover:bg-emerald-400"
                    : "bg-white/15 text-white ring-white/30 hover:bg-white/25"
                }`}
              >
                {/* Shuffle/stack icon (same as editor) */}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-5 h-5"
                >
                  <path d="M3 7h3.586a2 2 0 0 1 1.414.586l6.828 6.828A2 2 0 0 0 16.242 15H21v2h-4.758a4 4 0 0 1-2.829-1.172L6.586 9.414A2 2 0 0 0 5.172 9H3V7zm0 10h5l2 2H3v-2zm18-8h-5l-2-2H21v2z" />
                </svg>
              </button>
            </div>
          )}
          {inProgress && (
            <div className="absolute left-1/2 -translate-x-1/2 top-4 z-[55] pointer-events-auto text-center">
              <button
                onClick={() =>
                  staged && commitPickAndPass(staged.idx, staged.x, staged.z)
                }
                disabled={!staged}
                className="h-10 px-4 rounded border border-emerald-500 text-emerald-400 font-semibold disabled:opacity-50 bg-transparent hover:text-emerald-300 hover:border-emerald-400"
              >
                {staged ? (
                  <>
                    Pick & Pass:{" "}
                    <span className="font-fantaisie text-lg md:text-xl">
                      {currentPacks[0]?.[staged.idx]?.cardName ?? "Card"}
                    </span>
                  </>
                ) : (
                  "Pick & Pass"
                )}
              </button>
              <div className="mt-1 text-[11px] text-white/40 pointer-events-none">
                Pack {packIndex + 1} / 3 • Pick {pickNumber} / 15 • Passing{" "}
                {dir === 1 ? "Left" : "Right"}
              </div>
            </div>
          )}
          {!inProgress && (
            <>
              <label className="flex items-center gap-2 text-white">
                <input
                  type="checkbox"
                  checked={useCube}
                  onChange={(e) => setUseCube(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">Use Cube for draft</span>
              </label>

              {useCube ? (
                <label className="flex flex-col gap-1 text-white">
                  <span className="text-xs opacity-80">Select Cube</span>
                  <select
                    value={cubeId}
                    onChange={(e) => setCubeId(e.target.value)}
                    disabled={cubes.length === 0}
                    className="rounded px-3 py-2 bg-black/70 text-white ring-1 ring-white/20 backdrop-blur disabled:opacity-50"
                  >
                    {cubes.length === 0 ? (
                      <option value="">No cubes available</option>
                    ) : (
                      cubes.map((cube) => (
                        <option key={cube.id} value={cube.id}>
                          {cube.name}
                        </option>
                      ))
                    )}
                  </select>
                </label>
              ) : (
                <div className="flex flex-wrap items-end gap-3 text-white">
                  {[0, 1, 2].map((i) => (
                    <label key={`set-${i}`} className="flex flex-col gap-1">
                      <span className="text-xs opacity-80">
                        Pack {i + 1} Set
                      </span>
                      <select
                        value={setNames[i]}
                        onChange={(e) =>
                          setSetNames((prev) => {
                            const next = [...prev];
                            next[i] = e.target.value;
                            return next;
                          })
                        }
                        className="rounded px-3 py-2 bg-black/70 text-white ring-1 ring-white/20 backdrop-blur"
                      >
                        <option value="Alpha">Alpha</option>
                        <option value="Beta">Beta</option>
                        <option value="Arthurian Legends">
                          Arthurian Legends
                        </option>
                      </select>
                    </label>
                  ))}
                </div>
              )}

              <label className="flex flex-col gap-1 text-white">
                <span className="text-xs opacity-80">Players</span>
                <input
                  type="number"
                  min={2}
                  max={12}
                  value={players}
                  onChange={(e) =>
                    setPlayers(
                      Math.max(2, Math.min(12, Number(e.target.value)))
                    )
                  }
                  className="rounded px-3 py-2 bg-black/70 text-white w-28 ring-1 ring-white/20 backdrop-blur"
                />
              </label>

              <label className="flex items-center gap-2 text-white">
                <input
                  type="checkbox"
                  checked={replaceAvatars}
                  onChange={(e) => setReplaceAvatars(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">
                  Replace Sorcerer with Beta avatars
                </span>
              </label>

              <button
                onClick={startDraft}
                disabled={starting}
                className="h-12 px-6 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-semibold shadow-lg ring-1 ring-black/20 disabled:opacity-50"
              >
                {starting ? "Starting..." : "Start Draft"}
              </button>

              {error && (
                <div className="text-red-300 text-sm">Error: {error}</div>
              )}
            </>
          )}
        </div>

        {/* Pack status + Picks summary (no 2D pack grid; cards are on the mat) */}
        <div className="w-full pl-4 pr-0 pb-6 pt-2 pointer-events-none select-none">
          {inProgress && (
            <div className="grid grid-cols-12 gap-3 lg:gap-4">
              <div className="col-span-12 lg:col-span-8" />
              <div className="col-span-12 lg:col-span-4 justify-self-end pr-0">
                <div className="rounded p-3 bg-black/80 ring-1 ring-white/30 shadow-lg pointer-events-none">
                  <div className="font-medium mb-2 text-white flex items-center justify-between">
                    <span>Your Picks ({yourPicks.length})</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCompactPicks((v) => !v)}
                        className="text-xs px-2 py-1 bg-white/10 rounded hover:bg-white/20 pointer-events-auto"
                        title="Toggle compact view"
                      >
                        {compactPicks ? "Comfort" : "Compact"}
                      </button>
                      <button
                        onClick={() => setPicksOpen((v) => !v)}
                        className="text-xs px-2 py-1 bg-white/10 rounded hover:bg-white/20 pointer-events-auto"
                      >
                        {picksOpen ? "Hide" : "Show"}
                      </button>
                    </div>
                  </div>
                  {/* Slim stats row */}
                  {yourPicks.length > 0 && (
                    <div className="mb-2 text-[11px] text-white/90 flex flex-wrap items-center gap-3 pointer-events-auto">
                      <div className="flex items-center gap-2">
                        <span className="opacity-80">Types:</span>
                        <span>C {picksByType.creatures}</span>
                        <span>S {picksByType.spells}</span>
                        <span>Sites {picksByType.sites}</span>
                        <span>A {picksByType.avatars}</span>
                      </div>
                      {thresholdSummary.elements.length > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="opacity-80">Thresholds:</span>
                          {thresholdSummary.elements.map((element) => (
                            <span
                              key={element}
                              className="inline-flex items-center gap-1"
                            >
                              <Image
                                src={`/api/assets/${element}.png`}
                                alt={element}
                                width={14}
                                height={14}
                                className="pointer-events-none select-none"
                              />
                              <span className="capitalize">
                                {
                                  thresholdSummary.summary[
                                    element as keyof typeof thresholdSummary.summary
                                  ]
                                }
                              </span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {picksOpen && (
                    <div
                      className={`max-h-[52vh] overflow-auto pr-2 grid sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-2 gap-2 text-xs pointer-events-auto`}
                    >
                      {yourCounts.map((it) => {
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
                        const info = cardInfoById[it.cardId];
                        const slug = info?.slug;
                        const isSite = (info?.type || "")
                          .toLowerCase()
                          .includes("site");
                        return (
                          <div
                            key={it.cardId}
                            className={`rounded ${
                              compactPicks ? "p-1" : "p-2"
                            } bg-black/70 ring-1 ring-white/25 text-white`}
                            onMouseEnter={() => {
                              if (slug) {
                                showCardPreview({
                                  slug,
                                  name: it.name,
                                  type: info?.type || null,
                                });
                              }
                            }}
                            onMouseLeave={() => {
                              hideCardPreview();
                            }}
                          >
                            {compactPicks ? (
                              <div className="flex items-center justify-between gap-2">
                                <div className="truncate max-w-[60%] font-medium">
                                  {it.name}
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="flex items-center gap-1 opacity-90">
                                    {order.map((k) =>
                                      t[k] ? (
                                        <span
                                          key={k}
                                          className="inline-flex items-center gap-0.5"
                                        >
                                          {Array.from({ length: t[k] }).map(
                                            (_, i) => (
                                              <Image
                                                key={`${k}-${i}`}
                                                src={`/api/assets/${k}.png`}
                                                alt={k}
                                                width={12}
                                                height={12}
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
                                        size={20}
                                        strokeWidth={6}
                                      />
                                    ) : (
                                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white text-black text-[11px] font-bold">
                                        {meta.cost}
                                      </span>
                                    ))}
                                  <div className="text-right font-semibold">
                                    x{it.count}
                                  </div>
                                </div>
                              </div>
                            ) : (
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
                                      <div className="opacity-90 text-xs">
                                        {it.rarity}
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
                                          strokeWidth={6}
                                        />
                                      ) : (
                                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-white text-black text-xs font-bold">
                                          {meta.cost}
                                        </span>
                                      ))}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Card preview (hover) */}
        {hoverPreview && !orbitLocked && (
          <CardPreviewOverlay card={hoverPreview} anchor="top-left" />
        )}

        {/* Pack selection overlay at start of each round */}
        {needsPackChoice && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-auto select-none">
            <div className="rounded-xl p-6 bg-black/80 ring-1 ring-white/30 text-white w-[min(92vw,720px)] shadow-2xl">
              <div className="text-lg font-semibold mb-3">
                Choose a pack to crack (Round {packIndex + 1}/3)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[0, 1, 2].map((i) => {
                  const usedElsewhere = packChoice.some(
                    (v, idx) => idx !== packIndex && v === i
                  );
                  const setName =
                    seatPacks[0]?.[i]?.[0]?.setName || setNames[i] || "";
                  const assetName = (() => {
                    const s = (setName || "").toLowerCase();
                    if (s.includes("arthur")) return "arthurian-booster.png";
                    if (s.includes("alpha")) return "alphabeta-booster.png";
                    if (s.includes("beta")) return "alphabeta-booster.png";
                    return null;
                  })();
                  return (
                    <button
                      key={`pack-opt-${i}`}
                      onClick={() => choosePackToCrack(i)}
                      disabled={usedElsewhere}
                      className={`group rounded-lg p-3 bg-black/60 ring-1 ring-white/25 hover:bg-black/50 text-left ${
                        usedElsewhere ? "opacity-40 cursor-not-allowed" : ""
                      }`}
                      aria-label={`Open ${setName || "pack"} option ${i + 1}`}
                    >
                      <div
                        className={`relative w-full h-40 sm:h-48 md:h-56 rounded-md overflow-hidden ring-1 ring-white/15 bg-black/40 ${
                          usedElsewhere ? "" : "group-hover:ring-white/30"
                        }`}
                      >
                        {assetName ? (
                          <Image
                            src={`/api/assets/${assetName}`}
                            alt={`${setName} booster pack`}
                            fill
                            sizes="(max-width:640px) 80vw, (max-width:1024px) 30vw, 20vw"
                            className="object-contain"
                            priority
                            unoptimized
                          />
                        ) : (
                          <div className="flex items-center justify-center w-full h-full text-sm opacity-70">
                            {setName || "Booster"}
                          </div>
                        )}
                        {/* Set label badge */}
                        <div className="absolute bottom-1 left-1 right-1 text-[11px] px-2 py-1 rounded bg-black/60 text-white text-center pointer-events-none">
                          {setName || "Booster"}
                        </div>
                      </div>
                      <div className="mt-2 text-xs opacity-70">
                        {usedElsewhere
                          ? "Already used this round"
                          : "Click to open"}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Draft Statistics - Slim version integrated near Picks panel (moved from bottom-left) */}

        {/* Help overlay */}
        {helpOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-auto">
            <div
              className="absolute inset-0 bg-black/70"
              onClick={() => setHelpOpen(false)}
            />
            <div className="relative bg-slate-900 text-white rounded-lg p-6 w-[min(90vw,720px)] ring-1 ring-white/20 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <div className="text-lg font-semibold">Draft Help</div>
                <button
                  onClick={() => setHelpOpen(false)}
                  className="h-8 w-8 grid place-items-center rounded bg-white/10 hover:bg-white/20"
                  aria-label="Close help"
                  title="Close"
                >
                  ×
                </button>
              </div>
              <div className="space-y-4 text-sm opacity-90">
                <div>
                  <div className="font-medium mb-1">Picking cards</div>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>
                      Hover a card in your hand to preview it (left side).
                    </li>
                    <li>
                      Click a card or drag it outward beyond the center ring to
                      stage it (lower board).
                    </li>
                    <li>
                      Press <b>Spacebar</b> or click <b>Pick &amp; Pass</b> to
                      commit your pick.
                    </li>
                    <li>
                      Drag a staged card back inside the ring to unstage it.
                    </li>
                  </ul>
                </div>
                <div>
                  <div className="font-medium mb-1">Keyboard controls</div>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>
                      <b>Left/Right</b>: browse cards in your hand (focus lifts
                      and previews).
                    </li>
                    <li>
                      <b>Enter</b>: stage the focused/hovered card to the lower
                      board.
                    </li>
                    <li>
                      <b>Space</b>: Pick &amp; Pass if a card is staged.
                    </li>
                  </ul>
                </div>
                <div>
                  <div className="font-medium mb-1">Sorting</div>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>
                      Toggle <b>Sort Cards</b> to auto‑stack your picks by
                      mana/type near the top rows.
                    </li>
                    <li>
                      With sorting off, you can freely reposition picked cards.
                    </li>
                  </ul>
                </div>
                <div>
                  <div className="font-medium mb-1">Your Picks panel</div>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Shows totals by type and your maximum thresholds.</li>
                    <li>Hover a row to preview the corresponding card.</li>
                    <li>
                      Use the Compact/Comfort toggle to adjust density;
                      Hide/Show to collapse.
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Pick & Pass lives in the header container above; removed absolute overlay */}

        {/* Save deck panel */}
        {!inProgress && yourPicks.length > 0 && (
          <div className="max-w-7xl mx-auto px-4 pb-10 pointer-events-auto select-none">
            <div className="rounded p-4 bg-black/80 ring-1 ring-white/30 text-white shadow-lg">
              <div className="font-medium mb-2">Save Drafted Deck</div>
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-sm opacity-80">Deck name</span>
                  <input
                    value={deckName}
                    onChange={(e) => setDeckName(e.target.value)}
                    className="rounded px-3 py-2 bg-black/70 text-white ring-1 ring-white/20 backdrop-blur"
                  />
                </label>
                <button
                  onClick={saveDeck}
                  disabled={saving}
                  className="h-10 px-4 rounded bg-emerald-500 hover:bg-emerald-400 text-black font-semibold disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save Deck & Continue to Editor"}
                </button>
                {saveMsg && <div className="text-sm">{saveMsg}</div>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ClampOrbitTarget({
  bounds,
}: {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}) {
  const { controls, camera, invalidate } = useThree((state) => ({
    controls: state.controls as OrbitControlsImpl | undefined,
    camera: state.camera,
    invalidate: state.invalidate,
  }));

  useEffect(() => {
    if (!controls) return;
    let offset = camera.position.clone().sub(controls.target.clone());

    const updateOffset = () => {
      offset = camera.position.clone().sub(controls.target.clone());
    };

    const clampTarget = () => {
      const target = controls.target;
      const clampedX = Math.max(bounds.minX, Math.min(bounds.maxX, target.x));
      const clampedZ = Math.max(bounds.minZ, Math.min(bounds.maxZ, target.z));
      if (clampedX !== target.x || clampedZ !== target.z) {
        target.set(clampedX, target.y, clampedZ);
        camera.position.copy(target.clone().add(offset));
        controls.update();
        invalidate();
      }
    };

    controls.addEventListener("start", updateOffset);
    controls.addEventListener("change", clampTarget);
    return () => {
      controls.removeEventListener("start", updateOffset);
      controls.removeEventListener("change", clampTarget);
    };
  }, [
    bounds.maxX,
    bounds.maxZ,
    bounds.minX,
    bounds.minZ,
    camera,
    controls,
    invalidate,
  ]);

  return null;
}

function KeyboardPanControls({
  enabled = true,
  step = 0.4,
}: {
  enabled?: boolean;
  step?: number;
}) {
  const { controls } = useThree((state) => ({
    controls: state.controls as OrbitControlsImpl | undefined,
  }));
  useOrbitKeyboardPan(controls, { enabled, panStep: step });
  return null;
}
