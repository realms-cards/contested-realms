import { describe, expect, it } from "vitest";
import { describeCardStatus, type CardStatusInput } from "./cardStatus";

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
});
