import { createGame } from "@sorcery/shared";
import type { PlayerId } from "@sorcery/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enginePrecons, toEngineDeck } from "./decks";
import { loadEngineGame, readArrangement, readControlTurns, readFeedNotes, saveEngineGame } from "./persistence";

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

describe("saved card arrangement", () => {
  /** a plain in-memory localStorage, so the save goes through its real JSON round trip */
  beforeEach(() => {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  const game = () => {
    const deck = toEngineDeck(enginePrecons[0]);
    return createGame([deck, deck], ["You", "Computer"], 5, 0 as PlayerId);
  };
  const meta = { botLevel: "quick" as const, portalsRevealed: true, layer: "surface" as const, matchId: "m1" };

  it("round-trips through a save", () => {
    const arrangement = { u7: { at: "2,3", x: 0.12, y: -0.3, seq: 4 }, a2: { at: "0,1", x: -0.5, y: 0.5, seq: 5 } };
    saveEngineGame(game(), { ...meta, arrangement });
    const saved = loadEngineGame();
    expect(saved).not.toBeNull();
    expect(readArrangement(saved!.arrangement)).toEqual(arrangement);
  });

  it("loads a save from before arrangements existed", () => {
    saveEngineGame(game(), meta);
    const saved = loadEngineGame();
    expect(saved, "an older save still resumes").not.toBeNull();
    expect(saved!.arrangement).toBeUndefined();
    expect(readArrangement(saved!.arrangement)).toEqual({});
  });

  it("drops malformed entries and pulls stray offsets back onto the tile", () => {
    const good = { at: "1,2", x: 0.2, y: 0.1, seq: 1 };
    const raw: unknown = JSON.parse(
      JSON.stringify({ good, far: { ...good, x: 3 }, badAt: { ...good, at: "x" }, badSeq: { ...good, seq: -1 }, junk: 5 }),
    );
    expect(readArrangement(raw)).toEqual({ good, far: { ...good, x: 0.5 } });
    expect(readArrangement([good])).toEqual({});
    expect(readArrangement(null)).toEqual({});
  });
});
