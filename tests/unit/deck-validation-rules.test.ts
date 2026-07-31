import { describe, expect, it } from "vitest";
import {
  getRequirements,
  isMagicianAvatar,
  normalizeFormat,
  resolveImportFormat,
  validateDeck,
} from "@/lib/deck/validation-rules";

const codes = (result: ReturnType<typeof validateDeck>) =>
  result.errors.map((e) => e.code);

describe("normalizeFormat", () => {
  it("maps constructed labels to constructed", () => {
    expect(normalizeFormat("Constructed")).toBe("constructed");
    expect(normalizeFormat("constructed")).toBe("constructed");
  });

  it("treats everything else as limited", () => {
    expect(normalizeFormat("Sealed")).toBe("limited");
    expect(normalizeFormat("Draft")).toBe("limited");
    expect(normalizeFormat("sandbox")).toBe("limited");
    expect(normalizeFormat(null)).toBe("limited");
    expect(normalizeFormat(undefined)).toBe("limited");
  });
});

describe("isMagicianAvatar", () => {
  it("matches by name, case-insensitively", () => {
    expect(isMagicianAvatar("Magician")).toBe(true);
    expect(isMagicianAvatar("the magician")).toBe(true);
    expect(isMagicianAvatar("Sorcerer")).toBe(false);
    expect(isMagicianAvatar(null)).toBe(false);
  });
});

describe("getRequirements", () => {
  it("uses standard zone minimums for ordinary avatars", () => {
    expect(getRequirements("limited", "Sorcerer")).toMatchObject({
      minSpellbook: 24,
      minAtlas: 12,
      sitesInSpellbook: false,
    });
    expect(getRequirements("constructed", "Sorcerer")).toMatchObject({
      minSpellbook: 60,
      minAtlas: 30,
      sitesInSpellbook: false,
    });
  });

  it("drops the atlas minimum for Magician", () => {
    expect(getRequirements("constructed", "Magician")).toMatchObject({
      minSpellbook: 60,
      minAtlas: 0,
      sitesInSpellbook: true,
    });
  });
});

describe("validateDeck — ordinary avatars", () => {
  it("accepts a legal constructed deck", () => {
    const result = validateDeck(
      { spellbookCount: 60, atlasCount: 30, avatarCount: 1 },
      "constructed",
      "Sorcerer"
    );
    expect(result.isValid).toBe(true);
  });

  it("rejects too few sites", () => {
    const result = validateDeck(
      { spellbookCount: 60, atlasCount: 11, avatarCount: 1 },
      "constructed",
      "Sorcerer"
    );
    expect(codes(result)).toContain("ATLAS_MIN");
  });

  it("rejects a missing or duplicated avatar", () => {
    expect(
      codes(
        validateDeck(
          { spellbookCount: 60, atlasCount: 30, avatarCount: 0 },
          "constructed"
        )
      )
    ).toContain("AVATAR_COUNT");
    expect(
      codes(
        validateDeck(
          { spellbookCount: 60, atlasCount: 30, avatarCount: 2 },
          "constructed"
        )
      )
    ).toContain("AVATAR_COUNT");
  });

  it("caps the collection in constructed but not in limited", () => {
    expect(
      codes(
        validateDeck(
          {
            spellbookCount: 60,
            atlasCount: 30,
            collectionCount: 11,
            avatarCount: 1,
          },
          "constructed"
        )
      )
    ).toContain("COLLECTION_MAX");
    expect(
      validateDeck(
        {
          spellbookCount: 24,
          atlasCount: 12,
          collectionCount: 40,
          avatarCount: 1,
        },
        "limited"
      ).isValid
    ).toBe(true);
  });
});

describe("validateDeck — Magician", () => {
  it("has no site minimum; sites count toward the spellbook", () => {
    // 4 sites is illegal for any other avatar, fine here: 56 + 4 = 60
    const result = validateDeck(
      { spellbookCount: 56, atlasCount: 4, avatarCount: 1 },
      "constructed",
      "Magician"
    );
    expect(result.isValid).toBe(true);
  });

  it("accepts a draft-sized deck with 3 sites in limited", () => {
    const result = validateDeck(
      { spellbookCount: 21, atlasCount: 3, avatarCount: 1 },
      "limited",
      "Magician"
    );
    expect(result.isValid).toBe(true);
  });

  it("still enforces the combined total", () => {
    const result = validateDeck(
      { spellbookCount: 40, atlasCount: 4, avatarCount: 1 },
      "constructed",
      "Magician"
    );
    expect(codes(result)).toEqual(["SPELLBOOK_MIN"]);
    expect(result.errors[0]?.message).toContain("including sites");
    expect(result.errors[0]?.message).toContain("44");
  });

  it("never reports an atlas error", () => {
    const result = validateDeck(
      { spellbookCount: 0, atlasCount: 0, avatarCount: 1 },
      "constructed",
      "Magician"
    );
    expect(codes(result)).not.toContain("ATLAS_MIN");
  });
});

describe("resolveImportFormat", () => {
  it("labels a full 60/30 list as Constructed", () => {
    const resolved = resolveImportFormat(
      { spellbookCount: 60, atlasCount: 30, avatarCount: 1 },
      "Sorcerer"
    );
    expect(resolved.label).toBe("Constructed");
    expect(resolved.validation.isValid).toBe(true);
  });

  it("labels a draft-sized list as Limited instead of failing it", () => {
    const resolved = resolveImportFormat(
      { spellbookCount: 30, atlasCount: 14, avatarCount: 1 },
      "Sorcerer"
    );
    expect(resolved.label).toBe("Limited");
    expect(resolved.validation.isValid).toBe(true);
  });

  it("imports a Magician draft deck with fewer than 12 sites", () => {
    const resolved = resolveImportFormat(
      { spellbookCount: 27, atlasCount: 5, avatarCount: 1 },
      "Magician"
    );
    expect(resolved.label).toBe("Limited");
    expect(resolved.validation.isValid).toBe(true);
  });

  it("does not downgrade a constructed-sized list over an oversized sideboard", () => {
    // Curiosa sideboards routinely blow past the 10-card collection cap
    const resolved = resolveImportFormat(
      {
        spellbookCount: 60,
        atlasCount: 30,
        collectionCount: 25,
        avatarCount: 1,
      },
      "Sorcerer"
    );
    expect(resolved.label).toBe("Constructed");
    expect(resolved.validation.isValid).toBe(true);
  });

  it("honours an explicit format instead of inferring", () => {
    const resolved = resolveImportFormat(
      { spellbookCount: 30, atlasCount: 14, avatarCount: 1 },
      "Sorcerer",
      "Constructed"
    );
    expect(resolved.format).toBe("constructed");
    expect(resolved.validation.isValid).toBe(false);
  });

  it("reports limited errors when the list is too small for any format", () => {
    const resolved = resolveImportFormat(
      { spellbookCount: 5, atlasCount: 2, avatarCount: 1 },
      "Sorcerer"
    );
    expect(resolved.label).toBe("Limited");
    expect(codes(resolved.validation)).toEqual(
      expect.arrayContaining(["SPELLBOOK_MIN", "ATLAS_MIN"])
    );
  });
});
