import { parsePickToken } from "@/lib/game/cpu/pickTokens";

/**
 * What this pick is actually made of, so the banner can name it.
 *
 * SinglePick serves four prompt kinds with four different token kinds — squares, cards in
 * hand, units on the board, and the two deck piles — so it cannot assume. Saying "2 squares"
 * over a "Draw from your spellbook or your atlas?" prompt is worse than saying nothing.
 */
export function pickNoun(tokens: string[]): { one: string; many: string } | null {
  if (!tokens.length) return null;
  const kinds = new Set(tokens.map((token) => parsePickToken(token)?.kind ?? "other"));
  if (kinds.size !== 1) return null;
  switch ([...kinds][0]) {
    case "tile":
      return { one: "square", many: "squares" };
    case "hand":
      return { one: "card", many: "cards" };
    case "unit":
      return { one: "target", many: "targets" };
    // the two piles are named by their own buttons; a count of them says nothing
    default:
      return null;
  }
}

/**
 * Where the pick's targets are, for the banner's hint: cards in a hand are not "on the board"
 * (the first-site and mulligan prompts light the hand). A hand pick for the seat you pilot
 * under Courtesan Thaïs is "their" hand.
 */
export function pickPlace(tokens: string[]): string {
  const hands = tokens.map((token) => parsePickToken(token)).filter((parsed) => parsed?.kind === "hand");
  if (!tokens.length || hands.length !== tokens.length) return "on the board";
  return hands.every((parsed) => parsed && "seat" in parsed && parsed.seat === "p1") ? "in your hand" : "in their hand";
}

/** Same function, named so a test can reach it without rendering the board. */
export const pickNounForTest = pickNoun;
