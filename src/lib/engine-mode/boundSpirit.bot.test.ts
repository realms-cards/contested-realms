import { createGame } from "@sorcery/shared";
import type { GameState as EngineState, PlayerId } from "@sorcery/shared";
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
