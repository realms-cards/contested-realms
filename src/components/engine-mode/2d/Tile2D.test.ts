import { describe, expect, it } from "vitest";
import { hiddenLabel, SITE_ART_FRACTION, siteArtCrop, siteArtFilter, tileNumberLook, tileNumberSize, voidFill, voidRim } from "./Tile2D";

describe("Tile2D look", () => {
  it("draws the void without hatching, and differently below the surface", () => {
    for (const layer of ["surface", "subsurface"] as const) {
      expect(voidFill(layer)).not.toContain("repeating-linear-gradient");
      expect(voidFill(layer)).toContain("radial-gradient");
    }
    expect(voidFill("subsurface")).not.toBe(voidFill("surface"));
    expect(voidRim("subsurface")).not.toBe(voidRim("surface"));
  });

  it("dims and drains the site art underground, and keeps the colour setting on the surface", () => {
    expect(siteArtFilter({ saturation: 0.8, layer: "surface" })).toBe("saturate(0.8)");
    expect(siteArtFilter({ saturation: 1, tapped: true, layer: "surface" })).toBe("saturate(1) brightness(0.7)");
    const below = siteArtFilter({ saturation: 1, layer: "subsurface" });
    expect(below).toContain("saturate(0.35)");
    expect(below).toContain("brightness(0.5)");
    expect(siteArtFilter({ saturation: 1, tapped: true, layer: "subsurface" })).toContain("brightness(0.4)");
  });

  it("keeps the tile number small but readable", () => {
    expect(tileNumberSize(40)).toBe(10);
    expect(tileNumberSize(110)).toBe(12);
    expect(tileNumberSize(300)).toBe(16);
  });

  it("puts the tile number on a dark plate over site art (no blend mode) and keeps it quiet on the void", () => {
    const onSite = tileNumberLook(true);
    expect(onSite.style).toEqual({ color: "#f8fafc", background: "rgba(6,8,15,0.78)" });
    expect(onSite.style).not.toHaveProperty("mixBlendMode");
    expect(tileNumberLook(false).style).toEqual({});
    expect(tileNumberLook(false).className).toContain("text-rc-fg-muted");
  });

  it("counts the units on the layer not shown", () => {
    expect(hiddenLabel({ underground: 2, underwater: 1, surface: 0 }, "surface")).toMatchObject({
      count: 3,
      text: "2 burrowed · 1 submerged",
    });
    expect(hiddenLabel({ underground: 0, underwater: 0, surface: 1 }, "surface")).toBeNull();
    expect(hiddenLabel({ underground: 2, underwater: 0, surface: 1 }, "subsurface")).toMatchObject({ count: 1, text: "1 above" });
  });
});

describe("siteArtCrop", () => {
  it("fills the square with the art band only: the title bar and rules text fall below the tile", () => {
    const box = siteArtCrop({ w: 100, h: 100 });
    expect(box.top).toBe(0);
    // the art band (SITE_ART_FRACTION of the card's height) is exactly the tile's height
    expect(box.height * SITE_ART_FRACTION).toBeCloseTo(100);
    // landscape card proportions, centred left to right
    expect(box.width / box.height).toBeCloseTo(88 / 63);
    expect(box.left + box.width / 2).toBeCloseTo(50);
  });
});
