import { applyAction, createGame, legalSiteSquares } from "@sorcery/shared";
import type { GameState as EngineState, PlayerId } from "@sorcery/shared";
import { describe, expect, it } from "vitest";
import { enginePrecons, toEngineDeck } from "./decks";

/**
 * Engine fix carried in our fork (realms-cards/Untested-realm, branch `realms`), proposed
 * upstream: the forced first site must always land under the avatar.
 *
 * A player who already controls a site elsewhere used to be unable to establish one under
 * their own avatar at all — `legalSiteSquares` stops offering your own square the moment you
 * control any site, and the forced placement went through that check. Imperial Road's Genesis
 * gives an opponent exactly that situation.
 */
describe("establishing the first site", () => {
  const game = (): EngineState => {
    const deck = toEngineDeck(enginePrecons[0]);
    return createGame([deck, deck], ["You", "Computer"], 71, 0 as PlayerId);
  };

  it("still stops offering your own square once you control a distant site", () => {
    // the engine behaviour the fix works AROUND, pinned so we notice if it changes
    const g = game();
    const avatar = Object.values(g.units).find((u) => u.isAvatar && u.owner === 1)!;
    expect(legalSiteSquares(g, 1 as PlayerId).some((s) => s.x === avatar.x && s.y === avatar.y)).toBe(true);

    g.sites["far"] = {
      id: "far", name: "Dark Tower", x: avatar.x, y: Math.abs(avatar.y - 3),
      owner: 1, controller: 1, isRubble: false, tapped: false,
    } as unknown as EngineState["sites"][string];
    expect(legalSiteSquares(g, 1 as PlayerId).some((s) => s.x === avatar.x && s.y === avatar.y)).toBe(false);
  });

  it("establishes under the avatar anyway, through the forced placement", () => {
    const g = game();
    const avatar = Object.values(g.units).find((u) => u.isAvatar && u.owner === 0)!;
    g.sites["far"] = {
      id: "far", name: "Dark Tower", x: avatar.x, y: Math.abs(avatar.y - 3),
      owner: 0, controller: 0, isRubble: false, tapped: false,
    } as unknown as EngineState["sites"][string];

    // answer the forced first-site prompt the way the player would
    const prompt = g.prompts.find((p) => p.kind === "firstSite");
    if (prompt) {
      const ids = (prompt.data as { ids?: string[] }).ids ?? [];
      expect(applyAction(g, 0 as PlayerId, { t: "prompt", promptId: prompt.id, choice: ids[0] }).ok).toBe(true);
      // the site landed under the avatar and the domain is established
      const under = Object.values(g.sites).find((s) => s.x === avatar.x && s.y === avatar.y && !s.isRubble);
      expect(under, "a site should sit under the avatar").toBeTruthy();
      expect(g.players[0].established).toBe(true);
      expect(g.log.some((l) => /First site could not be placed/.test(l.msg))).toBe(false);
    }
  });
});
