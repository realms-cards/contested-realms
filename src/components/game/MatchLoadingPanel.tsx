"use client";

import { motion, useReducedMotion } from "framer-motion";

export type MatchLoadingStep = {
  label: string;
  detail?: string;
  done: boolean;
};

type MatchLoadingPanelProps = {
  title: string;
  subtitle: string;
  steps: MatchLoadingStep[];
};

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * The card shown on the match curtain while the board loads. It matches the
 * mulligan panel so the hand-off from setup reads as one continuous screen.
 */
export default function MatchLoadingPanel({
  title,
  subtitle,
  steps,
}: MatchLoadingPanelProps) {
  const reduceMotion = useReducedMotion();
  const doneCount = steps.filter((step) => step.done).length;
  const progress = steps.length > 0 ? doneCount / steps.length : 1;

  return (
    <motion.div
      className="w-full max-w-sm rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.9)] p-6 text-rc-fg shadow-rc-panel"
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.45, ease: EASE, delay: 0.1 }}
      role="status"
      aria-live="polite"
    >
      <div className="rc-eyebrow">Match start</div>
      <div className="mt-1 font-rc-display text-[26px] leading-none text-rc-fg-strong">
        {title}
      </div>
      <div className="rc-hint mt-2">{subtitle}</div>

      <div className="rc-progress mt-5" aria-hidden>
        <span style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>

      <ul className="mt-4 space-y-2">
        {steps.map((step) => (
          <li
            key={step.label}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <span className="flex items-center gap-2.5">
              <span
                className={`h-1.5 w-1.5 rounded-full transition-colors duration-300 ${
                  step.done ? "bg-rc-success" : "animate-pulse bg-rc-fg-muted"
                }`}
              />
              <span
                className={`transition-colors duration-300 ${
                  step.done ? "text-rc-fg-strong" : "text-rc-fg-muted"
                }`}
              >
                {step.label}
              </span>
            </span>
            {step.detail && (
              <span className="font-rc-mono text-xs tabular-nums text-rc-fg-muted">
                {step.detail}
              </span>
            )}
          </li>
        ))}
      </ul>
    </motion.div>
  );
}
