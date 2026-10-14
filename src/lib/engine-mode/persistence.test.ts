import { describe, expect, it } from "vitest";
import { readControlTurns, readFeedNotes } from "./persistence";

describe("saved session extras", () => {
  it("restores the turns played under Courtesan Thaïs, dropping malformed entries", () => {
    const saved: unknown = JSON.parse(JSON.stringify({ 5: 0, 6: 1, x: 1, 7: 2 }));
    expect(readControlTurns(saved)).toEqual({ 5: 0, 6: 1 });
    expect(readControlTurns(null)).toEqual({});
  });

  it("restores well-formed feed notes and drops the rest", () => {
    const good = { lines: [41], after: 40, seat: "p2", kind: "discard", text: "Computer pays the Troll Bridge toll: discards Sinkhole.", card: "Sinkhole", cells: ["2,1"] };
    const saved: unknown = JSON.parse(JSON.stringify([good, { ...good, seat: "p3" }, { ...good, cells: ["nope"] }, "junk"]));
    expect(readFeedNotes(saved)).toEqual([good]);
    expect(readFeedNotes({})).toEqual([]);
  });
});
