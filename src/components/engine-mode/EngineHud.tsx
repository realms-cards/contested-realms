"use client";

import { Icon } from "@iconify/react";
import { useEffect, useRef, useState } from "react";
import { RcButton } from "@/components/ui/rc-button";
import { soundManager } from "@/lib/audio/soundManager";
import { controlSwap, humanDecisionSeat, useEngineSession } from "@/lib/engine-mode/session";
import { PLAYER_COLORS } from "@/lib/game/constants";
import type { EngineInteraction } from "./useEngineInteraction";

const BAR =
  "pointer-events-auto flex items-center gap-2 rounded-full border border-rc-line/22 bg-[rgba(7,10,20,0.9)] px-3 py-1.5 font-rc-sans text-sm text-rc-fg shadow-rc-panel";

const PHASE_LABEL: Record<string, string> = {
  mulligan: "Opening hands",
  start: "Start phase",
  main: "Main phase",
  end: "End phase",
  over: "Game over",
};

/**
 * Turn status and the result. Every action lives in EngineActionRail.
 *
 * The defaults are the 3D table's floating layout. The 2D phone layout, where nothing may
 * float over the board, opts out of the pieces that would: it draws the turn status in its
 * own seat bars (`hideStatusPill`) and moves the error toast off the hand strip and action
 * bar to the top edge (`toastPlacement="top"`).
 */
export default function EngineHud({
  interaction,
  onRestart,
  onExit,
  hideStatusPill = false,
  toastPlacement = "corner",
}: {
  interaction: EngineInteraction;
  /** Start a new local game. Absent in a player-vs-player match, which has nothing to restart. */
  onRestart?: () => void;
  onExit: () => void;
  hideStatusPill?: boolean;
  toastPlacement?: "corner" | "top";
}) {
  const game = useEngineSession((s) => s.game);
  const viewer = useEngineSession((s) => s.seat);
  useEngineSession((s) => s.rev);
  const botThinking = useEngineSession((s) => s.botThinking);
  const lastError = useEngineSession((s) => s.lastError);
  const layer = useEngineSession((s) => s.layer);
  const portalsRevealed = useEngineSession((s) => s.portalsRevealed);
  // the key handler is installed once; reach the live confirm through a ref
  const confirmRef = useRef<(() => void) | null>(null);
  confirmRef.current = interaction.confirmable ? interaction.confirm : null;

  const [errorShown, setErrorShown] = useState<string | null>(null);

  useEffect(() => {
    if (!lastError) return;
    setErrorShown(lastError);
    const timer = setTimeout(() => setErrorShown(null), 4000);
    return () => clearTimeout(timer);
  }, [lastError]);

  // Board keys: V toggles the subsurface view (S is taken by WASD camera panning),
  // Enter ends the turn / confirms the picked action, like the rest of the game.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(t.tagName))) return;
      const s = useEngineSession.getState();
      if (e.key === "v" || e.key === "V") {
        s.setLayer(s.layer === "surface" ? "subsurface" : "surface");
        return;
      }
      if (e.key !== "Enter") return;
      const g = s.game;
      // only on a main phase whose decisions are ours (our own, or the one we pilot under
      // Courtesan Thaïs — never ours while the opponent is playing it) with nothing pending.
      // The handler is installed once, so the seat comes off the live state, not a closure.
      if (!g || g.phase !== "main" || humanDecisionSeat(g, s.seat) === null || g.prompts.length) return;
      e.preventDefault();
      if (confirmRef.current) return confirmRef.current();
      s.requestEndTurn();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The same fanfare the other modes play when a match ends.
  const over = game?.phase === "over";
  const won = over && game?.winner === viewer;
  const played = useRef(false);
  useEffect(() => {
    if (!over) {
      played.current = false;
      return;
    }
    if (played.current) return;
    played.current = true;
    soundManager.play(won ? "victory" : "defeat");
  }, [over, won]);

  if (!game) return null;
  const myTurn = game.activePlayer === viewer;
  const myMain = humanDecisionSeat(game, viewer) !== null && game.phase === "main" && game.prompts.length === 0;
  // Courtesan Thaïs: who is really playing this turn, said for the whole of it
  const swap = controlSwap(game, viewer);
  const swapDecider = swap && (swap.kind === "computer-plays-yours" || swap.kind === "computer-will-play-yours") ? "p2" : "p1";

  return (
    <>
      {!hideStatusPill && (
        <div className="pointer-events-none fixed inset-x-0 top-3 z-[150] flex justify-center px-4">
          <div className={BAR} role="status">
            <span className="font-rc-mono tabular-nums text-rc-fg-subtle">Turn {Math.max(1, game.turn)}</span>
            {/* the mulligan is simultaneous — no one's "turn" yet */}
            {game.phase !== "mulligan" && (
              <span className={myTurn ? "text-rc-accent-link" : "text-rc-fg-muted"}>
                {myTurn ? "Your turn" : "Computer's turn"}
              </span>
            )}
            <span className="text-rc-fg-subtle">
              {game.phase === "mulligan" && !portalsRevealed ? "Harbinger setup" : (PHASE_LABEL[game.phase] ?? game.phase)}
            </span>
            {layer === "subsurface" && <span className="text-rc-info-ink">Subsurface view</span>}
            {botThinking && <span className="text-rc-info-ink">thinking…</span>}
            {myMain && !interaction.picking && (
              <span className="hidden text-rc-fg-muted md:inline">Click a highlighted card or unit to act.</span>
            )}
          </div>
        </div>
      )}

      {/* Courtesan Thaïs on the 3D table: a second line under the status pill for as long as
          the swap lasts (the 2D layout mounts ControlBanner2D in its own place instead). */}
      {!hideStatusPill && swap && (
        <div className="pointer-events-none fixed inset-x-0 top-14 z-[150] flex justify-center px-4">
          <div
            role="status"
            aria-live="polite"
            data-control-swap={swap.kind}
            className={`flex max-w-[min(92vw,560px)] items-center gap-2 rounded-full border px-3 py-1 font-rc-sans shadow-rc-panel ${
              swap.now ? "border-rc-line/30 bg-[rgba(12,16,30,0.94)] text-sm text-rc-fg" : "border-rc-line/18 bg-[rgba(9,13,25,0.85)] text-xs text-rc-fg-muted"
            }`}
            style={{ borderColor: swap.now ? `${PLAYER_COLORS[swapDecider]}99` : undefined }}
          >
            <Icon icon="game-icons:puppet" aria-hidden className="h-4 w-4 flex-none" style={{ color: PLAYER_COLORS[swapDecider] }} />
            <span className="min-w-0 truncate">{swap.text}</span>
          </div>
        </div>
      )}

      {/* Error toast: bottom-right on the 3D table, top edge in the docked 2D layout
          (toastPlacement="top"). The actions live in EngineActionRail / ActionBar2D. */}
      {errorShown && (
        <div
          className={
            toastPlacement === "top"
              ? "pointer-events-none fixed inset-x-0 top-[max(0.5rem,env(safe-area-inset-top))] z-[150] flex justify-center px-4"
              : "pointer-events-none fixed bottom-4 right-16 z-[150] flex justify-end"
          }
        >
          <div className="rc-toast max-w-xs text-sm" data-tone="danger" role="alert">
            {errorShown}
          </div>
        </div>
      )}

      {over && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-[rgba(6,10,20,0.7)] p-4">
          <div className="w-full max-w-sm rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-6 text-center font-rc-sans text-rc-fg shadow-rc-panel">
            <h2 className="font-rc-display text-[26px] leading-tight text-rc-fg-strong">
              {game.draw ? "A draw" : won ? "Victory" : "Defeat"}
            </h2>
            <p className="mt-2 text-sm text-rc-fg-muted">
              {game.draw ? "Both avatars fell to the same blow." : won ? "The computer's avatar has fallen." : "Your avatar has fallen."}
            </p>
            <div className="mt-5 flex justify-center gap-2">
              <RcButton variant="outline" onClick={onExit}>
                Leave
              </RcButton>
              {onRestart && <RcButton onClick={onRestart}>Play again</RcButton>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
