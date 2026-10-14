"use client";

import { Icon } from "@iconify/react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CpuCardPick from "@/components/game/CpuCardPick";
import { humanDecisionSeat, useEngineSession } from "@/lib/engine-mode/session";
import { pilotPickItems, type EngineInteraction } from "../useEngineInteraction";
import MoreSheet2D, { type MoreView } from "./MoreSheet2D";
import { layerToggle, primaryAction } from "./actions2d";

/**
 * Every slot is a full thumb target (≥44px tall) with an icon AND a word, so nothing depends
 * on recognising an icon or a colour. Disabled slots stay in place rather than vanishing, so
 * a button never jumps under a finger as the engine's legal moves change.
 */
const SLOT =
  "relative flex min-h-[44px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-rc-md border px-1 py-1 font-rc-sans text-[11px] leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rc-accent-ring disabled:cursor-not-allowed disabled:opacity-35 touch-manipulation select-none";
const QUIET = "border-rc-line/22 bg-black/35 text-rc-fg-muted enabled:hover:border-rc-accent/70 enabled:hover:text-rc-fg";
const OUTLINE = "border-rc-line/40 bg-transparent text-rc-fg enabled:hover:border-rc-accent enabled:hover:bg-rc-accent/8";
/** THE commit action: the only gold on the bar. */
const COMMIT =
  "border-rc-accent-press bg-gradient-to-b from-rc-accent-hover to-rc-accent font-medium text-rc-accent-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]";
/** Cancel is the way out, so it must not look like the affirmative action beside it. */
const WAYOUT = "border-rc-danger/50 bg-rc-danger/15 text-rc-danger-ink enabled:hover:border-rc-danger";
/** The layer switch while the board shows the subsurface: earth, matching the board's underground rim. */
const BELOW = "border-[rgba(139,90,43,0.85)] bg-[rgba(139,90,43,0.22)] text-[#e3c9a6] enabled:hover:border-[#c08a52]";
const PRESSED = "aria-pressed:border-rc-info/60 aria-pressed:bg-rc-info/18 aria-pressed:text-rc-info-ink";

/**
 * Where the piloted hand (Courtesan Thaïs) opens: EngineGame2D places this element over the
 * board and the hand, so the panel never covers the actions, the prompt beside the board or
 * the control banner.
 */
export const PILOT_HAND_ID = "engine-pilot-hand";

const PRIMARY_ICON = {
  confirm: "game-icons:check-mark",
  endTurn: "game-icons:sands-of-time",
  restart: "game-icons:cycle",
} as const;

/**
 * The 2D view's action bar: Confirm / End turn, Cancel, Undo, the layer switch and More.
 *
 * The handlers are the 3D rail's own — `interaction.confirm/cancel`, the session's
 * `requestEndTurn` (which asks first when the avatar is still untapped), `undo` and
 * `setLayer` — and the availability rules are the rail's too, including following the
 * decision seat while we pilot the opponent's turn (Courtesan Thaïs). Everything that does not
 * fit lives in MoreSheet2D.
 *
 * `orientation="column"` lays the slots out two abreast for the landscape layout's narrow
 * side column, so six thumb-sized slots take three rows rather than the column's full height;
 * `columns={3}` puts three abreast (a phone's short landscape inspector: two rows).
 */
export default function ActionBar2D({
  interaction,
  onExit,
  onRestart,
  orientation = "row",
  columns = 2,
}: {
  interaction: EngineInteraction;
  onExit: () => void;
  /** Absent in a player-vs-player match: the finished game's button leaves instead. */
  onRestart?: () => void;
  orientation?: "row" | "column";
  columns?: 2 | 3;
}) {
  const game = useEngineSession((s) => s.game);
  const viewer = useEngineSession((s) => s.seat);
  useEngineSession((s) => s.rev);
  const canUndo = useEngineSession((s) => s.canUndo);
  const requestEndTurn = useEngineSession((s) => s.requestEndTurn);
  const undo = useEngineSession((s) => s.undo);
  const layer = useEngineSession((s) => s.layer);
  const setLayer = useEngineSession((s) => s.setLayer);
  const hidden = useEngineSession((s) => s.hidden);
  const [sheet, setSheet] = useState<MoreView | null>(null);
  // the piloted hand (Courtesan Thaïs): every card of theirs, the playable ones pickable
  const [pilotOpen, setPilotOpen] = useState(false);
  // The sheet is portalled to <body>, above the page's own fixed root, so it would cover a
  // prompt or the result dialog that arrives while it is open (say, the log open on the CPU's
  // turn when it attacks). Close it on the change INTO "something needs you", so the player
  // can still open More again afterwards.
  const needsYou = !!game && (game.phase === "over" || (humanDecisionSeat(game, viewer) !== null && game.prompts.length > 0));
  const neededYou = useRef(needsYou);
  useEffect(() => {
    if (needsYou && !neededYou.current) {
      setSheet(null);
      setPilotOpen(false);
    }
    neededYou.current = needsYou;
  }, [needsYou]);
  const pilotCards = interaction.pilotFullHand;
  // the turn we were piloting ended: its hand goes with it
  useEffect(() => {
    if (!pilotCards.length) setPilotOpen(false);
  }, [pilotCards.length]);
  useEffect(() => {
    if (!pilotOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPilotOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pilotOpen]);

  if (!game) return null;
  const deciding = humanDecisionSeat(game, viewer);
  const piloting = deciding !== null && deciding !== viewer;
  const myMain = deciding !== null && game.phase === "main" && game.prompts.length === 0;
  const over = game.phase === "over";
  const suggested = primaryAction({
    over,
    myMain,
    confirmable: !!interaction.confirmable,
    picking: interaction.picking,
    active: interaction.active,
  });
  // against a person there is no local game to start again: the finished game's button leaves
  const primary = suggested.kind === "restart" && !onRestart ? { ...suggested, label: "Leave" } : suggested;
  const toggle = layerToggle(layer, hidden);
  const below = layer === "subsurface";
  // what the More sheet holds that the player can act on right now
  const castable = myMain ? interaction.cemetery.length : 0;
  const onPrimary = () => {
    if (primary.kind === "confirm") interaction.confirm();
    else if (primary.kind === "restart") (onRestart ?? onExit)();
    else requestEndTurn();
  };

  const column = orientation === "column";
  return (
    <>
      <div
        role="toolbar"
        aria-label={piloting ? "Actions — their turn, you decide" : "Actions"}
        aria-orientation={column ? "vertical" : "horizontal"}
        className={`pointer-events-auto gap-1 ${column ? `grid ${columns === 3 ? "grid-cols-3" : "grid-cols-2"}` : "flex flex-row"}`}
        onContextMenu={(e) => e.preventDefault()}
      >
        <button
          type="button"
          disabled={!primary.enabled}
          onClick={onPrimary}
          title={primary.kind === "endTurn" ? "End turn (Enter)" : primary.kind === "confirm" ? "Confirm (Enter)" : undefined}
          className={`${SLOT} ${primary.commit ? COMMIT : OUTLINE}`}
        >
          <Icon icon={PRIMARY_ICON[primary.kind]} className="h-[18px] w-[18px]" aria-hidden />
          {primary.label}
        </button>

        <button
          type="button"
          disabled={!interaction.picking}
          onClick={interaction.cancel}
          title="Cancel this action (Esc)"
          className={`${SLOT} ${interaction.picking ? WAYOUT : QUIET}`}
        >
          <Icon icon="game-icons:cancel" className="h-[18px] w-[18px]" aria-hidden />
          Cancel
        </button>

        <button type="button" disabled={!canUndo} onClick={undo} title="Undo" className={`${SLOT} ${QUIET}`}>
          <Icon icon="game-icons:anticlockwise-rotation" className="h-[18px] w-[18px]" aria-hidden />
          Undo
        </button>

        {/* The layer switch names the layer ON SHOW, not the one a tap goes to, and carries a
            two-segment track (surface | below) with the current half lit — so "Below" on the
            button always means "you are looking below". Underground it is tinted earth. */}
        <button
          type="button"
          aria-pressed={below}
          aria-label={`Viewing ${below ? "below the surface" : "the surface"}. ${toggle.title}`}
          title={toggle.title}
          onClick={() => setLayer(below ? "surface" : "subsurface")}
          className={`${SLOT} ${below ? BELOW : QUIET}`}
        >
          <Icon icon={below ? "game-icons:underground-cave" : "game-icons:mountain-road"} className="h-[18px] w-[18px]" aria-hidden />
          {below ? "Below" : "Surface"}
          <span aria-hidden className="mt-0.5 flex w-7 gap-px overflow-hidden rounded-full ring-1 ring-current">
            <span className={`h-1 flex-1 ${below ? "bg-transparent" : "bg-current"}`} />
            <span className={`h-1 flex-1 ${below ? "bg-current" : "bg-transparent"}`} />
          </span>
          {toggle.count > 0 && <Count n={toggle.count} />}
        </button>

        {/* While we play the opponent's turn their hand IS the turn, so it gets its own slot
            rather than waiting a tap deep in More. */}
        {pilotCards.length > 0 && (
          <button
            type="button"
            aria-pressed={pilotOpen}
            onClick={() => setPilotOpen((open) => !open)}
            title={`Their hand (${pilotCards.length}, ${interaction.pilotHand.length} playable) — you are playing their turn`}
            className={`${SLOT} ${QUIET} ${PRESSED}`}
          >
            <Icon icon="game-icons:puppet" className="h-[18px] w-[18px]" aria-hidden />
            Their hand
            {interaction.pilotHand.length > 0 && <Count n={interaction.pilotHand.length} />}
          </button>
        )}

        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={sheet !== null}
          aria-label={castable ? `More — ${castable} castable from the cemetery` : "More"}
          onClick={() => setSheet("menu")}
          className={`${SLOT} ${QUIET}`}
        >
          <Icon icon="game-icons:hamburger-menu" className="h-[18px] w-[18px]" aria-hidden />
          More
          {castable > 0 && <Count n={castable} />}
        </button>
      </div>

      {pilotOpen &&
        pilotCards.length > 0 &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="pointer-events-none flex h-full w-full items-end justify-center">
            <CpuCardPick
              fill
              title={`Their hand — ${interaction.pilotHand.length} of ${pilotCards.length} playable`}
              items={pilotPickItems(pilotCards)}
              onPick={(token) => {
                interaction.begin(token);
                setPilotOpen(false);
              }}
              onClose={() => setPilotOpen(false)}
            />
          </div>,
          document.getElementById(PILOT_HAND_ID) ?? document.body,
        )}

      {sheet && (
        <MoreSheet2D
          key={sheet}
          interaction={interaction}
          onExit={onExit}
          onClose={() => setSheet(null)}
          initialView={sheet}
        />
      )}
    </>
  );
}

/** A small count in the slot's corner: the number is the signal, not its colour. */
function Count({ n }: { n: number }) {
  return (
    <span className="absolute right-0.5 top-0.5 min-w-[16px] rounded-rc-sm bg-[rgba(7,10,20,0.95)] px-0.5 text-center font-rc-mono text-[10px] leading-4 tabular-nums text-rc-fg ring-1 ring-rc-line/30">
      {n > 99 ? "99+" : n}
    </span>
  );
}
