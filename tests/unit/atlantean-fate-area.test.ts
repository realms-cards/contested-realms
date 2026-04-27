import { describe, expect, it } from "vitest";
import {
  calculate2x2Area,
  calculate2x2AreaWithOffset,
} from "@/lib/game/store/atlanteanFateState";

describe("Atlantean Fate 2x2 area calculation", () => {
  const W = 5;
  const H = 4;

  it("matches anchor-based calc when offset is positive (top-right intersection)", () => {
    // Card placed at tile (1,1) snapped to its top-right intersection.
    // Anchor (lower-left of 2x2) is the tile itself.
    const expected = calculate2x2Area(1, 1, W, H);
    const actual = calculate2x2AreaWithOffset(1, 1, 0.3, 0.3, W, H);
    expect(actual.sort()).toEqual(expected.sort());
  });

  it("uses tile-1 as anchor when offset is negative (bottom-left intersection)", () => {
    // Card placed at tile (2,1) but in its lower-left quadrant -> intersection
    // sits between tiles (1,0)-(2,1). Resolver must flood THAT 2x2, not (2,1)-(3,2).
    const actual = calculate2x2AreaWithOffset(2, 1, -0.3, -0.3, W, H);
    expect(actual.sort()).toEqual(["1,0", "1,1", "2,0", "2,1"].sort());
    // Critically, neither (3,1) nor (3,2) should be flooded.
    expect(actual).not.toContain("3,1");
    expect(actual).not.toContain("3,2");
  });

  it("handles mixed offset quadrants", () => {
    // Top-left intersection of tile (2,1): offX < 0, offZ >= 0
    const tl = calculate2x2AreaWithOffset(2, 1, -0.3, 0.3, W, H);
    expect(tl.sort()).toEqual(["1,1", "1,2", "2,1", "2,2"].sort());

    // Bottom-right intersection of tile (2,1): offX >= 0, offZ < 0
    const br = calculate2x2AreaWithOffset(2, 1, 0.3, -0.3, W, H);
    expect(br.sort()).toEqual(["2,0", "2,1", "3,0", "3,1"].sort());
  });
});
