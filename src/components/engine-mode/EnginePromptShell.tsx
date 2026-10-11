"use client";

import { Icon } from "@iconify/react";
import type { ReactNode } from "react";

/**
 * How an engine prompt is presented.
 *
 * A prompt that needs the board (pick a unit, a square, defenders) must leave the board
 * visible and clickable, so it takes the top banner — but a loud one: accent edge, breathing
 * glow, an icon and a counter, so it cannot be mistaken for status text.
 *
 * A prompt that is a decision in itself (yes/no, pick a card, split damage) takes the centre
 * of the screen behind a vignette, the way a modern game asks for a major choice.
 */

const SHEEN =
  "@keyframes rc-prompt-sheen{0%,100%{opacity:.55}50%{opacity:1}}@keyframes rc-prompt-rise{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}";

/** The loud top banner: board stays clickable underneath. */
export function PromptBanner({
  title,
  hint,
  counter,
  children,
}: {
  title: string;
  hint?: string | null;
  counter?: string | null;
  children?: ReactNode;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-14 z-[200] flex justify-center px-4">
      <style>{SHEEN}</style>
      <section
        role="dialog"
        aria-label={title}
        className="pointer-events-auto relative w-[min(94vw,760px)] overflow-hidden rounded-rc-lg border border-rc-accent/45 bg-[rgba(9,13,25,0.96)] px-5 py-3.5 font-rc-sans text-rc-fg shadow-[0_18px_50px_rgba(0,0,0,0.55),0_0_0_1px_rgba(243,207,106,0.14)]"
        style={{ animation: "rc-prompt-rise .18s ease-out" }}
      >
        {/* breathing accent edge — the "act now" signal */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-rc-accent to-transparent"
          style={{ animation: "rc-prompt-sheen 2.4s ease-in-out infinite" }}
        />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Icon icon="game-icons:pointing" className="h-4 w-4 flex-none text-rc-accent" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="font-rc-display text-[19px] leading-tight text-rc-fg-strong">{title}</div>
            {hint && <div className="mt-0.5 text-xs text-rc-fg-muted">{hint}</div>}
          </div>
          {counter && (
            <span className="rounded-full border border-rc-line/22 px-2 py-0.5 font-rc-mono text-xs tabular-nums text-rc-fg-muted">
              {counter}
            </span>
          )}
          <div className="flex flex-wrap items-center gap-2">{children}</div>
        </div>
      </section>
    </div>
  );
}

/** A major decision: centred, behind a vignette, the board dimmed but not hidden. */
export function PromptDialog({
  title,
  hint,
  children,
  wide = false,
}: {
  title: string;
  hint?: string | null;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="pointer-events-none fixed inset-0 z-[200] flex items-center justify-center p-4">
      <style>{SHEEN}</style>
      {/* vignette: darkens the edges so the eye lands on the panel, board still readable */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse at center, rgba(6,10,20,0.35) 0%, rgba(6,10,20,0.82) 100%)" }}
      />
      <section
        role="dialog"
        aria-modal="false"
        aria-label={title}
        className={`pointer-events-auto relative flex max-h-[86vh] flex-col overflow-hidden rounded-rc-lg border border-rc-accent/40 bg-[rgba(9,13,25,0.97)] font-rc-sans text-rc-fg shadow-[0_28px_80px_rgba(0,0,0,0.7)] ${wide ? "w-[min(94vw,920px)]" : "w-[min(94vw,560px)]"}`}
        style={{ animation: "rc-prompt-rise .2s ease-out" }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-rc-accent to-transparent"
          style={{ animation: "rc-prompt-sheen 2.4s ease-in-out infinite" }}
        />
        <header className="px-6 pb-2 pt-5 text-center">
          <div className="font-rc-display text-[26px] leading-tight text-rc-fg-strong">{title}</div>
          {hint && <div className="mt-1 text-sm text-rc-fg-muted">{hint}</div>}
        </header>
        <div className="thin-scrollbar flex-1 overflow-y-auto px-6 pb-5">{children}</div>
      </section>
    </div>
  );
}

/** Keyed by OUR board arrow, not the engine's letter. */
const COMPASS_SPOT: Record<string, string> = {
  N: "col-start-2 row-start-1",
  S: "col-start-2 row-start-3",
  E: "col-start-3 row-start-2",
  W: "col-start-1 row-start-2",
};
/** One arrow, turned: 0° points up the screen. */
const COMPASS_TURN: Record<string, number> = { N: 0, E: 90, S: 180, W: 270 };

/**
 * A direction choice drawn as a compass rather than a row of words — the fallback for the
 * handful of direction prompts the engine does not give an origin square for (it only
 * attaches `from`/`dirs` when every option is a bare n/s/e/w). With an origin we draw the
 * arrows on the board itself instead; see DirectionPick.
 *
 * Callers pass OUR board arrow (BOARD_DIRECTION in lib/engine-mode/coords), already rotated
 * out of engine space — the engine's "north" runs up our screen, and only east/west swap.
 */
export function Compass({ options, onPick }: { options: { key: string; label: string }[]; onPick: (label: string) => void }) {
  return (
    <div className="mx-auto grid w-[168px] grid-cols-3 grid-rows-3 place-items-center gap-1">
      {options.map(({ key, label }) => {
        const screen = key;
        return (
          <button
            key={key}
            type="button"
            title={label}
            aria-label={label}
            onClick={() => onPick(label)}
            className={`${COMPASS_SPOT[screen] ?? "col-start-2 row-start-2"} flex h-12 w-12 cursor-pointer items-center justify-center rounded-rc-md border border-rc-line/22 bg-black/35 text-rc-fg-muted transition-colors hover:border-rc-accent hover:bg-rc-accent/10 hover:text-rc-accent-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rc-accent-ring`}
          >
            <Icon
              icon="game-icons:plain-arrow"
              className="h-6 w-6"
              style={{ transform: `rotate(${COMPASS_TURN[screen] ?? 0}deg)` }}
              aria-hidden
            />
          </button>
        );
      })}
      <Icon icon="game-icons:compass" className="col-start-2 row-start-2 h-5 w-5 text-rc-fg-subtle" aria-hidden />
    </div>
  );
}

/** Reads a direction key out of an engine option string, when it is one. */
export function directionKey(option: string): string | null {
  const text = option.trim().toLowerCase();
  const table: Record<string, string> = { n: "n", s: "s", e: "e", w: "w", north: "n", south: "s", east: "e", west: "w" };
  if (table[text]) return table[text];
  const word = /\b(north|south|east|west)\b/.exec(text);
  return word ? table[word[1]] : null;
}
