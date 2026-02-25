/**
 * TutorialEngine — Drives scripted tutorial lessons.
 *
 * Manages step progression, validates player actions against forced_action
 * steps, executes scripted opponent actions, and applies state patches.
 */

import type {
  TutorialAction,
  TutorialLesson,
  TutorialStatePatch,
  TutorialStep,
} from "./types";

/** Events emitted by the engine to the UI layer. */
export interface TutorialEngineEvents {
  /** A new step is now active and should be displayed. */
  onStepChanged: (step: TutorialStep, index: number) => void;
  /** The lesson is complete. */
  onLessonComplete: () => void;
  /** The player performed an incorrect action — show a hint. */
  onHint: (message: string) => void;
  /** A scripted action was executed — animate it. */
  onScriptedAction: (action: TutorialAction) => void;
  /** State patches should be applied to the game store. */
  onApplyPatches: (patches: TutorialStatePatch[]) => void;
}

export class TutorialEngine {
  private readonly lesson: TutorialLesson;
  private currentStepIndex: number;
  private readonly events: Partial<TutorialEngineEvents>;
  private completed: boolean;

  constructor(
    lesson: TutorialLesson,
    events: Partial<TutorialEngineEvents> = {},
    resumeAtStep = 0
  ) {
    this.lesson = lesson;
    this.currentStepIndex = Math.min(
      resumeAtStep,
      lesson.steps.length - 1
    );
    this.events = events;
    this.completed = false;
  }

  // ──────────────────── Getters ────────────────────

  get lessonId(): string {
    return this.lesson.id;
  }

  get stepCount(): number {
    return this.lesson.steps.length;
  }

  get stepIndex(): number {
    return this.currentStepIndex;
  }

  get isComplete(): boolean {
    return this.completed;
  }

  getCurrentStep(): TutorialStep | null {
    if (this.completed) return null;
    return this.lesson.steps[this.currentStepIndex] ?? null;
  }

  getProgress(): number {
    if (this.lesson.steps.length === 0) return 1;
    if (this.completed) return 1;
    return this.currentStepIndex / this.lesson.steps.length;
  }

  // ──────────────────── Step Lifecycle ────────────────────

  /**
   * Start the lesson (or resume). Emits onStepChanged for the current step.
   */
  start(): void {
    const step = this.getCurrentStep();
    if (step) {
      this.events.onStepChanged?.(step, this.currentStepIndex);
      this.autoProcessStep(step);
    }
  }

  /**
   * Advance to the next step. Called by the UI after the player clicks "Next"
   * on narration/highlight/checkpoint steps, or internally after a
   * forced_action or scripted_action resolves.
   */
  advance(): TutorialStep | null {
    if (this.completed) return null;

    // Apply any state patches from the current step before advancing
    const currentStep = this.getCurrentStep();
    if (currentStep?.statePatches?.length) {
      this.events.onApplyPatches?.(currentStep.statePatches);
    }

    this.currentStepIndex++;

    if (this.currentStepIndex >= this.lesson.steps.length) {
      this.completed = true;
      this.events.onLessonComplete?.();
      return null;
    }

    const nextStep = this.lesson.steps[this.currentStepIndex];
    this.events.onStepChanged?.(nextStep, this.currentStepIndex);
    this.autoProcessStep(nextStep);
    return nextStep;
  }

  /**
   * Go back to the previous step (for narration/highlight/checkpoint review).
   * Only goes back to the most recent narration/highlight/checkpoint step —
   * forced_action and scripted_action steps modify state and can't be undone.
   */
  goBack(): TutorialStep | null {
    if (this.completed || this.currentStepIndex <= 0) return null;

    // Walk backwards to find a safe step to land on
    let target = this.currentStepIndex - 1;
    while (target >= 0) {
      const step = this.lesson.steps[target];
      if (
        step.type === "narration" ||
        step.type === "highlight" ||
        step.type === "checkpoint"
      ) {
        break;
      }
      target--;
    }
    if (target < 0) return null;

    this.currentStepIndex = target;
    const step = this.lesson.steps[target];
    this.events.onStepChanged?.(step, target);
    return step;
  }

  /**
   * Validate a player action against the current forced_action step.
   * Returns true if the action matches and the step advances.
   */
  validateAction(action: TutorialAction): boolean {
    const step = this.getCurrentStep();
    if (!step || step.type !== "forced_action" || !step.requiredAction) {
      return false;
    }

    if (actionsMatch(action, step.requiredAction)) {
      // Action is correct — advance
      this.advance();
      return true;
    }

    // Wrong action — emit hint
    const hint =
      step.hintText ?? getDefaultHint(step.requiredAction);
    this.events.onHint?.(hint);
    return false;
  }

  // ──────────────────── Internal ────────────────────

  /**
   * Auto-process steps that don't require user interaction:
   * - scripted_action: execute immediately, then advance
   * - wait: schedule advance after duration
   */
  private autoProcessStep(step: TutorialStep): void {
    if (step.type === "scripted_action" && step.scriptedAction) {
      this.events.onScriptedAction?.(step.scriptedAction);
      // Give UI time to animate, then auto-advance
      setTimeout(() => this.advance(), step.duration ?? 1200);
    } else if (step.type === "wait") {
      setTimeout(() => this.advance(), step.duration ?? 1000);
    }
  }
}

// ──────────────────── Helpers ────────────────────

/** Compare two tutorial actions for semantic equality. */
function actionsMatch(
  actual: TutorialAction,
  expected: TutorialAction
): boolean {
  if (actual.type !== expected.type) return false;

  switch (actual.type) {
    case "play_site": {
      const exp = expected as Extract<TutorialAction, { type: "play_site" }>;
      return actual.cardName === exp.cardName && actual.tile === exp.tile;
    }
    case "cast_spell": {
      const exp = expected as Extract<TutorialAction, { type: "cast_spell" }>;
      return actual.cardName === exp.cardName && actual.tile === exp.tile;
    }
    case "move_unit": {
      const exp = expected as Extract<TutorialAction, { type: "move_unit" }>;
      return (
        actual.unitName === exp.unitName &&
        actual.from === exp.from &&
        actual.to === exp.to
      );
    }
    case "attack": {
      const exp = expected as Extract<TutorialAction, { type: "attack" }>;
      return (
        actual.attackerName === exp.attackerName &&
        actual.targetName === exp.targetName
      );
    }
    case "draw": {
      const exp = expected as Extract<TutorialAction, { type: "draw" }>;
      return actual.deck === exp.deck;
    }
    case "end_turn":
    case "tap_avatar":
    case "pass":
      return true;
    default:
      return false;
  }
}

/** Generate a default hint for a required action. */
function getDefaultHint(action: TutorialAction): string {
  switch (action.type) {
    case "play_site":
      return `Try placing the ${action.cardName} site on tile ${action.tile}.`;
    case "cast_spell":
      return `Cast ${action.cardName} on tile ${action.tile}.`;
    case "move_unit":
      return `Move your ${action.unitName} to tile ${action.to}.`;
    case "attack":
      return `Attack ${action.targetName} with your ${action.attackerName}.`;
    case "end_turn":
      return "Click the End Turn button to finish your turn.";
    case "draw":
      return `Draw a card from your ${action.deck}.`;
    case "tap_avatar":
      return "Tap your Avatar to activate their ability.";
    case "pass":
      return "Click Pass to continue.";
  }
}
