import { describe, expect, it } from "vitest";
import { createGame, getScript, makeCtx } from "@sorcery/shared";
import type { GameState, PlayerId } from "@sorcery/shared";
import { describeCardStatus, effectMarks, type CardStatusInput } from "./cardStatus";
import { enginePrecons, toEngineDeck } from "./decks";

const base: CardStatusInput = {
  unit: { tapped: false, damage: 0, region: "surface", modifiers: [], isAvatar: false, deathsDoor: false, counters: undefined, carriedBy: null },
  statuses: [],
  stats: null,
  printed: { attack: 3, defence: 3 },
  carrying: [],
  carriedBy: null,
};

describe("describeCardStatus", () => {
  it("an untouched card has nothing to say", () => {
    expect(describeCardStatus(base)).toEqual({ chips: [], notes: [] });
  });

  it("names the board's statuses, with what disabled and silenced mean", () => {
    const { chips, notes } = describeCardStatus({ ...base, statuses: ["silenced", "disabled", "ward"] });
    expect(chips.map((c) => c.label)).toEqual(["Disabled", "Silenced", "Ward"]);
    expect(notes[0]).toMatch(/^Disabled: no abilities/);
    expect(notes[1]).toMatch(/^Silenced:/);
  });

  it("shows power and life against the printed values", () => {
    const { chips } = describeCardStatus({ ...base, stats: { atk: 5, def: 2 } });
    expect(chips.map((c) => [c.label, c.tone])).toEqual([
      ["Power 5 (+2)", "good"],
      ["Life 2 (-1)", "bad"],
    ]);
  });

  it("spells out the effects behind them, with their durations", () => {
    const unit = {
      ...base.unit!,
      damage: 1,
      tapped: true,
      region: "underwater" as const,
      counters: { asleep: 1 },
      modifiers: [
        { kind: "power" as const, amount: 2, duration: "endOfTurn" as const, turn: 3, sourcePlayer: 0 as const },
        { kind: "keyword" as const, keyword: "airborne" as const, duration: "untilYourNextTurn" as const, turn: 3, sourcePlayer: 0 as const },
        { kind: "keyword" as const, keyword: "lethal" as const, remove: true, duration: "permanent" as const, turn: 3, sourcePlayer: 1 as const },
      ],
    };
    const { chips, notes } = describeCardStatus({ ...base, unit, carrying: ["Ring of Morrigan"] });
    expect(chips.map((c) => c.label)).toEqual(["1 damage", "Tapped", "Submerged"]);
    expect(notes).toEqual([
      "+2 power until end of turn.",
      "Gains Airborne until its controller's next turn.",
      "Loses Lethal.",
      "Asleep: disabled until it takes damage.",
      "Carrying Ring of Morrigan.",
    ]);
  });

  it("names a masked Imposter, whose card on the board shows the mask's face", () => {
    const { chips, notes } = describeCardStatus({ ...base, mask: "Sorcerer" });
    expect(chips.map((c) => c.label)).toEqual(["Imposter, masked"]);
    expect(notes).toEqual(["The Imposter, masked as Sorcerer: it has Sorcerer's abilities until it takes damage or puts on a new mask."]);
  });
});

describe("effectMarks: what the engine keeps on a unit with no token for it", () => {
  /** a Frost Mage game with one allied minion of seat 0 next to a Humming Hummocks of seat 0 */
  const board = () => {
    const deck = toEngineDeck(enginePrecons.find((d) => d.id === "fvl-frost-mage")!);
    const game = createGame([deck, deck], ["You", "Computer"], 9, 0 as PlayerId);
    game.phase = "main";
    game.prompts = [];
    const avatar = Object.values(game.units).find((u) => u.isAvatar && u.owner === 0)!;
    game.cards.cBear = { id: "cBear", name: "Polar Bears", owner: 0 } as GameState["cards"][string];
    game.units.uBear = { ...avatar, id: "uBear", cardId: "cBear", name: "Polar Bears", isAvatar: false, x: 1, y: 1, counters: {}, modifiers: [], carrying: [], carryingUnits: [] };
    game.cards.c80 = { id: "c80", name: "Humming Hummocks", owner: 0 } as GameState["cards"][string];
    game.sites.s80 = { id: "s80", cardId: "c80", name: "Humming Hummocks", x: 1, y: 2, owner: 0, controller: 0, isRubble: false, tapped: false } as GameState["sites"][string];
    return game;
  };

  it("an encased minion, a protected ally and a Blaze runner each get their mark and a sentence", () => {
    const game = board();
    expect(effectMarks(game)).toEqual({});

    getScript("Frost Mage")!.abilities!.find((a) => a.key === "encase")!.effect(makeCtx(game, "uBear", 0 as PlayerId, [{ unit: "uBear" }]));
    getScript("Humming Hummocks")!.genesis!(makeCtx(game, "s80", 0 as PlayerId, []));
    getScript("Blaze")!.onCast!(makeCtx(game, "cBlaze", 0 as PlayerId, [{ unit: "uBear" }]));

    expect(effectMarks(game).uBear).toEqual(["encased", "blazing", "protected"]);
    const status = describeCardStatus({ ...base, marks: effectMarks(game).uBear });
    expect(status.chips.map((c) => c.label)).toEqual(["Encased in ice", "Blazing", "Protected"]);
    expect(status.notes.join(" ")).toContain("takes no damage");

    // Blaze lasts the turn it was cast
    game.turn += 1;
    expect(effectMarks(game).uBear).not.toContain("blazing");
  });
});
