"use client";

import { Icon } from "@iconify/react";
import { type CSSProperties, type FocusEvent, type PointerEvent as ReactPointerEvent, type SyntheticEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useShallow } from "zustand/react/shallow";
import { RcButton } from "@/components/ui/rc-button";
import { useVisualAid } from "@/hooks/useGraphicsSettings";
import { useCpuBoardPicker } from "@/lib/game/cpu/boardPicker";
import { fieldTargets, toneColors, type ArrowTarget, type FieldTone, type OptionRow } from "@/lib/game/cpu/fieldTargets";
import { useGameStore } from "@/lib/game/store";
import TileInspector from "./TileInspector";
import { ARROW_ROTATION, areaAnchorPoints, areaHitSize, areaTap, arrowBox, cellBox, crowdedTiles, popoverPlacement, tileMin, tileNumber, type TileSize, unitCandidatesByTile } from "./picks2d";

/** Where the docked prompt (phones) collects the board's option rows instead of floating them over a tile. */
export const PROMPT_DOCK_ID = "engine-prompt-dock";

// The 2D board's picks layer: the same colour language as CpuFieldTargets (toneColors, so a visual
// aid swaps everything at once), drawn in board pixels over the cards.
//
// Pointer discipline: the layer itself never takes a pointer. Tile highlights are pure paint, so a
// tap reaches the card under it (Card2D picks a unit token, or falls through to its tile) or the
// tile (Tile2D picks the tile token). Only the things that exist nowhere else on the board are
// buttons here: direction arrows, area markers, option rows, and the inspector hand-off on a tile
// too crowded to tap its cards apart.

/** Static wash per tone; `area` is the heaviest so a footprint reads as one block of ground. */
const WASH: Record<FieldTone, number> = {candidate:0.07,continue:0.12,selected:0.16,target:0.1,source:0.08,area:0.2};
const pulses = (tone: FieldTone) => tone === "candidate" || tone === "continue" || tone === "selected";
/** A choice in progress breathes at half speed ("this is waiting on you"); none at all under reduced motion. */
const pulseClass = (slow: boolean) => slow ? "motion-safe:animate-pulse motion-safe:[animation-duration:3.2s]" : "motion-safe:animate-pulse";
// Corner brackets in a 0..100 tile box: the target-lock sigil a clickable tile wears.
const BRACKETS = "M1.5 27V1.5H27M73 1.5H98.5V27M98.5 73V98.5H73M27 98.5H1.5V73";
const PIP = "M50 41.5L58.5 50L50 58.5L41.5 50Z";
const ARROW = "M12 3L20.5 12.5H15V21H9V12.5H3.5Z";

const stopDom = (event: SyntheticEvent) => event.stopPropagation();
const pick = (token: string) => useCpuBoardPicker.getState().select(token);
const setHovered = (token: string | null) => useCpuBoardPicker.getState().setHovered(token);
const unhover = (token: string) => { if (useCpuBoardPicker.getState().hovered === token) setHovered(null); };
const boxStyle = ({left,top,width,height}: {left: number; top: number; width: number; height: number}): CSSProperties => ({left,top,width,height});

/** The prompt dock element while `docked`; it may mount after this layer, and may be replaced. */
function useDock(docked: boolean): HTMLElement | null {
  const [dock, setDock] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!docked || typeof document === "undefined") { setDock(null); return; }
    const sync = () => {
      const found = document.getElementById(PROMPT_DOCK_ID);
      setDock(current => current === found ? current : found);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body,{childList:true,subtree:true});
    return () => observer.disconnect();
  },[docked]);
  return docked ? dock : null;
}

export default function FieldTargets2D({tile,docked}: {tile: TileSize; docked: boolean}) {
  const {request,tiles,selected,glow,sources,labels,sequence,areas,hovered} = useCpuBoardPicker(useShallow(picker => ({request:picker.request,tiles:picker.tiles,selected:picker.selected,glow:picker.glow,sources:picker.sources,labels:picker.labels,sequence:picker.sequence,areas:picker.areas,hovered:picker.hovered})));
  const cpu = useGameStore(state => state.opponentPlayerId?.startsWith("cpu_") === true);
  const permanents = useGameStore(state => state.permanents);
  const avatars = useGameStore(state => state.avatars);
  const colors = toneColors(useVisualAid());
  const hasAreas = Object.keys(areas).length > 0;
  // `hovered` only feeds the area preview, so a board with no areas never re-derives on hover.
  const anchor = hasAreas ? hovered : null;
  const targets = useMemo(() => fieldTargets({tiles,selected,glow,sources,labels,sequence,areas,hovered:anchor}),[tiles,selected,glow,sources,labels,sequence,areas,anchor]);
  const byTile = useMemo(() => unitCandidatesByTile({tiles},permanents,avatars),[tiles,permanents,avatars]);
  const crowded = useMemo(() => crowdedTiles(byTile,tile),[byTile,tile]);
  const dock = useDock(docked);
  const [focusAt, setFocusAt] = useState<string | null>(null);
  // The inspector belongs to the request it was opened for: a later pick never reopens it by itself.
  const [inspect, setInspect] = useState<{at: string; request: string} | null>(null);
  // A finger's first tap on an area marker previews it; this remembers which, for the "tap again" hint.
  const [touchPreview, setTouchPreview] = useState<string | null>(null);
  const pointer = useRef<"mouse" | "touch">("mouse");

  if (!cpu && !request.startsWith("engine")) return null;
  const slow = sequence === true;
  const inspectTokens = inspect && inspect.request === request ? byTile.get(inspect.at) ?? [] : [];
  const tileClickable = (at: string) => tiles.includes(at);
  const rowTiles = new Set(targets.rows.map(row => row.at));

  return <div data-engine-picks className="pointer-events-none absolute inset-0 z-[40]">
    {[...targets.tiles].map(([at,tone]) => <ToneTile key={at} at={at} tone={tone} tile={tile} color={colors[tone]} slow={slow} />)}
    {/* docked rows have left their tile: a quiet frame says where each one belongs, solid while its row is under the finger */}
    {dock && [...rowTiles].map(at => <div key={`row:${at}`} aria-hidden data-engine-option-tile={at} className="pointer-events-none absolute rounded-[2px]"
      style={{...boxStyle(cellBox(at,tile)),outline:`2px ${focusAt === at ? "solid" : "dashed"} ${focusAt === at ? colors.selected : colors.candidate}`,outlineOffset:-3,boxShadow:"inset 0 0 0 4px rgba(7,10,20,0.45)"}} />)}

    {hasAreas && areaAnchorPoints(areas,tile).map(({token,x,y}) => {
      const lit = token === hovered || token === selected;
      const color = token === selected ? colors.selected : lit ? colors.area : colors.candidate;
      const hit = areaHitSize(tile), mark = Math.max(18,Math.round(tileMin(tile)*0.3));
      const label = labels[token] || `Place at tile ${tileNumber(token)}`;
      return <button key={token} type="button" data-engine-area={token} aria-label={label} aria-pressed={token === selected} title={label}
        className="pointer-events-auto absolute flex touch-manipulation items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rc-accent-ring"
        style={{left:x-hit/2,top:y-hit/2,width:hit,height:hit}}
        onPointerDown={(event: ReactPointerEvent) => { pointer.current = event.pointerType === "mouse" ? "mouse" : "touch"; event.stopPropagation(); }}
        onPointerEnter={(event: ReactPointerEvent) => { if (event.pointerType === "mouse") setHovered(token); }}
        onPointerLeave={(event: ReactPointerEvent) => { if (event.pointerType === "mouse") unhover(token); }}
        onKeyDown={() => { pointer.current = "mouse"; }}
        // keyboard focus previews like a mouse hover; a tap's focus must not, or its first tap would already commit
        onFocus={(event: FocusEvent<HTMLButtonElement>) => { if (focusVisible(event.currentTarget)) setHovered(token); }}
        onBlur={() => unhover(token)}
        onContextMenu={stopDom}
        onClick={event => {
          event.stopPropagation();
          if (areaTap(token,useCpuBoardPicker.getState().hovered,pointer.current) === "select") { setTouchPreview(null); pick(token); return; }
          setTouchPreview(token);
          setHovered(token);
        }}>
        <span aria-hidden className={`block rotate-45 rounded-[3px] border-2 ${lit ? "" : pulseClass(slow)}`}
          style={{width:mark*0.7,height:mark*0.7,borderColor:color,background:lit ? `${color}e6` : `${color}66`,boxShadow:"0 0 0 2px rgba(7,10,20,0.6)"}} />
        {touchPreview === token && hovered === token && token !== selected &&
          <span role="status" className="rc-toast pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap px-2 py-0.5 font-rc-sans text-[11px] text-rc-fg">Tap again to place</span>}
      </button>;
    })}

    {crowded.map(at => {
      const count = byTile.get(at)?.length ?? 0;
      return <button key={`inspect:${at}`} type="button" data-engine-inspect={at} aria-label={`Choose among ${count} cards on tile ${tileNumber(at)}`}
        className="pointer-events-auto absolute touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rc-accent-ring"
        style={boxStyle(cellBox(at,tile))}
        onPointerDown={stopDom} onContextMenu={stopDom}
        onClick={event => { event.stopPropagation(); setInspect({at,request}); }}>
        <span aria-hidden className="absolute bottom-0.5 right-0.5 flex items-center gap-0.5 rounded-full border border-rc-line/22 bg-[rgba(7,10,20,0.85)] px-1 py-px font-rc-mono text-[10px] tabular-nums text-rc-fg shadow-rc-panel">
          <Icon icon="game-icons:magnifying-glass" className="h-3 w-3" />{count}
        </span>
      </button>;
    })}

    {targets.arrows.map(arrow => <Arrow key={arrow.token} arrow={arrow} tile={tile} color={colors[arrow.tone]} slow={slow} label={labels[arrow.token]} />)}

    {targets.rows.length > 0 && (dock
      ? createPortal(<DockedRows rows={targets.rows} onFocusTile={setFocusAt} />,dock)
      : targets.rows.map(row => <OptionPopover key={row.at} row={row} tile={tile} />))}

    {inspect && inspectTokens.length > 0 && <TileInspector at={inspect.at} tokens={inspectTokens} tileToken={tileClickable(inspect.at) ? inspect.at : null} onClose={() => setInspect(null)} />}
  </div>;
}

function focusVisible(element: HTMLElement): boolean {
  try { return element.matches(":focus-visible"); } catch { return false; }
}

/** One tile's highlight. A tile awaiting a click wears corner brackets and a breathing centre pip
 *  over a faint box; a merely lit one (chosen target, source, footprint) a plain box. In monochrome
 *  that shape difference is what carries the meaning. */
function ToneTile({at,tone,tile,color,slow}: {at: string; tone: FieldTone; tile: TileSize; color: string; slow: boolean}) {
  const live = pulses(tone);
  return <div aria-hidden data-pick-tile={at} data-tone={tone} className="pointer-events-none absolute" style={boxStyle(cellBox(at,tile))}>
    <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
      <rect width="100" height="100" fill={color} fillOpacity={WASH[tone]} className={live ? pulseClass(slow) : undefined} />
      <rect x="1" y="1" width="98" height="98" fill="none" stroke={color} strokeOpacity={live ? 0.45 : 0.9} strokeWidth={live ? 1.5 : 2} vectorEffect="non-scaling-stroke" />
      {live && <>
        {/* a dark under-stroke keeps the brackets legible over bright card art in every palette */}
        <path d={BRACKETS} fill="none" stroke="rgba(7,10,20,0.6)" strokeWidth={5} vectorEffect="non-scaling-stroke" />
        <path d={BRACKETS} fill="none" stroke={color} strokeWidth={3} vectorEffect="non-scaling-stroke" />
        <path d={PIP} fill={color} fillOpacity={0.4} stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" className={pulseClass(slow)} />
      </>}
    </svg>
  </div>;
}

/** A direction arrow on a tile edge: a solid chevron on a dark disc when it can be pressed, a hollow
 *  one (no disc, no pointer) when it only shows a direction already chosen. */
function Arrow({arrow,tile,color,slow,label}: {arrow: ArrowTarget; tile: TileSize; color: string; slow: boolean; label?: string}) {
  const {token,at,dir,tone,clickable} = arrow;
  const box = arrowBox(at,dir,tile);
  const glyph = <svg aria-hidden viewBox="0 0 24 24" className="h-[70%] w-[70%]" style={{transform:`rotate(${ARROW_ROTATION[dir]}deg)`}}>
    <path d={ARROW} fill={clickable ? color : "none"} stroke={clickable ? "rgba(7,10,20,0.85)" : color} strokeWidth={clickable ? 1.2 : 2} strokeLinejoin="round"
      className={clickable && pulses(tone) ? pulseClass(slow) : undefined} />
  </svg>;
  if (!clickable) return <div aria-hidden data-pick-arrow={token} className="pointer-events-none absolute flex items-center justify-center" style={boxStyle(box)}>{glyph}</div>;
  const name = label || `Direction ${dir}`;
  return <button type="button" data-pick-arrow={token} aria-label={name} aria-pressed={tone === "selected"} title={name}
    className="pointer-events-auto absolute flex touch-manipulation items-center justify-center rounded-full border-2 bg-[rgba(7,10,20,0.8)] shadow-rc-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rc-accent-ring"
    style={{...boxStyle(box),borderColor:color}}
    onPointerDown={stopDom} onContextMenu={stopDom}
    onPointerEnter={(event: ReactPointerEvent) => { if (event.pointerType === "mouse") setHovered(token); }}
    onPointerLeave={(event: ReactPointerEvent) => { if (event.pointerType === "mouse") unhover(token); }}
    onFocus={(event: FocusEvent<HTMLButtonElement>) => { if (focusVisible(event.currentTarget)) setHovered(token); }}
    onBlur={() => unhover(token)}
    onClick={event => { event.stopPropagation(); pick(token); }}>
    {glyph}
  </button>;
}

function OptionButtons({row,large}: {row: OptionRow; large: boolean}) {
  return <>{row.options.map(option => <RcButton key={option.token} size="xs" variant={option.variant === "commit" ? "default" : option.variant} tone="success"
    aria-label={option.label} aria-pressed={option.pressed} aria-disabled={!option.clickable || undefined} data-pick-option={option.token}
    className={`touch-manipulation ${large ? "h-10 sm:h-8" : "h-9 sm:h-7"}`}
    onClick={event => { event.stopPropagation(); if (option.clickable) pick(option.token); }}>
    {option.label}
  </RcButton>)}</>;
}

/** Desktop: the row floats at its tile, above it (below it on the top row), never off the board's sides. */
function OptionPopover({row,tile}: {row: OptionRow; tile: TileSize}) {
  const {left,top,alignX,below} = popoverPlacement(row.at,tile);
  const shiftX = alignX === "start" ? "0" : alignX === "end" ? "-100%" : "-50%";
  return <div role="group" aria-label={`Choices on tile ${tileNumber(row.at)}`} data-engine-options={row.at}
    onPointerDown={stopDom} onPointerUp={stopDom} onClick={stopDom} onContextMenu={stopDom}
    className="pointer-events-auto absolute z-10 flex w-max max-w-[min(22rem,80vw)] flex-wrap items-center justify-center gap-1.5 rounded-rc-md border border-rc-line/22 bg-[rgba(7,10,20,0.9)] p-1 shadow-rc-panel"
    style={{left,top,transform:`translate(${shiftX}, ${below ? "4px" : "calc(-100% - 4px)"})`}}>
    <OptionButtons row={row} large={false} />
  </div>;
}

/** Phones: every row in the prompt dock, each labelled with its tile; touching a row frames its tile on the board. */
function DockedRows({rows,onFocusTile}: {rows: OptionRow[]; onFocusTile: (at: string | null) => void}) {
  useEffect(() => () => onFocusTile(null),[onFocusTile]);
  return <div role="group" aria-label="Choices on the board" data-engine-options-dock className="flex flex-col gap-1.5 font-rc-sans text-rc-fg">
    {rows.map(row => <div key={row.at} data-engine-options={row.at} className="flex flex-wrap items-center gap-1.5"
      onPointerEnter={() => onFocusTile(row.at)} onPointerLeave={() => onFocusTile(null)}
      onFocus={() => onFocusTile(row.at)} onBlur={() => onFocusTile(null)}>
      {rows.length > 1 && <span className="min-w-12 font-rc-mono text-[11px] uppercase tabular-nums tracking-[0.08em] text-rc-fg-subtle">Tile {tileNumber(row.at)}</span>}
      <OptionButtons row={row} large />
    </div>)}
  </div>;
}
