import { describe, expect, it } from "vitest";
import {
  extractFourCoresDeckId,
  isFourCoresUrl,
  normalizeFourCoresDeck,
} from "@/lib/services/fourcores-deck";

/**
 * Four Cores serves decks at /api/decks/<id>/list, the same interop shape
 * realms.cards serves from its own /api/decks/[id]/list route. `compatPayload`
 * below is trimmed from a real fourcores.xyz response; the remaining tests
 * cover looser variants the normalizer tolerates.
 */
const compatPayload = {
  deckList: [
    {
      quantity: 2,
      variantId: "17",
      card: {
        id: "17",
        slug: "assorted_animals",
        name: "Assorted Animals",
        type: "Magic",
        category: "magic",
        variants: [{ id: "17", slug: "alp-assorted_animals-b-s" }],
      },
    },
    {
      quantity: 3,
      variantId: "341",
      card: {
        id: "341",
        slug: "steppe",
        name: "Steppe",
        type: "Site",
        category: "site",
        variants: [{ id: "341", slug: "alp-steppe-b-s" }],
      },
    },
    {
      // Newly released cards arrive with no printing data at all
      quantity: 2,
      variantId: "1673",
      card: {
        id: "1673",
        slug: "court_of_equity",
        name: "Court of Equity",
        type: "Site",
        category: "site",
        variants: [],
      },
    },
  ],
  sideboardList: [
    {
      quantity: 2,
      variantId: "1529",
      card: {
        id: "1529",
        slug: "penitent_knight",
        name: "Penitent Knight",
        type: "Minion",
        category: "minion",
        variants: [{ id: "1529", slug: "got-penitent_knight-b-s" }],
      },
    },
  ],
  // The avatar is named in metadata only, never listed among the cards
  avatarName: "Sorcerer",
  deckName: "How do I kill the 30-50 feral hogs",
  source: "fourcores.xyz",
};

describe("isFourCoresUrl", () => {
  it("matches fourcores.xyz hosts", () => {
    expect(isFourCoresUrl("https://fourcores.xyz/decks/abc123")).toBe(true);
    expect(
      isFourCoresUrl("https://www.fourcores.xyz/api/decks/abc123/list")
    ).toBe(true);
  });

  it("does not match other deck sites or bare ids", () => {
    expect(isFourCoresUrl("https://curiosa.io/decks/abc123")).toBe(false);
    expect(isFourCoresUrl("abc123")).toBe(false);
  });
});

describe("extractFourCoresDeckId", () => {
  it("reads the id from deck page and API urls", () => {
    expect(extractFourCoresDeckId("https://fourcores.xyz/decks/abc123")).toBe(
      "abc123"
    );
    expect(
      extractFourCoresDeckId("https://fourcores.xyz/api/decks/abc123/list")
    ).toBe("abc123");
  });
});

describe("normalizeFourCoresDeck", () => {
  it("normalizes a real Four Cores list response", () => {
    const result = normalizeFourCoresDeck(compatPayload);
    expect(result).not.toBeNull();
    expect(result?.deckName).toBe("How do I kill the 30-50 feral hogs");
    expect(result?.avatarName).toBe("Sorcerer");
    expect(result?.deckList.map((e) => e.card.name)).toEqual([
      "Assorted Animals",
      "Steppe",
      "Court of Equity",
    ]);
    expect(result?.deckList[0]?.quantity).toBe(2);
    expect(result?.sideboardList.map((e) => e.card.name)).toEqual([
      "Penitent Knight",
    ]);
  });

  it("keeps slugs and variant ids so variant lookup can match", () => {
    const result = normalizeFourCoresDeck(compatPayload);
    const assorted = result?.deckList[0];
    expect(assorted?.variantId).toBe("17");
    expect(assorted?.card.variants[0]?.slug).toBe("alp-assorted_animals-b-s");
  });

  it("leaves variants empty rather than faking one from the card slug", () => {
    const result = normalizeFourCoresDeck(compatPayload);
    const court = result?.deckList.find(
      (e) => e.card.name === "Court of Equity"
    );
    // The importer falls back to card.slug and then a name lookup for these
    expect(court?.card.variants).toEqual([]);
    expect(court?.card.slug).toBe("court_of_equity");
  });

  it("lifts an avatar out of the main list when one is listed there", () => {
    const result = normalizeFourCoresDeck({
      deckList: [
        {
          quantity: 1,
          variantId: "303",
          card: {
            id: "3",
            slug: "druid",
            name: "Druid",
            type: "Avatar",
            category: "avatar",
            variants: [{ id: "303", slug: "alp-druid-b-s" }],
          },
        },
        {
          quantity: 2,
          variantId: "17",
          card: {
            id: "17",
            slug: "assorted_animals",
            name: "Assorted Animals",
            type: "Magic",
            category: "magic",
            variants: [{ id: "17", slug: "alp-assorted_animals-b-s" }],
          },
        },
      ],
      deckName: "Listed Avatar",
    });
    // The importer adds the avatar to the Spellbook itself, so keeping it in
    // deckList too would import it twice
    expect(result?.avatarName).toBe("Druid");
    expect(result?.deckList.map((e) => e.card.name)).toEqual([
      "Assorted Animals",
    ]);
  });

  it("tolerates flattened cards, `count`, and a separate sites array", () => {
    const result = normalizeFourCoresDeck({
      name: "Loose Deck",
      avatar: { name: "Druid" },
      cards: [{ name: "Mix Aqua", count: 2, type: "Magic" }],
      sites: [{ name: "Aqueduct", count: 3 }],
      collection: [{ name: "Sorcerer", quantity: 1, type: "Avatar" }],
    });

    expect(result?.deckName).toBe("Loose Deck");
    expect(result?.avatarName).toBe("Druid");
    // Entries from the sites array get typed as Site so they land in the Atlas
    const aqueduct = result?.deckList.find((e) => e.card.name === "Aqueduct");
    expect(aqueduct?.card.type).toBe("Site");
    expect(aqueduct?.quantity).toBe(3);
    // With no id of its own, the card name stands in so the entry stays usable
    expect(aqueduct?.card.id).toBe("Aqueduct");
    expect(result?.sideboardList).toHaveLength(1);
  });

  it("accepts a bare entries array", () => {
    const result = normalizeFourCoresDeck([
      { name: "Druid", type: "Avatar", quantity: 1 },
      { name: "Mix Aqua", type: "Magic", quantity: 2 },
    ]);
    expect(result?.avatarName).toBe("Druid");
    expect(result?.deckList.map((e) => e.card.name)).toEqual(["Mix Aqua"]);
  });

  it("returns null when there is nothing importable", () => {
    expect(normalizeFourCoresDeck({ hello: "world" })).toBeNull();
    expect(normalizeFourCoresDeck(null)).toBeNull();
    expect(normalizeFourCoresDeck({ deckList: [] })).toBeNull();
  });
});
