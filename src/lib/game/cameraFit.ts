/**
 * Camera fitting helpers for the match view.
 *
 * On phones the top-down camera should frame the playable grid as large as the
 * HUD allows instead of using the desktop "1.1 × mat width" heuristic, which
 * leaves the board tiny in landscape and crops the outer columns in portrait.
 */

export interface ViewportInsets {
  /** Pixels reserved at the top of the viewport (status bar). */
  top: number;
  /** Pixels reserved at the bottom (hand peek strip). */
  bottom: number;
  /** Pixels reserved on the left (life counters). */
  left: number;
  /** Pixels reserved on the right (mana / threshold panel). */
  right: number;
}

/** HUD reservations for phones in landscape (side panels flank the board). */
export const PHONE_HUD_INSETS: ViewportInsets = {
  top: 44,
  bottom: 52,
  left: 36,
  right: 36,
};

/**
 * HUD reservations for phones in portrait. The side panels move above the
 * board there, so the grid may use almost the full width.
 */
export const PHONE_HUD_INSETS_PORTRAIT: ViewportInsets = {
  top: 44,
  bottom: 52,
  left: 12,
  right: 12,
};

/** Pick the phone HUD reservation matching the viewport orientation. */
export function phoneHudInsets(
  viewportW: number,
  viewportH: number,
): ViewportInsets {
  return viewportW < viewportH ? PHONE_HUD_INSETS_PORTRAIT : PHONE_HUD_INSETS;
}

export interface TopdownFitOptions {
  /** Grid width in world units. */
  gridW: number;
  /** Grid height in world units. */
  gridH: number;
  /** Viewport width in CSS pixels. */
  viewportW: number;
  /** Viewport height in CSS pixels. */
  viewportH: number;
  /** Vertical field of view in degrees (three.js PerspectiveCamera.fov). */
  fovDeg: number;
  /** HUD reservations. Defaults to {@link PHONE_HUD_INSETS}. */
  insets?: ViewportInsets;
  /** Extra breathing room around the grid (1 = tight). Default 1.04. */
  margin?: number;
}

/**
 * Distance from the board centre a straight-down perspective camera needs so
 * the whole grid (plus margin) fits inside the viewport area not covered by the
 * HUD. Works for both orientations: landscape is height-bound, portrait is
 * width-bound.
 */
export function computeTopdownFitDistance({
  gridW,
  gridH,
  viewportW,
  viewportH,
  fovDeg,
  insets = PHONE_HUD_INSETS,
  margin = 1.04,
}: TopdownFitOptions): number {
  const vw = Math.max(1, viewportW);
  const vh = Math.max(1, viewportH);
  const usableW = Math.max(1, vw - insets.left - insets.right);
  const usableH = Math.max(1, vh - insets.top - insets.bottom);
  const halfTan = Math.tan((fovDeg * Math.PI) / 360);
  const aspect = vw / vh;

  // World extents that must be visible so the grid occupies only the usable
  // (non-HUD) portion of the viewport.
  const needH = gridH * margin * (vh / usableH);
  const needW = gridW * margin * (vw / usableW);

  const distForHeight = needH / (2 * halfTan);
  const distForWidth = needW / (2 * halfTan * aspect);
  return Math.max(distForHeight, distForWidth);
}
