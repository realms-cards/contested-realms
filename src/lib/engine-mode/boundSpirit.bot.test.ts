import { createGame, isDisabled } from "@sorcery/shared";
import type { GameState as EngineState, PlayerId, UnitState } from "@sorcery/shared";
import { botAction } from "@untested-realm/bot/bot";
import { searchBotAction } from "@untested-realm/bot/bot_search";
import { expect, it } from "vitest";
import { enginePrecons, toEngineDeck } from "./decks";
import "@shared/engine/scriptPatches";

/**
 * Bound Spirit: "Disabled unless adjacent to an allied Spellcaster." The CPU used to summon it
 * beside the human avatar (the bot presses every summon toward the enemy), where it arrives
 * disabled and never acts. Fixed in the vendored bot (realms dcf05d7): disabled units threaten
 * nothing in the eval, and placement skips spots where a minion would arrive disabled.
 */
it("the CPU summons Bound Spirit next to its own avatar, not beside the human's", () => {
  const g = createGame([toEngineDeck(enginePrecons[0]), toEngineDeck(enginePrecons[1])], ["You", "Computer"], 7, 1 as PlayerId);
  g.phase = "main"; g.activePlayer = 1 as PlayerId; g.prompts = [];
  const me = Object.values(g.units).find((u) => u.isAvatar && u.owner === 1)!;
  const foe = Object.values(g.units).find((u) => u.isAvatar && u.owner === 0)!;
  expect(foe.x === me.x && foe.y !== me.y, "the avatars face each other down one column").toBe(true);
  const site = (id: string, x: number, y: number) =>
    (g.sites[id] = { id, name: "Spire", x, y, owner: 1, controller: 1, isRubble: false, tapped: false } as unknown as EngineState["sites"][string]);
  // a line of the bot's sites from its avatar to the square beside the human avatar
  for (let y = 0; y < 4; y++) site(`s${y}`, me.x, y);
  me.tapped = true;
  g.players[1].hand = ["c_b"];
  g.cards["c_b"] = { id: "c_b", name: "Bound Spirit", owner: 1 } as unknown as EngineState["cards"][string];
  g.players[1].mana = 9;
  const a = searchBotAction(g, 1 as PlayerId);
  expect(a.t).toBe("castSpell");
  const at = (a as { at?: { x: number; y: number } }).at!;
  expect(Math.max(Math.abs(at.x - me.x), Math.abs(at.y - me.y)), "summoned away from any allied spellcaster").toBeLessThanOrEqual(1);
});

/**
 * A Yeti So Shy (Outerbound: disabled off the outside of the realm). The bot's "would it arrive
 * disabled?" check asked with a probe that wasn't on the board, and the engine only disables units
 * in the realm, so the CPU summoned it on inner squares, disabled. Fixed in the vendored bot
 * (realms 74cb330, fix/summon-probe-in-realm): the probe is judged in the realm.
 */
it.each([
  ["the plain bot", (g: EngineState) => botAction(g, 1 as PlayerId)],
  ["the search bot", (g: EngineState) => searchBotAction(g, 1 as PlayerId)],
] as const)("%s summons an Outerbound minion on the outside of the realm", (_label, choose) => {
  const g = createGame([toEngineDeck(enginePrecons[0]), toEngineDeck(enginePrecons[1])], ["You", "Computer"], 7, 1 as PlayerId);
  g.phase = "main"; g.activePlayer = 1 as PlayerId; g.prompts = [];
  const me = Object.values(g.units).find((u) => u.isAvatar && u.owner === 1)!;
  // its home square (an edge) and a block of inner squares toward the human
  const squares: [number, number][] = [[me.x, me.y], [1, 1], [2, 1], [3, 1], [1, 2], [2, 2], [3, 2]];
  for (const [i, [x, y]] of squares.entries()) {
    g.sites[`s${i}`] = { id: `s${i}`, name: "Spire", x, y, owner: 1, controller: 1, isRubble: false, tapped: false } as unknown as EngineState["sites"][string];
  }
  me.tapped = true;
  g.players[1].hand = ["c_y"];
  g.cards["c_y"] = { id: "c_y", name: "A Yeti So Shy", owner: 1 } as unknown as EngineState["cards"][string];
  g.players[1].mana = 9;
  const a = choose(g);
  expect(a.t === "castSpell" && a.cardId === "c_y").toBe(true);
  const at = (a as { at: { x: number; y: number } }).at;
  const probe = { ...me, id: "probe", name: "A Yeti So Shy", isAvatar: false, x: at.x, y: at.y } as UnitState;
  expect(isDisabled({ ...g, units: { ...g.units, probe } }, probe), `summoned disabled at ${at.x},${at.y}`).toBe(false);
});
