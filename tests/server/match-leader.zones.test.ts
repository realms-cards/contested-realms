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

  it("rebuilds battlefield zones from permanents", () => {
    const match: any = {
      game: {
        permanents: {
          "0,0": [
            {
              owner: 1,
              card: { cardId: 10, name: "Knight" },
            },
            {
              owner: 2,
              card: { cardId: 11, name: "Rogue" },
            },
          ],
        },
        zones: {
          p1: {
            spellbook: [],
            atlas: [],
            hand: [],
            graveyard: [],
            battlefield: [],
            banished: [],
          },
          p2: {
            spellbook: [],
            atlas: [],
            hand: [],
            graveyard: [],
            battlefield: [],
            banished: [],
          },
        },
      },
    };

    const patch = __testZoneHelpers.syncBattlefieldZonesForTest(match, {} as any);
    const zones = match.game?.zones as Record<string, any>;
    expect(zones.p1.battlefield).toHaveLength(1);
    expect(zones.p2.battlefield).toHaveLength(1);
    const patchZones = (patch.zones as Record<string, any>) ?? {};
    expect(patchZones.p1?.battlefield).toHaveLength(1);
    expect(patchZones.p2?.battlefield).toHaveLength(1);
  });
});
