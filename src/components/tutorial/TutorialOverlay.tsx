"use client";

/**
 * TutorialOverlay — Renders narration, highlights, and step progression
 * on top of the 3D game scene during tutorial lessons.
 */

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { NumberBadge, type Digit } from "@/components/game/manacost";
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
      {/* Progress bar */}
      <div className="fixed top-0 left-0 right-0 z-[60] h-1 bg-slate-800/80">
        <div
          className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Skip button — positioned below nav bar to avoid UserBadge overlap */}
      <button
        onClick={onSkip}
        className="fixed top-3 right-16 z-[61] rounded bg-slate-800/80 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
      >
        Skip Lesson
      </button>

      {/* Step counter */}
      <div className="fixed top-3 left-3 z-[61] text-xs text-slate-400">
        Step {stepIndex + 1} / {stepCount}
      </div>

      {/* Hint toast */}
      {hint && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[62] max-w-sm">
          <div className="bg-amber-600/90 text-white rounded-lg px-4 py-3 shadow-lg text-sm flex items-start gap-3">
            <span className="shrink-0 text-lg">💡</span>
            <div className="flex-1">
              <p>{hint}</p>
            </div>
            <button
              onClick={onDismissHint}
              className="shrink-0 text-amber-200 hover:text-white text-xs ml-2"
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
                    className="object-contain rounded-lg drop-shadow-[0_0_20px_rgba(139,92,246,0.4)]"
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
                  className="object-contain rounded-lg drop-shadow-[0_0_20px_rgba(139,92,246,0.4)]"
                  unoptimized
                />
              </div>
            )}
            <p className="text-center text-sm text-slate-300 mt-3 font-medium drop-shadow-lg">
              {step.showCard.name}
            </p>
          </div>
        </div>
      )}

      {/* Main narration panel — positioned top-left to avoid obstructing the hand */}
      <div
        className={`fixed top-8 left-3 z-[60] w-80 max-w-[calc(100vw-1.5rem)] transition-all duration-300 ${
          visible ? "translate-x-0 opacity-100" : "-translate-x-4 opacity-0"
        }`}
      >
        <div className="rounded-xl bg-slate-900/95 ring-1 ring-slate-700/80 shadow-2xl backdrop-blur-sm max-h-[60vh] flex flex-col">
          {/* Title */}
          {step.title && (
            <div className="border-b border-slate-700/50 px-4 py-2.5 shrink-0">
              <h3 className="text-sm font-semibold text-white">
                {step.title}
              </h3>
            </div>
          )}

          {/* Body text — scrollable */}
          {step.text && (
            <div className="px-4 py-3 overflow-y-auto">
              <TutorialText text={step.text} />
            </div>
          )}

          {/* Action bar */}
          <div className="flex items-center justify-between border-t border-slate-700/50 px-4 py-2.5 shrink-0">
            <div className="flex items-center gap-2">
              <StepTypeIndicator type={step.type} />
              {canGoBack && (
                <button
                  onClick={onBack}
                  className="rounded px-2 py-1 text-xs text-slate-400 hover:text-white hover:bg-slate-700/60 transition-colors"
                  title="Previous step (Left arrow)"
                >
                  &larr; Back
                </button>
              )}
            </div>

            {isInteractive && (
              <button
                onClick={onAdvance}
                className="rounded-lg bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 px-4 py-1.5 text-sm font-semibold text-white transition-all shadow-md hover:shadow-lg"
              >
                {step.type === "checkpoint" ? "Continue" : "Next"}
              </button>
            )}

            {step.type === "forced_action" && (
              <span className="text-xs text-amber-400 italic">
                Perform the action to continue
              </span>
            )}

            {step.type === "scripted_action" && (
              <span className="text-xs text-blue-400 italic">
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
    <div className="space-y-2 text-sm text-slate-200 leading-relaxed">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (trimmed === "") return <div key={i} className="h-1" />;
        if (trimmed.startsWith("- ")) {
          return (
            <div key={i} className="flex gap-2 pl-2">
              <span className="text-violet-400 shrink-0">•</span>
              <span>{renderBold(trimmed.slice(2))}</span>
            </div>
          );
        }
        if (/^\d+\.\s/.test(trimmed)) {
          const match = trimmed.match(/^(\d+)\.\s(.*)$/);
          if (match) {
            return (
              <div key={i} className="flex gap-2 pl-2">
                <span className="text-violet-400 shrink-0 w-4 text-right">
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
        <span key={i} className="font-semibold text-white">
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
    narration: { label: "Info", color: "text-blue-400" },
    highlight: { label: "Look", color: "text-emerald-400" },
    forced_action: { label: "Your Turn", color: "text-amber-400" },
    scripted_action: { label: "Opponent", color: "text-red-400" },
    wait: { label: "Wait", color: "text-slate-400" },
    checkpoint: { label: "Checkpoint", color: "text-violet-400" },
  };
  const info = labels[type] ?? { label: type, color: "text-slate-400" };
  return (
    <span className={`text-xs font-medium uppercase tracking-wider ${info.color}`}>
      {info.label}
    </span>
  );
}
