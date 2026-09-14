"use client";

/**
 * TutorialOverlay — Renders narration, highlights, and step progression
 * on top of the 3D game scene during tutorial lessons.
 */

import { Icon } from "@iconify/react";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { NumberBadge, type Digit } from "@/components/game/manacost";
import { RcButton } from "@/components/ui/rc-button";
import type { TutorialStep } from "@/lib/tutorial/types";

interface TutorialOverlayProps {
  step: TutorialStep | null;
  stepIndex: number;
  stepCount: number;
  onAdvance: () => void;
  onBack: () => void;
  canGoBack: boolean;
  onSkip: () => void;
  hint: string | null;
  onDismissHint: () => void;
  /**
   * The life counters are shown on the left edge. On landscape phones the
   * panel shifts right so it does not cover them.
   */
  avoidLeftHud?: boolean;
}

export function TutorialOverlay({
  step,
  stepIndex,
  stepCount,
  onAdvance,
  onBack,
  canGoBack,
  onSkip,
  hint,
  onDismissHint,
  avoidLeftHud = false,
}: TutorialOverlayProps) {
  const [visible, setVisible] = useState(false);

  // Fade in when step changes
  useEffect(() => {
    if (!step) return;
    setVisible(false);
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, [step]);

  // Keyboard: Enter/Space/Right to advance, Left/Backspace to go back
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!step) return;
      const isAdvanceable =
        step.type === "narration" ||
        step.type === "highlight" ||
        step.type === "checkpoint";

      if (
        (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") &&
        isAdvanceable
      ) {
        e.preventDefault();
        onAdvance();
      } else if (
        (e.key === "ArrowLeft" || e.key === "Backspace") &&
        canGoBack
      ) {
        e.preventDefault();
        onBack();
      }
    },
    [step, onAdvance, onBack, canGoBack]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!step) return null;

  const progress = stepCount > 0 ? ((stepIndex + 1) / stepCount) * 100 : 0;

  const isInteractive =
    step.type === "narration" ||
    step.type === "highlight" ||
    step.type === "checkpoint";

  return (
    <>
      {/*
       * Progress, step counter and Skip live inside the panel header below.
       * They used to be fixed at the very top of the screen, which is covered
       * by the site header (the lesson renders inside the AppShell column).
       */}

      {/* Hint toast — just below the site header; right-aligned on phones so
          it does not land on the narration panel */}
      {hint && (
        <div className="fixed top-[calc(var(--rc-nav-h,0px)+0.5rem)] left-1/2 -translate-x-1/2 z-[62] w-max max-w-[min(24rem,calc(100vw-1.5rem))] max-lg:landscape:left-auto max-lg:landscape:right-[max(0.75rem,env(safe-area-inset-right))] max-lg:landscape:translate-x-0">
          <div
            className="rc-toast flex items-start gap-3 px-4 py-3 text-sm"
            data-tone="info"
          >
            <span className="mt-0.5 shrink-0 text-rc-spark">
              <Icon icon="game-icons:light-bulb" width={18} height={18} aria-hidden="true" />
            </span>
            <div className="flex-1">
              <p>{hint}</p>
            </div>
            <button
              onClick={onDismissHint}
              className="ml-2 shrink-0 font-rc-mono text-xs tracking-[0.08em] text-rc-accent-link transition-colors hover:text-rc-accent-ring"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Card showcase — centered on screen when step has showCard */}
      {step.showCard && (
        <div
          className={`fixed inset-0 z-[59] flex items-center justify-center pointer-events-none transition-opacity duration-500 ${
            visible ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="relative">
            {step.showCard.type === "Site" ? (
              /* Sites are landscape — displayed rotated */
              <div className="relative w-[480px] h-[360px]">
                <div className="absolute inset-0 rotate-90 scale-[1.333] origin-center">
                  <Image
                    src={`/api/images/${step.showCard.slug}`}
                    alt={step.showCard.name}
                    fill
                    className="object-contain rounded-rc-md drop-shadow-[0_0_20px_rgba(212,169,74,0.35)]"
                    unoptimized
                  />
                </div>
              </div>
            ) : (
              /* Spells are portrait */
              <div className="relative w-[360px] h-[480px]">
                <Image
                  src={`/api/images/${step.showCard.slug}`}
                  alt={step.showCard.name}
                  fill
                  className="object-contain rounded-rc-md drop-shadow-[0_0_20px_rgba(212,169,74,0.35)]"
                  unoptimized
                />
              </div>
            )}
            <p className="mt-3 text-center font-rc-display text-[18px] leading-tight text-rc-fg drop-shadow-lg">
              {step.showCard.name}
            </p>
          </div>
        </div>
      )}

      {/*
       * Main narration panel.
       * - Desktop and landscape phones: top-left, just below the site header,
       *   clear of the hand at the bottom. On landscape phones it also steps
       *   right of the life counters when they are visible.
       * - Portrait phones: the board sits mid-screen and the HUD sits above
       *   it, so the panel docks full-width above the hand instead.
       * Slightly translucent with a stronger blur so the board stays readable
       * behind it.
       */}
      <div
        className={`fixed z-[60] w-80 max-w-[calc(100vw-1.5rem)] transition-all duration-300 top-[calc(var(--rc-nav-h,0px)+0.5rem)] left-[max(0.75rem,env(safe-area-inset-left))] max-lg:portrait:top-auto max-lg:portrait:bottom-[calc(env(safe-area-inset-bottom,0px)+4.5rem)] max-lg:portrait:left-3 max-lg:portrait:right-3 max-lg:portrait:w-auto max-lg:portrait:max-w-none ${
          avoidLeftHud
            ? "max-lg:landscape:left-[calc(max(0.75rem,env(safe-area-inset-left))+3.75rem)]"
            : ""
        } ${visible ? "translate-x-0 opacity-100" : "-translate-x-4 opacity-0"}`}
      >
        <div className="flex max-h-[60vh] flex-col overflow-hidden rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.8)] text-rc-fg shadow-rc-panel backdrop-blur-md max-lg:landscape:max-h-[calc(100dvh-var(--rc-nav-h,0px)-4.5rem)] max-lg:portrait:max-h-[45dvh]">
          {/* Progress */}
          <div className="h-1 shrink-0 bg-black/45">
            <div
              className="h-full bg-gradient-to-r from-rc-accent to-rc-accent-hover transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Title row with step counter and skip */}
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-rc-line/12 px-4 py-2 max-lg:px-3">
            <h3 className="m-0 min-w-0 pt-0.5 font-rc-display text-[18px] leading-tight text-rc-fg-strong">
              {step.title ?? ""}
            </h3>
            <div className="flex shrink-0 items-center gap-1 text-xs">
              <span className="font-rc-mono tabular-nums text-rc-fg-subtle">
                Step {stepIndex + 1} / {stepCount}
              </span>
              <button
                onClick={onSkip}
                className="rounded-rc-sm px-2 py-1 font-rc-sans text-rc-fg-muted transition-colors hover:bg-rc-line/6 hover:text-rc-fg-strong"
              >
                Skip Lesson
              </button>
            </div>
          </div>

          {/* Body text — scrollable */}
          {step.text && (
            <div className="thin-scrollbar overflow-y-auto px-4 py-3 max-lg:px-3 max-lg:py-2">
              <TutorialText text={step.text} />
            </div>
          )}

          {/* Action bar */}
          <div className="flex items-center justify-between border-t border-rc-line/12 px-4 py-2.5 shrink-0 max-lg:px-3 max-lg:py-2">
            <div className="flex items-center gap-2">
              <StepTypeIndicator type={step.type} />
              {canGoBack && (
                <button
                  onClick={onBack}
                  className="rounded-rc-sm px-2 py-1 font-rc-sans text-xs text-rc-fg-muted transition-colors hover:bg-rc-line/6 hover:text-rc-fg-strong"
                  title="Previous step (Left arrow)"
                >
                  &larr; Back
                </button>
              )}
            </div>

            {isInteractive && (
              <RcButton size="sm" className="px-4" onClick={onAdvance}>
                {step.type === "checkpoint" ? "Continue" : "Next"}
              </RcButton>
            )}

            {step.type === "forced_action" && (
              <span className="font-rc-sans text-xs italic text-rc-spark">
                Perform the action to continue
              </span>
            )}

            {step.type === "scripted_action" && (
              <span className="font-rc-sans text-xs italic text-rc-info">
                Watching...
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ──────────────── Sub-components ────────────────

/** Render markdown-lite text (bold, newlines, bullet lists). */
function TutorialText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-2 font-rc-sans text-sm leading-relaxed text-rc-fg">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (trimmed === "") return <div key={i} className="h-1" />;
        if (trimmed.startsWith("- ")) {
          return (
            <div key={i} className="flex gap-2 pl-2">
              <span className="text-rc-accent-link shrink-0">•</span>
              <span>{renderBold(trimmed.slice(2))}</span>
            </div>
          );
        }
        if (/^\d+\.\s/.test(trimmed)) {
          const match = trimmed.match(/^(\d+)\.\s(.*)$/);
          if (match) {
            return (
              <div key={i} className="flex gap-2 pl-2">
                <span className="font-rc-mono tabular-nums text-rc-accent-link shrink-0 w-4 text-right">
                  {match[1]}.
                </span>
                <span>{renderBold(match[2])}</span>
              </div>
            );
          }
        }
        return <div key={i}>{renderBold(trimmed)}</div>;
      })}
    </div>
  );
}

/** Element symbol config for inline rendering. */
const ELEMENT_SYMBOLS: Record<string, { icon: string; color: string }> = {
  air: { icon: "/air.png", color: "#93c5fd" },
  earth: { icon: "/earth.png", color: "#f59e0b" },
  fire: { icon: "/fire.png", color: "#f87171" },
  water: { icon: "/water.png", color: "#67e8f9" },
};

/** Replace **bold** markers, {element} markers, and {mana:N} markers with styled spans/images/badges. */
function renderBold(text: string): React.ReactNode {
  // Split on bold markers, element markers, and mana cost markers
  const parts = text.split(/(\*\*[^*]+\*\*|\{(?:air|earth|fire|water)\}|\{mana:\d\})/);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <span key={i} className="font-semibold text-rc-fg-strong">
          {part.slice(2, -2)}
        </span>
      );
    }
    const elementMatch = part.match(/^\{(air|earth|fire|water)\}$/);
    if (elementMatch) {
      const el = ELEMENT_SYMBOLS[elementMatch[1]];
      return (
        <img
          key={i}
          src={el.icon}
          alt={elementMatch[1]}
          className="inline-block w-4 h-4 align-text-bottom mx-0.5"
          style={{ filter: `drop-shadow(0 0 2px ${el.color})` }}
        />
      );
    }
    const manaMatch = part.match(/^\{mana:(\d)\}$/);
    if (manaMatch) {
      return (
        <NumberBadge
          key={i}
          value={Number(manaMatch[1]) as Digit}
          size={18}
          strokeWidth={6}
          className="align-text-bottom mx-0.5"
        />
      );
    }
    return <span key={i}>{part}</span>;
  });
}

/** Small indicator showing the step type. */
function StepTypeIndicator({ type }: { type: string }) {
  const labels: Record<string, { label: string; color: string }> = {
    narration: { label: "Info", color: "text-rc-info" },
    highlight: { label: "Look", color: "text-rc-success" },
    forced_action: { label: "Your Turn", color: "text-rc-spark" },
    scripted_action: { label: "Opponent", color: "text-red-400" },
    wait: { label: "Wait", color: "text-rc-fg-subtle" },
    checkpoint: { label: "Checkpoint", color: "text-rc-moonlight" },
  };
  const info = labels[type] ?? { label: type, color: "text-rc-fg-subtle" };
  return (
    <span className={`font-rc-mono text-xs font-medium uppercase tracking-[0.14em] ${info.color}`}>
      {info.label}
    </span>
  );
}
