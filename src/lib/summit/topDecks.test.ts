import { describe, expect, it } from "vitest";
import {
  type BracketDetail,
  type BracketSummary,
  buildTopDecks,
  completedBrackets,
  hasNewTournament,
  isPublicDeckUrl,
  latestCompletedBracket,
  type SummitTopDecks,
  top8Placings,
} from "./top-decks";

const bracket = (over: Partial<BracketSummary>): BracketSummary => ({
  bracket_id: 1,
  slug: "a-bracket",
  name: "A Bracket",
  status: "complete",
  completed_at: "2026-09-30T00:00:00",
  champion: null,
  ...over,
});

/** A 24-entrant bracket laid out the way Summit returns one. */
const detail = (): BracketDetail => ({
  rounds: [
    { round: 1, title: "Round 1", matches: [{ round: 1, p1_user_id: "x1", p2_user_id: "x2" }] },
    { round: 2, title: "Round 2", matches: [{ round: 2, p1_user_id: "x3", p2_user_id: "x4" }] },
    {
      round: 3,
      title: "Quarterfinals",
      matches: [
        { round: 3, p1_user_id: "a", p2_user_id: "b" },
        { round: 3, p1_user_id: "c", p2_user_id: "d" },
        { round: 3, p1_user_id: "e", p2_user_id: "f" },
        { round: 3, p1_user_id: "g", p2_user_id: "h" },
      ],
    },
    {
      round: 4,
      title: "Semifinals",
      matches: [
        { round: 4, p1_user_id: "a", p2_user_id: "c" },
        { round: 4, p1_user_id: "e", p2_user_id: "g" },
      ],
    },
    { round: 5, title: "Finals", matches: [{ round: 5, p1_user_id: "a", p2_user_id: "e", winner_user_id: "a" }] },
  ],
});

describe("picking the tournament", () => {
  it("takes the newest bracket that actually finished", () => {
    const picked = latestCompletedBracket([
      bracket({ slug: "older", completed_at: "2026-09-19T00:00:00" }),
      bracket({ slug: "newest", completed_at: "2026-10-03T00:00:00" }),
      // still running: never the answer, even though it is the most recent
      bracket({ slug: "running", status: "published", completed_at: null }),
    ]);
    expect(picked?.slug).toBe("newest");
  });

  it("returns null when nothing has finished", () => {
    expect(latestCompletedBracket([bracket({ status: "published", completed_at: null })])).toBeNull();
  });
});

describe("who placed where", () => {
  it("reads the top eight off the bracket's own rounds", () => {
    const placings = top8Placings(detail());
    expect([...placings.keys()].sort()).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
    // earlier rounds are NOT top 8
    expect(placings.has("x1")).toBe(false);
  });

  it("promotes by how far each player got", () => {
    const p = top8Placings(detail());
    expect(p.get("a")).toBe(1); // champion
    expect(p.get("e")).toBe(2); // runner-up
    expect(p.get("c")).toBe(4); // lost the semifinal
    expect(p.get("g")).toBe(4);
    expect(p.get("b")).toBe(8); // lost the quarterfinal
  });

  it("yields nothing when the bracket never reached a quarterfinal", () => {
    expect(top8Placings({ rounds: [{ round: 1, title: "Round 1", matches: [] }] }).size).toBe(0);
  });
});

describe("which decks we are willing to publish", () => {
  const players = [
    { user_id: "a", display_name: "Champ", deck_url: "https://sorcerytcg.com/decks/aaa", deck_visible: true, visibility: "public", seed: 3, avatar_name: "Necromancer", deck_name: "Win" },
    { user_id: "b", display_name: "Hidden", deck_url: "https://sorcerytcg.com/decks/bbb", deck_visible: false, visibility: "public", seed: 1 },
    { user_id: "c", display_name: "Private", deck_url: "https://sorcerytcg.com/decks/ccc", deck_visible: true, visibility: "private", seed: 2 },
    { user_id: "d", display_name: "Elsewhere", deck_url: "https://example.com/decks/ddd", deck_visible: true, visibility: "public", seed: 4 },
    { user_id: "e", display_name: "Curiosa", deck_url: "https://curiosa.io/decks/eee?tab=view", deck_visible: true, visibility: "public", seed: 5 },
    { user_id: "zz", display_name: "Not in top 8", deck_url: "https://sorcerytcg.com/decks/zzz", deck_visible: true, visibility: "public", seed: 9 },
  ];

  it("keeps only published decks from top-8 players, on a site we can import", () => {
    const decks = buildTopDecks(detail(), players);
    expect(decks.map((d) => d.player)).toEqual(["Champ", "Curiosa"]);
  });

  it("orders by placing, champion first", () => {
    const decks = buildTopDecks(detail(), players);
    expect(decks[0].placing).toBe(1);
    expect(decks[0].player).toBe("Champ");
  });

  it("carries only the fields we are willing to show", () => {
    const [first] = buildTopDecks(detail(), players);
    expect(Object.keys(first).sort()).toEqual(["avatar", "deckName", "placing", "player", "seed", "url"].sort());
  });

  it("accepts both deck hosts and nothing else", () => {
    expect(isPublicDeckUrl("https://sorcerytcg.com/decks/x")).toBe(true);
    expect(isPublicDeckUrl("https://curiosa.io/decks/x?tab=view")).toBe(true);
    expect(isPublicDeckUrl("https://www.sorcererssummit.com/deck/x")).toBe(false);
    expect(isPublicDeckUrl("https://evil.example/decks/x")).toBe(false);
  });
});

describe("walking back to a bracket that has decks", () => {
  it("orders finished brackets newest first", () => {
    const order = completedBrackets([
      bracket({ slug: "old", completed_at: "2026-09-19T00:00:00" }),
      bracket({ slug: "new", completed_at: "2026-10-03T00:00:00" }),
      bracket({ slug: "mid", completed_at: "2026-09-30T00:00:00" }),
      bracket({ slug: "running", status: "published", completed_at: null }),
    ]).map((b) => b.slug);
    // the walk starts at the newest and falls back in order, because submitting a decklist
    // is optional and the newest tournament often has none
    expect(order).toEqual(["new", "mid", "old"]);
  });
});

describe("only working when a tournament has actually finished", () => {
  const list = [
    bracket({ slug: "newest", completed_at: "2026-10-03T00:00:00" }),
    bracket({ slug: "older", completed_at: "2026-09-30T00:00:00" }),
  ];
  const cachedOn = (slug: string, completedAt: string | null): SummitTopDecks => ({
    bracketSlug: slug,
    bracketName: slug,
    champion: null,
    completedAt,
    decks: [],
    fetchedAt: "2026-10-03T01:00:00",
    seenBracket: { slug, completedAt },
  });

  it("does nothing when the newest finished tournament is the one we already saw", () => {
    expect(hasNewTournament(cachedOn("newest", "2026-10-03T00:00:00"), list)).toBe(false);
  });

  it("works when a newer tournament has finished", () => {
    expect(hasNewTournament(cachedOn("older", "2026-09-30T00:00:00"), list)).toBe(true);
  });

  it("works the very first time, with nothing cached", () => {
    expect(hasNewTournament(null, list)).toBe(true);
  });

  it("notices a bracket that was completed again under the same slug", () => {
    expect(hasNewTournament(cachedOn("newest", "2026-10-01T00:00:00"), list)).toBe(true);
  });

  it("stays put when no tournament has ever finished", () => {
    expect(hasNewTournament(null, [bracket({ status: "published", completed_at: null })])).toBe(false);
  });

  it("remembers the newest finished bracket even when the decks came from an older one", () => {
    // the walk-back case: Season 4 had no decks, so the list is Season 6's — but "have we
    // seen anything new?" must still be judged against Season 4, or we would refetch forever
    const marker = cachedOn("season-6", "2026-09-30T00:00:00");
    marker.seenBracket = { slug: "newest", completedAt: "2026-10-03T00:00:00" };
    expect(hasNewTournament(marker, list)).toBe(false);
  });
});
