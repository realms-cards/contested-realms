import { describe, expect, it } from "vitest";
import { deepMergeReplaceArrays } from "../../server/modules/shared/match-helpers";

describe("match helper deep merge", () => {
  it("ignores stale tap updates when tapVersion regresses", () => {
    const base = [
      { instanceId: "perm-a", tapped: true, tapVersion: 3 },
      { instanceId: "perm-b", tapped: false, tapVersion: 1 },
    ];
    const patch = [
      { instanceId: "perm-a", tapped: false, tapVersion: 2 },
    ];

    const merged = deepMergeReplaceArrays(base, patch) as Array<
      Record<string, unknown>
    >;
    const permA = merged.find((entry) => entry.instanceId === "perm-a");
    expect(permA?.tapped).toBe(true);
    expect(permA?.tapVersion).toBe(3);
  });

  it("removes instances flagged with __remove while preserving others", () => {
    const base = [
      { instanceId: "perm-a", tapped: false, tapVersion: 1 },
      { instanceId: "perm-b", tapped: false, tapVersion: 0 },
    ];
    const patch = [
      { instanceId: "perm-b", __remove: true },
      { instanceId: "perm-c", tapped: false, tapVersion: 0 },
    ];

    const merged = deepMergeReplaceArrays(base, patch) as Array<
      Record<string, unknown>
    >;
    expect(merged).toHaveLength(2);
    const instances = merged.map((entry) => entry.instanceId);
    expect(instances).toContain("perm-a");
    expect(instances).toContain("perm-c");
    expect(instances).not.toContain("perm-b");
  });

  it("ignores stale generic updates when version regresses", () => {
    const base = [
      { instanceId: "perm-a", owner: 1, version: 3 },
      { instanceId: "perm-b", owner: 1, version: 0 },
    ];
    const stalePatch = [
      { instanceId: "perm-a", owner: 2, version: 2 },
    ];
    const mergedStale = deepMergeReplaceArrays(base, stalePatch) as Array<
      Record<string, unknown>
    >;
    const permA = mergedStale.find((entry) => entry.instanceId === "perm-a");
    expect(permA?.owner).toBe(1);
    expect(permA?.version).toBe(3);

    const freshPatch = [
      { instanceId: "perm-a", owner: 2, version: 4 },
    ];
    const mergedFresh = deepMergeReplaceArrays(base, freshPatch) as Array<
      Record<string, unknown>
    >;
    const permAFresh = mergedFresh.find(
      (entry) => entry.instanceId === "perm-a"
    );
    expect(permAFresh?.owner).toBe(2);
    expect(permAFresh?.version).toBe(4);
  });

  it("assigns identities when base entry lacks instanceId", () => {
    const base = [
      {
        owner: 1,
        card: { cardId: 10, name: "Nameless" },
        tapVersion: 0,
      },
    ];
    const patch = [
      {
        instanceId: "perm-generated",
        owner: 1,
        card: { cardId: 10, name: "Nameless", instanceId: "perm-generated" },
        tapVersion: 1,
        tapped: true,
        version: 3,
      },
    ];

    const merged = deepMergeReplaceArrays(base, patch) as Array<
      Record<string, unknown>
    >;
    expect(merged).toHaveLength(1);
    const entry = merged[0];
    expect(entry.instanceId).toBe("perm-generated");
    expect(entry.tapped).toBe(true);
    expect(entry.tapVersion).toBe(1);
    expect(entry.version).toBe(3);
  });
});
