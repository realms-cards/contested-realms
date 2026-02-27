"use client";

/**
 * Tutorial lesson gameplay page.
 *
 * Renders the tutorial engine overlay on top of the real 3D game board.
 * The player follows scripted steps to learn the game rules.
 */

import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import CardPreview from "@/components/game/CardPreview";
import OnlineLifeCounters from "@/components/game/OnlineLifeCounters";
import PlayerResourcePanels from "@/components/game/PlayerResourcePanel";
import { TutorialHighlight } from "@/components/tutorial/TutorialHighlight";
import { TutorialOverlay } from "@/components/tutorial/TutorialOverlay";
import { useTutorialSession } from "@/components/tutorial/useTutorialSession";
import { isFeatureEnabled } from "@/lib/config/features";
import { createCardPreviewData } from "@/lib/game/card-preview.types";
import { useGameStore } from "@/lib/game/store";

/** Dynamic import — keeps Three.js / R3F out of the server bundle. */
const TutorialBoard3D = dynamic(
  () => import("@/components/tutorial/TutorialBoard3D"),
  { ssr: false }
);

function TutorialLessonContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const lessonId = params && typeof params.lessonId === "string" ? params.lessonId : "";
  const startStep = Number(searchParams?.get("step") ?? "0") || 0;

  const session = useTutorialSession(lessonId, startStep);
  const previewCard = useGameStore((s) => s.previewCard);
  const cardPreviewsEnabled = useGameStore((s) => s.cardPreviewsEnabled);

  if (!isFeatureEnabled("tutorialMode")) {
    router.replace("/online/lobby");
    return null;
  }

  // Lesson not found
  if (session.stepCount === 0) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-slate-950 text-white">
        <h1 className="text-xl font-bold">Lesson Not Found</h1>
        <p className="mt-2 text-sm text-slate-400">
          The lesson &quot;{lessonId}&quot; doesn&apos;t exist.
        </p>
        <Link
          href="/tutorial"
          className="mt-4 text-sm text-violet-400 hover:text-violet-300"
        >
          Back to Lessons
        </Link>
      </main>
    );
  }

  // Lesson complete screen
  if (session.isComplete) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        <div className="mx-auto max-w-md text-center">
          <div className="mb-4 text-5xl">&#127942;</div>
          <h1 className="text-2xl font-bold text-white">
            {session.lessonTitle} — Complete!
          </h1>
          <p className="mt-3 text-sm text-slate-400">
            You&apos;ve successfully completed this lesson.
          </p>

          <div className="mt-8 flex flex-col gap-3">
            {session.nextLessonId && (
              <Link
                href={`/tutorial/${session.nextLessonId}`}
                className="rounded-lg bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 px-6 py-3 text-sm font-semibold text-white transition-all shadow-md"
              >
                Next Lesson
              </Link>
            )}

            <Link
              href="/tutorial"
              className="rounded-lg bg-slate-800 hover:bg-slate-700 px-6 py-3 text-sm text-slate-300 transition-colors"
            >
              Back to All Lessons
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // Active tutorial with 3D board
  const { visibleHud } = session;

  const highlightTarget = session.currentStep?.highlightTarget;
  const highlightVisible =
    !!highlightTarget &&
    (session.currentStep?.type === "highlight" ||
      session.currentStep?.type === "narration" ||
      (session.currentStep?.type === "forced_action" &&
        !!session.currentStep?.showHint));

  return (
    <main className="fixed inset-0 z-20 overflow-hidden bg-slate-950">
      {/* 3D game board — always mounted to avoid WebGL context loss */}
      <TutorialBoard3D
        visibleHud={visibleHud}
        highlightTarget={highlightTarget}
        highlightVisible={highlightVisible}
      />

      {/* 2D HUD overlays — progressively revealed as concepts are introduced */}
      {visibleHud.lifeCounters && (
        <OnlineLifeCounters
          dragFromHand={false}
          myPlayerKey="p1"
          playerNames={PLAYER_NAMES}
          showYouLabels={false}
        />
      )}
      {visibleHud.resourcePanels && (
        <PlayerResourcePanels
          myPlayerKey="p1"
          playerNames={PLAYER_NAMES}
          showYouLabels={false}
          readOnly
          dragFromHand={false}
        />
      )}

      {/* 2D Highlight effect — only for non-board targets (hand, piles, UI) */}
      {session.currentStep && (
        <TutorialHighlight
          target={session.currentStep.highlightTarget}
          visible={highlightVisible}
        />
      )}

      {/* Card preview on hover */}
      {cardPreviewsEnabled && previewCard && (
        <CardPreview
          card={createCardPreviewData({
            slug: previewCard.slug,
            name: previewCard.name,
            type: previewCard.type,
          })}
          anchor="top-right"
        />
      )}

      {/* Tutorial overlay (narration, controls) */}
      <TutorialOverlay
        step={session.currentStep}
        stepIndex={session.stepIndex}
        stepCount={session.stepCount}
        onAdvance={session.advance}
        onBack={session.goBack}
        canGoBack={session.canGoBack}
        onSkip={() => router.push("/tutorial")}
        hint={session.hint}
        onDismissHint={session.dismissHint}
      />
    </main>
  );
}

const PLAYER_NAMES = { p1: "You", p2: "Opponent" } as const;

export default function TutorialLessonPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-950">
          <div className="text-sm text-slate-400">Loading tutorial...</div>
        </main>
      }
    >
      <TutorialLessonContent />
    </Suspense>
  );
}
