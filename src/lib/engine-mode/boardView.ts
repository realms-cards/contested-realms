"use client";

import { useEffect, useState } from "react";
import { useGraphicsSettings, type BoardViewPreference } from "@/hooks/useGraphicsSettings";

export type BoardView = "2d" | "3d";

/** What "auto" looks at: the viewport in CSS pixels and whether the main pointer is a finger. */
export interface BoardViewEnv {
  width: number;
  height: number;
  coarsePointer: boolean;
}

/** A finger-driven screen whose short side is this or less is a phone, in either orientation. */
const PHONE_SHORT_SIDE_MAX = 600;
/** Any window narrower than this gets the flat board, pointer or not: the 3D HUD does not fit. */
const NARROW_WIDTH_MIN = 640;
/** How long resize / orientation events settle before the view is re-decided. */
export const BOARD_VIEW_DEBOUNCE_MS = 250;

/**
 * The board engine mode should draw. An explicit choice always wins; "auto" (and anything
 * unrecognised that an old or hand-edited localStorage entry might hold) picks 2D for phones
 * and very narrow windows and 3D for everything else, tablets included.
 */
export function resolveBoardView(
  pref: BoardViewPreference,
  env: BoardViewEnv,
): BoardView {
  if (pref === "2d" || pref === "3d") return pref;
  const shortSide = Math.min(env.width, env.height);
  if (env.coarsePointer && shortSide <= PHONE_SHORT_SIDE_MAX) return "2d";
  if (env.width < NARROW_WIDTH_MIN) return "2d";
  return "3d";
}

function readEnv(): BoardViewEnv {
  const coarsePointer =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;
  return { width: window.innerWidth, height: window.innerHeight, coarsePointer };
}

/**
 * `resolveBoardView` for this device, kept current across resizes and rotations.
 *
 * `null` until mounted and the stored preference is read, so the caller can render neither
 * board yet — a phone must never start loading the 3D bundle only to be switched off it.
 */
export function useResolvedBoardView(): BoardView | null {
  const { settings, isLoaded } = useGraphicsSettings();
  const [env, setEnv] = useState<BoardViewEnv | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const measure = () => {
      timer = null;
      const next = readEnv();
      // keep the old object when nothing changed, so a no-op resize doesn't re-render
      setEnv((prev) =>
        prev &&
        prev.width === next.width &&
        prev.height === next.height &&
        prev.coarsePointer === next.coarsePointer
          ? prev
          : next,
      );
    };
    const schedule = () => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(measure, BOARD_VIEW_DEBOUNCE_MS);
    };
    measure();
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    // a convertible switching between touch and mouse changes the pointer without a resize
    const pointer =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(pointer: coarse)")
        : null;
    pointer?.addEventListener?.("change", schedule);
    return () => {
      if (timer !== null) clearTimeout(timer);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      pointer?.removeEventListener?.("change", schedule);
    };
  }, []);

  if (!isLoaded || !env) return null;
  return resolveBoardView(settings.boardView, env);
}
