"use client";

/**
 * TutorialLessonSelect — Lesson selection screen for the tutorial.
 *
 * Shows all available lessons with completion status, descriptions,
 * and a start/resume button for each. Progress is read from localStorage.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
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

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Learn to Play</h1>
        <p className="mt-2 text-sm text-slate-400">
          Complete these interactive lessons to learn the rules of Sorcery:
          Contested Realm. Each lesson builds on the previous one.
        </p>

        {/* Overall progress */}
        {progress && completedCount > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>
                {completedCount} of {totalCount} lessons complete
              </span>
              <span>{Math.round((completedCount / totalCount) * 100)}%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-500"
                style={{
                  width: `${(completedCount / totalCount) * 100}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>

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
        <div className="mt-8 flex justify-end">
          <button
            onClick={handleReset}
            className="text-xs text-slate-500 hover:text-red-400 transition-colors"
          >
            Reset Progress
          </button>
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
      className={`block rounded-xl p-4 ring-1 transition-all hover:ring-2 ${
        isComplete
          ? "bg-slate-900/50 ring-emerald-800/50 hover:ring-emerald-600/60"
          : isCurrent
            ? "bg-slate-900/70 ring-violet-700/60 hover:ring-violet-500/70"
            : "bg-slate-900/60 ring-slate-700/50 hover:ring-slate-500/60"
      }`}
    >
      <div className="flex items-start gap-4">
        {/* Order number / status */}
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
            isComplete
              ? "bg-emerald-600/30 text-emerald-400"
              : isCurrent
                ? "bg-violet-600/30 text-violet-400"
                : "bg-slate-700/50 text-slate-400"
          }`}
        >
          {isComplete ? (
            <CheckIcon />
          ) : (
            order
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-white">{title}</h3>
            {isCurrent && !isComplete && (
              <span className="rounded bg-violet-600/30 px-1.5 py-0.5 text-[10px] font-medium text-violet-300">
                In Progress
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-400 line-clamp-2">
            {description}
          </p>
          <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-500">
            <span>{stepCount} steps</span>
            {isCurrent && !isComplete && (
              <span className="text-violet-400">
                Resume from step {resumeStep + 1}
              </span>
            )}
          </div>
        </div>

        {/* Action arrow */}
        <div className="shrink-0 self-center text-slate-500">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </Link>
  );
}

function CheckIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  );
}
