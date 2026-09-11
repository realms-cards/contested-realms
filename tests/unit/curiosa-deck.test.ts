import { afterEach, describe, expect, it, vi } from "vitest";
import { extractDeckId, fetchCuriosatrpc } from "@/lib/services/curiosa-deck";

/**
 * sorcerytcg.com's `deck.get` returns one flat decklist whose rows carry a
 * `board` of `Main`, `Collection`, `Avatar` or `Maybeboard`. The maybeboard is
 * the owner's scratch pad — cards they are still considering — and must never
 * reach an imported deck. The payload below is trimmed from a real response.
 */
function row(board: string, name: string, type: string, quantity = 1) {
  const slug = name.toLowerCase().replace(/\s+/g, "_");
  return {
    board,
    quantity,
    printingId: `p-${slug}`,
    printing: {
      id: `p-${slug}`,
      slug: `001-${slug}-b-s`,
      set: { name: "Alpha", code: "001" },
    },
    card: {
      id: `c-${slug}`,
      name,
      slug,
      engine: { type, category: type.toLowerCase() },
      printings: [{ id: `p-${slug}`, set: { name: "Alpha", code: "001" } }],
    },
  };
}

function mockDeckResponse(decklist: unknown[], name = "Test Deck") {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({ result: { data: { json: { name, decklist } } } }),
      { status: 200, headers: { "content-type": "application/json" } }
    )
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("extractDeckId", () => {
  it("reads the id out of a sorcerytcg deck URL", () => {
    expect(extractDeckId("https://sorcerytcg.com/decks/abc123")).toBe("abc123");
  });

  it("still reads legacy curiosa.io URLs, whose ids are unchanged", () => {
    expect(extractDeckId("https://curiosa.io/decks/abc123")).toBe("abc123");
  });

  it("accepts a bare id", () => {
    expect(extractDeckId("abc123")).toBe("abc123");
  });
});

describe("fetchCuriosatrpc board routing", () => {
  it("drops Maybeboard rows instead of importing them as Collection", async () => {
    mockDeckResponse([
      row("Avatar", "Deathspeaker", "Avatar"),
      row("Main", "Steppe", "Site", 3),
      row("Collection", "Penitent Knight", "Minion", 2),
      row("Maybeboard", "Dagger", "Artifact", 4),
    ]);

    const deck = await fetchCuriosatrpc("abc123");

    expect(deck).not.toBeNull();
    expect(deck?.avatarName).toBe("Deathspeaker");
    expect(deck?.deckList.map((e) => e.card.name)).toEqual(["Steppe"]);
    expect(deck?.sideboardList.map((e) => e.card.name)).toEqual([
      "Penitent Knight",
    ]);
  });

  it("drops unrecognized boards rather than guessing a zone", async () => {
    mockDeckResponse([
      row("Main", "Steppe", "Site", 3),
      row("Wishlist", "Dagger", "Artifact", 4),
    ]);

    const deck = await fetchCuriosatrpc("abc123");

    expect(deck?.deckList.map((e) => e.card.name)).toEqual(["Steppe"]);
    expect(deck?.sideboardList).toEqual([]);
  });

  it("returns null when a deck holds nothing but a maybeboard", async () => {
    mockDeckResponse([row("Maybeboard", "Dagger", "Artifact", 4)]);

    expect(await fetchCuriosatrpc("abc123")).toBeNull();
  });

  it("falls back to an extra Collection avatar when no Avatar row exists", async () => {
    mockDeckResponse([
      row("Main", "Steppe", "Site", 3),
      row("Collection", "Imposter", "Avatar"),
      row("Maybeboard", "Deathspeaker", "Avatar"),
    ]);

    const deck = await fetchCuriosatrpc("abc123");

    // The maybeboard avatar must not win the fallback
    expect(deck?.avatarName).toBe("Imposter");
  });
});
