"use client";

/**
 * useTutorialSession — React hook that manages a tutorial lesson session.
 *
 * Creates and connects the TutorialEngine with state management, handles
 * step progression, hint display, progress persistence, and lesson completion.
 * Also seeds the game store with the lesson's initial state and applies
 * state patches as the lesson progresses.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGameStore } from "@/lib/game/store";
import { TutorialEngine } from "@/lib/tutorial/TutorialEngine";
import { getLessonById, getNextLesson } from "@/lib/tutorial/lessons";
import { markLessonComplete, saveCheckpoint } from "@/lib/tutorial/progress";
import {
  applyTutorialPatches,
  resetInstanceCounter,
  tutorialStateToStore,
} from "@/lib/tutorial/tutorialStateAdapter";
import type { TutorialAction, TutorialHudElement, TutorialStep, TutorialStatePatch } from "@/lib/tutorial/types";
import { cellKeyToTile } from "@/lib/tutorial/types";

/** Which HUD elements are visible based on progressive disclosure. */
export interface TutorialHudVisibility {
  lifeCounters: boolean;
  hand: boolean;
  piles: boolean;
  resourcePanels: boolean;
}

export interface TutorialSessionState {
  /** The current tutorial step, or null if lesson is complete. */
  currentStep: TutorialStep | null;
  /** Current step index. */
  stepIndex: number;
  /** Total steps in the lesson. */
  stepCount: number;
  /** The lesson title. */
  lessonTitle: string;
  /** Whether the lesson has been completed. */
  isComplete: boolean;
  /** The id of the next lesson, or null if this is the last one. */
  nextLessonId: string | null;
  /** Active hint message, or null. */
  hint: string | null;
  /** Whether the game store has been initialized with the lesson state. */
  storeReady: boolean;
  /** Which HUD elements should be visible (progressive disclosure). */
  visibleHud: TutorialHudVisibility;
  /** Advance to the next step (for narration/highlight/checkpoint). */
  advance: () => void;
  /** Go back to the previous narration/highlight/checkpoint step. */
  goBack: () => void;
  /** Whether going back is possible from the current step. */
  canGoBack: boolean;
  /** Validate a player action (for forced_action steps). */
  validateAction: (action: TutorialAction) => boolean;
  /** Dismiss the current hint. */
  dismissHint: () => void;
}

export function useTutorialSession(
  lessonId: string,
  initialStep = 0
): TutorialSessionState {
  const engineRef = useRef<TutorialEngine | null>(null);
  const [currentStep, setCurrentStep] = useState<TutorialStep | null>(null);
  const [stepIndex, setStepIndex] = useState(initialStep);
  const [isComplete, setIsComplete] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [storeReady, setStoreReady] = useState(false);
  const [hudReveals, setHudReveals] = useState<Set<TutorialHudElement>>(new Set());

  const lesson = getLessonById(lessonId);
  const nextLesson = lesson ? getNextLesson(lesson.id) : undefined;

  // Seed game store with initial lesson state
  useEffect(() => {
    if (!lesson) return;

    resetInstanceCounter();

    // Reset store to clean defaults first
    useGameStore.getState().resetGameState();

    // Apply tutorial initial state
    const storeState = tutorialStateToStore(lesson.initialState);
    useGameStore.setState(storeState);

    // Enable card previews for tutorial
    useGameStore.getState().setCardPreviewsEnabled(true);

    setStoreReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId]);

  // Apply pending state patches to the game store
  const applyPatches = useCallback((patches: TutorialStatePatch[]) => {
    if (patches.length === 0) return;
    const current = useGameStore.getState() as unknown as Record<string, unknown>;
    const updated = applyTutorialPatches(patches, current);
    useGameStore.setState(updated);
  }, []);

  // Initialize engine
  useEffect(() => {
    if (!lesson) return;

    const engine = new TutorialEngine(
      lesson,
      {
        onStepChanged: (step, idx) => {
          setCurrentStep(step);
          setStepIndex(idx);
          setHint(null);
          // Save checkpoint for non-narration steps
          if (step.type === "checkpoint") {
            saveCheckpoint(lesson.id, idx);
          }
        },
        onLessonComplete: () => {
          setIsComplete(true);
          setCurrentStep(null);
          markLessonComplete(lesson.id);
        },
        onHint: (message) => {
          setHint(message);
        },
        onScriptedAction: () => {
          // Scripted actions are handled via patches applied by the engine
        },
        onApplyPatches: (patches) => {
          applyPatches(patches);
        },
      },
      initialStep
    );

    engineRef.current = engine;
    engine.start();

    return () => {
      engineRef.current = null;
    };
    // Only re-initialize when lesson changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId]);

  const advance = useCallback(() => {
    engineRef.current?.advance();
  }, []);

  const goBack = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || !lesson) return;

    // Let the engine navigate back and get the target step
    const targetStep = engine.goBack();
    if (!targetStep) return;
    const targetIndex = engine.stepIndex;

    // Reset game store to lesson's initial state
    resetInstanceCounter();
    useGameStore.getState().resetGameState();
    const storeState = tutorialStateToStore(lesson.initialState);
    useGameStore.setState(storeState);
    useGameStore.getState().setCardPreviewsEnabled(true);

    // Re-apply all patches for steps we've already advanced past (0..targetIndex-1)
    // Patches are applied when LEAVING a step, so at step N, patches from 0..N-1 are active
    for (let i = 0; i < targetIndex; i++) {
      const step = lesson.steps[i];
      if (step.statePatches?.length) {
        const current = useGameStore.getState() as unknown as Record<string, unknown>;
        const updated = applyTutorialPatches(step.statePatches, current);
        useGameStore.setState(updated);
      }
    }

    // Recompute HUD reveals for steps 0..targetIndex
    const newReveals = new Set<TutorialHudElement>();
    for (let i = 0; i <= targetIndex; i++) {
      const step = lesson.steps[i];
      if (step.revealHud) {
        for (const el of step.revealHud) {
          newReveals.add(el);
        }
      }
    }
    setHudReveals(newReveals);
  }, [lesson]);

  // Can go back if we're past the first step and on a narration/highlight/checkpoint
  const canGoBack =
    stepIndex > 0 &&
    !!currentStep &&
    (currentStep.type === "narration" ||
      currentStep.type === "highlight" ||
      currentStep.type === "checkpoint");

  const validateAction = useCallback((action: TutorialAction): boolean => {
    return engineRef.current?.validateAction(action) ?? false;
  }, []);

  const dismissHint = useCallback(() => {
    setHint(null);
  }, []);

  // Tutorial action gate: always active during tutorial.
  // - On forced_action steps: only the required action is allowed.
  // - On all other steps: all tile-based actions (play, move) are blocked.
  useEffect(() => {
    if (!currentStep) {
      useGameStore.getState().setTutorialActionGate({
        active: false,
        validate: null,
        onReject: null,
      });
      return;
    }

    const isForcedAction = currentStep.type === "forced_action" && !!currentStep.requiredAction;
    const required = isForcedAction ? currentStep.requiredAction : undefined;
    const hintMsg = currentStep.hintText;

    const validate = (actionType: string, x: number, y: number, cardName?: string): boolean => {
      // If not a forced_action step, block all tile-based actions
      if (!isForcedAction || !required) {
        return false;
      }

      const tileNum = cellKeyToTile(`${x},${y}` as `${number},${number}`);
      let matched = false;

      if (actionType === "play") {
        if (required.type === "play_site") {
          matched = tileNum === required.tile && (cardName ?? "") === required.cardName;
        } else if (required.type === "cast_spell") {
          matched = tileNum === required.tile && (cardName ?? "") === required.cardName;
        }
      } else if (actionType === "move") {
        if (required.type === "move_unit") {
          matched = tileNum === required.to && (cardName ?? "") === required.unitName;
        }
      } else {
        // For other action types (end_turn, draw, etc.), don't block via tile gate
        return true;
      }

      if (matched) {
        // Advance the tutorial engine after the game store finishes processing
        setTimeout(() => {
          engineRef.current?.advance();
        }, 100);
      }

      return matched;
    };

    const onReject = (_actionType: string, _x: number, _y: number, _cardName?: string) => {
      if (!isForcedAction) {
        setHint("Follow the tutorial steps before taking actions.");
        return;
      }
      const msg = hintMsg ?? getDefaultHintForAction(required!);
      setHint(msg);
    };

    useGameStore.getState().setTutorialActionGate({
      active: true,
      validate,
      onReject,
    });

    return () => {
      useGameStore.getState().setTutorialActionGate({
        active: false,
        validate: null,
        onReject: null,
      });
    };
  }, [currentStep]);

  // Accumulate step-level HUD reveals as the player progresses
  useEffect(() => {
    if (!currentStep?.revealHud) return;
    setHudReveals((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const el of currentStep.revealHud!) {
        if (!next.has(el)) {
          next.add(el);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [currentStep]);

  // Progressive disclosure: determine which HUD elements to show.
  // Lesson-level defaults provide a baseline, step-level `revealHud` overrides them.
  //   Lesson 3+: Life counters, Hand, Piles
  //   Lesson 4+: Resource panels
  // Earlier lessons use step-level `revealHud` to introduce elements at the right moment.
  const visibleHud = useMemo<TutorialHudVisibility>(() => {
    const order = lesson?.order ?? 0;
    return {
      lifeCounters: order >= 3 || hudReveals.has("lifeCounters"),
      hand: order >= 3 || hudReveals.has("hand"),
      piles: order >= 3 || hudReveals.has("piles"),
      resourcePanels: order >= 4 || hudReveals.has("resourcePanels"),
    };
  }, [lesson?.order, hudReveals]);

  return {
    currentStep,
    stepIndex,
    stepCount: lesson?.steps.length ?? 0,
    lessonTitle: lesson?.title ?? "Tutorial",
    isComplete,
    nextLessonId: nextLesson?.id ?? null,
    hint,
    storeReady,
    visibleHud,
    advance,
    goBack,
    canGoBack,
    validateAction,
    dismissHint,
  };
}

/** Generate a default hint when a required action is rejected. */
function getDefaultHintForAction(action: TutorialAction): string {
  switch (action.type) {
    case "play_site":
      return `Place the ${action.cardName} on tile ${action.tile}.`;
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
