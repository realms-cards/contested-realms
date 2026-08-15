import { describe, expect, it } from "vitest";
import {
  portalOwnersAt,
  tileNumberToCoords,
} from "@/lib/game/store/portalState";
import type { PortalState } from "@/lib/game/store/types";

const portalStateFor = (
  p1Tiles: number[] | null,
  p2Tiles: number[] | null,
): PortalState => ({
  harbingerSeats: [
    ...(p1Tiles ? (["p1"] as const) : []),
    ...(p2Tiles ? (["p2"] as const) : []),
  ],
  p1: p1Tiles
    ? { rolls: p1Tiles, tileNumbers: p1Tiles, rollPhase: "complete" }
    : null,
  p2: p2Tiles
    ? { rolls: p2Tiles, tileNumbers: p2Tiles, rollPhase: "complete" }
    : null,
  currentRoller: null,
  setupComplete: true,
});

describe("portalOwnersAt", () => {
  it("reports no owners off-portal and outside a Harbinger game", () => {
    expect(portalOwnersAt(0, 0, null)).toEqual([]);
    const state = portalStateFor([1, 2, 3], null);
    const [x, y] = tileNumberToCoords(9);
    expect(portalOwnersAt(x, y, state)).toEqual([]);
  });

  it("reports the single owner of a portal square", () => {
    const state = portalStateFor([1, 7, 13], [4, 9, 20]);
    const [x, y] = tileNumberToCoords(7);
    expect(portalOwnersAt(x, y, state)).toEqual(["p1"]);

    const [ox, oy] = tileNumberToCoords(20);
    expect(portalOwnersAt(ox, oy, state)).toEqual(["p2"]);
  });

  // Regression: both Harbingers roll independently, so the same square can be a
  // portal for both. Returning a single owner hid P2's portal entirely and
  // denied them the -1 discount on that square.
  it("reports both owners when two portals land on one square", () => {
    const state = portalStateFor([1, 7, 13], [7, 9, 20]);
    const [x, y] = tileNumberToCoords(7);

    const owners = portalOwnersAt(x, y, state);
    expect(owners).toHaveLength(2);
    expect(owners).toContain("p1");
    expect(owners).toContain("p2");
  });

  it("ignores players who have not finished rolling", () => {
    const state = portalStateFor([1, 7, 13], []);
    const [x, y] = tileNumberToCoords(7);
    expect(portalOwnersAt(x, y, state)).toEqual(["p1"]);
  });
});
