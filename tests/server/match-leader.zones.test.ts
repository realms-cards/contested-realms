import { describe, expect, it } from "vitest";
import { __testZoneHelpers } from "../../server/modules/match-leader";

describe("match-leader zone normalization", () => {
  it("rejects zone cards whose owner does not match the acting seat", () => {
    const entry = { cardId: 1, owner: "p1" };
    const result = __testZoneHelpers.normalizeZoneCardForSeat(entry, "p2");
    expect(result).toBeNull();
  });

  it("accepts cards when owner matches the acting seat", () => {
    const entry = { cardId: 2, owner: "p1" };
    const result = __testZoneHelpers.normalizeZoneCardForSeat(entry, "p1");
    expect(result).not.toBeNull();
    expect((result as Record<string, unknown>).owner).toBe("p1");
  });

  it("ensures entire zone lists are sanitized per seat", () => {
    const zones = __testZoneHelpers.ensurePlayerZonesForSeat(
      {
        hand: [
          { cardId: 3, owner: "p1" },
          { cardId: 4, owner: "p2" },
        ],
        spellbook: [{ cardId: 5, owner: "p1" }],
      },
      "p1"
    );
    expect(zones.hand).toHaveLength(1);
    expect((zones.hand[0] as Record<string, unknown>).owner).toBe("p1");
    expect((zones.spellbook[0] as Record<string, unknown>).owner).toBe("p1");
  });
});
