import { describe, expect, it } from "vitest";
import {
  currentPeriod,
  deriveCardRates,
  parseMetaWindow,
  periodsBack,
  wilsonLowerBound,
  windowMonths,
} from "@/lib/meta/stats";

describe("wilsonLowerBound", () => {
  it("returns 0 with no decided games", () => {
    expect(wilsonLowerBound(0, 0)).toBe(0);
  });

  it("ranks a proven performer above a lucky small sample", () => {
    // 2-0 looks like 100% but we can't be confident in it
    const twoAndOh = wilsonLowerBound(2, 0);
    // 58% over 300 games is a real edge
    const provenEdge = wilsonLowerBound(174, 126);
    expect(twoAndOh).toBeLessThan(provenEdge);
    expect(twoAndOh).toBeGreaterThan(0.3);
    expect(twoAndOh).toBeLessThan(0.4);
    expect(provenEdge).toBeGreaterThan(0.52);
    expect(provenEdge).toBeLessThan(0.58);
  });

  it("converges toward the raw rate as the sample grows", () => {
    const small = wilsonLowerBound(6, 4);
    const large = wilsonLowerBound(6000, 4000);
    expect(small).toBeLessThan(0.35);
    // At n = 10,000 the 95% margin is under one percentage point
    expect(large).toBeGreaterThan(0.585);
    expect(large).toBeLessThan(0.6);
    expect(large).toBeGreaterThan(small);
  });

  it("never goes below zero", () => {
    expect(wilsonLowerBound(0, 50)).toBe(0);
    expect(wilsonLowerBound(1, 99)).toBeGreaterThanOrEqual(0);
  });
});

describe("period helpers", () => {
  const aug = new Date("2026-08-30T19:00:00Z");

  it("formats the current month as YYYY-MM in UTC", () => {
    expect(currentPeriod(aug)).toBe("2026-08");
    // Just before midnight UTC on the last day still belongs to that month
    expect(currentPeriod(new Date("2026-08-31T23:59:59Z"))).toBe("2026-08");
  });

  it("walks back across a year boundary with zero padding", () => {
    expect(periodsBack(3, aug)).toEqual(["2026-08", "2026-07", "2026-06"]);
    expect(periodsBack(3, new Date("2026-01-15T00:00:00Z"))).toEqual([
      "2026-01",
      "2025-12",
      "2025-11",
    ]);
  });

  it("produces keys that sort correctly as strings", () => {
    const keys = periodsBack(14, aug);
    const sorted = [...keys].sort();
    expect(sorted.reverse()).toEqual(keys);
  });
});

describe("windows", () => {
  it("parses only known windows and defaults to all-time", () => {
    expect(parseMetaWindow("month")).toBe("month");
    expect(parseMetaWindow("3m")).toBe("3m");
    expect(parseMetaWindow("6m")).toBe("all");
    expect(parseMetaWindow(null)).toBe("all");
  });

  it("maps windows to month counts, 0 meaning no period filter", () => {
    expect(windowMonths("all")).toBe(0);
    expect(windowMonths("month")).toBe(1);
    expect(windowMonths("3m")).toBe(3);
  });
});

describe("deriveCardRates", () => {
  it("excludes draws from win rate and derives play rate from inclusion", () => {
    const rates = deriveCardRates({
      plays: 40,
      wins: 24,
      losses: 12,
      draws: 4,
      inDeck: 50,
      inDeckWins: 28,
      inDeckLosses: 18,
    });
    expect(rates.winRate).toBeCloseTo(24 / 36, 6);
    expect(rates.winRateLB).toBeLessThan(rates.winRate);
    expect(rates.playRate).toBeCloseTo(0.8, 6);
    expect(rates.winRateInDeck).toBeCloseTo(28 / 46, 6);
  });

  it("reports null inclusion metrics before any deck data exists", () => {
    const rates = deriveCardRates({
      plays: 10,
      wins: 6,
      losses: 4,
      draws: 0,
      inDeck: 0,
      inDeckWins: 0,
      inDeckLosses: 0,
    });
    expect(rates.playRate).toBeNull();
    expect(rates.winRateInDeck).toBeNull();
    expect(rates.winRate).toBe(0.6);
  });

  it("caps play rate at 1 for cards played from outside the maindeck", () => {
    // e.g. a Collection-zone card put into play by Imposter
    const rates = deriveCardRates({
      plays: 5,
      wins: 3,
      losses: 2,
      draws: 0,
      inDeck: 2,
      inDeckWins: 1,
      inDeckLosses: 1,
    });
    expect(rates.playRate).toBe(1);
  });
});
