import { describe, expect, it, vi, beforeEach } from "vitest";

import { enrichPatchWithCosts, loadCardCosts, resetCardCostCache } from "../../../server/modules/card-costs";

const makePrismaMock = () => {
  const findMany = vi.fn().mockResolvedValue([
    { card: { name: "Song of the Sea" }, cost: 3 },
    { card: { name: "Earthquake" }, cost: 5 },
  ]);
  return {
    cardSetMetadata: { findMany },
  };
};

describe("card cost utilities", () => {
  beforeEach(() => {
    resetCardCostCache();
  });

  it("loads card costs and caches subsequent calls", async () => {
    const prisma = makePrismaMock();

    const first = await loadCardCosts(prisma as any);
    const second = await loadCardCosts(prisma as any);

    expect(first.get("Song of the Sea")).toBe(3);
    expect(second.get("Earthquake")).toBe(5);
    expect(prisma.cardSetMetadata.findMany).toHaveBeenCalledTimes(1);
  });

  it("enriches patches with missing costs", async () => {
    const prisma = makePrismaMock();
    const patch = {
      zones: {
        p1: {
          hand: [{ name: "Song of the Sea" }],
        },
      },
    };

    const enriched = await enrichPatchWithCosts(patch, prisma as any);
    expect((enriched.zones as any).p1.hand[0].cost).toBe(3);
  });
});
