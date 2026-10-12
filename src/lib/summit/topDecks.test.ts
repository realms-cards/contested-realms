import { describe, expect, it } from "vitest";
import {
  buildEventDecks,
  datedEvents,
  hasNewEvent,
  placingFromName,
  type SummitEventSummary,
  type SummitTopDecks,
} from "./top-decks";

const event = (over: Partial<SummitEventSummary>): SummitEventSummary => ({
  folder: "An Event 2026",
  name: "An Event",
  event_date: "2026-10-03",
  player_count: 8,
  has_top8: true,
  winner_username: "someone",
  ...over,
});

describe("which collected event to publish", () => {
  it("takes the most recent dated event", () => {
    const [first] = datedEvents([
      event({ folder: "older", event_date: "2026-09-19" }),
      event({ folder: "newest", event_date: "2026-10-10" }),
      event({ folder: "mid", event_date: "2026-10-03" }),
    ]);
    expect(first.folder).toBe("newest");
  });

  it("skips events with no date and events with no top 8", () => {
    const kept = datedEvents([
      event({ folder: "undated", event_date: null }),
      event({ folder: "no-top8", has_top8: false }),
      event({ folder: "good" }),
    ]).map((e) => e.folder);
    expect(kept).toEqual(["good"]);
  });
});

describe("only working when a new event has been collected", () => {
  const cached = (folder: string): SummitTopDecks => ({
    folder,
    eventName: folder,
    eventDate: "2026-10-03",
    playerCount: 8,
    winner: null,
    decks: [],
    fetchedAt: "2026-10-04T00:00:00Z",
  });
  const list = [event({ folder: "newest", event_date: "2026-10-10" }), event({ folder: "older", event_date: "2026-10-03" })];

  it("does nothing when the newest collected event is the one we published", () => {
    expect(hasNewEvent(cached("newest"), list)).toBe(false);
  });

  it("works when a newer event has been collected", () => {
    expect(hasNewEvent(cached("older"), list)).toBe(true);
  });

  it("works the first time, with nothing cached", () => {
    expect(hasNewEvent(null, list)).toBe(true);
  });

  it("stays put when nothing is collected at all", () => {
    expect(hasNewEvent(null, [event({ event_date: null })])).toBe(false);
  });
});

describe("reading the placing out of a deck name", () => {
  it("understands the forms these events use", () => {
    expect(placingFromName("Canadian Grand Contest 2026 - Champion")).toBe(1);
    expect(placingFromName("Canadian Grand Contest 2026 - 2nd Place")).toBe(2);
    expect(placingFromName("Some Event - 7th Place")).toBe(7);
  });

  it("leaves a deck unplaced when the event named the player instead", () => {
    // real example: "Canadian Grand Contest 2026 - Jeremy Murray"
    expect(placingFromName("Canadian Grand Contest 2026 - Jeremy Murray")).toBeNull();
    expect(placingFromName("Just a deck")).toBeNull();
    expect(placingFromName(null)).toBeNull();
  });

  it("ignores a placing outside the top 8", () => {
    expect(placingFromName("Big Event - 12th Place")).toBeNull();
  });
});

describe("building the published list", () => {
  const detail = {
    event_name: "Canadian Grand Contest 2026",
    top8_decks: [
      { player: "C", avatar: "Imposter", deck_name: "E - 4th Place", deck_id: "d4", elements: ["Water"] },
      { player: "A", avatar: "Necromancer", deck_name: "E - Champion", deck_id: "d1", elements: ["Fire"] },
      { player: "B", avatar: "Archimago", deck_name: "E - 2nd Place", deck_id: "d2", elements: [] },
      { player: "D", avatar: "Pathfinder", deck_name: "E - Jeremy Murray", deck_id: "d9", elements: [] },
      { player: "E", avatar: "Druid", deck_name: "E - 3rd Place", elements: [] },
    ],
  };

  it("orders by placing, champion first, unplaced last", () => {
    const decks = buildEventDecks(detail);
    expect(decks.map((d) => d.placing)).toEqual([1, 2, 4, null]);
  });

  it("turns a deck_id into the public deck page our importer takes", () => {
    expect(buildEventDecks(detail)[0].url).toBe("https://sorcerytcg.com/decks/d1");
  });

  it("drops a deck with no id, since there is nothing to link to", () => {
    expect(buildEventDecks(detail).some((d) => d.player === "E")).toBe(false);
  });

  it("falls back to all_decks when an event has no separate top 8", () => {
    const decks = buildEventDecks({ all_decks: [{ player: "Z", deck_id: "dz", deck_name: "X - Champion" }] });
    expect(decks).toHaveLength(1);
    expect(decks[0].placing).toBe(1);
  });
});
