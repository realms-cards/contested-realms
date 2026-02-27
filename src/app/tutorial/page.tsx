"use client";

/**
 * Tutorial lesson selection page.
 *
 * Shows all available tutorial lessons with completion status.
 * Feature-gated via NEXT_PUBLIC_FEATURE_TUTORIAL_MODE.
 */

import { redirect } from "next/navigation";
import { TutorialLessonSelect } from "@/components/tutorial/TutorialLessonSelect";
import { isFeatureEnabled } from "@/lib/config/features";

export default function TutorialPage() {
  if (!isFeatureEnabled("tutorialMode")) {
    redirect("/online/lobby");
  }

  return <TutorialLessonSelect />;
}
