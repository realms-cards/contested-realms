"use client";

import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import CardPreview from "@/components/game/CardPreview";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Physics } from "@react-three/rapier";
import Board from "@/lib/game/Board";
import Piles3D from "@/lib/game/components/Piles3D";
import TextureCache from "@/lib/game/components/TextureCache";
import CardPlane from "@/lib/game/components/CardPlane";
import {
  MAT_PIXEL_W,
  MAT_PIXEL_H,
  CARD_LONG,
  CARD_SHORT,
} from "@/lib/game/constants";
import type { ThreeEvent } from "@react-three/fiber";
import type { Group } from "three";
import { MOUSE } from "three";
import { NumberBadge } from "@/components/game/manacost";
import type { Digit } from "@/components/game/manacost";
import {
  BoosterCard,
  Pick3D,
  Rarity,
  categorizeCard,
  computeStackPositions,
} from "@/lib/game/cardSorting";

// --- Draft data types (mirrors /draft 2D) ---
// Types moved to src/lib/game/cardSorting.ts

function weightForRarity(r: Rarity) {
  switch (r) {
    case "Unique":
      return 12;
    case "Elite":
      return 8;
    case "Exceptional":
      return 4;
    default:
      return 1;
  }
}

function choiceWeighted<T>(items: { item: T; weight: number }[]): T | null {
  const total = items.reduce((s, x) => s + Math.max(0, x.weight), 0);
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (const { item, weight } of items) {
    const w = Math.max(0, weight);
    if (r < w) return item;
    r -= w;
  }
  return items.at(-1)?.item ?? null;
}

// Lightweight draggable card for draft (not tied to game store)
function DraggableCard3D({
  slug,
  isSite,
  x,
  z,
  onDrop,
  disabled,
  onDragChange,
  rotationZ: extraRotZ = 0,
  onDragMove,
  onRelease,
  getTopRenderOrder,
  onHoverChange,
  lockUpright,
}: {
  slug: string;
  isSite: boolean;
  x: number;
  z: number;
  onDrop?: (wx: number, wz: number) => void;
  disabled?: boolean;
  onDragChange?: (dragging: boolean) => void;
  rotationZ?: number;
  onDragMove?: (wx: number, wz: number) => void;
  onRelease?: (wx: number, wz: number, wasDragging: boolean) => void;
  getTopRenderOrder?: () => number;
  onHoverChange?: (hovering: boolean) => void;
  lockUpright?: boolean;
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
  const roRef = useRef<number>(1500);
  const [isDragging, setIsDragging] = useState(false);
  const [uprightLocked, setUprightLocked] = useState(false);

  const setPos = useCallback((wx: number, wz: number, lift = false) => {
    if (!ref.current) return;
    ref.current.position.set(wx, lift ? 0.25 : 0.002, wz);
  }, []);

  const rotZ =
    (isSite ? -Math.PI / 2 : 0) +
    (isDragging || lockUpright || uprightLocked ? 0 : extraRotZ);

  return (
    <group ref={ref} position={[x, 0.002, z]}>
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
          // Lock orbit immediately while pointer is held on a card to prevent camera orbiting
          onDragChange?.(true);
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
          if (onDrop && wasDragging) onDrop(wx, wz);
          onRelease?.(wx, wz, wasDragging);
        }}
        onPointerOver={() => {
          if (disabled) return;
          onHoverChange?.(true);
        }}
        onPointerOut={() => {
          onHoverChange?.(false);
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
        {/* CardGlow removed for draft3d per request */}
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

export default function Draft3DPage() {
  const router = useRouter();
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
      setYourPicks([]);
      setPick3D([]);
      setNextPickId(1);
      setBotPicks([]);
      setSeatPacks([]);
      setCurrentPacks([]);
      setPackIndex(0);
      setPickNumber(1);
      setPackChoice([null, null, null]);

      // Generate packs per selected set (one column per round)
      const [setA, setB, setC] = setNames;
      const avatarParam = replaceAvatars ? '&replaceAvatars=true' : '';
      const [respA, respB, respC] = await Promise.all([
        fetch(`/api/booster?set=${encodeURIComponent(setA)}&count=${players}${avatarParam}`),
        fetch(`/api/booster?set=${encodeURIComponent(setB)}&count=${players}${avatarParam}`),
        fetch(`/api/booster?set=${encodeURIComponent(setC)}&count=${players}${avatarParam}`),
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

      const packsA: BoosterCard[][] = (dataA.packs || []).map(
        (pack: BoosterCard[]) =>
          (pack || []).map((c) => ({ ...c, setName: setA }))
      );
      const packsB: BoosterCard[][] = (dataB.packs || []).map(
        (pack: BoosterCard[]) =>
          (pack || []).map((c) => ({ ...c, setName: setB }))
      );
      const packsC: BoosterCard[][] = (dataC.packs || []).map(
        (pack: BoosterCard[]) =>
          (pack || []).map((c) => ({ ...c, setName: setC }))
      );

      // Assign 3 packs per seat, preserving per-column sets
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

  // Arrange current pack into a hand-style fan in world space near the board center
  const packLayout = useMemo(() => {
    const pack = currentPacks[0] || [];
    const n = pack.length;
    if (n === 0) return [] as { x: number; z: number; rot: number }[];
    const maxAngle = Math.min(0.85, (n - 1) * 0.09); // radians across the fan
    const step = n > 1 ? maxAngle / (n - 1) : 0;
    const start = -maxAngle / 2;
    const spacing = CARD_SHORT * 1.05; // horizontal spacing
    const arcDepth = CARD_LONG * 0.35; // curve towards/away from camera
    const centerX = 0;
    const centerZ = -1.4; // Move fan towards top of board to make room
    return new Array(n).fill(0).map((_, i) => {
      const a = start + i * step;
      const x = centerX + (i - (n - 1) / 2) * spacing;
      const z = centerZ - Math.abs(Math.sin(a)) * arcDepth;
      const rot = a * 0.75; // gentle yaw for fan look
      return { x, z, rot };
    });
  }, [currentPacks]);

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
        { id: nextPickId, card: picked, x: wx, z: wz },
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
  const [isSortingEnabled, setIsSortingEnabled] = useState(false);
  const [infoBoxVisible, setInfoBoxVisible] = useState(true);
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
          if (meta.thresholds![element] > 0) {
            elements.add(element);
            summary[element as keyof typeof summary] = Math.max(
              summary[element as keyof typeof summary],
              meta.thresholds![element]
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

  // Create sorted stack positions
  const stackPositions = useMemo(() => {
    return computeStackPositions(pick3D, metaByCardId, isSortingEnabled);
  }, [pick3D, isSortingEnabled, metaByCardId]);

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
      // Navigate to 3D deck editor with new deck loaded in draft completion mode
      router.push(
        `/decks/editor-3d?id=${encodeURIComponent(data.id)}&from=draft`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 w-screen h-screen">
      {/* 3D Game View as the stage */}
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
          </Physics>

          {/* 3D piles for atmosphere (HUD hidden in draft mode) */}
          <Piles3D owner="p1" matW={MAT_PIXEL_W} matH={MAT_PIXEL_H} />
          <Piles3D owner="p2" matW={MAT_PIXEL_W} matH={MAT_PIXEL_H} />

          <TextureCache />
          {/* Threshold ring and per-card glow removed for cleaner draft UI */}

          {/* 3D Draft: current pack cards fanned near the board center */}
          {inProgress && !needsPackChoice && (
            <group>
              {(currentPacks[0] || []).map((c, idx) => {
                const pos = packLayout[idx] ?? { x: 0, z: 0, rot: 0 };
                const isSite = (c.type || "").toLowerCase().includes("site");
                return (
                  <DraggableCard3D
                    key={`pack-${packIndex}-${pickNumber}-${c.variantId}-${idx}`}
                    slug={c.slug}
                    isSite={isSite}
                    x={pos.x}
                    z={pos.z}
                    disabled={pickedThisTurn}
                    onDragChange={setOrbitLocked}
                    rotationZ={pos.rot}
                    getTopRenderOrder={getTopRenderOrder}
                    onHoverChange={(hover) => {
                      if (hover && !orbitLocked)
                        setHoverPreview({
                          slug: c.slug,
                          name: c.cardName,
                          type: c.type,
                        });
                      else setHoverPreview(null);
                    }}
                    onDragMove={(wx, wz) => {
                      const d = Math.hypot(
                        wx - PICK_CENTER.x,
                        wz - PICK_CENTER.z
                      );
                      if (d > PICK_RADIUS) setReadyIdx(idx);
                      else if (readyIdx === idx) setReadyIdx(null);
                    }}
                    onRelease={(wx, wz, wasDragging) => {
                      if (!wasDragging) return;
                      const d = Math.hypot(
                        wx - PICK_CENTER.x,
                        wz - PICK_CENTER.z
                      );
                      if (d > PICK_RADIUS) {
                        setStaged({ idx, x: wx, z: wz });
                      } else if (staged && staged.idx === idx) {
                        setStaged(null);
                      }
                    }}
                  />
                );
              })}
            </group>
          )}

          {/* 3D Draft: your picked cards remain on the mat and stay draggable */}
          {pick3D.length > 0 && (
            <group>
              {pick3D.map((p) => {
                const isSite = (p.card.type || "")
                  .toLowerCase()
                  .includes("site");

                // Use sorted position if sorting is enabled
                const stackPos = stackPositions?.get(p.id);
                const x = stackPos ? stackPos.x : p.x;
                const z = stackPos ? stackPos.z : p.z;
                const isVisible = stackPos ? stackPos.isVisible : true;

                return (
                  <DraggableCard3D
                    key={`pick-${p.id}`}
                    slug={p.card.slug}
                    isSite={isSite}
                    x={x}
                    z={z}
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
                    onHoverChange={(hover) => {
                      if (hover && !orbitLocked)
                        setHoverPreview({
                          slug: p.card.slug,
                          name: p.card.cardName,
                          type: p.card.type,
                        });
                      else setHoverPreview(null);
                    }}
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

      {/* Overlays */}
      <div className="absolute inset-0 z-20 pointer-events-none select-none">
        {/* Top controls */}
        <div className="max-w-7xl mx-auto p-4 flex flex-wrap items-end gap-4 pointer-events-auto select-none">
          <div className="text-3xl font-fantaisie text-white">Draft</div>

          {/* Sorting controls */}
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
              <button
                onClick={() => setInfoBoxVisible(!infoBoxVisible)}
                className="h-10 px-4 rounded bg-white/10 text-white hover:bg-white/20 font-medium"
              >
                {infoBoxVisible ? "Hide Info" : "Show Info"}
              </button>
            </div>
          )}
          {!inProgress && (
            <>
              <div className="flex flex-wrap items-end gap-3 text-white">
                {[0, 1, 2].map((i) => (
                  <label key={`set-${i}`} className="flex flex-col gap-1">
                    <span className="text-xs opacity-80">Pack {i + 1} Set</span>
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
                <span className="text-sm">Replace Sorcerer with Beta avatars</span>
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
        <div className="max-w-7xl mx-auto px-4 pb-6 pt-2 pointer-events-none select-none">
          {inProgress ? (
            <div className="grid grid-cols-12 gap-6">
              <div className="col-span-12 lg:col-span-8">
                <div className="flex items-center justify-between mb-2 text-white text-sm">
                  <div>
                    Pack {packIndex + 1} / 3 • Pick {pickNumber} / 15 • Passing{" "}
                    {dir === 1 ? "Left" : "Right"}
                  </div>
                </div>
                <div className="text-white text-sm">
                  Drag a card outward to stage it, then click <b>Pick & Pass</b>
                  . Drag it back inward to unstage.
                </div>
              </div>
              <div className="col-span-12 lg:col-span-4">
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
                                setHoverPreview({
                                  slug,
                                  name: it.name,
                                  type: info?.type || null,
                                });
                              }
                            }}
                            onMouseLeave={() => setHoverPreview(null)}
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
          ) : (
            <div className="text-sm text-white">
              Click <i>Start Draft</i> to begin. You will draft 3 packs, passing
              Left-Right-Left. Seat 1 is you; other seats are bots.
            </div>
          )}
        </div>

        {/* Hover Preview Overlay (hidden while dragging) */}
        {hoverPreview && !orbitLocked && (
          <CardPreview card={hoverPreview} anchor="top-right" />
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

        {/* Draft Statistics - Bottom Left */}
        {infoBoxVisible && pick3D.length > 0 && (
          <div className="bottom-6 left-6 pointer-events-auto select-none absolute">
            <div className="rounded p-3 bg-black/80 ring-1 ring-white/30 shadow-lg w-72">
              <div className="font-medium mb-2 text-white">
                Draft Statistics
              </div>
              <div className="text-sm text-white/90 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>Creatures: {picksByType.creatures}</div>
                  <div>Spells: {picksByType.spells}</div>
                  <div>Sites: {picksByType.sites}</div>
                  <div>Avatars: {picksByType.avatars}</div>
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
                            {element}:{" "}
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

        {/* Bottom controls: staged Pick and Pass */}
        {inProgress && (
          <div className="absolute bottom-6 left-0 right-0 flex items-center justify-center pointer-events-auto select-none">
            <div className="flex flex-wrap gap-3 bg-black/70 ring-1 ring-white/20 px-4 py-3 rounded-lg text-white shadow-lg">
              <div className="text-sm opacity-90 self-center hidden sm:block">
                Drag a card outward to stage a pick.
              </div>
              <button
                onClick={() =>
                  staged && commitPickAndPass(staged.idx, staged.x, staged.z)
                }
                disabled={!staged}
                className="h-10 px-4 rounded bg-emerald-500 hover:bg-emerald-400 text-black font-semibold disabled:opacity-50"
              >
                {staged
                  ? `Pick & Pass: ${
                      currentPacks[0]?.[staged.idx]?.cardName ?? "Card"
                    }`
                  : "Pick & Pass"}
              </button>
            </div>
          </div>
        )}

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
                  className="h-10 px-4 rounded bg-white/90 text-black disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Build Deck (3D)"}
                </button>
                <button
                  onClick={() => router.push("/decks/editor-3d")}
                  className="h-10 px-4 rounded border border-white/30 text-white"
                >
                  Deck Editor (3D)
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
