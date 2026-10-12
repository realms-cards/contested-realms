import { describe, expect, it } from "vitest";
import { apiDeckToEngine } from "./decks";

/**
 * Guards the import path that `/decks` accepts but engine mode used to refuse. The Magician
 * keeps its sites in the spellbook and leaves the atlas empty — the engine says so itself
 * ("Magician: sites go in the spellbook, the atlas stays empty") and builds the piles that
 * way in setup. Requiring both piles rejected a legal deck.
 */
const rows = (...names: string[]) => names.map((name) => ({ name }));

describe("deck import", () => {
  it("accepts a Magician deck whose atlas is empty", () => {
    const result = apiDeckToEngine(
      { name: "Magic only", spellbook: rows("Magician", "Chain Lightning", "Dark Tower") },
      "fallback",
    );
    expect(result.ok, result.ok ? "" : result.error).toBe(true);
    if (result.ok) {
      expect(result.deck.avatar).toBe("Magician");
      expect(Object.keys(result.deck.atlas)).toHaveLength(0);
    }
  });

  it("still refuses an atlas-less deck for an avatar that needs one", () => {
    const result = apiDeckToEngine({ name: "No sites", spellbook: rows("Flamecaller", "Chain Lightning") }, "fallback");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("no atlas");
  });

  it("accepts an ordinary deck with both piles", () => {
    const result = apiDeckToEngine(
      { name: "Normal", spellbook: rows("Flamecaller", "Chain Lightning"), atlas: rows("Dark Tower") },
      "fallback",
    );
    expect(result.ok, result.ok ? "" : result.error).toBe(true);
  });

  it("names the unknown card rather than failing vaguely", () => {
    const result = apiDeckToEngine({ spellbook: rows("Flamecaller", "Definitely Not A Card") }, "fallback");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Definitely Not A Card");
  });
});
