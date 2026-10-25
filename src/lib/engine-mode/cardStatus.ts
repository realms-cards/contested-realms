import { keywordLabel, type UnitState } from "@sorcery/shared";

/**
 * What is going on with a card on the board, spelled out for the preview: the statuses the board
 * draws as small badges (Disabled, Silenced, Ward, Stealth, changed power/life, damage) as chips, and
 * the effects behind them in words ("Gains Airborne until end of turn", "+2 power until …").
 *
 * The statuses and the changed stats come from the board model the badges are drawn from, so they
 * read the same in single player and online (where `disabled` and power arrive from the server and
 * the unit's own flags would miss a derived disable). The unit adds what the badges cannot say:
 * its modifiers and their durations, its counters, what it carries.
 */

export type BoardStatus = "stealth" | "ward" | "disabled" | "silenced";

export interface StatusChip {
  key: string;
  icon: string;
  label: string;
  tone: "bad" | "good" | "info";
}

export interface CardStatusInput {
  /** the engine unit (the full state in single player, the player's view online), if it is one */
  unit: Pick<UnitState, "tapped" | "damage" | "region" | "modifiers" | "isAvatar" | "deathsDoor" | "counters" | "carriedBy"> | null;
  /** the status tokens the board has attached to it */
  statuses: BoardStatus[];
  /** current power/life — present only when an effect has moved them off the printed values */
  stats: { atk: number; def: number } | null;
  printed: { attack: number | null; defence: number | null } | null;
  /** names of the artifacts it carries, and of the unit carrying it */
  carrying: string[];
  carriedBy: string | null;
}

const STATUS_CHIPS: Record<BoardStatus, Omit<StatusChip, "key">> = {
  disabled: { icon: "game-icons:manacles", label: "Disabled", tone: "bad" },
  silenced: { icon: "game-icons:silenced", label: "Silenced", tone: "bad" },
  ward: { icon: "game-icons:magic-shield", label: "Ward", tone: "good" },
  stealth: { icon: "game-icons:hood", label: "Stealth", tone: "info" },
};

const STATUS_NOTES: Partial<Record<BoardStatus, string>> = {
  disabled: "Disabled: no abilities, can't strike, take steps or be tapped to pay for costs.",
  silenced: "Silenced: loses its printed abilities.",
};

const DURATION: Record<string, string> = {
  endOfTurn: " until end of turn",
  untilYourNextTurn: " until its controller's next turn",
  permanent: "",
};

/** the engine's label, capitalized as the cards print keywords ("airborne" → "Airborne") */
const keywordName = (keyword: Parameters<typeof keywordLabel>[0]): string => keywordLabel(keyword).replace(/^./, (c) => c.toUpperCase());

export function describeCardStatus(input: CardStatusInput): { chips: StatusChip[]; notes: string[] } {
  const { unit, statuses, stats, printed } = input;
  const chips: StatusChip[] = [];
  const notes: string[] = [];

  for (const status of ["disabled", "silenced", "ward", "stealth"] as BoardStatus[]) {
    if (!statuses.includes(status)) continue;
    chips.push({ key: status, ...STATUS_CHIPS[status] });
    const note = STATUS_NOTES[status];
    if (note) notes.push(note);
  }

  if (stats && printed) {
    const atk = stats.atk - (printed.attack ?? 0);
    const def = stats.def - (printed.defence ?? printed.attack ?? 0);
    const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);
    if (atk !== 0) chips.push({ key: "power", icon: "game-icons:crossed-swords", label: `Power ${stats.atk} (${sign(atk)})`, tone: atk > 0 ? "good" : "bad" });
    if (def !== 0) chips.push({ key: "life", icon: "game-icons:heart-plus", label: `Life ${stats.def} (${sign(def)})`, tone: def > 0 ? "good" : "bad" });
  }
  if (unit?.damage) chips.push({ key: "damage", icon: "game-icons:sword-wound", label: `${unit.damage} damage`, tone: "bad" });
  if (unit?.tapped) chips.push({ key: "tapped", icon: "game-icons:clockwise-rotation", label: "Tapped", tone: "info" });
  if (unit?.region === "underground") chips.push({ key: "region", icon: "game-icons:underground-cave", label: "Burrowed", tone: "info" });
  if (unit?.region === "underwater") chips.push({ key: "region", icon: "game-icons:wave-crest", label: "Submerged", tone: "info" });
  if (unit?.deathsDoor) chips.push({ key: "door", icon: "game-icons:door", label: "Death's Door", tone: "bad" });

  for (const m of unit?.modifiers ?? []) {
    const until = DURATION[m.duration] ?? "";
    if (m.kind === "power" && m.amount) notes.push(`${m.amount > 0 ? "+" : ""}${m.amount} power${until}.`);
    else if (m.kind === "keyword" && m.keyword)
      notes.push(m.remove ? `Loses ${keywordName(m.keyword)}${until}.` : `Gains ${keywordName(m.keyword)}${until}.`);
    else if (m.kind === "text" && m.note) notes.push(`${m.note}${until}.`);
  }
  if (unit?.counters?.asleep) notes.push("Asleep: disabled until it takes damage.");
  if (input.carriedBy) notes.push(`Carried by ${input.carriedBy}.`);
  if (input.carrying.length) notes.push(`Carrying ${input.carrying.join(", ")}.`);

  // the same sentence twice adds nothing (two identical grants read as one)
  return { chips, notes: [...new Set(notes)] };
}
