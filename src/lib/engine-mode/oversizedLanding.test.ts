import { describe, expect, it } from "vitest";
import { applyAction, cloneState, createGame, makeCtx, occupiedSquares, teleportWithPlacement } from "@sorcery/shared";
import type { Action, GameState, PlayerId } from "@sorcery/shared";
import { legalActionsWithCasters, teleportLandingSquares } from "@shared/engine/casterActions";
import { actionPaths } from "./actionPaths";
import { placementPicks } from "./areaPrompt";
import { engineCellKey } from "./coords";
import { enginePrecons, toEngineDeck } from "./decks";

const YOU = 0 as PlayerId;

/**
 * Your main phase: a 2x2 ally on tiles (1,1)-(2,2), every square a site of yours (air for Blink's
 * threshold), Blink in hand and the mana to cast it.
 */
function giantAndBlink(): GameState {
  const deck = toEngineDeck(enginePrecons[0]);
  const game = createGame([deck, deck], ["You", "Computer"], 13, YOU);
  game.phase = "main";
  game.prompts = [];
  game.activePlayer = YOU;
  game.turn = 5;
  let n = 0;
  for (let x = 0; x < 5; x++) {
    for (let y = 0; y < 4; y++) {
      const id = `s${70 + n++}`;
      game.cards[`c${id}`] = { id: `c${id}`, name: "Spire", owner: YOU } as GameState["cards"][string];
      game.sites[id] = { id, cardId: `c${id}`, name: "Spire", x, y, owner: YOU, controller: YOU, isRubble: false, tapped: false } as GameState["sites"][string];
    }
  }
  const avatar = Object.values(game.units).find((u) => u.isAvatar && u.owner === YOU)!;
  game.cards.cGiant = { id: "cGiant", name: "Mountain Giant", owner: YOU } as GameState["cards"][string];
  game.units.uGiant = {
    ...avatar, id: "uGiant", cardId: "cGiant", name: "Mountain Giant", isAvatar: false, x: 1, y: 1, size: "2x2",
    tapped: false, damage: 0, enteredTurn: 1, counters: {}, modifiers: [], carrying: [], carryingUnits: [],
  };
  game.cards.cBlink = { id: "cBlink", name: "Blink", owner: YOU } as GameState["cards"][string];
  game.players[YOU].hand.push("cBlink");
  game.players[YOU].mana = 5;
  return game;
}

const footprint = (squares: { x: number; y: number }[]) => squares.map((sq) => `${sq.x},${sq.y}`).sort();

describe("an oversized ally's landing is the player's choice", () => {
  it("Blink offers one cast per landing, each picked on a tile only it covers, and lands where it showed", () => {
    const game = giantAndBlink();
    const legal = legalActionsWithCasters(game, YOU);
    const blinks = legal.filter((a) => a.t === "castSpell" && a.cardId === "cBlink" && a.targets?.[0] === "uGiant");
    // group by destination: some destination must offer several landings
    const byDest = new Map<string, Action[]>();
    for (const blink of blinks) if (blink.t === "castSpell") byDest.set(blink.targets![1], [...(byDest.get(blink.targets![1]) ?? []), blink]);
    const [dest, casts] = [...byDest.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    expect(casts.length).toBeGreaterThan(1);

    const { paths } = actionPaths(game, legal);
    const last = casts.map((cast) => paths.find((p) => p.action === cast)!);
    // every landing ends on a distinct tile, previewing its own footprint
    const ends = last.map((p) => p.steps[p.steps.length - 1]);
    expect(new Set(ends).size).toBe(casts.length);
    for (const [i, path] of last.entries()) {
      const squares = teleportLandingSquares(game, casts[i])!;
      expect(path.areas?.[ends[i]]?.slice().sort()).toEqual(squares.map((sq) => engineCellKey(sq.x, sq.y, 0)).sort());
    }

    // and the engine lands it exactly there
    for (const cast of casts) {
      const trial = cloneState(game);
      expect(applyAction(trial, YOU, cast).ok).toBe(true);
      expect(footprint(occupiedSquares(trial.units.uGiant))).toEqual(footprint(teleportLandingSquares(game, cast)!));
    }
    expect(dest.startsWith("sq:")).toBe(true);
  });

  it("the engine's own placement prompt (teleportPlace) gets one board pick per landing", () => {
    const game = giantAndBlink();
    teleportWithPlacement(makeCtx(game, "uGiant", YOU, []), "uGiant", { x: 3, y: 2 });
    const prompt = game.prompts[0];
    expect(prompt?.kind).toBe("teleportPlace");
    const placements = (prompt.data as { placements: { squares: { x: number; y: number }[] }[] }).placements;
    const picks = placementPicks(placements, 0)!;
    expect(picks.tokens).toHaveLength(placements.length);
    // pick the second landing through its token and check the engine puts the body there
    const token = picks.tokens[1];
    expect(applyAction(game, YOU, { t: "prompt", promptId: prompt.id, choice: picks.index[token] }).ok).toBe(true);
    expect(footprint(occupiedSquares(game.units.uGiant))).toEqual(footprint(placements[1].squares));
  });
});
