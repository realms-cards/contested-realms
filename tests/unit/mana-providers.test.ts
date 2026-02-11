/**
 * Mana Providers Unit Tests
 *
 * Tests for the mana provider system that tracks which cards provide
 * mana resources and elemental thresholds.
 *
 * Critical requirements tested:
 * - Mana provider card identification
 * - Threshold provider card identification
 * - Element-specific threshold grants (Air, Water, Earth, Fire)
 * - Non-mana site exceptions
 * - Case-insensitive card name lookup
 */

import { describe, it, expect } from "vitest";
import {
  MANA_PROVIDER_BY_NAME,
  THRESHOLD_GRANT_BY_NAME,
  NON_MANA_SITE_IDENTIFIERS,
} from "@/lib/game/mana-providers";

describe("Mana Providers", () => {
  describe("MANA_PROVIDER_BY_NAME", () => {
    it("should be a Set", () => {
      expect(MANA_PROVIDER_BY_NAME).toBeInstanceOf(Set);
    });

    it("should contain known mana providers", () => {
      // Test a sample of known mana providers
      expect(MANA_PROVIDER_BY_NAME.has("abundance")).toBe(true);
      expect(MANA_PROVIDER_BY_NAME.has("avalon")).toBe(true);
      expect(MANA_PROVIDER_BY_NAME.has("amethyst core")).toBe(true);
    });

    it("should contain Core cards as mana providers", () => {
      expect(MANA_PROVIDER_BY_NAME.has("amethyst core")).toBe(true);
      expect(MANA_PROVIDER_BY_NAME.has("aquamarine core")).toBe(true);
      expect(MANA_PROVIDER_BY_NAME.has("onyx core")).toBe(true);
      expect(MANA_PROVIDER_BY_NAME.has("ruby core")).toBe(true);
    });

    it("should contain Site cards as mana providers", () => {
      expect(MANA_PROVIDER_BY_NAME.has("shrine of the dragonlord")).toBe(true);
      expect(MANA_PROVIDER_BY_NAME.has("valley of delight")).toBe(true);
      expect(MANA_PROVIDER_BY_NAME.has("drought")).toBe(true);
    });

    it("should contain Permanent cards as mana providers", () => {
      // Cores are artifact permanents that provide mana
      expect(MANA_PROVIDER_BY_NAME.has("aquamarine core")).toBe(true);
      expect(MANA_PROVIDER_BY_NAME.has("onyx core")).toBe(true);
      expect(MANA_PROVIDER_BY_NAME.has("ruby core")).toBe(true);
    });

    it("should use lowercase names", () => {
      // All entries should be lowercase for consistent lookup
      const allLowercase = Array.from(MANA_PROVIDER_BY_NAME).every(
        (name) => name === name.toLowerCase(),
      );
      expect(allLowercase).toBe(true);
    });

    it("should not contain uppercase names", () => {
      expect(MANA_PROVIDER_BY_NAME.has("ABUNDANCE")).toBe(false);
      expect(MANA_PROVIDER_BY_NAME.has("Abundance")).toBe(false);
      expect(MANA_PROVIDER_BY_NAME.has("Avalon")).toBe(false);
    });

    it("should have at least 10 entries", () => {
      // Mana providers are now curated to cards that explicitly "provide" mana
      expect(MANA_PROVIDER_BY_NAME.size).toBeGreaterThanOrEqual(10);
    });

    it("should allow efficient lookup with has()", () => {
      // Testing performance characteristic of Set
      const startTime = performance.now();
      for (let i = 0; i < 1000; i++) {
        MANA_PROVIDER_BY_NAME.has("avalon");
      }
      const duration = performance.now() - startTime;

      // 1000 lookups should be very fast (< 10ms)
      expect(duration).toBeLessThan(10);
    });
  });

  describe("THRESHOLD_GRANT_BY_NAME", () => {
    it("should be an object", () => {
      expect(typeof THRESHOLD_GRANT_BY_NAME).toBe("object");
    });

    it("should contain all Core cards", () => {
      expect(THRESHOLD_GRANT_BY_NAME["amethyst core"]).toBeDefined();
      expect(THRESHOLD_GRANT_BY_NAME["aquamarine core"]).toBeDefined();
      expect(THRESHOLD_GRANT_BY_NAME["onyx core"]).toBeDefined();
      expect(THRESHOLD_GRANT_BY_NAME["ruby core"]).toBeDefined();
    });

    it("should grant Air threshold for Amethyst Core", () => {
      expect(THRESHOLD_GRANT_BY_NAME["amethyst core"]).toEqual({ air: 1 });
    });

    it("should grant Water threshold for Aquamarine Core", () => {
      expect(THRESHOLD_GRANT_BY_NAME["aquamarine core"]).toEqual({ water: 1 });
    });

    it("should grant Earth threshold for Onyx Core", () => {
      expect(THRESHOLD_GRANT_BY_NAME["onyx core"]).toEqual({ earth: 1 });
    });

    it("should grant Fire threshold for Ruby Core", () => {
      expect(THRESHOLD_GRANT_BY_NAME["ruby core"]).toEqual({ fire: 1 });
    });

    it("should use lowercase keys", () => {
      const allLowercase = Object.keys(THRESHOLD_GRANT_BY_NAME).every(
        (key) => key === key.toLowerCase(),
      );
      expect(allLowercase).toBe(true);
    });

    it("should not have uppercase keys", () => {
      expect(THRESHOLD_GRANT_BY_NAME["AMETHYST CORE"]).toBeUndefined();
      expect(THRESHOLD_GRANT_BY_NAME["Amethyst Core"]).toBeUndefined();
    });

    it("should have Core cards that are also in MANA_PROVIDER_BY_NAME", () => {
      // Cores provide both threshold and mana
      const cores = [
        "amethyst core",
        "aquamarine core",
        "onyx core",
        "ruby core",
      ];
      for (const core of cores) {
        expect(MANA_PROVIDER_BY_NAME.has(core)).toBe(true);
        expect(THRESHOLD_GRANT_BY_NAME[core]).toBeDefined();
      }
    });

    it("should have valid element keys", () => {
      const validElements = new Set(["air", "water", "earth", "fire"]);

      for (const thresholds of Object.values(THRESHOLD_GRANT_BY_NAME)) {
        for (const element of Object.keys(thresholds)) {
          expect(validElements.has(element)).toBe(true);
        }
      }
    });

    it("should have numeric threshold values", () => {
      for (const thresholds of Object.values(THRESHOLD_GRANT_BY_NAME)) {
        for (const value of Object.values(thresholds)) {
          expect(typeof value).toBe("number");
          expect(value).toBeGreaterThan(0);
        }
      }
    });

    it("should have Core cards plus Arthurian Families and other providers", () => {
      // Now includes Cores, Arthurian Families, and transformed sites
      expect(
        Object.keys(THRESHOLD_GRANT_BY_NAME).length,
      ).toBeGreaterThanOrEqual(4);
    });

    it("should grant exactly 1 threshold per Core", () => {
      for (const thresholds of Object.values(THRESHOLD_GRANT_BY_NAME)) {
        const elements = Object.keys(thresholds);
        expect(elements.length).toBe(1);
      }
    });
  });

  describe("NON_MANA_SITE_IDENTIFIERS", () => {
    it("should be a Set", () => {
      expect(NON_MANA_SITE_IDENTIFIERS).toBeInstanceOf(Set);
    });

    it("should be initially empty or small", () => {
      // Currently no exceptions are defined
      expect(NON_MANA_SITE_IDENTIFIERS.size).toBeGreaterThanOrEqual(0);
      expect(NON_MANA_SITE_IDENTIFIERS.size).toBeLessThan(10);
    });

    it("should allow adding exceptions", () => {
      // Test that the Set can be modified (if needed in the future)
      const testSet = new Set(NON_MANA_SITE_IDENTIFIERS);
      testSet.add("test_site");
      expect(testSet.has("test_site")).toBe(true);
    });

    it("should not contain any mana providers", () => {
      // Non-mana sites should not overlap with mana providers
      for (const siteName of NON_MANA_SITE_IDENTIFIERS) {
        expect(MANA_PROVIDER_BY_NAME.has(siteName)).toBe(false);
      }
    });
  });

  describe("Integration Tests", () => {
    it("should correctly identify all Cores as both mana and threshold providers", () => {
      const cores = [
        "amethyst core",
        "aquamarine core",
        "onyx core",
        "ruby core",
      ];

      for (const core of cores) {
        expect(MANA_PROVIDER_BY_NAME.has(core)).toBe(true);
        expect(THRESHOLD_GRANT_BY_NAME[core]).toBeDefined();
      }
    });

    it("should have mana providers without threshold grants", () => {
      // Most mana providers don't grant thresholds (only Cores do)
      const manaProvidersWithoutThresholds = Array.from(
        MANA_PROVIDER_BY_NAME,
      ).filter((name) => !THRESHOLD_GRANT_BY_NAME[name]);

      expect(manaProvidersWithoutThresholds.length).toBeGreaterThan(0);
      expect(manaProvidersWithoutThresholds).toContain("avalon");
      expect(manaProvidersWithoutThresholds).toContain("abundance");
    });

    it("should map elements correctly for each Core", () => {
      const elementMapping = {
        "amethyst core": "air",
        "aquamarine core": "water",
        "onyx core": "earth",
        "ruby core": "fire",
      };

      for (const [core, expectedElement] of Object.entries(elementMapping)) {
        const thresholds = THRESHOLD_GRANT_BY_NAME[core];
        expect(thresholds).toBeDefined();
        expect(thresholds[expectedElement as keyof typeof thresholds]).toBe(1);
      }
    });

    it("should have all Core threshold providers also in MANA_PROVIDER_BY_NAME", () => {
      // Only cores are in both; Arthurian Families provide threshold only, not mana
      const cores = [
        "amethyst core",
        "aquamarine core",
        "onyx core",
        "ruby core",
      ];
      const manaProviders = Array.from(MANA_PROVIDER_BY_NAME);

      for (const core of cores) {
        expect(manaProviders).toContain(core);
      }
    });

    it("should handle case-insensitive lookups correctly", () => {
      // Utility function to normalize names for lookup
      const normalizedLookup = (name: string) =>
        MANA_PROVIDER_BY_NAME.has(name.toLowerCase());

      expect(normalizedLookup("AVALON")).toBe(true);
      expect(normalizedLookup("Avalon")).toBe(true);
      expect(normalizedLookup("avalon")).toBe(true);
      expect(normalizedLookup("AMETHYST CORE")).toBe(true);
      expect(normalizedLookup("Amethyst Core")).toBe(true);
    });
  });

  describe("Data Consistency", () => {
    it("should not have empty strings in mana providers", () => {
      expect(MANA_PROVIDER_BY_NAME.has("")).toBe(false);
    });

    it("should not have null or undefined in mana providers", () => {
      expect(MANA_PROVIDER_BY_NAME.has(null as unknown as string)).toBe(false);
      expect(MANA_PROVIDER_BY_NAME.has(undefined as unknown as string)).toBe(
        false,
      );
    });

    it("should not have whitespace-only entries", () => {
      const hasWhitespaceOnly = Array.from(MANA_PROVIDER_BY_NAME).some(
        (name) => name.trim().length === 0,
      );
      expect(hasWhitespaceOnly).toBe(false);
    });

    it("should not have leading or trailing whitespace", () => {
      const hasTrimIssues = Array.from(MANA_PROVIDER_BY_NAME).some(
        (name) => name !== name.trim(),
      );
      expect(hasTrimIssues).toBe(false);
    });

    it("should have consistent naming format", () => {
      // All names should use lowercase with spaces (not underscores or dashes)
      const allConsistent = Array.from(MANA_PROVIDER_BY_NAME).every((name) => {
        // Allow lowercase letters, spaces, apostrophes, and hyphens
        return /^[a-zäëïöüÿàèìòùáéíóúâêîôû\s'-]+$/.test(name);
      });
      expect(allConsistent).toBe(true);
    });
  });

  describe("Performance", () => {
    it("should perform Set lookups in constant time", () => {
      const iterations = 10000;
      const testName = "avalon";

      const startTime = performance.now();
      for (let i = 0; i < iterations; i++) {
        MANA_PROVIDER_BY_NAME.has(testName);
      }
      const duration = performance.now() - startTime;

      // 10000 lookups should be very fast (< 20ms)
      expect(duration).toBeLessThan(20);
    });

    it("should perform Record lookups in constant time", () => {
      const iterations = 10000;
      const testName = "amethyst core";

      const startTime = performance.now();
      for (let i = 0; i < iterations; i++) {
        const _ = THRESHOLD_GRANT_BY_NAME[testName];
      }
      const duration = performance.now() - startTime;

      // 10000 lookups should be very fast (< 20ms)
      expect(duration).toBeLessThan(20);
    });
  });
});
