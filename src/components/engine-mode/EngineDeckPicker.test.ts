import { describe, expect, it } from "vitest";
import { choiceToSource, deckOptions, type DeckLists } from "./EngineDeckPicker";

const top = {
  folder: "gc-x",
  eventName: "Grand Contest X",
  eventDate: null,
  playerCount: 64,
  winner: "Ann",
  fetchedAt: "",
  decks: [{ player: "Ann", avatar: "Flamecaller", deckName: "Fire Aggro", url: "https://sorcerytcg.com/decks/abc", elements: [], placing: 1 }],
};

const lists = (extra: Partial<DeckLists> = {}): DeckLists => ({
  mine: [{ id: "m1", name: "Mine" }],
  publicDecks: [{ id: "pc1", name: "Gothic Precon" }],
  top,
  others: null,
  ...extra,
});

describe("engine deck picker categories", () => {
  it("sections your decks, precons, the latest top 8 and other players' public decks", () => {
    const groups = [...new Set(deckOptions(lists(), true).map((o) => o.group))];
    expect(groups).toEqual(["Your decks", "Precons", "Top 8 — Grand Contest X", "Public decks", "Other"]);
    // other players' decks are only listed once loaded
    expect(deckOptions(lists(), true).filter((o) => o.group === "Public decks").map((o) => o.label)).toEqual([
      "Show other players' public decks…",
    ]);
    const loaded = deckOptions(lists({ others: [{ id: "o1", name: "Other", format: "Constructed", userName: "Bob", updatedAt: "", avatarState: "none" as const, avatarCard: null }] }), true);
    expect(loaded.filter((o) => o.group === "Public decks").map((o) => o.value)).toEqual(["saved:o1"]);
  });

  it("plays a top-8 deck from its link and a public deck by id", () => {
    const topValue = deckOptions(lists(), false).find((o) => o.group?.startsWith("Top 8"))!.value;
    expect(choiceToSource(topValue, "", lists())).toEqual({ kind: "link", url: "https://sorcerytcg.com/decks/abc" });
    const withOthers = lists({ others: [{ id: "o1", name: "Other", format: "Constructed", userName: "Bob", updatedAt: "", avatarState: "none" as const, avatarCard: null }] });
    expect(choiceToSource("saved:o1", "", withOthers)).toEqual({ kind: "saved", id: "o1", name: "Other" });
  });
});
