import { describe, it, expect } from "vitest";
import {
  mergeArrayByInstanceId,
  mergePermanentsMap,
} from "../src/lib/game/store/utils/patchHelpers";

describe("Duplicate card handling", () => {
  describe("mergeArrayByInstanceId", () => {
    it("should NOT merge permanents with same cardId but different instanceIds", () => {
      // Two copies of the same card on the board (same cardId, different instanceId)
      const baseArr = [
        {
          owner: 1,
          card: { cardId: 100, name: "Mountain", instanceId: "inst-1" },
          instanceId: "inst-1",
          tapped: false,
          version: 0,
        },
        {
          owner: 1,
          card: { cardId: 100, name: "Mountain", instanceId: "inst-2" },
          instanceId: "inst-2",
          tapped: false,
          version: 0,
        },
      ];

      // Patch that updates only the first Mountain
      const patchArr = [
        {
          owner: 1,
          card: { cardId: 100, name: "Mountain", instanceId: "inst-1" },
          instanceId: "inst-1",
          tapped: true, // Tap the first one
          version: 1,
        },
      ];

      const result = mergeArrayByInstanceId(baseArr, patchArr);

      // Should have both Mountains
      expect(result.length).toBe(2);

      // First Mountain should be tapped
      const first = result.find(
        (r) => (r as { instanceId: string }).instanceId === "inst-1"
      ) as { tapped: boolean };
      expect(first.tapped).toBe(true);

      // Second Mountain should still be untapped
      const second = result.find(
        (r) => (r as { instanceId: string }).instanceId === "inst-2"
      ) as { tapped: boolean };
      expect(second.tapped).toBe(false);
    });

    it("should correctly add a second copy of the same card", () => {
      // One Mountain already on board
      const baseArr = [
        {
          owner: 1,
          card: { cardId: 100, name: "Mountain", instanceId: "inst-1" },
          instanceId: "inst-1",
          tapped: false,
          version: 0,
        },
      ];

      // Patch adds a second Mountain
      const patchArr = [
        {
          owner: 1,
          card: { cardId: 100, name: "Mountain", instanceId: "inst-2" },
          instanceId: "inst-2",
          tapped: false,
          version: 0,
        },
      ];

      const result = mergeArrayByInstanceId(baseArr, patchArr);

      // Should have both Mountains
      expect(result.length).toBe(2);
      expect(
        result.some(
          (r) => (r as { instanceId: string }).instanceId === "inst-1"
        )
      ).toBe(true);
      expect(
        result.some(
          (r) => (r as { instanceId: string }).instanceId === "inst-2"
        )
      ).toBe(true);
    });

    it("should NOT remove second copy when first copy is removed", () => {
      // Two Mountains on board
      const baseArr = [
        {
          owner: 1,
          card: { cardId: 100, name: "Mountain", instanceId: "inst-1" },
          instanceId: "inst-1",
          tapped: false,
          version: 0,
        },
        {
          owner: 1,
          card: { cardId: 100, name: "Mountain", instanceId: "inst-2" },
          instanceId: "inst-2",
          tapped: false,
          version: 0,
        },
      ];

      // Patch removes only the first Mountain
      const patchArr = [
        {
          instanceId: "inst-1",
          __remove: true,
        },
      ];

      const result = mergeArrayByInstanceId(baseArr, patchArr);

      // Should have only the second Mountain
      expect(result.length).toBe(1);
      expect((result[0] as { instanceId: string }).instanceId).toBe("inst-2");
    });
  });

  describe("mergePermanentsMap", () => {
    it("should preserve multiple copies of same card across different cells", () => {
      const base = {
        "0,0": [
          {
            owner: 1,
            card: { cardId: 100, name: "Mountain", instanceId: "inst-1" },
            instanceId: "inst-1",
            tapped: false,
            version: 0,
          },
        ],
        "1,0": [
          {
            owner: 1,
            card: { cardId: 100, name: "Mountain", instanceId: "inst-2" },
            instanceId: "inst-2",
            tapped: false,
            version: 0,
          },
        ],
      };

      // Patch updates cell 0,0
      const patch = {
        "0,0": [
          {
            owner: 1,
            card: { cardId: 100, name: "Mountain", instanceId: "inst-1" },
            instanceId: "inst-1",
            tapped: true,
            version: 1,
          },
        ],
      };

      const result = mergePermanentsMap(base as never, patch);

      // Both cells should have their cards
      expect(result["0,0"].length).toBe(1);
      expect(result["1,0"].length).toBe(1);

      // Only the first should be tapped
      expect((result["0,0"][0] as { tapped: boolean }).tapped).toBe(true);
      expect((result["1,0"][0] as { tapped: boolean }).tapped).toBe(false);
    });

    it("should correctly handle two copies of same card in same cell", () => {
      const base = {
        "0,0": [
          {
            owner: 1,
            card: { cardId: 100, name: "Minion", instanceId: "inst-1" },
            instanceId: "inst-1",
            tapped: false,
            version: 0,
          },
          {
            owner: 1,
            card: { cardId: 100, name: "Minion", instanceId: "inst-2" },
            instanceId: "inst-2",
            tapped: false,
            version: 0,
          },
        ],
      };

      // Patch taps only the first minion
      const patch = {
        "0,0": [
          {
            instanceId: "inst-1",
            tapped: true,
            tapVersion: 1,
          },
        ],
      };

      const result = mergePermanentsMap(base as never, patch);

      // Both minions should still be there
      expect(result["0,0"].length).toBe(2);

      const first = result["0,0"].find(
        (m) => (m as { instanceId: string }).instanceId === "inst-1"
      ) as { tapped: boolean };
      const second = result["0,0"].find(
        (m) => (m as { instanceId: string }).instanceId === "inst-2"
      ) as { tapped: boolean };

      expect(first.tapped).toBe(true);
      expect(second.tapped).toBe(false);
    });
  });
});
