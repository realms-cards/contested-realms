/**
 * Tutorial lesson registry.
 * Lessons are ordered and imported statically for tree-shaking.
 */

import type { TutorialLesson } from "../types";
import lesson01 from "./lesson-01-welcome";
import lesson02 from "./lesson-02-setup";
import lesson03 from "./lesson-03-sites-mana";
import lesson04 from "./lesson-04-thresholds";
import lesson05 from "./lesson-05-summoning";
import lesson06 from "./lesson-06-movement";
import lesson07 from "./lesson-07-defending";
import lesson08 from "./lesson-08-winning";

/** All tutorial lessons in display order. */
export const ALL_LESSONS: readonly TutorialLesson[] = [
  lesson01,
  lesson02,
  lesson03,
  lesson04,
  lesson05,
  lesson06,
  lesson07,
  lesson08,
] as const;

/** Look up a lesson by its id. */
export function getLessonById(id: string): TutorialLesson | undefined {
  return ALL_LESSONS.find((l) => l.id === id);
}

/** Get the next lesson after the given id, or undefined if it was the last. */
export function getNextLesson(currentId: string): TutorialLesson | undefined {
  const idx = ALL_LESSONS.findIndex((l) => l.id === currentId);
  if (idx === -1 || idx >= ALL_LESSONS.length - 1) return undefined;
  return ALL_LESSONS[idx + 1];
}
