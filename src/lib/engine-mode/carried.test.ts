import { createGame } from "@sorcery/shared";
import type { GameState as EngineState, PlayerId } from "@sorcery/shared";
import { describe, expect, it } from "vitest";
import { tokenForEngineId } from "./actionPaths";
import { enginePrecons, toEngineDeck } from "./decks";

/**
 * A carried artifact (Toolbox, a Weapon) is drawn as a small attachment on its bearer, and
 * PermanentStack skips attachments in the loop that assigns pick tokens
 * (`if (p.attachedTo) return null`). So `unit:perm:<artifactId>` has no click target at all —
 * which is why a carried Toolbox could not be activated. Anchor it on the bearer instead.
 */
function withCarried(bearerIsAvatar: boolean): { game: EngineState; bearerId: string } {
  const deck = toEngineDeck(enginePrecons[0]);
  const game = createGame([deck, deck], ["You", "Computer"], 13, 0 as PlayerId);
  const bearer = Object.values(game.units).find((u) => u.isAvatar === bearerIsAvatar && u.owner === 0);
  if (!bearer) throw new Error("no bearer");
  game.artifacts["a1"] = {
    id: "a1",
    cardId: "cA1",
    name: "Toolbox",
    x: bearer.x,
    y: bearer.y,
    region: "surface",
    carriedBy: bearer.id,
    tapped: false,
    conjuredBy: 0,
  } as unknown as EngineState["artifacts"][string];
  return { game, bearerId: bearer.id };
}

describe("carried artifacts are clickable through their bearer", () => {
  it("resolves to the bearer's avatar token", () => {
    const { game } = withCarried(true);
    expect(tokenForEngineId(game, "a1")).toBe("unit:avatar:p1");
  });

  it("resolves to the bearer's permanent token for a minion", () => {
    const deck = toEngineDeck(enginePrecons[0]);
    const game = createGame([deck, deck], ["You", "Computer"], 13, 0 as PlayerId);
    const avatar = Object.values(game.units).find((u) => u.isAvatar && u.owner === 0)!;
    game.units["u99"] = { ...avatar, id: "u99", isAvatar: false, name: "Bearer" };
    game.artifacts["a1"] = {
      id: "a1",
      cardId: "cA1",
      name: "Toolbox",
      x: avatar.x,
      y: avatar.y,
      region: "surface",
      carriedBy: "u99",
      tapped: false,
      conjuredBy: 0,
    } as unknown as EngineState["artifacts"][string];
    expect(tokenForEngineId(game, "a1")).toBe("unit:perm:u99");
  });

  it("leaves a loose artifact on its own square", () => {
    const { game } = withCarried(true);
    game.artifacts["a1"] = { ...game.artifacts["a1"], carriedBy: undefined };
    expect(tokenForEngineId(game, "a1")).toBe("unit:perm:a1");
  });
});
