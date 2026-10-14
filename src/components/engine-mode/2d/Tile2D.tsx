"use client";

import { Icon } from "@iconify/react";
import { OVERLAY_COLORS } from "@/lib/engine-mode/boardOverlays";
import type { BoardLayer, HiddenCounts } from "@/lib/engine-mode/projection";
import { PLAYER_COLORS } from "@/lib/game/constants";
import type { CardRef, CellKey, PlayerKey, SiteTile } from "@/lib/game/store/types";
import { TOKEN_BY_KEY, tokenCardId, tokenSlug } from "@/lib/game/tokens";
import { CardArt } from "./Card2D";
import { siteOwnerGlow } from "./layout2d";
import { tileMin, tileNumber, type TileSize } from "./picks2d";
import { useLongPress, type PressInfo } from "./useLongPress";

const { water: WATER, land: LAND } = OVERLAY_COLORS;

/**
 * An empty square is the void between realms: a near-black well that falls away towards its
 * edges, a faint mist at its heart and a scatter of dust motes (two offset dot lattices, so the
 * pattern never reads as a grid). Pure CSS, no images, nothing moves. Below the surface the same
 * well turns to packed earth: warmer motes, a heavier vignette, a darker floor. Both stay far
 * darker than any site art, so "no site here" never reads as a dark site.
 */
export function voidFill(layer: BoardLayer): string {
  if (layer === "subsurface") {
    return [
      "radial-gradient(ellipse at 50% 42%, rgba(92,64,38,0.22) 0%, rgba(92,64,38,0) 62%)",
      "radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.7) 100%)",
      "radial-gradient(circle, rgba(196,150,104,0.10) 0.6px, transparent 1.1px) 0 0 / 6px 6px",
      "radial-gradient(circle, rgba(196,150,104,0.06) 0.6px, transparent 1.1px) 3px 4px / 11px 9px",
      "#0b0806",
    ].join(", ");
  }
  return [
    "radial-gradient(ellipse at 50% 40%, rgba(64,74,112,0.20) 0%, rgba(64,74,112,0) 65%)",
    "radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.6) 100%)",
    "radial-gradient(circle, rgba(170,182,214,0.08) 0.6px, transparent 1.1px) 0 0 / 7px 7px",
    "radial-gradient(circle, rgba(170,182,214,0.05) 0.6px, transparent 1.1px) 4px 3px / 13px 11px",
    "#06080f",
  ].join(", ");
}

/** The void's inner rim light: just enough edge for the grid to stay legible between empty squares. */
export function voidRim(layer: BoardLayer): string {
  return layer === "subsurface"
    ? "inset 0 0 0 1px rgba(160,118,76,0.16), inset 0 1px 0 rgba(255,220,180,0.05)"
    : "inset 0 0 0 1px rgba(148,163,196,0.14), inset 0 1px 0 rgba(255,255,255,0.05)";
}

/**
 * The site art's filter. Below the surface the sites are the ceiling overhead: dimmed, mostly
 * drained of colour and pushed towards earth, so the whole board reads "underground" at a
 * glance while the terrain tint on top still says water or land.
 */
export function siteArtFilter({ saturation, tapped, layer }: { saturation: number; tapped?: boolean; layer: BoardLayer }): string {
  if (layer === "subsurface") {
    return `saturate(${(saturation * 0.35).toFixed(2)}) sepia(0.3) brightness(${tapped ? 0.4 : 0.5})`;
  }
  return `saturate(${saturation})${tapped ? " brightness(0.7)" : ""}`;
}

/** The tile number's size: calm, a little under an eighth of the tile's smaller edge, never unreadable. */
export const tileNumberSize = (edge: number): number => Math.min(16, Math.max(10, Math.round(edge * 0.11)));

/**
 * How the tile number is painted. On a void square it is the quiet muted grey. On site art no
 * blend mode reads everywhere — `difference` (and `exclusion`, which is softer still) turn a
 * white number into a mid-tone over mid-tone art, so sand, sky and lavender swallowed it. So
 * over a site the number sits on its own small dark plate instead: white on near-black is the
 * same contrast on every site, in every visual aid, and the plate is small enough to leave the
 * art alone.
 */
export function tileNumberLook(onSite: boolean): {
  className: string;
  style: { color?: string; background?: string };
} {
  return onSite
    ? {
        className: "rounded-[3px] px-[3px] py-[2px] font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.6)]",
        style: { color: "#f8fafc", background: "rgba(6,8,15,0.78)" },
      }
    : { className: "text-rc-fg-muted/80 [text-shadow:0_1px_2px_rgba(0,0,0,0.95),0_0_4px_rgba(0,0,0,0.8)]", style: {} };
}

/**
 * How much of a lying-down site card, from its top edge, is art. Under it run the printed title
 * bar ("Red Desert – An Ordinary Site of blight") and the rules text; the card preview shows
 * those, the tile shows the place.
 */
export const SITE_ART_FRACTION = 0.78;

/**
 * The art window of a site on a tile: the card laid on its side and scaled, keeping its shape,
 * until its art band (SITE_ART_FRACTION of its height) covers the whole tile, centred left to
 * right; on a square or wide-ish tile the band fills it top-aligned, on a very wide one the band
 * is taller than the tile and centred on it. Returns the landscape card's box relative to the tile.
 */
export function siteArtCrop(tile: TileSize): { left: number; top: number; width: number; height: number } {
  const height = Math.max(tile.h / SITE_ART_FRACTION, (tile.w * 63) / 88);
  const width = (height * 88) / 63;
  return { left: (tile.w - width) / 2, top: Math.min(0, (tile.h - height * SITE_ART_FRACTION) / 2), width, height };
}

/** Rubble, the site-replacement token: drawn with the token's own art, like a site. */
const RUBBLE_CARD: CardRef = {
  cardId: tokenCardId(TOKEN_BY_KEY.rubble),
  name: TOKEN_BY_KEY.rubble.name,
  type: "Token",
  slug: tokenSlug(TOKEN_BY_KEY.rubble),
};

/** The site's art only, cropped to the tile (siteArtCrop): no printed name, no cut-off rules text. */
function SiteArtCrop({ card, tile }: { card: CardRef; tile: TileSize }) {
  const box = siteArtCrop(tile);
  return (
    <span aria-hidden className="pointer-events-none absolute" style={box}>
      {/* the scan is stored upright: a portrait box of the swapped shape, turned onto its side */}
      <span
        className="absolute left-1/2 top-1/2 rotate-90"
        style={{ width: box.height, height: box.width, marginLeft: -box.height / 2, marginTop: -box.width / 2 }}
      >
        <CardArt card={card} sizes={`${Math.ceil(box.width)}px`} rotateLandscape={false} />
      </span>
    </span>
  );
}

export interface Tile2DProps {
  cell: CellKey;
  /** the tile's size in px (not necessarily square) */
  tile: TileSize;
  site: SiteTile | null;
  /** 0–1, the site-colour setting */
  saturation: number;
  rubble?: boolean;
  flooded?: boolean;
  /** seats with a Harbinger portal on this square */
  portals?: PlayerKey[];
  /** subsurface view only: the terrain under the site */
  tint?: "water" | "land" | null;
  /** the layer the board is showing */
  layer?: BoardLayer;
  onTap: (cell: CellKey, info: PressInfo) => void;
  onLongPress: (cell: CellKey, info: PressInfo) => void;
  onHover?: (cell: CellKey, entering: boolean) => void;
}

export function hiddenLabel(counts: HiddenCounts, layer: BoardLayer): { icon: string; count: number; text: string } | null {
  if (layer === "subsurface") {
    return counts.surface ? { icon: "game-icons:mountains", count: counts.surface, text: `${counts.surface} above` } : null;
  }
  const count = counts.underground + counts.underwater;
  if (!count) return null;
  const parts = [
    counts.underground ? `${counts.underground} burrowed` : "",
    counts.underwater ? `${counts.underwater} submerged` : "",
  ].filter(Boolean);
  return {
    icon: counts.underground ? "game-icons:underground-cave" : "game-icons:wave-crest",
    count,
    text: parts.join(" · "),
  };
}

/**
 * One square of the 2D board: the site's art (or the void) full-bleed — the art band only, never
 * the printed title bar or rules text (siteArtCrop), turned to face its owner (the opponent's
 * upside down, with a faint inner glow in their colour: siteOwnerGlow) — the
 * tile number (no name strip: the card preview names the site), and the square's own marks — tapped, rubble, flooded, portal, subsurface
 * tint. The badge counting units on the other layer is LayerBadge2D, drawn above the cards.
 */
export default function Tile2D({
  cell,
  tile,
  site,
  saturation,
  rubble,
  flooded,
  portals = [],
  tint,
  layer = "surface",
  onTap,
  onLongPress,
  onHover,
}: Tile2DProps) {
  const [x, y] = cell.split(",").map(Number);
  const press = useLongPress({
    onTap: (info) => onTap(cell, info),
    onLongPress: (info) => onLongPress(cell, info),
  });
  const owner: PlayerKey | null = site ? (site.owner === 2 ? "p2" : "p1") : null;
  const edge = tileMin(tile);
  const icon = Math.max(12, Math.round(edge * 0.2));
  const numberSize = tileNumberSize(edge);
  const number = tileNumber(cell);
  const name = site?.card?.name ?? (rubble ? "Rubble" : null);
  const numberLook = tileNumberLook(Boolean(site?.card));

  return (
    <div className="absolute" style={{ left: x * tile.w, top: y * tile.h, width: tile.w, height: tile.h }}>
      <button
        type="button"
        {...press}
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") onHover?.(cell, true);
        }}
        onPointerLeave={(e) => {
          press.onPointerLeave(e);
          if (e.pointerType === "mouse") onHover?.(cell, false);
        }}
        aria-label={`Tile ${number}${name ? `, ${name}` : ", empty"}${site?.tapped ? ", tapped" : ""}${tint ? `, ${tint} below` : ""}`}
        className="absolute inset-[1px] isolate touch-manipulation select-none overflow-hidden rounded-[3px] [-webkit-touch-callout:none] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-rc-accent"
        style={{
          background: site ? "rgba(7,10,20,0.9)" : voidFill(layer),
          border: "1px solid rgba(0,0,0,0.6)",
          boxShadow: site ? undefined : voidRim(layer),
        }}
        data-owner={owner ?? undefined}
      >
        {site?.card && (
          <span
            className="absolute inset-0"
            style={{
              filter: siteArtFilter({ saturation, tapped: site.tapped, layer }),
              // the opponent's site lies as played from across the table, like their cards (cardTurn)
              transform: owner === "p2" ? "rotate(180deg)" : undefined,
            }}
          >
            <SiteArtCrop card={site.card} tile={tile} />
          </span>
        )}
        {site?.card && owner === "p2" && (
          <span aria-hidden data-owner-glow className="pointer-events-none absolute inset-0" style={{ boxShadow: siteOwnerGlow(owner, edge) }} />
        )}
        {rubble && !site?.card && (
          <span className="absolute inset-0" style={{ filter: siteArtFilter({ saturation, layer }) }}>
            <SiteArtCrop card={RUBBLE_CARD} tile={tile} />
          </span>
        )}
        {tint && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background: tint === "water" ? WATER : LAND,
              opacity: 0.3,
              boxShadow: `inset 0 0 ${Math.round(edge * 0.22)}px ${tint === "water" ? WATER : LAND}`,
            }}
          />
        )}
        {/* the number the log uses, in the corner (on its own plate over site art: tileNumberLook) */}
        <span className={`pointer-events-none absolute flex items-center gap-0.5 ${site?.card ? "left-0.5 top-0.5" : "left-1 top-0.5"}`}>
          <span
            data-tile-number
            className={`font-fantaisie leading-none ${numberLook.className}`}
            style={{ fontSize: numberSize, ...numberLook.style }}
          >
            {number}
          </span>
          {site?.tapped && <Icon icon="game-icons:clockwise-rotation" aria-label="tapped" width={numberSize} height={numberSize} className="text-rc-fg-strong drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]" />}
          {flooded && <Icon icon="game-icons:flood" aria-label="flooded" width={numberSize} height={numberSize} className="text-rc-info drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]" />}
          {/* the terrain by shape as well as hue, so it survives monochrome and colour blindness */}
          {tint && (
            <Icon
              icon={tint === "water" ? "game-icons:water-drop" : "game-icons:stone-block"}
              aria-hidden
              width={numberSize}
              height={numberSize}
              className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]"
              style={{ color: tint === "water" ? "#93c5fd" : "#d6b48a" }}
            />
          )}
        </span>
        {portals.map((seat, i) => (
          <span
            key={seat}
            aria-label={`${seat === "p1" ? "your" : "opponent's"} portal`}
            className="pointer-events-none absolute rounded-full"
            style={{
              inset: edge * (0.18 + i * 0.07),
              border: `2px ${seat === "p2" ? "dashed" : "solid"} ${PLAYER_COLORS[seat]}`,
              boxShadow: `0 0 10px ${PLAYER_COLORS[seat]}`,
            }}
          >
            {i === 0 && (
              <Icon
                icon="game-icons:portal"
                aria-hidden
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-80"
                style={{ color: PLAYER_COLORS[seat] }}
                width={icon}
                height={icon}
              />
            )}
          </span>
        ))}
      </button>
    </div>
  );
}

/**
 * How many units stand on this square on the layer the board is not showing; tapping it
 * switches layers (V). Drawn over the cards, in the tile's top-right corner.
 */
export function LayerBadge2D({
  cell,
  tile,
  counts,
  layer,
  onToggle,
}: {
  cell: CellKey;
  tile: TileSize;
  counts: HiddenCounts;
  layer: BoardLayer;
  onToggle: () => void;
}) {
  const away = hiddenLabel(counts, layer);
  if (!away) return null;
  const [x, y] = cell.split(",").map(Number);
  const where = layer === "surface" ? "Show the subsurface layer" : "Show the surface";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      title={`${away.text} — ${where} (V)`}
      aria-label={`${away.text}. ${where}`}
      className="pointer-events-auto absolute flex min-h-6 min-w-6 -translate-x-full touch-manipulation items-center justify-center gap-0.5 overflow-hidden whitespace-nowrap rounded-full border border-rc-line/22 bg-[rgba(7,10,20,0.9)] px-1 font-rc-mono text-[10px] tabular-nums text-rc-fg-muted shadow-rc-panel hover:border-rc-accent hover:text-rc-fg-strong"
      style={{ left: (x + 1) * tile.w - 2, top: y * tile.h + 2, maxWidth: tile.w - 4 }}
    >
      <Icon icon={away.icon} width={12} height={12} aria-hidden />
      {tile.w >= 96 ? away.text : away.count}
    </button>
  );
}
