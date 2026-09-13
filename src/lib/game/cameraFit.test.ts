import { describe, expect, it } from "vitest";
import { computeTopdownFitDistance } from "./cameraFit";

const FOV = 50;
const halfTan = Math.tan((FOV * Math.PI) / 360);
const noInsets = { top: 0, bottom: 0, left: 0, right: 0 };

/** Visible world width/height at a given distance for the given viewport. */
function visible(dist: number, vw: number, vh: number) {
  const h = 2 * dist * halfTan;
  return { w: h * (vw / vh), h };
}

describe("computeTopdownFitDistance", () => {
  it("fits the grid height on a landscape phone", () => {
    const dist = computeTopdownFitDistance({
      gridW: 7,
      gridH: 5.6,
      viewportW: 932,
      viewportH: 430,
      fovDeg: FOV,
      insets: noInsets,
      margin: 1,
    });
    const v = visible(dist, 932, 430);
    expect(v.h).toBeCloseTo(5.6, 5);
    expect(v.w).toBeGreaterThan(7);
  });

  it("fits the grid width on a portrait phone", () => {
    const dist = computeTopdownFitDistance({
      gridW: 7,
      gridH: 5.6,
      viewportW: 430,
      viewportH: 932,
      fovDeg: FOV,
      insets: noInsets,
      margin: 1,
    });
    const v = visible(dist, 430, 932);
    expect(v.w).toBeCloseTo(7, 5);
    expect(v.h).toBeGreaterThan(5.6);
  });

  it("moves the camera back when HUD insets shrink the usable area", () => {
    const base = computeTopdownFitDistance({
      gridW: 7,
      gridH: 5.6,
      viewportW: 932,
      viewportH: 430,
      fovDeg: FOV,
      insets: noInsets,
      margin: 1,
    });
    const withHud = computeTopdownFitDistance({
      gridW: 7,
      gridH: 5.6,
      viewportW: 932,
      viewportH: 430,
      fovDeg: FOV,
      insets: { top: 43, bottom: 43, left: 0, right: 0 },
      margin: 1,
    });
    // 86px of 430px reserved -> grid must occupy 80% of the height.
    expect(withHud / base).toBeCloseTo(430 / 344, 5);
  });

  it("never divides by zero on degenerate viewports", () => {
    const dist = computeTopdownFitDistance({
      gridW: 7,
      gridH: 5.6,
      viewportW: 0,
      viewportH: 0,
      fovDeg: FOV,
    });
    expect(Number.isFinite(dist)).toBe(true);
    expect(dist).toBeGreaterThan(0);
  });
});
