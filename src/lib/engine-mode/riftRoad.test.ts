import { applyAction, createGame, forcedSiteSquares, playSite, siteAt } from "@sorcery/shared";
import type { GameState as EngineState, PlayerId } from "@sorcery/shared";
import { describe, expect, it } from "vitest";
import { enginePrecons, toEngineDeck } from "./decks";

/**
 * Engine fix carried in our fork and proposed upstream: a forced site placement must honour
 * the card's own placement script.
 *
 * Rift Valley is played by pulling a partial row or column apart to make the void it goes
 * into, so its legal squares are OCCUPIED seams. Imperial Road used to offer only empty
 * neighbours, making the two sets disjoint — the ability could never fire through the road.
 */
const site = (id: string, x: number, y: number, name: string) =>
  ({ id, name, x, y, owner: 0, controller: 0, isRubble: false, tapped: false }) as unknown as EngineState["sites"][string];

function board() {
  const deck = toEngineDeck(enginePrecons[0]);
  const g = createGame([deck, deck], ["You", "Computer"], 81, 0 as PlayerId);
  // a partial run along row y=1, with the road at its end and (3,1) free
  g.sites["r0"] = site("r0", 0, 1, "Dark Tower");
  g.sites["r1"] = site("r1", 1, 1, "Lone Tower");
  g.sites["road"] = site("road", 2, 1, "Imperial Road");
  return g;
}

/** Put a named card into a player's hand and return its id. */
function intoHand(g: EngineState, player: PlayerId, name: string): string {
  const id = `c_${name.replace(/\s+/g, "_")}`;
  g.cards[id] = { id, name, owner: player } as unknown as EngineState["cards"][string];
  g.players[player].hand.push(id);
  return id;
}

const adjacentToRoad = [
  { x: 3, y: 1 },
  { x: 1, y: 1 },
  { x: 2, y: 2 },
  { x: 2, y: 0 },
];

describe("a forced placement honours the card's own placement script", () => {
  it("offers Rift Valley the occupied seam beside the road", () => {
    const g = board();
    const squares = forcedSiteSquares(g, 0 as PlayerId, "Rift Valley", adjacentToRoad);
    // (1,1) is occupied, and is exactly where the land can be pulled apart
    expect(squares.some((s) => s.x === 1 && s.y === 1)).toBe(true);
  });

  it("offers an ordinary site only the free squares, as before", () => {
    const g = board();
    const squares = forcedSiteSquares(g, 0 as PlayerId, "Dark Tower", adjacentToRoad);
    expect(squares.some((s) => s.x === 1 && s.y === 1)).toBe(false);
    expect(squares.some((s) => s.x === 3 && s.y === 1)).toBe(true);
  });

  it("actually plays Rift Valley onto the seam, pulling the row apart", () => {
    const g = board();
    const card = intoHand(g, 0 as PlayerId, "Rift Valley");
    const err = playSite(g, 0 as PlayerId, card, 1, 1, { force: true });
    expect(err, `expected the forced placement to succeed, got: ${err}`).toBeFalsy();
    // (1,1) can be pulled apart along the row or out of its own column, so the engine asks
    // which way the land parts before anything moves.
    const prompt = g.prompts[0];
    expect(prompt?.title).toContain("Pull the land apart");
    applyAction(g, 0 as PlayerId, { t: "prompt", promptId: prompt.id, choice: "push the row east" });
    expect(siteAt(g, 1, 1)?.name).toBe("Rift Valley");
    // the sites that were there are still on the board — pushed, not destroyed
    expect(Object.values(g.sites).some((s) => s.name === "Lone Tower" && !s.isRubble)).toBe(true);
  });

  it("still refuses an ordinary site forced onto an occupied square", () => {
    const g = board();
    const card = intoHand(g, 0 as PlayerId, "Dark Tower");
    expect(playSite(g, 0 as PlayerId, card, 1, 1, { force: true })).toBe("A site already occupies that square.");
  });
});
