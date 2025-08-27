"use client";

import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Physics } from "@react-three/rapier";
import Board from "@/lib/game/Board";
import Hud3D from "@/lib/game/components/Hud3D";
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
import CardGlow from "@/lib/game/components/CardGlow";

// --- Draft data types (mirrors /draft 2D) ---

type Rarity = "Ordinary" | "Exceptional" | "Elite" | "Unique";
type Finish = "Standard" | "Foil";

type BoosterCard = {
  variantId: number;
  slug: string;
  finish: Finish;
  product: string;
  rarity: Rarity;
  type: string | null;
  cardId: number;
  cardName: string;
};

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
  highlight,
  getTopRenderOrder,
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
  highlight?: boolean;
  getTopRenderOrder?: () => number;
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

  const setPos = useCallback((wx: number, wz: number, lift = false) => {
    if (!ref.current) return;
    ref.current.position.set(wx, lift ? 0.25 : 0.002, wz);
  }, []);

  const rotZ = (isSite ? -Math.PI / 2 : 0) + extraRotZ;

  return (
    <group ref={ref} position={[x, 0.002, z]}>
      {/* Larger invisible hitbox for easier interaction */}
      <mesh
        position={[0, 0.01, 0]}
        onPointerDown={(e: ThreeEvent<PointerEvent>) => {
          if (disabled) return;
          if (e.nativeEvent.button !== 0) return;
          e.stopPropagation();
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
            // Bind a global pointerup fallback
            const handleUp = () => {
              // Ensure cleanup even if pointer up occurs off the mesh
              onDragChange?.(false);
              dragStart.current = null;
              dragging.current = false;
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
          onDragChange?.(false);
          if (upCleanupRef.current) {
            upCleanupRef.current();
            upCleanupRef.current = null;
          }
          if (onDrop && wasDragging) onDrop(wx, wz);
          onRelease?.(wx, wz, wasDragging);
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
        {/* Pick-ready glow */}
        {highlight && (
          <CardGlow
            width={CARD_SHORT * 1.1}
            height={CARD_LONG * 1.1}
            rotationZ={rotZ}
            elevation={0.0015}
            renderOrder={roRef.current - 1}
          />
        )}
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
  const [setName, setSetName] = useState("Alpha");
  const [players, setPlayers] = useState(8);
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
  type Pick3D = { id: number; card: BoosterCard; x: number; z: number };
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

      const totalPacks = players * 3;
      const res = await fetch(
        `/api/booster?set=${encodeURIComponent(setName)}&count=${totalPacks}`
      );
      const data = await res.json();
      if (!res.ok)
        throw new Error(data?.error || "Failed to generate boosters");

      const packs: BoosterCard[][] = data.packs;
      // Assign 3 packs per seat
      const seats: BoosterCard[][][] = Array.from({ length: players }, () => [
        [],
        [],
        [],
      ]);
      for (let s = 0; s < players; s++) {
        seats[s][0] = packs[s * 3 + 0] ?? [];
        seats[s][1] = packs[s * 3 + 1] ?? [];
        seats[s][2] = packs[s * 3 + 2] ?? [];
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
    const centerZ = 0; // keep interaction in the middle of the board
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

  // Commit only your pick (no pass yet). Place at given world position.
  const commitPickOnly = useCallback(
    (cardIdx: number, wx: number, wz: number) => {
      const cur = currentPacks.map((p) => [...p]);
      const myPack = cur[0];
      if (!myPack || cardIdx < 0 || cardIdx >= myPack.length) return;
      const picked = myPack.splice(cardIdx, 1)[0];
      setCurrentPacks(cur);
      setYourPicks((prev) => [...prev, picked]);
      setPick3D((prev) => [
        ...prev,
        { id: nextPickId, card: picked, x: wx, z: wz },
      ]);
      setNextPickId((n) => n + 1);
      setPickedThisTurn(true);
      setStaged(null);
      setReadyIdx(null);
    },
    [currentPacks, nextPickId]
  );

  // Pass packs after exactly one pick committed
  const passAfterPick = useCallback(() => {
    if (!inProgress || !pickedThisTurn) return;
    const cur = currentPacks.map((p) => [...p]);
    // Bots pick simultaneously now
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
    setPickedThisTurn(false);
    setStaged(null);
    setReadyIdx(null);
  }, [
    inProgress,
    pickedThisTurn,
    currentPacks,
    dir,
    rotatePacks,
    seatPacks,
    packIndex,
    pickNumber,
    botPickFrom,
  ]);

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

  // Collapsible picks panel + metadata (cost/thresholds) for your picks
  const [picksOpen, setPicksOpen] = useState(true);
  const [metaByCardId, setMetaByCardId] = useState<
    Record<
      number,
      { cost: number | null; thresholds: Record<string, number> | null }
    >
  >({});
  useEffect(() => {
    const ids = yourCounts.map((it) => it.cardId);
    if (!ids.length) {
      setMetaByCardId({});
      return;
    }
    const params = new URLSearchParams();
    params.set("set", setName);
    params.set("ids", ids.join(","));
    fetch(`/api/cards/meta?${params.toString()}`)
      .then((r) => r.json())
      .then(
        (
          rows: {
            cardId: number;
            cost: number | null;
            thresholds: Record<string, number> | null;
          }[]
        ) => {
          const next: Record<
            number,
            { cost: number | null; thresholds: Record<string, number> | null }
          > = {};
          for (const m of rows)
            next[m.cardId] = { cost: m.cost, thresholds: m.thresholds };
          setMetaByCardId(next);
        }
      )
      .catch(() => {});
  }, [setName, yourCounts]);

  async function saveDeck() {
    try {
      setSaving(true);
      setError(null);
      setSaveMsg(null);
      const cards = yourPicks.map((c) => ({
        cardId: c.cardId,
        variantId: c.variantId,
        zone: "Spellbook" as const,
        count: 1,
      }));
      const res = await fetch("/api/decks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: deckName || "Draft Deck",
          format: "Draft",
          set: setName,
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
          zone: "Spellbook" as const,
          count: 1,
        }));
        const resBot = await fetch("/api/decks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: `${deckName || "Draft Deck"} (Bot)`,
            format: "Draft",
            set: setName,
            cards: botCards,
          }),
        });
        const dataBot = await resBot.json();
        if (resBot.ok)
          botMsg = ` and bot deck ${dataBot.name} (id: ${dataBot.id})`;
      }
      setSaveMsg(`Saved deck ${data.name} (id: ${data.id})${botMsg}`);
      // Navigate to deck editor with new deck loaded
      router.push(`/decks/editor?id=${encodeURIComponent(data.id)}`);
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

          {/* 3D Piles + HUD for atmosphere */}
          <Piles3D owner="p1" matW={MAT_PIXEL_W} matH={MAT_PIXEL_H} />
          <Piles3D owner="p2" matW={MAT_PIXEL_W} matH={MAT_PIXEL_H} />
          <Hud3D owner="p1" />
          <Hud3D owner="p2" />

          <TextureCache />
          {/* Threshold ring removed in favor of per-card glow */}

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
                    highlight={
                      readyIdx === idx || (staged ? staged.idx === idx : false)
                    }
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
                return (
                  <DraggableCard3D
                    key={`pick-${p.id}`}
                    slug={p.card.slug}
                    isSite={isSite}
                    x={p.x}
                    z={p.z}
                    onDrop={(wx, wz) => {
                      setPick3D((prev) =>
                        prev.map((it) =>
                          it.id === p.id ? { ...it, x: wx, z: wz } : it
                        )
                      );
                    }}
                    onDragChange={setOrbitLocked}
                    getTopRenderOrder={getTopRenderOrder}
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
          <div className="text-xl font-semibold text-white">
            Draft Mode (3D)
          </div>

          <label className="flex flex-col gap-1 text-white">
            <span className="text-xs opacity-80">Set</span>
            <select
              value={setName}
              onChange={(e) => setSetName(e.target.value)}
              className="rounded px-3 py-2 bg-black/70 text-white ring-1 ring-white/20 backdrop-blur"
            >
              <option value="Alpha">Alpha</option>
              <option value="Beta">Beta</option>
              <option value="Arthurian Legends">Arthurian Legends</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-white">
            <span className="text-xs opacity-80">Players</span>
            <input
              type="number"
              min={2}
              max={12}
              value={players}
              onChange={(e) =>
                setPlayers(Math.max(2, Math.min(12, Number(e.target.value))))
              }
              className="rounded px-3 py-2 bg-black/70 text-white w-28 ring-1 ring-white/20 backdrop-blur"
            />
          </label>

          <button
            onClick={startDraft}
            disabled={starting}
            className="h-12 px-6 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-semibold shadow-lg ring-1 ring-black/20 disabled:opacity-50"
          >
            {starting ? "Starting..." : "Start Draft"}
          </button>

          {error && <div className="text-red-300 text-sm">Error: {error}</div>}
        </div>

        {/* Pack status + Picks summary (no 2D pack grid; cards are on the mat) */}
        <div className="max-w-7xl mx-auto px-4 pb-6 pt-2 pointer-events-auto select-none">
          {inProgress ? (
            <div className="grid grid-cols-12 gap-6">
              <div className="col-span-12 lg:col-span-8">
                <div className="flex items-center justify-between mb-2 text-white text-sm">
                  <div>
                    Pack {packIndex + 1} / 3 • Pick {pickNumber} / 15 • Passing{" "}
                    {dir === 1 ? "Left" : "Right"}
                  </div>
                  <div>Your picks: {yourPicks.length}</div>
                </div>
                <div className="text-white text-sm">
                  Drag a card outward to stage it (it will glow), then click{" "}
                  <b>Pick & Pass</b>. Drag it back inward to unstage.
                </div>
              </div>
              <div className="col-span-12 lg:col-span-4">
                <div className="rounded p-3 bg-black/80 ring-1 ring-white/30 shadow-lg">
                  <div className="font-medium mb-2 text-white flex items-center justify-between">
                    <span>Your Picks ({yourPicks.length})</span>
                    <button
                      onClick={() => setPicksOpen((v) => !v)}
                      className="text-xs px-2 py-1 bg-white/10 rounded hover:bg-white/20"
                    >
                      {picksOpen ? "Hide" : "Show"}
                    </button>
                  </div>
                  {picksOpen && (
                    <div className="grid sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-2 text-sm">
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
                        return (
                          <div
                            key={it.cardId}
                            className="rounded p-2 bg-black/70 ring-1 ring-white/25 text-white"
                          >
                            <div className="flex items-start justify-between">
                              <div>
                                <div className="font-semibold">{it.name}</div>
                                <div className="opacity-90 text-xs">
                                  {it.rarity}
                                </div>
                              </div>
                              <div className="text-right font-semibold">
                                x{it.count}
                              </div>
                            </div>
                            <div className="mt-1 flex items-center flex-wrap gap-2 opacity-90">
                              {meta?.cost != null && (
                                <span className="text-xs">
                                  Cost {meta.cost}
                                </span>
                              )}
                              <div className="flex items-center gap-2">
                                {order.map((k) =>
                                  t[k] ? (
                                    <span
                                      key={k}
                                      className="inline-flex items-center gap-1"
                                    >
                                      <img
                                        src={`/api/assets/${k}.png`}
                                        className="w-4 h-4 pointer-events-none select-none"
                                        alt={k}
                                      />
                                      <span className="text-xs">{t[k]}</span>
                                    </span>
                                  ) : null
                                )}
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
          ) : (
            <div className="text-sm text-white">
              Click <i>Start Draft</i> to begin. You will draft 3 packs, passing
              Left-Right-Left. Seat 1 is you; other seats are bots.
            </div>
          )}
        </div>

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
                  const product =
                    seatPacks[0]?.[i]?.[0]?.product || "Booster Pack";
                  return (
                    <button
                      key={`pack-opt-${i}`}
                      onClick={() => choosePackToCrack(i)}
                      disabled={usedElsewhere}
                      className={`rounded-lg p-4 bg-black/60 ring-1 ring-white/25 hover:bg-black/50 text-left ${
                        usedElsewhere ? "opacity-40 cursor-not-allowed" : ""
                      }`}
                    >
                      <div className="text-sm opacity-80">Option {i + 1}</div>
                      <div className="text-base font-semibold">{product}</div>
                      <div className="mt-1 text-xs opacity-70">
                        Click to open
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Bottom controls: staged Pick and Pass */}
        {inProgress && (
          <div className="absolute bottom-6 left-0 right-0 flex items-center justify-center pointer-events-auto select-none">
            <div className="flex flex-wrap gap-3 bg-black/70 ring-1 ring-white/20 px-4 py-3 rounded-lg text-white shadow-lg">
              <div className="text-sm opacity-90 self-center hidden sm:block">
                Drag a card outward until it glows to stage a pick.
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
                  {saving ? "Saving..." : "Save Deck"}
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
