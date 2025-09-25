import { describe, expect, test } from "vitest";

import {
  cardRefToPreview,
  createCardPreviewData,
  isCardMeshUserData,
  isCardPreviewData,
  type CardMeshUserData,
  type CardPreviewData,
} from "../../src/lib/game/card-preview.types";
import type { CardRef } from "../../src/lib/game/store";

describe("card preview helpers", () => {
  describe("createCardPreviewData()", () => {
    test("returns normalized preview data for valid input", () => {
      const result = createCardPreviewData({
        slug: "  alpha-wolf  ",
        name: "  Alpha Wolf  ",
        type: "Creature",
      });

      expect(result).toEqual<CardPreviewData>({
        slug: "alpha-wolf",
        name: "Alpha Wolf",
        type: "Creature",
      });
    });

    test("returns null when slug or name are missing", () => {
      expect(createCardPreviewData({ slug: "", name: "Lost" })).toBeNull();
      expect(createCardPreviewData({ slug: "ghost", name: "" })).toBeNull();
      expect(createCardPreviewData({ slug: undefined, name: "Mage" })).toBeNull();
    });
  });

  describe("isCardPreviewData()", () => {
    test("accepts valid preview data", () => {
      const candidate: CardPreviewData = {
        slug: "ember-spirit",
        name: "Ember Spirit",
        type: "Spell",
      };

      expect(isCardPreviewData(candidate)).toBe(true);
    });

    test("rejects objects with missing or invalid fields", () => {
      expect(isCardPreviewData({ slug: "", name: "Test", type: null })).toBe(false);
      expect(isCardPreviewData({ slug: "test", name: 42, type: null })).toBe(false);
      expect(isCardPreviewData(null)).toBe(false);
    });
  });

  describe("isCardMeshUserData()", () => {
    test("accepts valid mesh metadata", () => {
      const candidate: CardMeshUserData = {
        cardId: 101,
        slug: "ruby-gargoyle",
        type: "Creature",
        name: "Ruby Gargoyle",
      };

      expect(isCardMeshUserData(candidate)).toBe(true);
    });

    test("rejects invalid mesh metadata", () => {
      expect(
        isCardMeshUserData({ cardId: "not-a-number", slug: "bad", type: null })
      ).toBe(false);
      expect(isCardMeshUserData({ cardId: 1, slug: "", type: null })).toBe(false);
      expect(isCardMeshUserData(undefined)).toBe(false);
    });
  });

  describe("cardRefToPreview()", () => {
    test("converts populated CardRef structures", () => {
      const cardRef: CardRef = {
        cardId: 7,
        slug: "stormcaller",
        name: "Stormcaller",
        type: "Creature",
      };

      const preview = cardRefToPreview(cardRef);

      expect(preview).toEqual<CardPreviewData>({
        slug: "stormcaller",
        name: "Stormcaller",
        type: "Creature",
      });
    });

    test("returns null when CardRef lacks slug or name", () => {
      const noSlug: CardRef = {
        cardId: 8,
        slug: null,
        name: "Nameless",
        type: null,
      };

      expect(cardRefToPreview(noSlug)).toBeNull();
    });
  });
});