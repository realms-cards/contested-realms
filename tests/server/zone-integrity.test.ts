import { describe, expect, it } from "vitest";
import {
  collectInstanceIds,
  deriveCrossSeat,
  isTokenCard,
  validateZoneIntegrity,
} from "../../server/modules/zone-integrity";

// Minimal game-state builder: each seat's zones plus permanents cells.
type ZoneMap = Partial<
  Record<
    "spellbook" | "atlas" | "hand" | "graveyard" | "battlefield" | "collection" | "banished",
    Array<Record<string, unknown>>
  >
>;
function game(opts: {
  p1?: ZoneMap;
  p2?: ZoneMap;
  permanents?: Record<string, Array<Record<string, unknown>>>;
}): Record<string, unknown> {
  return {
    zones: { p1: opts.p1 ?? {}, p2: opts.p2 ?? {} },
    permanents: opts.permanents ?? {},
  };
}
const card = (id: string, extra: Record<string, unknown> = {}) => ({
  instanceId: id,
  cardId: 100,
  name: id,
  ...extra,
});
const token = (id: string) => ({
  instanceId: id,
  cardId: -5,
  slug: "token:rubble",
  type: "Token",
  name: "Rubble",
});

describe("zone-integrity: token detection", () => {
  it("recognizes whitelisted token slugs, token: prefix, type Token, and negative cardId", () => {
    expect(isTokenCard({ slug: "token:skeleton" })).toBe(true);
    expect(isTokenCard({ slug: "alp_silence_b_s" })).toBe(true);
    expect(isTokenCard({ slug: "token:anything" })).toBe(true);
    expect(isTokenCard({ type: "Token" })).toBe(true);
    expect(isTokenCard({ cardId: -3 })).toBe(true);
    expect(isTokenCard({ slug: "ardent_thrall", cardId: 42 })).toBe(false);
  });
});

describe("zone-integrity: collectInstanceIds", () => {
  it("collects ids across both seats' zones and permanents", () => {
    const g = game({
      p1: { hand: [card("a")], spellbook: [card("b")] },
      p2: { graveyard: [card("c")] },
      permanents: { "2,3": [card("d")] },
    });
    const ids = collectInstanceIds(g);
    expect([...ids.keys()].sort()).toEqual(["a", "b", "c", "d"]);
  });
});

describe("zone-integrity: deriveCrossSeat", () => {
  it("prefers crossSeat descriptor", () => {
    expect(
      deriveCrossSeat({ crossSeat: { effect: "sea_raider", seats: ["p2"] } }),
    ).toEqual({ effect: "sea_raider", seats: ["p2"] });
  });
  it("falls back to legacy __allowZoneSeats as effect 'legacy'", () => {
    expect(deriveCrossSeat({ __allowZoneSeats: ["p2"] })).toEqual({
      effect: "legacy",
      seats: ["p2"],
    });
  });
  it("returns null when no authorization is present", () => {
    expect(deriveCrossSeat({ zones: {} })).toBeNull();
  });
  it("coerces an unknown effect id to 'legacy'", () => {
    expect(deriveCrossSeat({ crossSeat: { effect: "haxx", seats: ["p1"] } })).toEqual({
      effect: "legacy",
      seats: ["p1"],
    });
  });
});

describe("zone-integrity: conservation (Layer 1)", () => {
  it("passes when cards merely move between the actor's own zones", () => {
    const prev = game({ p1: { spellbook: [card("a")], hand: [] } });
    const next = game({ p1: { spellbook: [], hand: [card("a")] } });
    const r = validateZoneIntegrity(prev, next, null, "p1");
    expect(r.ok).toBe(true);
  });

  it("rejects fabricating a non-token card into the actor's hand", () => {
    const prev = game({ p1: { hand: [] } });
    const next = game({ p1: { hand: [card("ghost")] } });
    const r = validateZoneIntegrity(prev, next, null, "p1");
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.code === "fabricated_card")).toBe(true);
  });

  it("allows minting a whitelisted token", () => {
    const prev = game({ permanents: { "1,1": [] } });
    const next = game({ permanents: { "1,1": [token("r1")] } });
    const r = validateZoneIntegrity(prev, next, null, "p1");
    expect(r.ok).toBe(true);
  });

  it("rejects deleting an opponent's real card", () => {
    const prev = game({ p1: {}, p2: { battlefield: [card("x")] } });
    const next = game({ p1: {}, p2: { battlefield: [] } });
    // actor p1 wiping p2's card — flagged both as deletion and cross-seat
    const r = validateZoneIntegrity(prev, next, null, "p1");
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.code === "deleted_card")).toBe(true);
  });
});

describe("zone-integrity: cross-seat capability (Layer 2)", () => {
  it("rejects writing opponent zones with no authorization", () => {
    const prev = game({ p2: { graveyard: [] } });
    const next = game({ p2: { graveyard: [token("t")] } });
    const r = validateZoneIntegrity(prev, next, null, "p1");
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.code === "unauthorized_cross_seat")).toBe(
      true,
    );
  });

  it("accepts a within-envelope cross-seat write (sea_raider: spellbook→graveyard)", () => {
    // p1 mills p2: a card moves from p2 spellbook to p2 graveyard (conserved)
    const prev = game({ p2: { spellbook: [card("s")], graveyard: [] } });
    const next = game({ p2: { spellbook: [], graveyard: [card("s")] } });
    const patch = { crossSeat: { effect: "sea_raider", seats: ["p2"] } };
    const r = validateZoneIntegrity(prev, next, patch, "p1");
    expect(r.ok).toBe(true);
  });

  it("rejects an out-of-envelope cross-seat write (sea_raider touching hand)", () => {
    const prev = game({ p2: { hand: [card("h")], graveyard: [] } });
    const next = game({ p2: { hand: [], graveyard: [card("h")] } });
    const patch = { crossSeat: { effect: "sea_raider", seats: ["p2"] } };
    const r = validateZoneIntegrity(prev, next, patch, "p1");
    expect(r.ok).toBe(false);
    expect(
      r.violations.some((v) => v.code === "cross_seat_out_of_envelope"),
    ).toBe(true);
  });

  it("flags legacy __allowZoneSeats cross-seat writes", () => {
    const prev = game({ p2: { graveyard: [card("g")], banished: [] } });
    const next = game({ p2: { graveyard: [], banished: [card("g")] } });
    const patch = { __allowZoneSeats: ["p2"] };
    const r = validateZoneIntegrity(prev, next, patch, "p1");
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.code === "legacy_cross_seat")).toBe(true);
  });

  it("does not flag cross-seat when the actor only touches their own zones", () => {
    const prev = game({ p1: { hand: [card("a")] }, p2: { hand: [card("b")] } });
    const next = game({ p1: { hand: [] }, p2: { hand: [card("b")] } });
    // p1 played 'a' to a permanent cell (still conserved)
    next.permanents = { "2,3": [card("a")] };
    const r = validateZoneIntegrity(prev, next, null, "p1");
    expect(r.ok).toBe(true);
  });
});
