"use client";

import { Icon } from "@iconify/react";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import UserBadge from "@/components/auth/UserBadge";
import CpuCardPick from "@/components/game/CpuCardPick";
import { RcButton } from "@/components/ui/rc-button";
import { useMusicPlayer } from "@/hooks/useMusicPlayer";
import { DEFAULT_SOUND_VOLUME } from "@/lib/audio/soundManager";
import { useSound } from "@/lib/contexts/SoundContext";
import { cardRefFor } from "@/lib/engine-mode/cardIndex";
import { humanDecisionSeat, useEngineSession } from "@/lib/engine-mode/session";
import { useGameStore } from "@/lib/game/store";
import BoardViewToggle from "../BoardViewToggle";
import type { EngineInteraction } from "../useEngineInteraction";
import ActionFeed2D from "./ActionFeed2D";
import { rollLabel } from "./actions2d";

export type MoreView = "menu" | "cemetery" | "pilot" | "collection" | "tools" | "audio" | "log";

const ITEM = "h-10 w-full justify-start gap-2.5 px-3 text-[13px]";
const COUNT = "ml-auto font-rc-mono text-xs tabular-nums text-rc-fg-subtle";

/**
 * Everything the 2D view's action bar has no room for, as one bottom sheet: the board-view
 * choice first (Auto / 3D / 2D), then audio (sound and music on/off and their volumes, the
 * same settings the other modes' AudioControls change), then the card panels
 * the 3D rail opens (cemetery casts, the piloted hand, the collection — the same CpuCardPick
 * panels wired to the same `interaction.begin`), the table tools, the log, the account (the floating badge stands down on the 2D page, so sign-in and
 * the user settings live here) and the two ways out.
 *
 * It is a sheet over the bottom of the screen rather than a popover so every target is a full
 * thumb-width row, and it closes on Escape, on the backdrop, or once a card has been picked.
 */
export default function MoreSheet2D({
  interaction,
  onExit,
  onClose,
  initialView = "menu",
}: {
  interaction: EngineInteraction;
  onExit: () => void;
  onClose: () => void;
  initialView?: MoreView;
}) {
  const game = useEngineSession((s) => s.game);
  const viewer = useEngineSession((s) => s.seat);
  useEngineSession((s) => s.rev);
  const dispatch = useEngineSession((s) => s.dispatch);
  const collection = useGameStore((s) => s.zones.p1?.collection);
  const events = useGameStore((s) => s.events);
  const cardPreviews = useGameStore((s) => s.cardPreviewsEnabled);
  const toggleCardPreviews = useGameStore((s) => s.toggleCardPreviews);
  const arrangeMode = useEngineSession((s) => s.arrangeMode);
  const setArrangeMode = useEngineSession((s) => s.setArrangeMode);
  const arranged = useEngineSession((s) => Object.keys(s.arrangement).length);
  const resetArrangement = useEngineSession((s) => s.resetArrangement);

  const [view, setView] = useState<MoreView>(initialView);
  const [concedeArmed, setConcedeArmed] = useState(false);
  const [rolls, setRolls] = useState<string[]>([]);
  const [rngMax, setRngMax] = useState(20);
  // portals need a DOM; never run on the server render
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const heading = useRef<HTMLHeadingElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  // rows hidden below the fold: a fade and a hint say there is more to scroll to
  const [moreBelow, setMoreBelow] = useState(false);

  // the sheet takes focus so a keyboard or screen reader lands inside it
  useEffect(() => {
    if (mounted) heading.current?.focus();
  }, [mounted, view]);

  const hasGame = game !== null;
  const measure = () => {
    const el = scroller.current;
    if (el) setMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
  };
  // re-measured whenever the sheet or what is in it changes size (a view switch, a window resize)
  useEffect(() => {
    const el = scroller.current;
    if (!mounted || !el) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [mounted, view, hasGame]);

  // disarm the concede confirmation after a moment, as the rail does
  useEffect(() => {
    if (!concedeArmed) return;
    const timer = setTimeout(() => setConcedeArmed(false), 3000);
    return () => clearTimeout(timer);
  }, [concedeArmed]);

  // Escape steps back to the menu, then closes
  const viewRef = useRef(view);
  viewRef.current = view;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (viewRef.current !== "menu" && initialView === "menu") setView("menu");
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, initialView]);

  const roll = (label: string, max: number) => {
    const result = rollLabel(label, max);
    setRolls((r) => [result, ...r].slice(0, 5));
    try {
      window.dispatchEvent(new CustomEvent("app:toast", { detail: { message: `You rolled ${result}` } }));
    } catch {}
  };

  if (!mounted || !game) return null;
  // the same gates as EngineActionRail: actions follow the decision seat (Courtesan Thaïs)
  const deciding = humanDecisionSeat(game, viewer);
  const piloting = deciding !== null && deciding !== viewer;
  const myMain = deciding !== null && game.phase === "main" && game.prompts.length === 0;
  const over = game.phase === "over";
  const pool = collection ?? [];
  const castable = myMain ? interaction.cemetery : [];
  const pick = (token: string) => {
    interaction.begin(token);
    onClose();
  };

  const titles: Record<MoreView, string> = {
    menu: "More",
    cemetery: "Cemetery",
    pilot: "Their hand",
    collection: "Collection",
    tools: "Table tools",
    audio: "Audio",
    log: "Game log",
  };

  let body: ReactNode = null;
  if (view === "cemetery") {
    body = castable.length ? (
      <CpuCardPick
        title={`Castable from ${piloting ? "their" : "your"} cemetery`}
        items={castable.map((c) => ({ id: c.token, card: cardRefFor(c.name) }))}
        onPick={pick}
      />
    ) : (
      <Empty>Nothing in the cemetery can be cast right now.</Empty>
    );
  } else if (view === "pilot") {
    body = interaction.pilotHand.length ? (
      <CpuCardPick
        title="You are playing their turn"
        items={interaction.pilotHand.map((c) => ({ id: c.token, card: cardRefFor(c.name) }))}
        onPick={pick}
      />
    ) : (
      <Empty>You are not playing their turn.</Empty>
    );
  } else if (view === "collection") {
    body = pool.length ? (
      <CpuCardPick
        title={`${pool.length} cards — the pool "from your collection" effects fetch from`}
        items={pool.map((card, i) => ({ id: card.instanceId ?? String(i), card }))}
        onPick={() => undefined}
      />
    ) : (
      <Empty>The collection is empty.</Empty>
    );
  } else if (view === "audio") {
    body = <AudioSection />;
  } else if (view === "tools") {
    body = (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-1.5">
          <RcButton variant="outline" size="sm" className="h-10" onClick={() => roll("d20", 20)}>
            Roll d20
          </RcButton>
          <RcButton variant="outline" size="sm" className="h-10" onClick={() => roll("d6", 6)}>
            Roll d6
          </RcButton>
          <RcButton variant="outline" size="sm" className="h-10" onClick={() => roll("coin", 2)}>
            Flip a coin
          </RcButton>
        </div>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            inputMode="numeric"
            min={2}
            max={999}
            value={rngMax}
            onChange={(e) => setRngMax(Math.max(2, Number(e.target.value) || 2))}
            aria-label="Random number upper bound"
            className="h-10 w-20 rounded-rc-md border border-rc-line/22 bg-black/40 px-2 font-rc-mono text-sm tabular-nums text-rc-fg"
          />
          <RcButton variant="outline" size="sm" className="h-10" onClick={() => roll(`1–${rngMax}`, rngMax)}>
            Random
          </RcButton>
        </div>
        {rolls.length > 0 && (
          <ol className="flex flex-col gap-0.5 font-rc-mono text-xs tabular-nums text-rc-fg-muted">
            {rolls.map((r, i) => (
              <li key={`${r}-${i}`}>{r}</li>
            ))}
          </ol>
        )}
      </div>
    );
  } else if (view === "log") {
    // the same per-turn action feed the landscape / desktop inspector shows: on a portrait
    // phone this is where it lives (tapping an entry previews its card and flashes its tiles)
    body = <ActionFeed2D compact title={false} />;
  } else {
    body = (
      <div className="flex flex-col gap-3">
        {/* the board view first: switching to 3D (or back) is the most-wanted thing in here */}
        <BoardViewToggle />

        <AudioSection />

        {/* the account near the top, so the badge's menu drops down over the sheet rather
            than past its end; right-aligned, as the menu opens leftwards from the badge */}
        <Section label="Account">
          <div className="flex min-h-10 items-center justify-end">
            <UserBadge showPresence={false} />
          </div>
        </Section>

        {(castable.length > 0 || interaction.pilotHand.length > 0 || pool.length > 0) && (
          <Section label={piloting ? "Their cards" : "Your cards"}>
            {castable.length > 0 && (
              <RcButton variant="quiet" size="sm" className={ITEM} onClick={() => setView("cemetery")}>
                <Icon icon="game-icons:tombstone" className="h-4 w-4" aria-hidden />
                Cast from the cemetery
                <span className={COUNT}>{castable.length}</span>
              </RcButton>
            )}
            {interaction.pilotHand.length > 0 && (
              <RcButton variant="quiet" size="sm" className={ITEM} onClick={() => setView("pilot")}>
                <Icon icon="game-icons:hand" className="h-4 w-4" aria-hidden />
                Their hand
                <span className={COUNT}>{interaction.pilotHand.length}</span>
              </RcButton>
            )}
            {pool.length > 0 && (
              <RcButton variant="quiet" size="sm" className={ITEM} onClick={() => setView("collection")}>
                <Icon icon="game-icons:open-book" className="h-4 w-4" aria-hidden />
                Browse the collection
                <span className={COUNT}>{pool.length}</span>
              </RcButton>
            )}
          </Section>
        )}

        <Section label="Table">
          <RcButton variant="quiet" size="sm" className={ITEM} onClick={() => setView("log")}>
            <Icon icon="game-icons:scroll-unfurled" className="h-4 w-4" aria-hidden />
            Game log
            <span className={COUNT}>{events.length}</span>
          </RcButton>
          <RcButton variant="quiet" size="sm" className={ITEM} onClick={() => setView("tools")}>
            <Icon icon="game-icons:dice-twenty-faces-twenty" className="h-4 w-4" aria-hidden />
            Dice and random numbers
          </RcButton>
          <RcButton
            variant="quiet"
            size="sm"
            tone="info"
            className={ITEM}
            aria-pressed={cardPreviews}
            onClick={toggleCardPreviews}
          >
            <Icon icon="game-icons:magnifying-glass" className="h-4 w-4" aria-hidden />
            Card previews
            <span className={COUNT}>{cardPreviews ? "On" : "Off"}</span>
          </RcButton>
          {/* display only: slide cards within their tiles (Alt-drag does the same on a desktop) */}
          <RcButton
            variant="quiet"
            size="sm"
            tone="moonlight"
            className={ITEM}
            aria-pressed={arrangeMode}
            onClick={() => {
              setArrangeMode(!arrangeMode);
              // turning it on is for dragging cards: get the sheet out of the way
              if (!arrangeMode) onClose();
            }}
          >
            <Icon icon="game-icons:move" className="h-4 w-4" aria-hidden />
            Arrange cards
            <span className={COUNT}>{arrangeMode ? "On" : "Off"}</span>
          </RcButton>
          <RcButton
            variant="quiet"
            size="sm"
            className={ITEM}
            disabled={arranged === 0}
            onClick={() => resetArrangement()}
          >
            <Icon icon="game-icons:anticlockwise-rotation" className="h-4 w-4" aria-hidden />
            Reset layout
            {arranged > 0 && <span className={COUNT}>{arranged}</span>}
          </RcButton>
        </Section>

        <Section label="Leaving">
          <div className="grid grid-cols-2 gap-1.5">
            {!over && (
              <RcButton
                variant={concedeArmed ? "danger-soft" : "outline"}
                size="sm"
                className="h-10"
                onClick={() => {
                  if (!concedeArmed) return setConcedeArmed(true);
                  setConcedeArmed(false);
                  dispatch({ t: "concede" });
                  onClose();
                }}
              >
                <Icon icon="game-icons:broken-shield" className="h-4 w-4" aria-hidden />
                {concedeArmed ? "Really concede?" : "Concede"}
              </RcButton>
            )}
            <RcButton variant="outline" size="sm" className={`h-10 ${over ? "col-span-2" : ""}`} onClick={onExit}>
              <Icon icon="game-icons:exit-door" className="h-4 w-4" aria-hidden />
              Leave
            </RcButton>
          </div>
          {/* the same promise the resume prompt keeps */}
          <p className="text-[11px] text-rc-fg-subtle">Leaving keeps the match; you can resume it later.</p>
        </Section>
      </div>
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[185] flex flex-col justify-end sm:items-center sm:justify-center sm:p-4" onContextMenu={(e) => e.preventDefault()}>
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        className="absolute inset-0 cursor-default bg-[rgba(6,10,20,0.7)]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="engine-more-title"
        ref={scroller}
        onScroll={measure}
        className="thin-scrollbar relative mx-auto flex max-h-[75vh] max-h-[75dvh] w-full max-w-[560px] flex-col overflow-y-auto rounded-t-rc-lg border border-b-0 border-rc-line/18 bg-[rgba(9,13,25,0.97)] px-4 pt-3 font-rc-sans text-rc-fg shadow-rc-panel pb-[max(12px,env(safe-area-inset-bottom))] sm:max-h-[calc(100dvh-2rem)] sm:rounded-rc-lg sm:border-b"
      >
        <div className="mb-3 flex items-center gap-2">
          {view !== "menu" && initialView === "menu" && (
            <RcButton variant="quiet" size="icon-xs" aria-label="Back" onClick={() => setView("menu")}>
              <Icon icon="game-icons:return-arrow" className="h-4 w-4" aria-hidden />
            </RcButton>
          )}
          <h2
            id="engine-more-title"
            ref={heading}
            tabIndex={-1}
            className="min-w-0 flex-1 truncate font-rc-display text-lg leading-tight text-rc-fg-strong focus:outline-none"
          >
            {titles[view]}
          </h2>
          <RcButton variant="ghost" size="icon-xs" aria-label="Close" onClick={onClose}>
            <Icon icon="game-icons:cancel" className="h-4 w-4" aria-hidden />
          </RcButton>
        </div>
        {body}
        {moreBelow && (
          <div className="pointer-events-none sticky -bottom-[max(12px,env(safe-area-inset-bottom))] -mx-4 -mb-[max(12px,env(safe-area-inset-bottom))] mt-[-2.5rem] flex h-10 flex-none items-end justify-center bg-gradient-to-t from-[rgba(9,13,25,1)] to-transparent pb-1">
            <Icon icon="game-icons:plain-arrow" className="h-3.5 w-3.5 text-rc-fg-subtle" aria-hidden />
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1.5">
      <div className="rc-field-label">{label}</div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-4 text-center text-sm text-rc-fg-muted">{children}</p>;
}

/** A native range for a 0–1 volume, with a thumb big enough for a thumb. */
const RANGE = [
  "rc-range h-10 min-w-0 flex-1",
  "[&::-moz-range-thumb]:h-[22px] [&::-moz-range-thumb]:w-[22px] [&::-webkit-slider-thumb]:mt-[-8px] [&::-webkit-slider-thumb]:h-[22px] [&::-webkit-slider-thumb]:w-[22px]",
  // a neutral thumb: gold is kept for the one commit button on screen
  "[&::-webkit-slider-thumb]:[background:#d7dbe6] [&::-moz-range-thumb]:[background:#d7dbe6]",
  "[&::-webkit-slider-thumb]:[border-color:rgba(9,13,25,0.7)] [&::-moz-range-thumb]:[border-color:rgba(9,13,25,0.7)]",
  // the filled part of the track, up to the thumb (`--fill`, set per slider): the level reads at a glance
  "[&::-webkit-slider-runnable-track]:[background:linear-gradient(to_right,rgba(215,219,230,0.7)_var(--fill,0%),rgba(0,0,0,0.45)_var(--fill,0%))] [&::-moz-range-progress]:h-[6px] [&::-moz-range-progress]:rounded-full [&::-moz-range-progress]:[background:rgba(215,219,230,0.7)]",
  "[&:focus-visible::-webkit-slider-thumb]:[box-shadow:0_0_0_4px_rgba(215,219,230,0.3)] [&:hover::-webkit-slider-thumb]:[box-shadow:0_0_0_4px_rgba(215,219,230,0.22)]",
  "[&:focus-visible::-moz-range-thumb]:[box-shadow:0_0_0_4px_rgba(215,219,230,0.3)] [&:hover::-moz-range-thumb]:[box-shadow:0_0_0_4px_rgba(215,219,230,0.22)]",
].join(" ");

/** The sound-effect volume "Sound effects: On" brings back, kept across reloads (the stored volume is 0 while off). */
const LAST_SOUND_VOLUME_KEY = "sorcery:lastSoundVolume";

function readLastSoundVolume(): number | null {
  try {
    const raw = window.localStorage.getItem(LAST_SOUND_VOLUME_KEY);
    const n = raw === null ? Number.NaN : Number.parseFloat(raw);
    return Number.isFinite(n) && n > 0 && n <= 1 ? n : null;
  } catch {
    return null;
  }
}

function storeLastSoundVolume(value: number) {
  try {
    window.localStorage.setItem(LAST_SOUND_VOLUME_KEY, String(value));
  } catch {
    // storage is a convenience: without it "on" falls back to the default volume
  }
}

function VolumeRow({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const pct = Math.round(value * 100);
  return (
    <label className="flex items-center gap-2.5">
      <span className="w-[5.5rem] flex-none text-[12px] text-rc-fg-muted">{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={pct}
        onChange={(e) => onChange(Number.parseInt(e.target.value, 10) / 100)}
        aria-valuetext={`${pct}%`}
        className={RANGE}
        style={{ "--fill": `${pct}%` } as CSSProperties}
      />
      <span className="w-9 flex-none text-right font-rc-mono text-xs tabular-nums text-rc-fg-subtle">{pct}%</span>
    </label>
  );
}

/**
 * Sound and music, on the existing settings: the sound-effect volume of SoundContext (off is
 * volume 0, as the other modes' mute button does, and on brings the last volume back) and the
 * music player's own on/off (togglePlay, which decides by intent) and volume. Both persist
 * exactly as AudioControls persists them. The audio system has no master volume: each has its
 * own slider.
 */
function AudioSection() {
  const { volume, setVolume } = useSound();
  const [music, musicControls] = useMusicPlayer();
  // the volume "on" brings back: the last one above zero
  const lastVolume = useRef(volume > 0 ? volume : DEFAULT_SOUND_VOLUME);
  useEffect(() => {
    if (volume > 0) {
      lastVolume.current = volume;
      storeLastSoundVolume(volume);
    } else {
      // off since before this sheet opened (a reload): bring back what was set before then
      lastVolume.current = readLastSoundVolume() ?? lastVolume.current;
    }
  }, [volume]);
  const sfxOn = volume > 0;
  return (
    <Section label="Audio">
      <div className="grid grid-cols-2 gap-1.5">
        <RcButton
          variant="quiet"
          size="sm"
          tone="success"
          className="h-11 justify-start gap-2 px-3 text-[13px]"
          aria-pressed={sfxOn}
          onClick={() => setVolume(sfxOn ? 0 : lastVolume.current || DEFAULT_SOUND_VOLUME)}
        >
          <Icon icon={sfxOn ? "game-icons:speaker" : "game-icons:speaker-off"} className="h-4 w-4 flex-none" aria-hidden />
          Sound effects
          <span className={COUNT}>{sfxOn ? "On" : "Off"}</span>
        </RcButton>
        <RcButton
          variant="quiet"
          size="sm"
          tone="success"
          className="h-11 justify-start gap-2 px-3 text-[13px]"
          aria-pressed={music.isEnabled}
          onClick={musicControls.togglePlay}
        >
          <Icon icon="game-icons:musical-notes" className="h-4 w-4 flex-none" aria-hidden />
          Music
          <span className={COUNT}>{music.isEnabled ? "On" : "Off"}</span>
        </RcButton>
      </div>
      <VolumeRow label="Sound volume" value={volume} onChange={setVolume} />
      <VolumeRow label="Music volume" value={music.volume} onChange={musicControls.setVolume} />
      {music.isEnabled && (
        <div className="flex items-center gap-1">
          <RcButton variant="ghost" size="icon" className="h-10 w-10 flex-none" aria-label="Previous track" onClick={musicControls.previousTrack}>
            <Icon icon="game-icons:previous-button" className="h-4 w-4" aria-hidden />
          </RcButton>
          <span className="min-w-0 flex-1 truncate text-center text-[12px] text-rc-fg-muted" title={music.currentTrack.title}>
            {music.autoplayBlocked && !music.isPlaying ? "Tap anywhere to start the music" : music.currentTrack.title}
          </span>
          <RcButton variant="ghost" size="icon" className="h-10 w-10 flex-none" aria-label="Next track" onClick={musicControls.nextTrack}>
            <Icon icon="game-icons:next-button" className="h-4 w-4" aria-hidden />
          </RcButton>
        </div>
      )}
    </Section>
  );
}
