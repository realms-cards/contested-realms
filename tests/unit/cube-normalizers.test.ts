import { describe, expect, it } from "vitest";
import { normalizeCubeSummary } from "@/lib/cubes/normalizers";

describe("normalizeCubeSummary", () => {
  it("derives card counts from nested cube cards", () => {
    const result = normalizeCubeSummary({
      id: 123,
      name: "My Cube",
      description: null,
      isPublic: true,
      imported: false,
      updatedAt: new Date("2024-05-05T12:00:00Z"),
      cards: [{ count: 2 }, { count: "3" }, { count: -1 }, { value: 5 }],
    });
    expect(result).toMatchObject({
      id: "123",
      name: "My Cube",
      isPublic: true,
      imported: false,
      cardCount: 5,
    });
    expect(result.updatedAt).toBe("2024-05-05T12:00:00.000Z");
  });

  it("honors direct cardCount values and overrides", () => {
    const base = normalizeCubeSummary(
      { id: "abc", cardCount: "7", updatedAt: 1715011200000 },
      { isOwner: true, userName: "Tester" },
    );
    expect(base).toMatchObject({
      id: "abc",
      cardCount: 7,
      isOwner: true,
      userName: "Tester",
    });
    expect(base.updatedAt).toBe("2024-05-06T16:00:00.000Z");
  });

  it("falls back to defaults when fields are missing", () => {
    const result = normalizeCubeSummary(null);
    expect(result).toMatchObject({
      id: "",
      name: "Untitled Cube",
      description: null,
      isPublic: false,
      imported: false,
      cardCount: 0,
    });
  });
});
