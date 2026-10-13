"use client";

import { useEffect, useRef, useState } from "react";
import { RcButton } from "@/components/ui/rc-button";
import { soundManager } from "@/lib/audio/soundManager";
import { useEngineSession } from "@/lib/engine-mode/session";
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

/** Turn status and the result. Every action lives in EngineActionRail. */
export default function EngineHud({
  interaction,
  onRestart,
  onExit,
}: {
  interaction: EngineInteraction;
  onRestart: () => void;
  onExit: () => void;
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
      // only on our own main phase with nothing else pending (the handler is installed once,
      // so the seat comes off the live state rather than out of a closure)
      if (!g || g.phase !== "main" || g.activePlayer !== s.seat || g.prompts.length) return;
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
  const myMain = myTurn && game.phase === "main" && game.prompts.length === 0;

  return (
    <>
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

      {/* Errors stay bottom-right; the actions themselves now live in the vertical
          EngineActionRail under the mana readout. */}
      {errorShown && (
        <div className="pointer-events-none fixed bottom-4 right-16 z-[150] flex justify-end">
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
              <RcButton onClick={onRestart}>Play again</RcButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
