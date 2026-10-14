import { applyAction, createGame } from "@sorcery/shared";
import type { PlayerId } from "@sorcery/shared";
import { botAction, botNeedsToAct } from "@untested-realm/bot/bot";
import { expect, it } from "vitest";
import { engineCellKey, localizeEngineText, type ViewerSeat } from "./coords";
import { enginePrecons, toEngineDeck } from "./decks";

const tileOf = (x: number, y: number, viewer: ViewerSeat) => {
  const [bx, by] = engineCellKey(x, y, viewer).split(",").map(Number);
  return by * 5 + bx + 1;
};

const VIEWERS: readonly ViewerSeat[] = [0, 1];

/** Every "plays X at tile N" line must name a tile a card of that name is actually on. */
it("log tile numbers match the projected board", () => {
  let checked = 0;
  // the two viewers see the same square under different numbers; a viewer-blind rewrite would
  // quietly pass the per-viewer check below while never once disagreeing
  let disagreed = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const g = createGame([toEngineDeck(enginePrecons[seed % 4]), toEngineDeck(enginePrecons[(seed + 1) % 4])], ["You", "Computer"], seed, (seed % 2) as PlayerId);
    let seen = 0;
    for (let i = 0; i < 300 && g.phase !== "over"; i++) {
      const s: PlayerId | null = botNeedsToAct(g, 0) ? 0 : botNeedsToAct(g, 1) ? 1 : null;
      if (s === null) break;
      if (!applyAction(g, s, botAction(g, s)).ok)
        applyAction(g, s, g.prompts[0] ? { t: "prompt", promptId: g.prompts[0].id, choice: null } : { t: "endTurn" });
      for (const line of g.log.slice(seen)) {
        const named: number[] = [];
        for (const viewer of VIEWERS) {
          const m = /plays? (.+?) at tile (\d+)\./.exec(localizeEngineText(line.msg, viewer));
          if (!m) continue;
          const [, name, tile] = m;
          const tiles = Object.values(g.sites).filter((x) => x.name === name).map((x) => tileOf(x.x, x.y, viewer));
          if (!tiles.length) continue;
          expect({ viewer, name, tile: Number(tile), onBoard: tiles }).toEqual({ viewer, name, tile: Number(tile), onBoard: expect.arrayContaining([Number(tile)]) });
          named.push(Number(tile));
          checked++;
        }
        if (named.length === 2 && named[0] !== named[1]) disagreed++;
      }
      seen = g.log.length;
    }
  }
  expect(checked).toBeGreaterThan(3);
  expect(disagreed).toBeGreaterThan(0);
}, 300000);
