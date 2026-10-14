"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import type { ReactNode } from "react";
import { suppressGlobalUserBadge } from "@/components/auth/userBadgePresence";
import { EndTurnConfirmDialog } from "@/components/game/EndTurnConfirmDialog";
import MusicGameSync from "@/components/game/MusicGameSync";
import { GameSoundEffects } from "@/lib/audio/gameSfx";
import { holdBotLineToasts, useEngineSession, watchArrangeModifier } from "@/lib/engine-mode/session";
import { useGameStore } from "@/lib/game/store";
import { getStoredCardPreviewsEnabled } from "@/lib/game/store/uiState";
import EngineContextMenu from "../EngineContextMenu";
import EngineHud from "../EngineHud";
import EnginePromptPanel, { preGameSurface } from "../EnginePromptPanel";
import { PromptPlacementContext } from "../EnginePromptShell";
import { useEngineInteraction } from "../useEngineInteraction";
import ActionBar2D, { PILOT_HAND_ID } from "./ActionBar2D";
import Board2D from "./Board2D";
import ControlBanner2D, { ArrangeBanner2D } from "./ControlBanner2D";
import EventFx2D from "./EventFx2D";
import { PROMPT_DOCK_ID } from "./FieldTargets2D";
import Hand2D from "./Hand2D";
import PickGuide2D from "./PickGuide2D";
import SeatBar2D from "./SeatBar2D";
import Sidebar2D from "./Sidebar2D";
import StatusLine2D from "./StatusLine2D";
import { useBoard2DSizing } from "./useBoard2DSizing";
import type { Box2D } from "./useBoard2DSizing";

/**
 * The prompt dock: the docked banner in the page flow, then the element FieldTargets2D portals
 * its option rows into. The rows get their own sibling element rather than sharing the
 * banner's, so React never has to reconcile around nodes it did not render.
 */
function PromptDock({ compact, flat }: { compact: boolean; flat: boolean }) {
  return (
    <PromptPlacementContext.Provider value="docked">
      {/* `compact` (a phone, either way up): the banner's type steps down a size so the whole
          prompt — title, hint and buttons — fits the short dock. `flat` (the inspector): the
          banner is a section of the panel, the option rows inset to match. The pick guide
          heads the dock while a half-made action on the board waits for its next choice. */}
      <div className="flex shrink-0 flex-col gap-1.5" data-dock-fill={compact ? "" : undefined}>
        <PickGuide2D />
        <EnginePromptPanel />
        <div id={PROMPT_DOCK_ID} className={`flex flex-col gap-1 empty:hidden ${flat ? "px-3 pb-2.5" : ""}`} />
      </div>
    </PromptPlacementContext.Provider>
  );
}

/** Harbinger's dice want the whole screen; the dock is far too small for two dice trays. */
function PortalSetupOverlay() {
  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto overscroll-contain bg-[rgba(6,10,20,0.82)] px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))]">
      <EnginePromptPanel />
    </div>
  );
}

/** A piece of the page at the exact pixel box the sizing gave it, clipped so it can never spill into a neighbour. */
function Slot({ box, className = "", children }: { box: Box2D; className?: string; children: ReactNode }) {
  return (
    <div className={`absolute min-h-0 min-w-0 ${className}`} style={{ left: box.x, top: box.y, width: box.w, height: box.h }}>
      {children}
    </div>
  );
}

/**
 * Engine mode as a flat DOM board (Board2D) with a docked hand, laid out so nothing floats over
 * the board. Portrait is one column — opponent bar, board, the dock row (the card preview on the
 * left; the status line, prompt dock and feed on the right), your bar, hand, actions. Landscape and wide are three: a slim rail of seat columns on the left (the
 * opponent's at the top, yours at the bottom), the board with the hand under it in the middle,
 * and the inspector on the right (Sidebar2D: the card preview, the prompt dock, the action
 * feed, the status line and the actions in one panel). The pixel boxes come from
 * `computeBoard2DSizing`, measured inside the safe-area insets.
 *
 * It runs the same session and picker as the 3D table (EngineGame in EngineMatch), so the
 * board view can be switched mid-match: the state lives in the session store, not here. The
 * non-visual pieces the 3D table mounts are mounted here too: sounds, music, the context menu,
 * the end-turn warning, the HUD's keys, toasts and result dialog. The 3D table's centred
 * pop-ins (the turn banner, the computer's card reveal, the floating preview) are not: their
 * news lives in the preview box, the status line, the feed and the board's own effects.
 *
 * The page fills the screen edge to edge, so the floating account badge (GlobalUserBadge) would
 * sit on the opponent's bar or the prompt; it stands down while this page is mounted and the
 * account controls live in the More sheet instead.
 */
export default function EngineGame2D({ onRestart, onExit }: { onRestart: () => void; onExit: () => void }) {
  const interaction = useEngineInteraction();
  const frameRef = useRef<HTMLDivElement>(null);
  const sizing = useBoard2DSizing(frameRef);
  const toggleCardPreviews = useGameStore((s) => s.toggleCardPreviews);
  const endTurnConfirm = useEngineSession((s) => s.endTurnConfirm);
  const dismissEndTurn = useEngineSession((s) => s.dismissEndTurn);
  const dispatch = useEngineSession((s) => s.dispatch);
  const portalSetup = useEngineSession((s) => (s.game ? preGameSurface(s.game, s.portalsRevealed) === "portal" : false));

  // before paint, so the badge never flashes over the opponent's bar
  useLayoutEffect(() => suppressGlobalUserBadge(), []);

  // The computer's log lines are toasted for the 3D table. Here every one of them is already in
  // the status line and the feed, and the toast box would cover the hand, the seat bar or the
  // very tile it is about, so the session stops sending them while this view is mounted. (A
  // capture listener cannot swallow them: the host listens on window itself, where listeners
  // run in registration order and the host's came first.)
  useEffect(() => holdBotLineToasts(), []);

  // Alt (Option) + drag slides a card within its tile, as on the 3D table
  useEffect(() => watchArrangeModifier(), []);

  // the remembered card-preview setting, as the 3D table honours it
  useEffect(() => {
    const stored = getStoredCardPreviewsEnabled();
    if (stored !== useGameStore.getState().cardPreviewsEnabled) {
      useGameStore.getState().setCardPreviewsEnabled(stored);
    }
  }, []);

  // P hides/shows the card preview, the same key as the other modes. Space (hide the hand) and
  // U (hide the interface) are left out: the strip and the bars are the only way to play here.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "p" && e.key !== "P") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      e.preventDefault();
      toggleCardPreviews();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleCardPreviews]);

  // landscape and wide share the three-column arrangement
  const portrait = sizing?.layout === "portrait";

  return (
    <div
      className="fixed inset-0 overflow-hidden bg-[#0b0b0c] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)] text-rc-fg"
      // long-press and right-click are game gestures (EngineContextMenu); never the browser's menu
      onContextMenu={(e) => e.preventDefault()}
    >
      <div ref={frameRef} className="relative h-full w-full">
        {/*
          ONE child list in both orientations, each piece in its own keyed slot placed at the
          box the sizing computed: rotating the phone only moves and resizes the slots, so the
          prompt (marked mulligan cards, a half-made MultiPick), the More sheet and the board
          never remount and lose what the player was doing.
        */}
        {sizing && (
          <>
            <Slot key="opp" box={sizing.boxes.oppBar} className={`flex flex-col overflow-hidden ${portrait ? "justify-center" : "justify-start"}`}>
              <SeatBar2D seat="p2" density={sizing.seatBar} />
            </Slot>
            <Slot key="board" box={sizing.boxes.board}>
              <Board2D tileW={sizing.tileW} tileH={sizing.tileH} docked>
                <EventFx2D tileW={sizing.tileW} tileH={sizing.tileH} />
              </Board2D>
            </Slot>
            <Slot
              key="me"
              box={sizing.boxes.myBar}
              className={`flex flex-col overflow-hidden ${portrait ? "justify-center" : "justify-end"}`}
            >
              <SeatBar2D seat="p1" density={sizing.seatBar} />
            </Slot>
            <Slot key="hand" box={sizing.boxes.hand} className="flex overflow-hidden">
              <Hand2D cardHeight={sizing.handCardH} orientation="row" />
            </Slot>
            {/* the piloted hand's panel (ActionBar2D) opens here: over the board and the hand, from
                the bottom up, never over the actions or the inspector */}
            <div
              key="pilot"
              id={PILOT_HAND_ID}
              className="pointer-events-none absolute z-[60] flex items-end empty:hidden"
              style={{
                left: sizing.boxes.hand.x,
                top: sizing.boxes.board.y,
                width: portrait ? sizing.boxes.hand.w : sizing.boxes.board.w,
                height: sizing.boxes.hand.y + sizing.boxes.hand.h - sizing.boxes.board.y,
              }}
            />
            <Sidebar2D
              key="side"
              sizing={sizing}
              dock={!portalSetup && <PromptDock compact={sizing.layout !== "wide"} flat={!portrait} />}
              status={
                <>
                  {/* whose turn you are playing (Courtesan Thaïs) and arrange mode, over the
                      status line; all collapse while silent */}
                  <div data-control-banner="" className="flex flex-col gap-1 empty:hidden">
                    <ControlBanner2D />
                    {/* arrange mode is on: cards slide instead of acting, until "Done" */}
                    <ArrangeBanner2D />
                  </div>
                  <StatusLine2D large={sizing.layout === "wide"} />
                </>
              }
              actions={
                <ActionBar2D
                  interaction={interaction}
                  onExit={onExit}
                  onRestart={onRestart}
                  orientation={portrait ? "row" : "column"}
                  columns={sizing.layout === "landscape" ? 3 : 2}
                />
              }
            />
          </>
        )}
      </div>

      {portalSetup && <PortalSetupOverlay />}

      <GameSoundEffects store={useGameStore} />
      {/*
        No big centred pop-ins here: no floating card preview (the preview has its own box in
        every layout), no "Turn N" banner (StatusLine2D says it, with the gong) and no reveal
        of the computer's card (the preview shows its latest play, the feed says what it did,
        EventFx2D plays it out on the board). The computer still paces itself on the reveal
        queue, which drains on its own timer. Only the game-over result and real decisions
        (the end-turn warning, prompt sheets) take the middle of the screen.
      */}
      <EndTurnConfirmDialog
        open={endTurnConfirm}
        onCancel={dismissEndTurn}
        onConfirm={() => {
          dismissEndTurn();
          dispatch({ t: "endTurn" });
        }}
      />
      <MusicGameSync myPlayerKey="p1" />
      <EngineContextMenu />
      {/* the keys, the error toast and the result; the turn pill's job is done by the seat bars */}
      <EngineHud interaction={interaction} onRestart={onRestart} onExit={onExit} hideStatusPill toastPlacement="top" />
    </div>
  );
}
