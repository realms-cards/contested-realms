import { applyAction, cloneState, createGame, getCard, orthAdjacentWrapped, validateSummonAt } from "@sorcery/shared";
import type { GameState, PlayerId, Region } from "@sorcery/shared";
import { botAction, botNeedsToAct } from "@untested-realm/bot/bot";
import { describe, expect, it } from "vitest";
import { legalActionsWithCasters } from "./casterActions";
import { enginePrecons, toEngineDeck } from "./decks";

/** Squares upstream's generator tries for summons: on or beside a live site. */
function nearSiteSquares(game: GameState): Set<string> {
  const near = new Set<string>();
  for (const site of Object.values(game.sites)) {
    if (site.isRubble) continue;
    near.add(`${site.x},${site.y}`);
    for (const sq of orthAdjacentWrapped(game, site.x, site.y)) near.add(`${sq.x},${sq.y}`);
  }
  return near;
}

function playUntilMainWithMinion(seed: number): GameState | null {
  const fire = toEngineDeck(enginePrecons[0]);
  // a Voidwalk minion, since only Voidwalk may be summoned onto a bare portent square
  const harbinger = {
    ...fire,
    name: "Harbinger test",
    avatar: "Harbinger",
    spellbook: { ...fire.spellbook, "Barging Barghest": 4 },
  };
  const game = createGame([harbinger, fire], ["You", "Computer"], seed, (seed % 2) as PlayerId);
  for (let i = 0; i < 200 && game.phase !== "over"; i++) {
    const seat: PlayerId | null = botNeedsToAct(game, 0) ? 0 : botNeedsToAct(game, 1) ? 1 : null;
    if (seat === null) break;
    if (
      seat === 0 &&
      game.phase === "main" &&
      !game.prompts.length &&
      game.turn >= 4 &&
      game.players[0].hand.some((id) => getCard(game.cards[id].name).type === "Minion")
    ) {
      return game;
    }
    if (!applyAction(game, seat, botAction(game, seat)).ok)
      applyAction(game, seat, game.prompts[0] ? { t: "prompt", promptId: game.prompts[0].id, choice: null } : { t: "endTurn" });
  }
  return null;
}

describe("legalActionsWithCasters portent casts", () => {
  it("offers every avatar portent cast the engine accepts", () => {
    let checked = 0;
    for (const seed of [1, 2, 3]) {
      const game = playUntilMainWithMinion(seed);
      if (!game) continue;
      const legal = legalActionsWithCasters(game, 0);
      for (const sq of (game.flow?.harbinger?.[0] ?? []) as { x: number; y: number }[]) {
        for (const cardId of game.players[0].hand) {
          for (const region of ["surface", "void"] as Region[]) {
            const action = { t: "castSpell", cardId, casterId: game.players[0].avatarUnitId, at: { ...sq, region } } as const;
            if (!applyAction(cloneState(game), 0, action).ok) continue;
            checked++;
            expect(
              legal.some((a) => a.t === "castSpell" && a.cardId === cardId && a.at?.x === sq.x && a.at?.y === sq.y && a.at?.region === region),
            ).toBe(true);
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  }, 240_000);

  it("offers a portent cast in the void, away from every site", () => {
    const game = playUntilMainWithMinion(1);
    expect(game).not.toBeNull();
    if (!game) return;
    // force the away-square case: a portent on a square no site touches, mana to spare,
    // and a Voidwalk minion in hand (fish one out of the spellbook if needed)
    const near = nearSiteSquares(game);
    game.players[0].mana = 9;
    if (!game.players[0].hand.some((id) => game.cards[id].name === "Barging Barghest")) {
      const inDeck = game.players[0].spellbook.find((id) => game.cards[id].name === "Barging Barghest");
      expect(inDeck).toBeTruthy();
      if (!inDeck) return;
      game.players[0].spellbook.splice(game.players[0].spellbook.indexOf(inDeck), 1);
      game.players[0].hand.push(inDeck);
    }
    const minions = game.players[0].hand.filter((id) => getCard(game.cards[id].name).type === "Minion");
    let away: { x: number; y: number } | null = null;
    let minion: string | undefined;
    for (let y = 0; y < 4 && !minion; y++)
      for (let x = 0; x < 5 && !minion; x++) {
        if (near.has(`${x},${y}`)) continue;
        game.flow = { ...(game.flow ?? {}), harbinger: { 0: [{ x, y }] }, harbingerUsed: {} };
        for (const region of ["surface", "void"] as Region[]) {
          minion ??= minions.find((id) => validateSummonAt(game, 0, game.cards[id].name, { x, y, region }) === null);
          if (minion && !away) away = { x, y };
        }
      }
    expect(minion).toBeTruthy();
    expect(away).not.toBeNull();
    if (!minion || !away) return;
    // enough thresholds for any minion in the test deck (tempThresh is what affinity reads)
    game.flow = { ...(game.flow ?? {}), harbinger: { 0: [away] }, harbingerUsed: {}, tempThresh: { 0: { air: 9, earth: 9, fire: 9, water: 9 } } };
    const region = (["surface", "void"] as Region[]).find(
      (r) => validateSummonAt(game, 0, game.cards[minion!].name, { ...away!, region: r }) === null,
    );
    expect(region).toBeTruthy();
    if (!region) return;
    const action = { t: "castSpell", cardId: minion, casterId: game.players[0].avatarUnitId, at: { ...away, region } } as const;
    const verdict = applyAction(cloneState(game), 0, action);
    expect(verdict.error ?? "ok").toBe("ok");
    const legal = legalActionsWithCasters(game, 0);
    expect(
      legal.some((a) => a.t === "castSpell" && a.cardId === minion && a.at?.x === away!.x && a.at?.y === away!.y && a.at?.region === region),
    ).toBe(true);
  }, 120_000);

  it("offers a plain Voidwalk summon onto any bare square, no grant needed", () => {
    const game = playUntilMainWithMinion(2);
    expect(game).not.toBeNull();
    if (!game) return;
    // no portents, plenty of mana and thresholds — just the Voidwalk keyword
    game.flow = { ...(game.flow ?? {}), harbinger: { 0: [] }, tempThresh: { 0: { air: 9, earth: 9, fire: 9, water: 9 } } };
    game.players[0].mana = 9;
    if (!game.players[0].hand.some((id) => game.cards[id].name === "Barging Barghest")) {
      const inDeck = game.players[0].spellbook.find((id) => game.cards[id].name === "Barging Barghest");
      expect(inDeck).toBeTruthy();
      if (!inDeck) return;
      game.players[0].spellbook.splice(game.players[0].spellbook.indexOf(inDeck), 1);
      game.players[0].hand.push(inDeck);
    }
    const barghest = game.players[0].hand.find((id) => game.cards[id].name === "Barging Barghest");
    const near = nearSiteSquares(game);
    let away: { x: number; y: number } | null = null;
    for (let y = 0; y < 4 && !away; y++)
      for (let x = 0; x < 5 && !away; x++)
        if (!near.has(`${x},${y}`) && validateSummonAt(game, 0, "Barging Barghest", { x, y, region: "void" }) === null) away = { x, y };
    expect(away).not.toBeNull();
    if (!away || !barghest) return;
    const legal = legalActionsWithCasters(game, 0);
    expect(
      legal.some((a) => a.t === "castSpell" && a.cardId === barghest && a.at?.x === away!.x && a.at?.y === away!.y && a.at?.region === "void"),
    ).toBe(true);
  }, 120_000);
});
