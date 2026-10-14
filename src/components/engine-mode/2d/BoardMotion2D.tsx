"use client";

import { Icon } from "@iconify/react";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode, RefObject, SVGProps } from "react";
import { useVisualAid } from "@/hooks/useGraphicsSettings";
import { useEngineSession } from "@/lib/engine-mode/session";
import { PLAYER_COLORS } from "@/lib/game/constants";
import { useCpuBoardPicker } from "@/lib/game/cpu/boardPicker";
import { CPU_SPELL_REVEAL_READ_MS, cpuRevealsPending } from "@/lib/game/cpu/revealQueue";
import { CardArt } from "./Card2D";
import { fxPalette } from "./actions2d";
import {
  ARRIVE_MS,
  CRUMBLE_MS,
  FOCUS_MS,
  IMPACT_MS,
  STRIKE_MS,
  TOMB_MS,
  TRAIL_MS,
  attackOf,
  cellCentre,
  crumbleKeyframes,
  diffBoard,
  snapBoard,
  trimmedSegment,
} from "./boardDiff";
import type { BoardSnap, Fate } from "./boardDiff";
import { useBoard2DFocus } from "./focusStore";
import type { Placed } from "./layout2d";
import { tileMin, type TileSize } from "./picks2d";

/*
 * The board's motion layer: what happened to the CARDS, drawn over them so the eye can follow
 * the opponent's turn. Driven by diffing successive projections (boardDiff) plus the engine's
 * reveal (impact flashes) and the computer's narration (attacks):
 *
 *  - an opponent unit that moved leaves a ghost at its origin and a marching trail to where it
 *    went (TRAIL_MS);
 *  - an attack puts crossed swords on the target and a strike line from the attacker;
 *  - a card that left the board stays as a ghost, then crumbles, under a glyph saying where it
 *    went (cemetery, banished, back to hand);
 *  - a new opponent permanent glows for a moment;
 *  - a card in a damaged square flashes red when the hit lands.
 *
 * Plain DOM + SVG, motion on the Web Animations API (start time from the document timeline, so
 * a slow device skips frames instead of slowing down). Reduced motion keeps only fades. Nothing
 * here ever takes a pointer event.
 */

type MotionFxBody =
  | { kind: "trail"; ghost: BoardSnap; to: BoardSnap }
  | { kind: "removed"; snap: BoardSnap; fate: Exclude<Fate, "alive">; hold: number }
  | { kind: "arrived"; snap: BoardSnap }
  | { kind: "impact"; snap: BoardSnap }
  | { kind: "focus"; cell: string; repeat?: number }
  | { kind: "strike"; from: { x: number; y: number } | null; to: { x: number; y: number }; size: number };
type MotionFx = MotionFxBody & { id: number };

function lifetime(fx: MotionFx): number {
  switch (fx.kind) {
    case "trail":
      return TRAIL_MS;
    case "removed":
      return fx.hold + Math.max(CRUMBLE_MS, TOMB_MS);
    case "arrived":
      return ARRIVE_MS;
    case "impact":
      return IMPACT_MS;
    case "strike":
      return STRIKE_MS;
    case "focus":
      return FOCUS_MS * (fx.repeat ?? 1);
  }
}

const NO_GLOW: readonly string[] = [];

const FATE_GLYPH: Record<Exclude<Fate, "alive">, { icon: string; label: string }> = {
  dead: { icon: "game-icons:tombstone", label: "to the cemetery" },
  banished: { icon: "game-icons:vortex", label: "banished" },
  returned: { icon: "game-icons:return-arrow", label: "back to hand" },
  gone: { icon: "game-icons:tombstone", label: "removed" },
};

const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Run a WAAPI animation once on mount; jsdom (no `animate`) leaves the node at its resting style. */
function useOnce(ref: RefObject<Element | null>, frames: Keyframe[], options: KeyframeAnimationOptions) {
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || typeof node.animate !== "function") return;
    const play = node.animate(frames, { fill: "both", ...options });
    return () => play.cancel();
    // played once per mount; a re-render (resize) must not restart it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

function Anim({
  frames,
  options,
  tag = "",
  className,
  style,
  children,
}: {
  frames: Keyframe[];
  options: KeyframeAnimationOptions;
  /** names the effect for tests and the dev handle (data-motion) */
  tag?: string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useOnce(ref, frames, options);
  return (
    <div ref={ref} data-motion={tag} className={className} style={style}>
      {children}
    </div>
  );
}

function AnimPath(props: SVGProps<SVGPathElement> & { frames: Keyframe[]; options: KeyframeAnimationOptions }) {
  const { frames, options, ...rest } = props;
  const ref = useRef<SVGPathElement>(null);
  useOnce(ref, frames, options);
  return <path ref={ref} {...rest} />;
}

/** A card's on-screen box in px (a tapped card is turned, so its box is turned too). */
function boxOf(snap: Pick<BoardSnap, "x" | "y" | "w" | "h" | "rotate">, tile: TileSize) {
  const edge = tileMin(tile);
  const w = (snap.rotate === 90 ? snap.h : snap.w) * edge;
  const h = (snap.rotate === 90 ? snap.w : snap.h) * edge;
  return { left: snap.x * tile.w - w / 2, top: snap.y * tile.h - h / 2, width: w, height: h };
}

export interface BoardMotion2DProps {
  tile: TileSize;
  placed: readonly Placed[];
  /** where a card that left the board went (see boardDiff `fateOf`) */
  fateOf: (key: string) => Fate;
  /** a change here (the layer shown, a new match) starts a new baseline instead of a diff */
  baseline: string;
}

export default function BoardMotion2D({ tile, placed, fateOf, baseline }: BoardMotion2DProps) {
  const [effects, setEffects] = useState<MotionFx[]>([]);
  const prev = useRef<{ baseline: string; snaps: BoardSnap[] } | null>(null);
  const nextId = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  /** recently removed cards by pick token, so an attack on a unit that died still finds its square */
  const recentlyRemoved = useRef(new Map<string, { snap: BoardSnap; at: number }>());
  /** keys whose damage counter rose recently, so the impact flash picks the card that was hit */
  const recentlyHurt = useRef(new Map<string, number>());
  const placedRef = useRef(placed);
  placedRef.current = placed;
  const tileRef = useRef(tile);
  tileRef.current = tile;
  const reduced = useMemo(prefersReducedMotion, []);
  const palette = fxPalette(useVisualAid());
  const markerId = useId().replace(/:/g, "");

  const add = (list: MotionFxBody[]) => {
    if (!list.length) return;
    const fresh: MotionFx[] = list.map((fx) => ({ ...fx, id: ++nextId.current }));
    setEffects((current) => [...current, ...fresh]);
    for (const fx of fresh) {
      const timer = setTimeout(() => {
        timers.current.delete(timer);
        setEffects((current) => current.filter((e) => e.id !== fx.id));
      }, lifetime(fx) + 60);
      timers.current.add(timer);
    }
  };

  useEffect(() => {
    const live = timers.current;
    return () => {
      live.forEach(clearTimeout);
      live.clear();
    };
  }, []);

  // Diff each new projection against the last one.
  useEffect(() => {
    const snaps = snapBoard(placed, tile);
    const last = prev.current;
    prev.current = { baseline, snaps };
    if (!last || last.baseline !== baseline) return;
    const diff = diffBoard(last.snaps, snaps, fateOf);
    if (!diff.moves.length && !diff.removed.length && !diff.arrived.length && !diff.hurt.length) return;
    const now = Date.now();
    for (const key of diff.hurt) recentlyHurt.current.set(key, now);
    for (const [token, gone] of recentlyRemoved.current) if (now - gone.at > 6000) recentlyRemoved.current.delete(token);
    for (const { snap } of diff.removed) recentlyRemoved.current.set(snap.token, { snap, at: now });
    // the computer's card is still being read: the effect it caused lands after it, so a
    // destroyed card holds its place until then instead of vanishing under the reveal
    const hold = cpuRevealsPending() ? CPU_SPELL_REVEAL_READ_MS : 250;
    const fx: MotionFxBody[] = [];
    for (const move of diff.moves) if (move.owner === "p2") fx.push({ kind: "trail", ghost: move.ghost, to: move.to });
    for (const { snap, fate } of diff.removed) fx.push({ kind: "removed", snap, fate, hold });
    for (const snap of diff.arrived) if (snap.owner === "p2") fx.push({ kind: "arrived", snap });
    add(fx);
    // placement is the only input: tile changes rescale snapshots, they do not replay
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placed, baseline]);

  // The hit lands: flash the cards in each damaged square.
  const reveal = useEngineSession((s) => s.reveal);
  useEffect(() => {
    if (!reveal?.hits.length) return;
    const now = Date.now();
    const snaps = snapBoard(placedRef.current, tileRef.current);
    const fx: MotionFxBody[] = [];
    for (const hit of reveal.hits) {
      const here = snaps.filter((s) => s.cell === hit.at);
      const hurt = here.filter((s) => now - (recentlyHurt.current.get(s.key) ?? 0) < 4000 || s.key.startsWith("avatar:"));
      // a card the hit destroyed is already off the board; its crumbling ghost takes the flash
      const fallen = [...recentlyRemoved.current.values()]
        .filter((gone) => gone.snap.cell === hit.at && now - gone.at < 4000)
        .map((gone) => gone.snap);
      // nothing on the square visibly took it (no counter rose, nothing fell): flash all of it
      const struck = hurt.length || fallen.length ? [...hurt, ...fallen] : here;
      for (const snap of struck) fx.push({ kind: "impact", snap });
    }
    add(fx);
  }, [reveal]);

  // The computer attacks: swords on the target, a strike line from the attacker.
  const narration = useEngineSession((s) => s.narration);
  useEffect(() => {
    if (!narration) return;
    // A toll (Troll Bridge) is paid on the turn of whoever pushed a unit in, often ours, when the
    // board's lights belong to our own picks: pulse the bridge's tile itself, twice over.
    const tiles = (narration.cells ?? []).filter((h) => /^\d+,\d+$/.test(h));
    if (tiles.length && /\btoll\b/i.test(narration.text)) add(tiles.map((cell) => ({ kind: "focus" as const, cell, repeat: 2 })));
    const picker = useCpuBoardPicker.getState();
    if (picker.request !== `engine-cpu:${narration.seq}`) return;
    const attack = attackOf(narration.text, picker.glow);
    if (!attack) return;
    const t = tileRef.current;
    const edge = tileMin(t);
    const at = (token: string): { x: number; y: number; size: number } | null => {
      const card = placedRef.current.find((p) => p.token === token);
      if (card) return { x: card.x, y: card.y, size: Math.max(card.w, card.h) };
      const gone = recentlyRemoved.current.get(token)?.snap;
      if (gone) return { x: gone.x * t.w, y: gone.y * t.h, size: Math.max(gone.w, gone.h) * edge };
      const centre = cellCentre(token, t);
      return centre ? { ...centre, size: edge * 0.7 } : null;
    };
    const target = at(attack.target);
    if (!target) return;
    const from = at(attack.attacker);
    add([{ kind: "strike", from: from ? { x: from.x / t.w, y: from.y / t.h } : null, to: { x: target.x / t.w, y: target.y / t.h }, size: target.size / edge }]);
  }, [narration]);

  const cpuGlow = useCpuBoardPicker((s) => (s.request.startsWith("engine-cpu:") ? s.glow : NO_GLOW));

  // "Look here" from the action feed: flash the tiles that action touched.
  const focusSeq = useBoard2DFocus((s) => s.seq);
  // a request made before this board mounted (another view, an earlier match) is not replayed
  const focusSeen = useRef(focusSeq);
  useEffect(() => {
    if (focusSeq === focusSeen.current) return;
    focusSeen.current = focusSeq;
    const { cells } = useBoard2DFocus.getState();
    add(cells.map((cell) => ({ kind: "focus" as const, cell })));
  }, [focusSeq]);

  // Dev handle, like __engineReveal2D: what the motion layer is showing right now.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    (window as unknown as Record<string, unknown>).__boardMotion2D = { effects: effects.map((e) => e.kind) };
  }, [effects]);

  if (!effects.length) return null;
  // a new opponent card the computer's narration already lights (the summon's square) needs no
  // second ring of its own: one mark per square reads; three stacked rings do not
  const narrated = (snap: BoardSnap) => cpuGlow.includes(snap.cell) || cpuGlow.includes(snap.token);
  const opp = PLAYER_COLORS.p2;
  const edge = tileMin(tile);
  const lineW = Math.max(2.5, edge * 0.045);
  const dash = `${Math.max(6, edge * 0.11)} ${Math.max(4, edge * 0.07)}`;
  const livePos = (key: string, fallback: BoardSnap) => {
    const card = placed.find((p) => p.key === key);
    return card ? { x: card.x / tile.w, y: card.y / tile.h, w: card.w / edge, h: card.h / edge, rotate: card.rotate } : fallback;
  };

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-visible" data-board-motion>
      {/* ghosts and removed cards, under the lines */}
      {effects.map((fx) => {
        if (fx.kind === "trail") {
          const box = boxOf(fx.ghost, tile);
          return (
            <Anim
              key={fx.id}
              frames={[
                { offset: 0, opacity: 0.6 },
                { offset: 0.75, opacity: 0.45 },
                { offset: 1, opacity: 0 },
              ]}
              options={{ duration: TRAIL_MS, easing: "ease-in" }}
              className="absolute overflow-hidden rounded-[4px]"
              // the opponent's ghost faces them like their cards do, with the same faint glow; no outline
              style={{
                ...box,
                opacity: 0.5,
                boxShadow: `0 0 8px 1px ${opp}66`,
                filter: "grayscale(0.6)",
              }}
            >
              <div className="absolute inset-0" style={{ transform: fx.ghost.owner === "p2" ? "rotate(180deg)" : undefined }}>
                <CardArt card={fx.ghost.card} sizes={`${Math.ceil(box.width)}px`} rotateLandscape={false} />
              </div>
            </Anim>
          );
        }
        if (fx.kind === "removed") {
          const box = boxOf(fx.snap, tile);
          const run = fx.hold + CRUMBLE_MS;
          const glyph = FATE_GLYPH[fx.fate];
          const glyphSize = Math.max(22, Math.min(48, edge * 0.42));
          return (
            <div key={fx.id} data-motion-removed={fx.fate} className="absolute" style={box}>
              <Anim
                frames={crumbleKeyframes(fx.hold / run, reduced)}
                options={{ duration: run, easing: "ease-in" }}
                className="absolute inset-0 overflow-hidden rounded-[4px]"
                style={{ boxShadow: fx.snap.owner === "p2" ? `0 0 8px 1px ${PLAYER_COLORS.p2}66` : undefined }}
              >
                {/* the crumble animates `transform`, so the opponent's facing lives on an inner box */}
                <div className="absolute inset-0" style={{ transform: fx.snap.owner === "p2" ? "rotate(180deg)" : undefined }}>
                  <CardArt card={fx.snap.card} sizes={`${Math.ceil(box.width)}px`} rotateLandscape={false} />
                </div>
              </Anim>
              <Anim
                frames={
                  reduced
                    ? [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }]
                    : [
                        { opacity: 0, transform: "translate(-50%,-30%) scale(0.6)" },
                        { opacity: 1, transform: "translate(-50%,-50%) scale(1.1)", offset: 0.15 },
                        { opacity: 1, transform: "translate(-50%,-50%) scale(1)", offset: 0.8 },
                        { opacity: 0, transform: "translate(-50%,-70%) scale(1)" },
                      ]
                }
                options={{ duration: TOMB_MS, delay: fx.hold, easing: "ease-out" }}
                className="absolute left-1/2 top-1/2 flex flex-col items-center"
                style={{ opacity: 0, transform: "translate(-50%,-50%)" }}
              >
                <span
                  className="flex items-center justify-center rounded-full border border-rc-line/40 bg-[rgba(7,10,20,0.88)] text-rc-fg-strong shadow-rc-panel"
                  style={{ width: glyphSize * 1.35, height: glyphSize * 1.35 }}
                  title={`${fx.snap.card.name}, ${glyph.label}`}
                >
                  <Icon icon={glyph.icon} width={glyphSize} height={glyphSize} />
                </span>
              </Anim>
            </div>
          );
        }
        return null;
      })}

      {/* lines: movement trails and strikes */}
      <svg className="absolute left-0 top-0 overflow-visible" width={tile.w * 5} height={tile.h * 4}>
        <defs>
          <marker id={`${markerId}-opp`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill={opp} />
          </marker>
          <marker id={`${markerId}-hit`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill={palette.damage} />
          </marker>
        </defs>
        {effects.map((fx) => {
          if (fx.kind === "trail") {
            const to = livePos(fx.to.key, fx.to);
            const seg = trimmedSegment(
              { x: fx.ghost.x * tile.w, y: fx.ghost.y * tile.h },
              { x: to.x * tile.w, y: to.y * tile.h },
              edge * 0.12,
              Math.max(to.w, to.h) * edge * 0.45,
            );
            if (!seg) return null;
            const d = `M${seg.x1} ${seg.y1}L${seg.x2} ${seg.y2}`;
            const period = dash.split(" ").reduce((a, b) => a + Number(b), 0);
            return (
              <g key={fx.id}>
                {/* a dark under-stroke keeps the trail readable on any site art */}
                <path d={d} stroke="rgba(0,0,0,0.65)" strokeWidth={lineW + 3} strokeLinecap="round" fill="none" opacity={0.8} />
                <AnimPath
                  d={d}
                  stroke={opp}
                  strokeWidth={lineW}
                  strokeDasharray={dash}
                  strokeLinecap="round"
                  fill="none"
                  markerEnd={`url(#${markerId}-opp)`}
                  frames={
                    reduced
                      ? [{ opacity: 1 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }]
                      : [
                          { opacity: 1, strokeDashoffset: `${period * 6}` },
                          { opacity: 1, strokeDashoffset: "0", offset: 0.8 },
                          { opacity: 0, strokeDashoffset: `${-period}` },
                        ]
                  }
                  options={{ duration: TRAIL_MS, easing: "linear" }}
                />
              </g>
            );
          }
          if (fx.kind === "strike" && fx.from) {
            const seg = trimmedSegment(
              { x: fx.from.x * tile.w, y: fx.from.y * tile.h },
              { x: fx.to.x * tile.w, y: fx.to.y * tile.h },
              edge * 0.08,
              fx.size * edge * 0.3,
            );
            if (!seg) return null;
            const d = `M${seg.x1} ${seg.y1}L${seg.x2} ${seg.y2}`;
            return (
              <g key={fx.id}>
                <path d={d} stroke="rgba(0,0,0,0.7)" strokeWidth={lineW + 4} strokeLinecap="round" fill="none" />
                <AnimPath
                  d={d}
                  pathLength={1}
                  stroke={palette.damage}
                  strokeWidth={lineW + 1}
                  strokeLinecap="round"
                  strokeDasharray="1 1"
                  fill="none"
                  markerEnd={`url(#${markerId}-hit)`}
                  frames={
                    reduced
                      ? [{ opacity: 1, strokeDashoffset: "0" }, { opacity: 1, strokeDashoffset: "0", offset: 0.8 }, { opacity: 0, strokeDashoffset: "0" }]
                      : [
                          { opacity: 1, strokeDashoffset: "1" },
                          { opacity: 1, strokeDashoffset: "0", offset: 0.18 },
                          { opacity: 1, strokeDashoffset: "0", offset: 0.8 },
                          { opacity: 0, strokeDashoffset: "0" },
                        ]
                  }
                  options={{ duration: STRIKE_MS, easing: "ease-out" }}
                />
              </g>
            );
          }
          return null;
        })}
      </svg>

      {/* rings and markers on top */}
      {effects.map((fx) => {
        if (fx.kind === "arrived") {
          if (narrated(fx.snap)) return null;
          const box = boxOf(livePos(fx.snap.key, fx.snap), tile);
          return (
            <Anim
              key={fx.id}
              frames={
                reduced
                  ? [{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }]
                  : [
                      { opacity: 0, transform: "scale(1.5)" },
                      { opacity: 1, transform: "scale(1)", offset: 0.2 },
                      { opacity: 0.85, transform: "scale(1.06)", offset: 0.55 },
                      { opacity: 0, transform: "scale(1.12)" },
                    ]
              }
              options={{ duration: ARRIVE_MS, easing: "ease-out" }}
              className="absolute rounded-[6px]"
              style={{
                left: box.left - 4,
                top: box.top - 4,
                width: box.width + 8,
                height: box.height + 8,
                opacity: 0,
                // a soft bloom in their colour, never a frame: the card's facing already says whose it is
                boxShadow: `0 0 18px 4px ${opp}88, inset 0 0 12px ${opp}55`,
              }}
            />
          );
        }
        if (fx.kind === "impact") {
          const box = boxOf(livePos(fx.snap.key, fx.snap), tile);
          return (
            <Anim
              key={fx.id}
              frames={
                reduced
                  ? [{ opacity: 0 }, { opacity: 0.8, offset: 0.15 }, { opacity: 0 }]
                  : [
                      { opacity: 0, transform: "scale(1)" },
                      { opacity: 0.85, transform: "scale(1.08) translateX(-2px)", offset: 0.12 },
                      { opacity: 0.7, transform: "scale(1.02) translateX(2px)", offset: 0.3 },
                      { opacity: 0, transform: "scale(1)" },
                    ]
              }
              options={{ duration: IMPACT_MS, easing: "ease-out" }}
              className="absolute rounded-[4px]"
              style={{
                ...box,
                opacity: 0,
                background: `${palette.damage}8c`,
                boxShadow: `0 0 16px ${palette.damage}, inset 0 0 0 3px ${palette.damage}`,
                mixBlendMode: "screen",
              }}
            />
          );
        }
        if (fx.kind === "focus") {
          const [cx, cy] = fx.cell.split(",").map(Number);
          if (!Number.isInteger(cx) || !Number.isInteger(cy)) return null;
          return (
            <Anim
              key={fx.id}
              frames={
                reduced
                  ? [{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }]
                  : [
                      { opacity: 0, transform: "scale(1.12)" },
                      { opacity: 1, transform: "scale(0.96)", offset: 0.15 },
                      { opacity: 0.4, transform: "scale(1)", offset: 0.35 },
                      { opacity: 1, transform: "scale(0.96)", offset: 0.55 },
                      { opacity: 0.4, transform: "scale(1)", offset: 0.75 },
                      { opacity: 0, transform: "scale(1)" },
                    ]
              }
              options={{ duration: FOCUS_MS, easing: "ease-in-out", iterations: fx.repeat ?? 1 }}
              tag={`focus:${fx.cell}`}
              className="absolute rounded-[4px]"
              style={{
                left: cx * tile.w + 1,
                top: cy * tile.h + 1,
                width: tile.w - 2,
                height: tile.h - 2,
                opacity: 0,
                border: `4px double ${palette.caster}`,
                boxShadow: `0 0 16px ${palette.caster}, inset 0 0 ${Math.round(edge * 0.2)}px ${palette.caster}99`,
              }}
            />
          );
        }
        if (fx.kind === "strike") {
          const size = Math.max(26, Math.min(56, edge * 0.46));
          return (
            <Anim
              key={fx.id}
              frames={
                reduced
                  ? [{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }]
                  : [
                      { opacity: 0, transform: "translate(-50%,-50%) scale(1.8) rotate(-25deg)" },
                      { opacity: 1, transform: "translate(-50%,-50%) scale(1) rotate(0deg)", offset: 0.15 },
                      { opacity: 1, transform: "translate(-50%,-50%) scale(1.08)", offset: 0.3 },
                      { opacity: 1, transform: "translate(-50%,-50%) scale(1)", offset: 0.8 },
                      { opacity: 0, transform: "translate(-50%,-50%) scale(0.9)" },
                    ]
              }
              options={{ duration: STRIKE_MS, easing: "ease-out" }}
              className="absolute flex items-center justify-center rounded-full border-2 bg-[rgba(7,10,20,0.85)] shadow-rc-panel"
              style={{
                left: fx.to.x * tile.w,
                top: fx.to.y * tile.h,
                width: size * 1.3,
                height: size * 1.3,
                opacity: 0,
                transform: "translate(-50%,-50%)",
                borderColor: palette.damage,
                color: palette.damage,
              }}
            >
              <Icon icon="game-icons:crossed-swords" width={size} height={size} />
            </Anim>
          );
        }
        return null;
      })}
    </div>
  );
}
