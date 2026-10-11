"use client";

import { Html } from "@react-three/drei";
import { invalidate, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { BoardReveal } from "@/lib/engine-mode/projection";
import { useEngineSession } from "@/lib/engine-mode/session";
import { TILE_SIZE } from "@/lib/game/constants";
import { useGameStore } from "@/lib/game/store";

/**
 * The engine's own event animation, drawn on the board.
 *
 * Upstream accumulates every resolved action — spell, activated ability or trigger, from
 * either seat — into `state.flow.areaReveal`: the squares that took damage and how much, the
 * squares it merely affected, the caster, and a caption. Its docblock says the client is meant
 * to animate it when `seq` changes, and it is fingerprint-gated upstream so an idle trigger
 * never flashes. We render it where the player is already looking: on the tiles themselves.
 */

/** How long a damage number lives. Must match the CSS keyframe below. */
const NUMBER_MS = 1250;
/** How long the tile glow lives; it clears a little sooner so the number lands alone. */
const GLOW_MS = 1050;

const DAMAGE = "#f0514f";
const AFFECTED = "#f3cf6a";
const CASTER = "#8ad8ff";

const RING = (half: number) =>
  new Float32Array([-half, half, 0, half, half, 0, half, -half, 0, -half, -half, 0]);
const OUTER = RING(TILE_SIZE / 2);
const INNER = RING(TILE_SIZE / 2 - TILE_SIZE * 0.08);
/** Level with the grid, like the pick highlights: anything raised parallaxes off its own tile. */
const LIFT = 0.003;
/** Under the DOM HUD (z-100) and the prompt shell (z-200). */
const HTML_Z: [number, number] = [30, 0];

const cell = (at: string) => at.split(",").map(Number) as [number, number];

/**
 * The float is driven imperatively from the rAF pump below rather than by a CSS keyframe.
 *
 * A CSS animation on an element inside drei's <Html> portal never leaves the PENDING state
 * here — measured on the live board: `playState: "running"` but `startTime: null` and
 * `currentTime` pinned at 0, so the number sat invisible on its first frame forever. We are
 * already running a frame pump to keep the canvas rendering, so the cheapest correct fix is
 * to write the two properties ourselves each frame.
 */
interface Float {
  /** 0 → 1 over NUMBER_MS */
  opacity: number;
  lift: number;
  scale: number;
}
function floatStep(t: number): Float {
  if (t < 0.18) {
    const k = t / 0.18;
    return { opacity: k, lift: 6 - 6 * k, scale: 0.55 + 0.7 * k };
  }
  if (t < 0.45) {
    const k = (t - 0.18) / 0.27;
    return { opacity: 1, lift: -10 * k, scale: 1.25 - 0.25 * k };
  }
  const k = (t - 0.45) / 0.55;
  return { opacity: 1 - k, lift: -10 - 24 * k, scale: 1 + 0.5 * k };
}
/** The caption holds, then leaves. */
function captionStep(t: number): { opacity: number; lift: number } {
  if (t < 0.15) return { opacity: t / 0.15, lift: 4 - 4 * (t / 0.15) };
  if (t < 0.78) return { opacity: 1, lift: 0 };
  const k = (t - 0.78) / 0.22;
  return { opacity: 1 - k, lift: -6 * k };
}

export default function EngineEventReveal() {
  const reveal = useEngineSession((s) => s.reveal);
  const width = useGameStore((s) => s.board.size.w);
  const height = useGameStore((s) => s.board.size.h);
  const [shown, setShown] = useState<BoardReveal | null>(null);
  // Dev handle, like __cpuReveals / __cpuBoardPicker: lets a headless check confirm this
  // layer mounted and see what it is currently showing.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    (window as unknown as Record<string, unknown>).__engineReveal = { mounted: true, shown };
  }, [shown]);

  /** Every floating node of the current reveal, written to directly each frame. */
  const floats = useRef(new Map<string, HTMLElement>());

  // Each engine `seq` plays once; a later cosmetic re-render must not restart it.
  //
  // The pump has to live OUT here, not in a `useFrame`: the match canvas runs
  // frameloop="demand", so a loop that calls invalidate() from inside useFrame can never
  // start itself — no frame runs, so the hook never fires, and nothing would ever draw.
  // This is motion, so it pumps at full rate (see lib/game/render/cosmeticFrame for why
  // decorative loops must not).
  useEffect(() => {
    if (!reveal) return;
    setShown(reveal);
    let frame = 0;
    const startedAt = performance.now();
    const pump = () => {
      const t = Math.min(1, (performance.now() - startedAt) / NUMBER_MS);
      for (const [key, node] of floats.current) {
        const step = key.startsWith("caption") ? captionStep(t) : floatStep(t);
        node.style.opacity = String(step.opacity);
        node.style.transform = `translateY(${step.lift}px) scale(${"scale" in step ? step.scale : 1})`;
      }
      invalidate();
      if (t < 1) frame = requestAnimationFrame(pump);
    };
    pump();
    const timer = setTimeout(() => setShown((current) => (current?.seq === reveal.seq ? null : current)), NUMBER_MS);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [reveal]);

  const offsetX = -((width - 1) * TILE_SIZE) / 2;
  const offsetY = -((height - 1) * TILE_SIZE) / 2;
  const at = useMemo(
    () => (key: string): [number, number, number] => {
      const [x, y] = cell(key);
      return [offsetX + x * TILE_SIZE, LIFT, offsetY + y * TILE_SIZE];
    },
    [offsetX, offsetY],
  );
  /** Collects the floating nodes for the pump; also drops them on unmount. */
  const float = (key: string) => (node: HTMLElement | null) => {
    if (node) floats.current.set(key, node);
    else floats.current.delete(key);
  };

  if (!shown) return null;
  const caption = shown.name.trim();
  // the caption rides the first damaged square, else the first affected one, else the caster
  const captionCell = shown.hits[0]?.at ?? shown.sites[0] ?? shown.caster;

  return (
    <group key={shown.seq}>
      {shown.caster && shown.caster !== shown.hits[0]?.at && <Ring position={at(shown.caster)} color={CASTER} opacity={0.5} />}
      {shown.sites.map((site) => (
        <Ring key={`site:${site}`} position={at(site)} color={AFFECTED} opacity={0.65} wash={0.1} />
      ))}
      {shown.hits.map((hit) => (
        <group key={`hit:${hit.at}`}>
          <Ring position={at(hit.at)} color={DAMAGE} opacity={0.8} wash={0.16} />
          <Html position={[at(hit.at)[0], 0.5, at(hit.at)[2]]} center zIndexRange={HTML_Z} style={{ pointerEvents: "none" }}>
            <span
              ref={float(`hit:${hit.at}`)}
              aria-hidden
              className="select-none font-rc-display tabular-nums"
              style={{
                color: "#ffd9d6",
                fontSize: "34px",
                lineHeight: 1,
                opacity: 0,
                textShadow: `0 0 10px ${DAMAGE}, 0 0 22px rgba(240,81,79,.7), 0 2px 3px rgba(0,0,0,.95)`,
                display: "block",
              }}
            >
              −{hit.dmg}
            </span>
          </Html>
        </group>
      ))}
      {caption && captionCell && (
        <Html position={[at(captionCell)[0], 0.92, at(captionCell)[2]]} center zIndexRange={HTML_Z} style={{ pointerEvents: "none" }}>
          <span
            ref={float("caption")}
            className="whitespace-nowrap rounded-full border border-rc-line/22 bg-[rgba(7,10,20,0.92)] px-2.5 py-1 font-rc-display text-[15px] text-rc-fg-strong shadow-rc-panel"
            style={{ display: "block", opacity: 0 }}
          >
            {caption}
          </span>
        </Html>
      )}
    </group>
  );
}

/** A tile ring, with an optional wash inside it. */
function Ring({
  position,
  color,
  opacity,
  wash = 0,
}: {
  position: [number, number, number];
  color: string;
  opacity: number;
  wash?: number;
}) {
  const outer = useRef<THREE.LineBasicMaterial>(null);
  const inner = useRef<THREE.LineBasicMaterial>(null);
  const fill = useRef<THREE.MeshBasicMaterial>(null);
  const started = useRef<number | null>(null);
  useFrame(({ clock }) => {
    started.current ??= clock.getElapsedTime();
    const t = Math.min(1, (clock.getElapsedTime() - started.current) / (GLOW_MS / 1000));
    // quick flash in, long ease out
    const level = t < 0.12 ? t / 0.12 : 1 - (t - 0.12) / 0.88;
    if (outer.current) outer.current.opacity = opacity * level;
    if (inner.current) inner.current.opacity = opacity * level * 0.6;
    if (fill.current) fill.current.opacity = wash * level;
  });
  return (
    <group position={position} rotation-x={-Math.PI / 2}>
      {wash > 0 && (
        <mesh renderOrder={1090}>
          <planeGeometry args={[TILE_SIZE, TILE_SIZE]} />
          <meshBasicMaterial
            ref={fill}
            color={color}
            transparent
            opacity={0}
            depthWrite={false}
            depthTest={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
      <lineLoop renderOrder={1091}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[OUTER, 3]} />
        </bufferGeometry>
        <lineBasicMaterial ref={outer} color={color} transparent opacity={0} depthTest={false} />
      </lineLoop>
      <lineLoop renderOrder={1091}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[INNER, 3]} />
        </bufferGeometry>
        <lineBasicMaterial ref={inner} color={color} transparent opacity={0} depthTest={false} />
      </lineLoop>
    </group>
  );
}
