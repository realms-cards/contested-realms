"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import CardPreview from "@/components/game/CardPreview";
import CpuPlayReveal from "@/components/game/CpuPlayReveal";
import { EndTurnConfirmDialog } from "@/components/game/EndTurnConfirmDialog";
import MusicGameSync from "@/components/game/MusicGameSync";
import OnlineConsole from "@/components/game/OnlineConsole";
import OnlineLifeCounters from "@/components/game/OnlineLifeCounters";
import RestoreUiButton from "@/components/game/RestoreUiButton";
import TurnStartOverlay from "@/components/game/TurnStartOverlay";
import AppShell from "@/components/ui/AppShell";
import { PageHeader } from "@/components/ui/page-header";
import { RcButton } from "@/components/ui/rc-button";
import { GameSoundEffects } from "@/lib/audio/gameSfx";
import { enginePrecons, loadEngineDeck } from "@/lib/engine-mode/decks";
import { loadEngineGame } from "@/lib/engine-mode/persistence";
import type { SavedEngineGame } from "@/lib/engine-mode/persistence";
import { useEngineSession } from "@/lib/engine-mode/session";
import type { BotLevel } from "@/lib/engine-mode/session";
import { createCardPreviewData } from "@/lib/game/card-preview.types";
import { useGameStore } from "@/lib/game/store";
import { getStoredCardPreviewsEnabled } from "@/lib/game/store/uiState";
import EngineActionRail from "./EngineActionRail";
import EngineContextMenu from "./EngineContextMenu";
import EngineDeckPicker, { choiceToSource, RANDOM_PRECON, useDeckLists } from "./EngineDeckPicker";
import EngineHud from "./EngineHud";
import EngineNarration from "./EngineNarration";
import EnginePromptPanel from "./EnginePromptPanel";
import EngineResourcePanels from "./EngineResourcePanels";
import { useEngineInteraction } from "./useEngineInteraction";

/** Dynamic import keeps Three.js / R3F out of the server bundle. */
const EngineBoard3D = dynamic(() => import("./EngineBoard3D"), { ssr: false });

interface Setup {
  mine: string;
  mineLink: string;
  theirs: string;
  theirsLink: string;
  level: BotLevel;
  /** optional rule: the second player scries 1 before turn 1 */
  secondSeer: boolean;
}

const SETUP_KEY = "realms:engineSetup";
const DEFAULT_SETUP: Setup = {
  mine: `builtin:${enginePrecons[0].id}`,
  mineLink: "",
  theirs: RANDOM_PRECON,
  theirsLink: "",
  level: "quick",
  secondSeer: false,
};

/** The last setup is a per-viewer convenience; any storage failure just means defaults. */
function readSetup(): Setup {
  try {
    const raw = localStorage.getItem(SETUP_KEY);
    return raw ? { ...DEFAULT_SETUP, ...(JSON.parse(raw) as Partial<Setup>) } : DEFAULT_SETUP;
  } catch {
    return DEFAULT_SETUP;
  }
}

export default function EngineMatch() {
  const router = useRouter();
  const game = useEngineSession((s) => s.game);
  const start = useEngineSession((s) => s.start);
  const stop = useEngineSession((s) => s.stop);
  const resume = useEngineSession((s) => s.resume);
  const discardSaved = useEngineSession((s) => s.discardSaved);
  const lists = useDeckLists();
  const [setup, setSetup] = useState<Setup>(DEFAULT_SETUP);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** undefined while we look, null when there is nothing to resume */
  const [saved, setSaved] = useState<SavedEngineGame | null | undefined>(undefined);

  useEffect(() => setSetup(readSetup()), []);
  // offer the match the player was in before the reload (storage is synchronous)
  useEffect(() => setSaved(loadEngineGame()), []);

  // Loading decks is async; if the player leaves while it is in flight, start() must not
  // run afterwards — it would lock the board and install the projection for a dead page.
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      stop();
    };
  }, [stop]);

  const update = (patch: Partial<Setup>) =>
    setSetup((s) => {
      const next = { ...s, ...patch };
      try {
        localStorage.setItem(SETUP_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

  const begin = async (s: Setup) => {
    const mine = choiceToSource(s.mine, s.mineLink, lists);
    const theirs = choiceToSource(s.theirs, s.theirsLink, lists);
    if (!mine || !theirs) {
      setError("Paste a deck link first.");
      return;
    }
    setStarting(true);
    setError(null);
    try {
      const [a, b] = await Promise.all([loadEngineDeck(mine), loadEngineDeck(theirs)]);
      if (!aliveRef.current) return;
      if (!a.ok) return setError(`Your deck: ${a.error}`);
      if (!b.ok) return setError(`Opponent's deck: ${b.error}`);
      await start(a.deck, b.deck, s.level, { secondSeer: s.secondSeer });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the game.");
    } finally {
      setStarting(false);
    }
  };

  if (game)
    return (
      <EngineGame
        onRestart={() => {
          // back to the setup screen first, so a deck-loading failure is actually visible
          stop();
          void begin(setup);
        }}
        onExit={() => {
          // leaving keeps the match: the resume prompt offers it back next time
          stop();
          router.push("/");
        }}
      />
    );

  if (saved === undefined) {
    return (
      <AppShell width="narrow">
        <PageHeader eyebrow="experimental" title="Rules Engine vs CPU" />
        <section className="rc-panel px-[18px] py-3.5">
          <div className="rc-hint animate-pulse">Looking for a game in progress…</div>
        </section>
      </AppShell>
    );
  }

  if (saved) {
    const { summary } = saved;
    return (
      <AppShell width="narrow">
        <PageHeader eyebrow="experimental" title="Rules Engine vs CPU" />
        <section className="rc-panel space-y-4 px-[18px] py-3.5">
          <div>
            <div className="font-rc-display text-[26px] leading-none text-rc-fg-strong">
              {summary.over ? "Your last game is finished" : "You have a game in progress"}
            </div>
            <div className="rc-hint mt-2">
              {summary.you} vs {summary.opponent} — turn {summary.turn}
              {summary.over ? ", already decided" : ""}.
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <RcButton
              onClick={() => {
                resume(saved);
                setSaved(null);
              }}
            >
              {summary.over ? "See the result" : "Resume game"}
            </RcButton>
            <RcButton
              variant="outline"
              onClick={() => {
                discardSaved();
                setSaved(null);
              }}
            >
              New game
            </RcButton>
          </div>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell width="narrow">
      <PageHeader
        eyebrow="experimental"
        title="Rules Engine vs CPU"
        description="Every card is resolved by a full rules engine, and the computer plans its turns with a look-ahead search. Only legal plays are offered: click a highlighted card or unit, then where it should go."
      />
      <section className="rc-panel space-y-5 px-[18px] py-3.5">
        <div className="rc-alert" data-tone="info">
          Powered by the open-source Untested Realm engine by Roberto Fratello. All 1,108 cards are scripted, so any
          deck works.
        </div>
        <EngineDeckPicker
          label="Your deck"
          lists={lists}
          value={setup.mine}
          link={setup.mineLink}
          allowRandom={false}
          onChange={(mine) => update({ mine })}
          onLinkChange={(mineLink) => update({ mineLink })}
        />
        <EngineDeckPicker
          label="Opponent's deck"
          lists={lists}
          value={setup.theirs}
          link={setup.theirsLink}
          allowRandom
          onChange={(theirs) => update({ theirs })}
          onLinkChange={(theirsLink) => update({ theirsLink })}
        />
        <div>
          <div className="rc-field-label mb-2">Computer</div>
          <div className="flex gap-2">
            {(["quick", "thinking"] as const).map((level) => (
              <RcButton
                key={level}
                variant="quiet"
                size="sm"
                tone="info"
                aria-pressed={setup.level === level}
                onClick={() => update({ level })}
              >
                {level === "quick" ? "Quick" : "Thinks longer"}
              </RcButton>
            ))}
          </div>
        </div>
        <label className="rc-check flex text-[13px]">
          <input type="checkbox" checked={setup.secondSeer} onChange={(e) => update({ secondSeer: e.target.checked })} />
          Enable Second Seer (2nd player scries 1)
        </label>
        {error && (
          <div className="rc-alert" data-tone="danger" role="alert">
            {error}
          </div>
        )}
        <RcButton size="lg" disabled={starting} onClick={() => begin(setup)}>
          {starting ? "Shuffling…" : "Start game"}
        </RcButton>
      </section>
    </AppShell>
  );
}

function EngineGame({ onRestart, onExit }: { onRestart: () => void; onExit: () => void }) {
  const interaction = useEngineInteraction();
  const previewCard = useGameStore((s) => s.previewCard);
  const cardPreviewsEnabled = useGameStore((s) => s.cardPreviewsEnabled);
  const toggleCardPreviews = useGameStore((s) => s.toggleCardPreviews);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const endTurnConfirm = useEngineSession((s) => s.endTurnConfirm);
  const dismissEndTurn = useEngineSession((s) => s.dismissEndTurn);
  const dispatch = useEngineSession((s) => s.dispatch);
  const dragFromHand = useGameStore((s) => s.dragFromHand);
  // Mulligan over = the board is really in play; this is what turn 1's announcement waits for,
  // exactly as /play waits on mulliganComplete && seerComplete.
  const pastSetup = useGameStore((s) => s.phase !== "Setup");
  // The same hide-everything mode the other modes have: the board alone, for reading it or
  // taking a picture of it. Prompts stay — they are the game asking you a question, not
  // furniture — and RestoreUiButton is always there to bring the rest back.
  const uiHidden = useGameStore((s) => s.uiHidden);

  // The card-preview setting is remembered across sessions in the other modes; honour the
  // same stored value here instead of always opening at the store default.
  useEffect(() => {
    const stored = getStoredCardPreviewsEnabled();
    if (stored !== useGameStore.getState().cardPreviewsEnabled) {
      useGameStore.getState().setCardPreviewsEnabled(stored);
    }
  }, []);

  // Space hides/shows your hand, the same key as the other modes — Hand3D already honours
  // `handVisibilityMode`, only the binding was missing here.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.key !== " " && e.key !== "Spacebar") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(t.tagName))) return;
      e.preventDefault();
      const store = useGameStore.getState();
      store.setHandVisibilityMode(store.handVisibilityMode === "visible" ? "hidden" : "visible");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // U hides/shows the whole interface, the same key as the other modes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "u" && e.key !== "U") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      e.preventDefault();
      useGameStore.getState().toggleUiHidden();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // P hides/shows the card preview, the same key as the other modes.
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
  return (
    <div
      className="fixed inset-0 overflow-hidden bg-[#0b0b0c]"
      // Right-click is a game gesture here (it opens EngineContextMenu), so the browser's own
      // menu must never appear over the board. Individual 3D objects preventDefault when they
      // open the menu, but empty board space and every DOM overlay did not.
      onContextMenu={(e) => e.preventDefault()}
    >
      <EngineBoard3D controlsRef={controlsRef} cameraLocked={interaction.picking || dragFromHand} />
      <GameSoundEffects store={useGameStore} />
      {/* Everything from here to the console is chrome, and hides together with U. */}
      {!uiHidden && <>
      {/* the engine owns life totals — the familiar counters, read-only */}
      <OnlineLifeCounters
        dragFromHand={false}
        myPlayerKey="p1"
        playerNames={{ p1: "You", p2: "Computer" }}
        readOnly
        spectating={false}
        showYouLabels
      />
      {/* The mana/threshold readout keeps its own centred spot, untouched by the rail. */}
      <div className="pointer-events-none fixed right-3 top-1/2 z-[150] -translate-y-1/2">
        <EngineResourcePanels />
      </div>

      {/* The actions sit right in the bottom-right corner as one tight cluster, so they take
          the least possible room and never reach toward the middle of the board. */}
      <div className="pointer-events-none fixed bottom-1 right-1 z-[150]">
        <EngineActionRail interaction={interaction} onExit={onExit} />
      </div>
      {cardPreviewsEnabled && previewCard && (
        <CardPreview
          card={createCardPreviewData({ slug: previewCard.slug, name: previewCard.name, type: previewCard.type })}
          anchor="top-right"
        />
      )}
      </>}
      {/* Not gated: a prompt is the game waiting on you, and hiding it would strand the match. */}
      <div className="pointer-events-none fixed inset-x-0 top-16 z-[200] flex justify-center px-4">
        <EnginePromptPanel />
      </div>
      {!uiHidden && <>
      {/* the computer's turn, narrated: a line per action and the card it played */}
      <EngineNarration />
      {/* The same console the online and replay views use, in the same bottom-left spot, fed
          from the engine's own log (projection: `events`). Chat and Leave are hidden: there is
          nobody to chat to, and Leave lives in the action rail. */}
      <div className="pointer-events-none fixed inset-0 z-[140]">
        <OnlineConsole
          dragFromHand={false}
          chatLog={[]}
          chatInput=""
          setChatInput={() => undefined}
          onSendChat={() => undefined}
          onLeaveMatch={onExit}
          connected
          hideChat
          hideLeaveButton
          playerNames={{ p1: "You", p2: "Computer" }}
        />
      </div>
      </>}

      {/* Brought back with a click when the interface is hidden. End-turn is not offered on it:
          that button drives the STORE's requestEndTurn, which engine mode does not read — the
          engine owns the turn — so it would be a button that does nothing. */}
      <RestoreUiButton myPlayerKey="p1" canEndTurn={false} />

      {/* "Turn N" + the draw reminder, the same announcement the other modes open a turn with.
          `seat` is needed because engine mode leaves actorKey null, which elsewhere means
          hotseat — otherwise the computer's turns would be announced too. */}
      <TurnStartOverlay gameStarted={pastSetup} seat="p1" />

      {/* The same warning /play shows, same component and wording. */}
      <EndTurnConfirmDialog
        open={endTurnConfirm}
        onCancel={dismissEndTurn}
        onConfirm={() => {
          dismissEndTurn();
          dispatch({ t: "endTurn" });
        }}
      />

      {/* centre, with the thinking pill and the narration line — one place for the computer */}
      {!uiHidden && <CpuPlayReveal placement="center" />}
      {/* Mood-matched music, same as /play and /online/play. The rail owns play/pause. */}
      <MusicGameSync myPlayerKey="p1" />
      <EngineContextMenu />
      {!uiHidden && <EngineHud interaction={interaction} onRestart={onRestart} onExit={onExit} />}
    </div>
  );
}
