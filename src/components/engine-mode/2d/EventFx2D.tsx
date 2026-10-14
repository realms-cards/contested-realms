"use client";

import Image from "next/image";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cardImage } from "@/components/game/CpuPlayReveal";
import { useVisualAid } from "@/hooks/useGraphicsSettings";
import type { BoardReveal } from "@/lib/engine-mode/projection";
import { useEngineSession } from "@/lib/engine-mode/session";
import { FX_CARD_MS, FX_RING_MS, FX_RING_STYLE, captionKeyframes, cardKeyframes, fxCardBox, fxLayout, fxPalette } from "./actions2d";
import type { FxKind } from "./actions2d";
import { BEAM_MS, HIT_MS, cellCentre, hitKeyframes, trimmedSegment } from "./boardDiff";
import { BOARD_COLS, BOARD_ROWS, tileMin } from "./picks2d";

/** A narration this long after a reveal belongs to a later action. */
const STALE_AFTER_MS = 600;

/**
 * A spell's damage number holds a second longer than a combat hit's (HIT_MS): it is the one
 * result of a cast a player has to catch, and the board is busy with the beam meanwhile.
 */
export const FX_HIT_MS = HIT_MS + 1000;
/** How long an event's board marks live (the cast card keeps its own, longer span). */
const EVENT_MS = Math.max(FX_HIT_MS, BEAM_MS);

/**
 * Ring keyframes per kind. A damaged square flashes hard and lets go; a square the effect only
 * touched pulses twice, so "this changed" is unmistakable without a number; the caster's ring
 * holds steady while the beams leave it.
 */
function ringFrames(kind: FxKind, reduced: boolean): Keyframe[] {
  if (kind === "affected") {
    return reduced
      ? [{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }]
      : [
          { opacity: 0, transform: "scale(1)" },
          { opacity: 1, transform: "scale(0.94)", offset: 0.14 },
          { opacity: 0.35, transform: "scale(1)", offset: 0.34 },
          { opacity: 1, transform: "scale(0.94)", offset: 0.52 },
          { opacity: 0.6, transform: "scale(1)", offset: 0.75 },
          { opacity: 0, transform: "scale(1)" },
        ];
  }
  if (kind === "caster") return [{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }];
  // damage: quick flash in, long ease out
  return [{ opacity: 0 }, { opacity: 1, offset: 0.08 }, { opacity: 0.8, offset: 0.4 }, { opacity: 0 }];
}

const RING_MS: Record<FxKind, number> = { damage: FX_RING_MS + 350, affected: BEAM_MS, caster: BEAM_MS };

/**
 * The engine's event animation on the flat board — the 2D counterpart of EngineEventReveal.
 *
 * `session.reveal` carries, for every resolved spell, ability or trigger from either seat, the
 * squares that took damage and how much, the squares it merely touched, the caster and a
 * caption. Here each becomes a ring on its tile, a big damage number that rises and fades, a
 * beam from the caster to every square it reached, and a caption pill; a named spell is laid
 * on the board as its card for a moment. (What happened to the cards themselves — moves,
 * deaths, attacks, impact flashes — is BoardMotion2D, inside the board.)
 *
 * Plain DOM, so motion runs on the Web Animations API (the drei `<Html>` keyframe trap does not
 * apply outside the canvas) and is fire-and-forget: each `seq` plays once and clears itself.
 *
 * Mount it as the top layer INSIDE the board's `position: relative` box (5×`tileW` by
 * 4×`tileH`); it covers that box and never takes a pointer event.
 */
export default function EventFx2D({
  tileW,
  tileH,
  cols = BOARD_COLS,
  rows = BOARD_ROWS,
}: {
  tileW: number;
  tileH: number;
  cols?: number;
  rows?: number;
}) {
  const tile = useMemo(() => ({ w: tileW, h: tileH }), [tileW, tileH]);
  const edge = tileMin(tile);
  const reveal = useEngineSession((s) => s.reveal);
  const palette = fxPalette(useVisualAid());
  const [shown, setShown] = useState<BoardReveal | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const markerId = useId().replace(/:/g, "");

  // Each engine `seq` plays once and then clears itself; a later re-render must not restart it.
  const shownAt = useRef(0);
  useEffect(() => {
    if (!reveal) return;
    shownAt.current = Date.now();
    setShown(reveal);
    const span = reveal.card ? Math.max(FX_CARD_MS, EVENT_MS) : EVENT_MS;
    const timer = setTimeout(() => setShown((current) => (current?.seq === reveal.seq ? null : current)), span);
    return () => clearTimeout(timer);
  }, [reveal]);

  // The computer's next action ends this one's marks: a narration that arrives well after the
  // reveal is about something else, and the old caption, beams and rings must not sit under it
  // as if they were its effect. (The reveal and the narration of ONE action land together.)
  const narration = useEngineSession((s) => s.narration);
  useEffect(() => {
    if (!narration) return;
    if (Date.now() - shownAt.current < STALE_AFTER_MS) return;
    setShown(null);
  }, [narration]);

  const layout = useMemo(() => (shown ? fxLayout(shown, tile, cols, rows) : null), [shown, tile, cols, rows]);
  const card = shown?.card ?? null;
  const art = useMemo(() => (card ? cardImage(card) : null), [card]);
  const cardBox = layout?.cardCell && art ? fxCardBox(layout.cardCell, tile, art.landscape, cols, rows) : null;

  // Source -> target: a beam from the caster's square to each square the effect reached.
  const beams = useMemo(() => {
    if (!shown?.caster) return [];
    const from = cellCentre(shown.caster, tile);
    if (!from) return [];
    const targets: { at: string; kind: FxKind }[] = [
      ...shown.hits.map((hit) => ({ at: hit.at, kind: "damage" as const })),
      ...shown.sites.map((at) => ({ at, kind: "affected" as const })),
    ];
    const seen = new Set<string>();
    const out: { key: string; kind: FxKind; d: string }[] = [];
    for (const target of targets) {
      if (target.at === shown.caster || seen.has(target.at)) continue;
      seen.add(target.at);
      const to = cellCentre(target.at, tile);
      const seg = to ? trimmedSegment(from, to, tileMin(tile) * 0.3, tileMin(tile) * 0.36) : null;
      if (seg) out.push({ key: `${target.kind}:${target.at}`, kind: target.kind, d: `M${seg.x1} ${seg.y1}L${seg.x2} ${seg.y2}` });
    }
    return out;
  }, [shown, tile]);

  // Start every animation once the new reveal's nodes exist. Keyed on the seq only, so a tile
  // size change mid-flight re-lays the nodes without replaying them.
  const seq = shown?.seq;
  useLayoutEffect(() => {
    const host = root.current;
    if (seq === undefined || !host) return;
    const reduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lift = Math.max(0.6, edge / 80);
    const plays: Animation[] = [];
    host.querySelectorAll<HTMLElement | SVGElement>("[data-fx]").forEach((node) => {
      if (typeof node.animate !== "function") return; // jsdom / very old engines: nodes stay at rest
      const kind = node.dataset.fx;
      const ringKind = (node.dataset.kind ?? "damage") as FxKind;
      const [frames, duration] =
        kind === "number"
          ? [hitKeyframes(lift, reduced), FX_HIT_MS]
          : kind === "caption"
            ? [captionKeyframes(reduced), EVENT_MS]
            : kind === "card"
              ? [cardKeyframes(reduced), FX_CARD_MS]
              : kind === "beam" || kind === "beam-glow" || kind === "beam-core"
                ? [
                    reduced || ringKind !== "damage"
                      ? [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }]
                      : [
                          { opacity: 1, strokeDashoffset: "1" },
                          { opacity: 1, strokeDashoffset: "0", offset: 0.25 },
                          { opacity: 1, strokeDashoffset: "0", offset: 0.7 },
                          { opacity: 0, strokeDashoffset: "0" },
                        ],
                    BEAM_MS,
                  ]
                : [ringFrames(ringKind, reduced), RING_MS[ringKind]];
      plays.push(node.animate(frames, { duration, easing: "ease-out", fill: "both" }));
    });
    return () => plays.forEach((play) => play.cancel());
    // tile is read for the travel distance only; changing it must not replay the event
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq]);

  // Dev handle, like __engineReveal: lets a headless check see what this layer is showing.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    (window as unknown as Record<string, unknown>).__engineReveal2D = { mounted: true, shown };
  }, [shown]);

  if (!shown || !layout) return null;
  const fontSize = Math.round(Math.max(26, Math.min(56, edge * 0.56)));
  const beamWidth = Math.max(2.5, edge * 0.045);

  return (
    <div ref={root} key={shown.seq} aria-hidden className="pointer-events-none absolute inset-0 z-30 overflow-visible">
      {layout.rings.map((ring) => {
        const color = palette[ring.kind];
        return (
          <div
            key={ring.key}
            data-fx="ring"
            data-kind={ring.kind}
            className="absolute rounded-[3px]"
            style={{
              left: ring.x,
              top: ring.y,
              width: ring.w,
              height: ring.h,
              opacity: 0,
              border: `${ring.kind === "caster" ? 2 : 4}px ${FX_RING_STYLE[ring.kind]} ${color}`,
              boxShadow:
                ring.kind === "caster"
                  ? `0 0 8px ${color}`
                  : `0 0 12px ${color}, inset 0 0 ${Math.round(Math.min(ring.w, ring.h) * 0.25)}px ${color}80`,
              background: ring.kind === "damage" ? `${color}33` : ring.kind === "affected" ? `${color}1f` : undefined,
            }}
          />
        );
      })}

      {beams.length > 0 && (
        <svg className="absolute left-0 top-0 overflow-visible" width={tile.w * cols} height={tile.h * rows}>
          <defs>
            <filter id={`${markerId}-glow`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation={Math.max(2, beamWidth * 0.9)} />
            </filter>
            {(["damage", "affected"] as const).map((kind) => (
              <marker
                key={kind}
                id={`${markerId}-${kind}`}
                viewBox="0 0 10 10"
                refX="7"
                refY="5"
                markerWidth="4"
                markerHeight="4"
                orient="auto-start-reverse"
              >
                <path d="M0 0L10 5L0 10z" fill={palette[kind]} />
              </marker>
            ))}
          </defs>
          {beams.map((beam) => {
            // damage draws itself out from the caster; a touch is dashed, as its ring is
            const dash =
              beam.kind === "damage"
                ? { pathLength: 1, strokeDasharray: "1 1" }
                : { strokeDasharray: `${Math.max(5, edge * 0.08)} ${Math.max(4, edge * 0.06)}` };
            const color = palette[beam.kind];
            return (
              <g key={beam.key}>
                {/* a bolt of light, not a bar: a soft coloured glow, the coloured beam and a white-hot
                    core (the core and the arrowhead still read once monochrome greys the colour).
                    Every layer draws in and fades together, so nothing is left standing behind it. */}
                <path
                  data-fx="beam-glow"
                  data-kind={beam.kind}
                  d={beam.d}
                  stroke={color}
                  strokeOpacity={0.45}
                  strokeWidth={beamWidth * 3}
                  strokeLinecap="round"
                  fill="none"
                  filter={`url(#${markerId}-glow)`}
                  style={{ opacity: 0 }}
                  {...dash}
                />
                <path
                  data-fx="beam"
                  data-kind={beam.kind}
                  d={beam.d}
                  stroke={color}
                  strokeWidth={beam.kind === "damage" ? beamWidth + 1 : beamWidth}
                  strokeLinecap="round"
                  fill="none"
                  style={{ opacity: 0 }}
                  {...dash}
                  markerEnd={`url(#${markerId}-${beam.kind})`}
                />
                <path
                  data-fx="beam-core"
                  data-kind={beam.kind}
                  d={beam.d}
                  stroke="#ffffff"
                  strokeOpacity={0.9}
                  strokeWidth={Math.max(1, beamWidth * 0.35)}
                  strokeLinecap="round"
                  fill="none"
                  style={{ opacity: 0 }}
                  {...dash}
                />
              </g>
            );
          })}
        </svg>
      )}

      {cardBox && card && art && (
        <div
          data-fx="card"
          className="absolute overflow-hidden rounded-rc-md shadow-rc-md ring-1 ring-rc-line/25"
          style={{ left: cardBox.x, top: cardBox.y, width: cardBox.w, height: cardBox.h, opacity: 0 }}
        >
          {art.src ? (
            <Image
              src={art.src}
              alt=""
              fill
              unoptimized
              sizes={`${Math.ceil(cardBox.w)}px`}
              draggable={false}
              // a site's art is stored upright; laid on its side like the board's own sites
              className={`${art.landscape ? "rotate-90 scale-[1.333] object-contain" : "object-cover"} origin-center object-center`}
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center bg-[rgba(9,13,25,0.95)] p-1 text-center font-rc-display text-xs text-rc-fg">
              {card.name}
            </span>
          )}
        </div>
      )}

      {layout.numbers.map((number) => (
        <div
          key={number.key}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: number.x, top: number.y }}
        >
          <span
            data-fx="number"
            className="block select-none font-rc-display font-bold tabular-nums leading-none"
            style={{
              opacity: 0,
              fontSize,
              color: "#ffffff",
              // a black outline under the fill (paint-order) plus the damage glow: readable on any
              // art, and still a number with an edge once the monochrome filter greys it
              WebkitTextStroke: `${Math.max(3, Math.round(fontSize * 0.12))}px #000`,
              paintOrder: "stroke fill",
              textShadow: `0 0 12px ${palette.damage}, 0 0 24px ${palette.damage}cc, 0 3px 4px rgba(0,0,0,.95)`,
            }}
          >
            {number.text}
          </span>
        </div>
      ))}

      {layout.caption && (
        <div
          className={`absolute ${
            layout.caption.align === "start" ? "" : layout.caption.align === "end" ? "-translate-x-full" : "-translate-x-1/2"
          } ${layout.caption.below ? "pt-1" : "-translate-y-full pb-1"}`}
          style={{ left: layout.caption.x, top: layout.caption.y }}
        >
          <span
            data-fx="caption"
            className="block max-w-[min(70vw,280px)] truncate rounded-full border border-rc-line/22 bg-[rgba(7,10,20,0.92)] px-2.5 py-0.5 font-rc-display text-[13px] text-rc-fg-strong shadow-rc-panel"
            style={{ opacity: 0 }}
          >
            {layout.caption.text}
          </span>
        </div>
      )}
    </div>
  );
}
