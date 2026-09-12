"use client";

/**
 * TutorialLessonSelect — Lesson selection screen for the tutorial.
 *
 * Shows all available lessons with completion status, descriptions,
 * and a start/resume button for each. Progress is read from localStorage.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { RcButton } from "@/components/ui/rc-button";
import { ALL_LESSONS } from "@/lib/tutorial/lessons";
import { getTutorialProgress, resetTutorialProgress } from "@/lib/tutorial/progress";
import type { TutorialProgress } from "@/lib/tutorial/types";

export function TutorialLessonSelect() {
  const [progress, setProgress] = useState<TutorialProgress | null>(null);

  useEffect(() => {
    setProgress(getTutorialProgress());
  }, []);

  const handleReset = () => {
    resetTutorialProgress();
    setProgress(getTutorialProgress());
  };

  const completedCount = progress?.completedLessons.length ?? 0;
  const totalCount = ALL_LESSONS.length;
  const completedPct = Math.round((completedCount / totalCount) * 100);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        eyebrow="new here?"
        title="Learn to Play"
        description="Complete these interactive lessons to learn the rules of Sorcery: Contested Realm. Each lesson builds on the previous one."
      />

      {/* Overall progress */}
      {progress && completedCount > 0 && (
        <div>
          <div className="mb-1.5 flex items-center justify-between font-rc-mono text-[11px] tracking-[0.1em] text-rc-fg-subtle">
            <span>
              {completedCount} of {totalCount} lessons complete
            </span>
            <span className="rc-stat text-[11px]">{completedPct}%</span>
          </div>
          <div className="rc-progress">
            <span style={{ width: `${(completedCount / totalCount) * 100}%` }} />
          </div>
        </div>
      )}

      {/* Lesson list */}
      <div className="space-y-3">
        {ALL_LESSONS.map((lesson) => {
          const isComplete = progress?.completedLessons.includes(lesson.id);
          const isCurrent = progress?.currentLesson === lesson.id;
          const resumeStep = isCurrent ? progress?.currentStep ?? 0 : 0;

          return (
            <LessonCard
              key={lesson.id}
              id={lesson.id}
              order={lesson.order}
              title={lesson.title}
              description={lesson.description}
              concepts={lesson.concepts}
              stepCount={lesson.steps.length}
              isComplete={!!isComplete}
              isCurrent={!!isCurrent}
              resumeStep={resumeStep}
            />
          );
        })}
      </div>

      {/* Footer actions */}
      {completedCount > 0 && (
        <div className="flex justify-end">
          <RcButton variant="ghost" size="sm" onClick={handleReset}>
            Reset Progress
          </RcButton>
        </div>
      )}
    </div>
  );
}

// ──────────────── LessonCard ────────────────

interface LessonCardProps {
  id: string;
  order: number;
  title: string;
  description: string;
  concepts: string[];
  stepCount: number;
  isComplete: boolean;
  isCurrent: boolean;
  resumeStep: number;
}

function LessonCard({
  id,
  order,
  title,
  description,
  stepCount,
  isComplete,
  isCurrent,
  resumeStep,
}: LessonCardProps) {
  const href = isCurrent
    ? `/tutorial/${id}?step=${resumeStep}`
    : `/tutorial/${id}`;

  return (
    <Link
      href={href}
      className={`rc-panel block p-4 transition-colors hover:border-rc-accent/45 hover:bg-rc-accent/6 ${
        isCurrent && !isComplete ? "border-rc-accent/35" : ""
      }`}
    >
      <div className="flex items-start gap-4">
        {/* Order number */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-rc-md border border-rc-line/25 bg-gradient-to-br from-[#1a2440] to-[#0b1020] font-rc-mono text-sm text-rc-fg-strong tabular-nums">
          {order}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="m-0 font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong">
              {title}
            </h3>
            {isComplete && <Badge tone="ok">Complete</Badge>}
            {isCurrent && !isComplete && (
              <Badge tone="gold">In Progress</Badge>
            )}
          </div>
          <p className="mt-1.5 line-clamp-2 font-rc-sans text-sm leading-relaxed text-rc-fg-muted">
            {description}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3 font-rc-mono text-[11px] tracking-[0.1em] text-rc-fg-dim">
            <span>{stepCount} steps</span>
            {isCurrent && !isComplete && (
              <span className="text-rc-accent-link">
                Resume from step {resumeStep + 1}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
