"use client";

import { Icon } from "@iconify/react";
import { useCallback, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { useGraphicsSettings, useVisualAid } from "@/hooks/useGraphicsSettings";
import { auraAreas, disableAreas, layerTints, multiSquareBodies, spanEntities } from "@/lib/engine-mode/boardOverlays";
import { useEngineSession } from "@/lib/engine-mode/session";
import { useCpuBoardPicker } from "@/lib/game/cpu/boardPicker";
import { toneColors } from "@/lib/game/cpu/fieldTargets";
import { useGameStore } from "@/lib/game/store";
import type { CardRef, CellKey, ContextMenuTarget, PlayerKey } from "@/lib/game/store/types";
import AreaLayer2D from "./AreaLayer2D";
import BoardMotion2D from "./BoardMotion2D";
import Card2D from "./Card2D";
import FieldTargets2D from "./FieldTargets2D";
import Tile2D, { LayerBadge2D } from "./Tile2D";
import { fateOf as fateOfCard } from "./boardDiff";
import { cardTone, isClickableTone, layoutBoard2D, resolveTap, spanTapCell, tileMarks, Z_PICK } from "./layout2d";
import type { Attachment, Placed, TapOutcome } from "./layout2d";
import { BOARD_COLS, BOARD_ROWS, tileMin, tileNumber } from "./picks2d";
import type { PressInfo } from "./useLongPress";

export interface Board2DProps {
  /** a tile's width and height in px (tiles stretch to fill the board's box, so need not be
   *  square); the board is 5 x 4 tiles */
  tileW: number;
  tileH: number;
  /** phones: the picks layer docks its option rows into the prompt dock */
  docked?: boolean;
  /** layer 4, effects (EventFx2D): drawn over everything in board pixels, never takes a tap */
  children?: ReactNode;
}

const CELLS: CellKey[] = Array.from({ length: BOARD_COLS * BOARD_ROWS }, (_, i) => `${i % BOARD_COLS},${Math.floor(i / BOARD_COLS)}`);

/** A finger or pen, rather than a mouse (a keyboard click reports no pointer type at all). */
const isCoarse = (info: PressInfo) => info.pointerType === "touch" || info.pointerType === "pen";
const sameCard = (a: CardRef | null, b: CardRef) =>
  Boolean(a) && a?.name === b.name && (a?.instanceId ?? null) === (b.instanceId ?? null);

/**
 * The flat 5x4 board for phones: no WebGL, nothing floating over it. Layer 0 is the tiles,
 * 1 the area overlays, 2 the cards (absolutely placed by layout2d so auras and oversized bodies
 * span their squares as one card), 3 the picks (FieldTargets2D), 4 whatever effects the page
 * passes as children. It reads the projected store and the engine session itself and talks to
 * the rules only through the board picker, exactly as the 3D board does.
 */
export default function Board2D({ tileW, tileH, docked = false, children }: Board2DProps) {
  const tile = useMemo(() => ({ w: tileW, h: tileH }), [tileW, tileH]);
  const game = useEngineSession((s) => s.game);
  const rev = useEngineSession((s) => s.rev);
  const layer = useEngineSession((s) => s.layer);
  const hidden = useEngineSession((s) => s.hidden);
  const setLayer = useEngineSession((s) => s.setLayer);
  const matchId = useEngineSession((s) => s.matchId);
  const { board, permanents, avatars, positions, portalState } = useGameStore(
    useShallow((s) => ({
      board: s.board,
      permanents: s.permanents,
      avatars: s.avatars,
      positions: s.permanentPositions,
      portalState: s.portalState,
    })),
  );
  const picker = useCpuBoardPicker(
    useShallow((p) => ({ tiles: p.tiles, glow: p.glow, sources: p.sources, selected: p.selected, sequence: p.sequence })),
  );
  const { settings } = useGraphicsSettings();
  const colors = toneColors(useVisualAid());

  // the engine state is mutated in place between projections; `rev` is what says it changed
  const overlays = useMemo(() => {
    if (!game) return { spans: [], auras: [], bodies: [], disables: [], tints: new Map<string, boolean>() };
    return {
      spans: spanEntities(game, layer),
      auras: layer === "surface" ? auraAreas(game) : [],
      bodies: multiSquareBodies(game),
      disables: layer === "surface" ? disableAreas(game) : [],
      tints: new Map(layerTints(game, layer).map((t) => [t.cell, t.water])),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, rev, layer]);

  const placed = useMemo(
    () => layoutBoard2D({ permanents, avatars, spans: overlays.spans, positions, tile }),
    [permanents, avatars, overlays.spans, positions, tile],
  );
  const marks = useMemo(() => tileMarks(permanents), [permanents]);
  const toneOf = useCallback((token: string) => cardTone(picker, token), [picker]);

  // Engine card ids behind every board id seen this match: once a unit leaves the board its
  // record is gone, and this is how the motion layer still tells "died" from "back to hand".
  const cardIds = useRef(new Map<string, string>());
  useMemo(() => {
    if (!game) {
      cardIds.current.clear();
      return;
    }
    for (const pile of [game.units, game.artifacts, game.auras]) {
      for (const [id, entity] of Object.entries(pile)) cardIds.current.set(id, entity.cardId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, rev]);
  const fateOf = useCallback(
    (key: string) => fateOfCard(key, useEngineSession.getState().game, (id) => cardIds.current.get(id)),
    [],
  );
  const rootRef = useRef<HTMLDivElement>(null);

  const portalsAt = (cell: CellKey): PlayerKey[] => {
    if (!portalState?.setupComplete) return [];
    const n = tileNumber(cell);
    return (["p1", "p2"] as const).filter((seat) => portalState[seat]?.tileNumbers.includes(n));
  };

  /** Apply a tap's outcome. On touch a preview stays up until the next tap anywhere on the board. */
  const apply = useCallback((outcome: TapOutcome, info: PressInfo, card: CardRef | null) => {
    const pick = useCpuBoardPicker.getState();
    const store = useGameStore.getState();
    const coarse = isCoarse(info);
    if (outcome.kind === "preview" && card) {
      store.setPreviewCard(coarse && sameCard(store.previewCard, card) ? null : card);
      return;
    }
    if (coarse && store.previewCard) store.setPreviewCard(null);
    if (outcome.kind === "hover") pick.setHovered(outcome.token);
    else if (outcome.kind === "select") {
      // a finger has no hover: the last thing touched is what the status line explains
      if (coarse) pick.setHovered(outcome.token);
      pick.select(outcome.token);
    }
  }, []);

  const onCardTap = useCallback(
    (target: Placed, info: PressInfo, attachment?: Attachment) => {
      const pick = useCpuBoardPicker.getState();
      let cell: CellKey = target.cell;
      const rect = target.span !== null && !attachment ? rootRef.current?.getBoundingClientRect() : undefined;
      if (rect) cell = spanTapCell(target, { x: info.x - rect.left, y: info.y - rect.top }, tile);
      const tokens = attachment
        ? [attachment.token, target.cell]
        : [target.token, ...target.statuses.map((s) => s.token), cell];
      const outcome = resolveTap({
        tokens,
        tiles: pick.tiles,
        areas: pick.areas,
        hovered: pick.hovered,
        coarse: isCoarse(info),
        previewable: true,
      });
      apply(outcome, info, attachment?.card ?? target.card);
    },
    [apply, tile],
  );

  const onTileTap = useCallback(
    (cell: CellKey, info: PressInfo) => {
      const pick = useCpuBoardPicker.getState();
      const site = useGameStore.getState().board.sites[cell]?.card ?? null;
      const outcome = resolveTap({
        tokens: [cell],
        tiles: pick.tiles,
        areas: pick.areas,
        hovered: pick.hovered,
        coarse: isCoarse(info),
        previewable: Boolean(site),
      });
      apply(outcome, info, site);
    },
    [apply],
  );

  const onCardLongPress = useCallback((target: Placed, info: PressInfo, attachment?: Attachment) => {
    const menu: ContextMenuTarget = attachment
      ? attachment.ref
      : target.ref.kind === "avatar"
        ? { kind: "avatar", who: target.ref.who }
        : target.ref;
    useGameStore.getState().openContextMenu(menu, { x: info.x, y: info.y });
  }, []);

  const onTileLongPress = useCallback((cell: CellKey, info: PressInfo) => {
    const store = useGameStore.getState();
    if (!store.board.sites[cell]) return;
    const [x, y] = cell.split(",").map(Number);
    store.openContextMenu({ kind: "site", x, y }, { x: info.x, y: info.y });
  }, []);

  /** Mouse hover: the card previews, and a clickable token tells the status line what a click would do. */
  const hoverToken = (token: string, entering: boolean) => {
    const pick = useCpuBoardPicker.getState();
    if (entering) {
      if (pick.tiles.includes(token)) pick.setHovered(token);
    } else if (pick.hovered === token) pick.setHovered(null);
  };
  const hoverCard = (card: CardRef, entering: boolean) => {
    const store = useGameStore.getState();
    if (entering) store.setPreviewCard(card);
    else if (sameCard(store.previewCard, card)) store.setPreviewCard(null);
  };
  const onCardHover = (target: Placed, entering: boolean, attachment?: Attachment) => {
    hoverToken(attachment?.token ?? target.token, entering);
    hoverCard(attachment?.card ?? target.card, entering);
  };
  const onTileHover = (cell: CellKey, entering: boolean) => {
    hoverToken(cell, entering);
    const site = board.sites[cell]?.card;
    if (site) hoverCard(site, entering);
  };

  const bounds = useMemo(() => ({ w: tile.w * BOARD_COLS, h: tile.h * BOARD_ROWS }), [tile]);
  const below = layer === "subsurface";
  const toggleLayer = () => setLayer(layer === "surface" ? "subsurface" : "surface");

  return (
    <div
      ref={rootRef}
      className="relative shrink-0 touch-manipulation select-none"
      style={{ width: bounds.w, height: bounds.h }}
      role="group"
      aria-label={below ? "Board, below the surface" : "Board"}
      data-layer={layer}
    >
      {CELLS.map((cell) => {
        const tint = overlays.tints.get(cell);
        return (
          <Tile2D
            key={cell}
            cell={cell}
            tile={tile}
            site={board.sites[cell] ?? null}
            saturation={settings.siteSaturation}
            rubble={marks[cell]?.rubble}
            flooded={marks[cell]?.flooded}
            portals={portalsAt(cell)}
            tint={tint === undefined ? null : tint ? "water" : "land"}
            layer={layer}
            onTap={onTileTap}
            onLongPress={onTileLongPress}
            onHover={onTileHover}
          />
        );
      })}

      {below && (
        /* Underground: the board sinks into the earth — a heavy inner shadow, an earthen rim and
           a label on the top edge, so the layer never has to be inferred from the units alone. */
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[1] rounded-[3px]"
          style={{
            boxShadow: `inset 0 0 ${Math.round(tileMin(tile) * 0.5)}px rgba(0,0,0,0.85), inset 0 0 0 2px rgba(139,90,43,0.6)`,
            outline: "1px solid rgba(139,90,43,0.45)",
            outlineOffset: 2,
          }}
        />
      )}
      {below && (
        <div className="pointer-events-none absolute left-1/2 top-0 z-[3] flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 whitespace-nowrap rounded-full border border-[rgba(139,90,43,0.7)] bg-[rgba(20,13,8,0.94)] px-2 py-0.5 font-rc-sans text-[11px] leading-none text-[#e3c9a6] shadow-rc-panel">
          <Icon icon="game-icons:underground-cave" width={12} height={12} aria-hidden />
          Below the surface
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 z-[1]">
        <AreaLayer2D tile={tile} auras={overlays.auras} bodies={overlays.bodies} disables={overlays.disables} />
      </div>

      <div className="pointer-events-none absolute inset-0 z-[2]">
        {placed.map((p) => {
          const tone = cardTone(picker, p.token);
          return (
            <Card2D
              key={p.key}
              placed={isClickableTone(tone) ? { ...p, z: Z_PICK + p.z } : p}
              tone={tone}
              colors={colors}
              toneOf={toneOf}
              onTap={onCardTap}
              onLongPress={onCardLongPress}
              onHover={onCardHover}
              bounds={bounds}
            />
          );
        })}
      </div>

      <div className="pointer-events-none absolute inset-0 z-[3]">
        {Object.entries(hidden).map(([cell, counts]) => (
          <LayerBadge2D key={cell} cell={cell} tile={tile} counts={counts} layer={layer} onToggle={toggleLayer} />
        ))}
      </div>

      {/* Picks: only its own buttons (arrows, area markers, option rows) take taps; a tile or
          card under it is picked by the tile / card itself. */}
      <div className="pointer-events-none absolute inset-0 z-[4]">
        <FieldTargets2D tile={tile} docked={docked} />
      </div>

      {/* what happened to the cards (moves, deaths, arrivals, attacks) — over the picks' tiles,
          never taking a tap */}
      <div className="pointer-events-none absolute inset-0 z-[5]">
        <BoardMotion2D tile={tile} placed={placed} fateOf={fateOf} baseline={`${matchId}:${layer}:${game ? "on" : "off"}`} />
      </div>

      {children && <div className="pointer-events-none absolute inset-0 z-[6]">{children}</div>}
    </div>
  );
}
