"use client";

/**
 * Tutorial lesson gameplay page.
 *
 * Renders the tutorial engine overlay on top of the real 3D game board.
 * The player follows scripted steps to learn the game rules.
 */

import { Icon } from "@iconify/react";
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
import { RcLinkButton } from "@/components/ui/rc-button";
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
      <main className="flex min-h-screen flex-col items-center justify-center text-rc-fg">
        <h1 className="m-0 font-rc-display text-[26px] leading-none text-rc-fg-strong">Lesson Not Found</h1>
        <p className="mt-2 font-rc-sans text-sm text-rc-fg-muted">
          The lesson &quot;{lessonId}&quot; doesn&apos;t exist.
        </p>
        <Link
          href="/tutorial"
          className="rc-link mt-4 font-rc-sans text-sm"
        >
          Back to Lessons
        </Link>
      </main>
    );
  }

  // Lesson complete screen
  if (session.isComplete) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center text-rc-fg">
        <div className="mx-auto max-w-md text-center">
          <div className="mb-4 flex justify-center text-rc-accent">
            <Icon icon="game-icons:laurels-trophy" width={48} height={48} aria-hidden="true" />
          </div>
          <h1 className="m-0 font-rc-display text-[28px] leading-[1.1] text-rc-fg-strong">
            {session.lessonTitle} — Complete!
          </h1>
          <p className="mt-3 font-rc-sans text-sm text-rc-fg-muted">
            You&apos;ve successfully completed this lesson.
          </p>

          <div className="mt-8 flex flex-col gap-3">
            {session.nextLessonId ? (
              <>
                <RcLinkButton
                  href={`/tutorial/${session.nextLessonId}`}
                  size="lg"
                >
                  Next Lesson
                </RcLinkButton>
                <RcLinkButton
                  href="/tutorial"
                  variant="outline"
                  size="lg"
                >
                  Back to All Lessons
                </RcLinkButton>
              </>
            ) : (
              <>
                <RcLinkButton
                  href="/online/lobby"
                  size="lg"
                >
                  Go to Online Lobby
                </RcLinkButton>
                <RcLinkButton
                  href="/tutorial"
                  variant="outline"
                  size="lg"
                >
                  Back to All Lessons
                </RcLinkButton>
              </>
            )}
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
    <main className="fixed inset-0 z-20 overflow-hidden bg-rc-floor">
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
        avoidLeftHud={!!visibleHud.lifeCounters}
      />
    </main>
  );
}

const PLAYER_NAMES = { p1: "You", p2: "Opponent" } as const;

export default function TutorialLessonPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center">
          <div className="font-rc-mono text-sm text-rc-fg-muted">Loading tutorial...</div>
        </main>
      }
    >
      <TutorialLessonContent />
    </Suspense>
  );
}
