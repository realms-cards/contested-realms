/**
 * Tutorial progress persistence via localStorage.
 *
 * Tracks which lessons the player has completed and where they left off
 * in an in-progress lesson. Safe for SSR — all reads return defaults
 * when window is unavailable.
 */

import type { TutorialProgress } from "./types";

const STORAGE_KEY = "sorcery_tutorial_progress";

const DEFAULT_PROGRESS: TutorialProgress = {
  completedLessons: [],
  currentLesson: null,
  currentStep: 0,
  lastAccessed: 0,
};

/** Read persisted tutorial progress (returns defaults if unavailable). */
export function getTutorialProgress(): TutorialProgress {
  if (typeof window === "undefined") return { ...DEFAULT_PROGRESS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PROGRESS };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_PROGRESS };
    const p = parsed as Record<string, unknown>;
    return {
      completedLessons: Array.isArray(p.completedLessons)
        ? (p.completedLessons as string[])
        : [],
      currentLesson:
        typeof p.currentLesson === "string" ? p.currentLesson : null,
      currentStep:
        typeof p.currentStep === "number" ? p.currentStep : 0,
      lastAccessed:
        typeof p.lastAccessed === "number" ? p.lastAccessed : 0,
    };
  } catch {
    return { ...DEFAULT_PROGRESS };
  }
}

/** Write tutorial progress to localStorage. */
export function saveTutorialProgress(progress: TutorialProgress): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...progress, lastAccessed: Date.now() })
    );
  } catch {
    // localStorage might be full or unavailable — ignore
  }
}

/** Mark a lesson as completed and clear current lesson if it matches. */
export function markLessonComplete(lessonId: string): void {
  const progress = getTutorialProgress();
  if (!progress.completedLessons.includes(lessonId)) {
    progress.completedLessons.push(lessonId);
  }
  if (progress.currentLesson === lessonId) {
    progress.currentLesson = null;
    progress.currentStep = 0;
  }
  saveTutorialProgress(progress);
}

/** Save checkpoint: remember current lesson and step. */
export function saveCheckpoint(lessonId: string, stepIndex: number): void {
  const progress = getTutorialProgress();
  progress.currentLesson = lessonId;
  progress.currentStep = stepIndex;
  saveTutorialProgress(progress);
}

/** Check whether a specific lesson has been completed. */
export function isLessonComplete(lessonId: string): boolean {
  return getTutorialProgress().completedLessons.includes(lessonId);
}

/** Reset all tutorial progress. */
export function resetTutorialProgress(): void {
  saveTutorialProgress({ ...DEFAULT_PROGRESS });
}
