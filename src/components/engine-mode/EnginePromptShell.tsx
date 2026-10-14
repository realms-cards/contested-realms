"use client";

import { Icon } from "@iconify/react";
import { createContext, useContext } from "react";
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
/** The bottom sheet slides up from the screen edge instead of rising in place. */
const SHEET = "@keyframes rc-prompt-sheet{from{opacity:.4;transform:translateY(24px)}to{opacity:1;transform:none}}";

/**
 * Where prompts go. "overlay" (the 3D table) floats them over the board; "docked" (the 2D
 * phone layout, where nothing may cover the board) puts the banner into the page flow —
 * the layout gives it a row — and turns a decision into a bottom sheet.
 */
export type PromptPlacement = "overlay" | "docked";

export const PromptPlacementContext = createContext<PromptPlacement>("overlay");

export function usePromptPlacement(): PromptPlacement {
  return useContext(PromptPlacementContext);
}

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
  const placement = usePromptPlacement();
  if (placement === "docked") {
    return (
      <DockedBanner title={title} hint={hint} counter={counter}>
        {children}
      </DockedBanner>
    );
  }
  return (
    <div className="pointer-events-none fixed inset-x-0 top-14 z-[200] flex justify-center px-4">
      <style>{SHEEN}</style>
      <section
        role="region"
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

/**
 * The banner in the page flow, laid out for the dock it sits in: the title (with its icon and
 * counter) on one line, the hint across the full width under it in reading-size type, and
 * the action buttons sharing a row of their own, each growing to fill it and wrapping
 * rather than squeezing. When the dock is too short for the whole banner the button row
 * stays pinned in view and the title and hint scroll under it.
 *
 * In a phone's dock, either way up (the page marks it `data-dock-fill`), the type steps down a
 * size and the buttons may sit two to a row in a half-width column (a portrait phone shares
 * the dock row with the card preview), to keep within the dock's height budget; the banner is
 * only as tall as its content, so a short prompt never leaves an empty band above its buttons. In the landscape / desktop inspector (`data-dock-flat`) it is a section
 * of that one panel rather than a box inside it: no border or rounding, a faint warm ground
 * and the breathing accent edge on top.
 */
function DockedBanner({
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
    <section
      role="region"
      aria-label={title}
      data-docked-banner=""
      className="relative flex w-full grow flex-col overflow-clip rounded-rc-md border border-rc-accent/45 bg-[rgba(9,13,25,0.96)] px-3.5 pb-3 pt-3 font-rc-sans text-rc-fg shadow-[0_0_0_1px_rgba(243,207,106,0.14)] motion-safe:[animation:rc-prompt-rise_.18s_ease-out] [[data-dock-fill]_&]:px-3 [[data-dock-fill]_&]:pb-2.5 [[data-dock-fill]_&]:pt-2.5 [[data-dock-flat]_&]:rounded-none [[data-dock-flat]_&]:border-0 [[data-dock-flat]_&]:bg-[rgb(16,19,28)] [[data-dock-flat]_&]:shadow-none"
    >
      <style>{SHEEN}</style>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-rc-accent to-transparent motion-safe:[animation:rc-prompt-sheen_2.4s_ease-in-out_infinite]"
      />
      {/* `data-prompt-body`: in a portrait phone's dock this part scrolls on its own while the
          buttons below keep their place (Sidebar2D), so the two never overlap */}
      <div data-prompt-body="" className="thin-scrollbar grow">
        <div className="flex items-start gap-2">
          <Icon
            icon="game-icons:pointing"
            className="mt-0.5 h-5 w-5 flex-none text-rc-accent [[data-dock-fill]_&]:h-4 [[data-dock-fill]_&]:w-4"
            aria-hidden
          />
          <div data-prompt-title="" className="min-w-0 flex-1 font-rc-display text-[20px] leading-tight text-rc-fg-strong [[data-dock-fill]_&]:text-[17px]">
            {title}
          </div>
          {/* a phone's dock is too narrow to share the title's line: the counter leads the hint there */}
          {counter && <CounterChip counter={counter} className="mt-0.5 [[data-dock-fill]_&]:hidden" />}
        </div>
        {(hint || counter) && (
          <p
            data-prompt-hint=""
            className={`mt-2 text-[15px] leading-relaxed text-rc-fg-muted [[data-dock-fill]_&]:mt-1 [[data-dock-fill]_&]:text-[13px] [[data-dock-fill]_&]:leading-snug ${
              hint ? "" : "hidden [[data-dock-fill]_&]:block"
            }`}
          >
            {counter && <CounterChip counter={counter} className="mr-1.5 hidden align-[1px] [[data-dock-fill]_&]:inline-block" />}
            {hint}
          </p>
        )}
      </div>
      {/*
        the buttons (the commit CTA among them) stick to the bottom of the dock's scroller, so a
        title that wraps in a narrow column can never push Confirm out of view or under the
        actions; `overflow-clip` above (not `hidden`) keeps the section from becoming the
        scroll container this sticks to. Each button grows to share the row, and they wrap
        two or three to a line in a narrow column.
      */}
      {children && (
        <div
          data-prompt-actions
          className="sticky bottom-0 z-[1] -mx-3.5 -mb-3 mt-3 flex flex-wrap items-stretch gap-2 bg-[rgba(9,13,25,0.98)] [[data-dock-flat]_&]:bg-[rgb(16,19,28)] px-3.5 pb-3 pt-2 shadow-[0_-8px_10px_-8px_rgba(0,0,0,0.7)] [&>button]:h-10 [&>button]:min-w-[5.5rem] [&>button]:flex-[1_1_auto] [&>button]:text-sm [[data-dock-fill]_&]:-mx-3 [[data-dock-fill]_&]:-mb-2.5 [[data-dock-fill]_&]:mt-2 [[data-dock-fill]_&]:px-3 [[data-dock-fill]_&]:pb-2.5 [[data-dock-fill]_&>button]:h-9 [[data-dock-fill]_&>button]:min-w-[3.5rem] [[data-dock-fill]_&>button]:px-2.5 [[data-dock-fill]_&]:gap-1.5"
        >
          {children}
        </div>
      )}
    </section>
  );
}

/** A prompt's "2/3"-style counter. */
function CounterChip({ counter, className = "" }: { counter: string; className?: string }) {
  return (
    <span
      className={`flex-none whitespace-nowrap rounded-full border border-rc-line/22 px-2 py-0.5 font-rc-mono text-xs leading-tight tabular-nums text-rc-fg-muted ${className}`}
    >
      {counter}
    </span>
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
  const placement = usePromptPlacement();
  if (placement === "docked") {
    return (
      <PromptSheet title={title} hint={hint} wide={wide}>
        {children}
      </PromptSheet>
    );
  }
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

/**
 * The decision as a bottom sheet: anchored to the screen edge the thumb is already at, no
 * taller than three quarters of the screen, and clear of the home indicator and notches.
 * The scrim is a gradient that leaves the top of the board readable; like the centred
 * dialog it never takes the pointer, so the board under it stays live.
 */
function PromptSheet({
  title,
  hint,
  children,
  wide,
}: {
  title: string;
  hint?: string | null;
  children: ReactNode;
  wide: boolean;
}) {
  return (
    <div className="pointer-events-none fixed inset-0 z-[200] flex flex-col items-center justify-end">
      <style>{SHEEN + SHEET}</style>
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: "linear-gradient(to bottom, rgba(6,10,20,0.15) 0%, rgba(6,10,20,0.8) 100%)" }}
      />
      <section
        role="dialog"
        aria-modal="false"
        aria-label={title}
        className={`pointer-events-auto relative flex max-h-[75vh] max-h-[75dvh] w-full flex-col overflow-hidden rounded-t-rc-lg border border-b-0 border-rc-accent/40 bg-[rgba(9,13,25,0.97)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] font-rc-sans text-rc-fg shadow-[0_-18px_50px_rgba(0,0,0,0.6)] motion-safe:[animation:rc-prompt-sheet_.22s_ease-out] ${wide ? "max-w-[920px]" : "max-w-[560px]"}`}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-rc-accent to-transparent motion-safe:[animation:rc-prompt-sheen_2.4s_ease-in-out_infinite]"
        />
        {/* grab-handle mark: reads as a sheet, not a page */}
        <span aria-hidden className="mx-auto mt-2 h-1 w-10 flex-none rounded-full bg-rc-line/30" />
        <header className="px-4 pb-2 pt-2 text-center">
          <div className="font-rc-display text-[20px] leading-tight text-rc-fg-strong">{title}</div>
          {hint && <div className="mt-1 text-xs text-rc-fg-muted">{hint}</div>}
        </header>
        <div className="thin-scrollbar flex-1 overflow-y-auto overscroll-contain px-4 pb-4">{children}</div>
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
