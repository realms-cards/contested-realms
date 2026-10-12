import { applyAction, createGame } from "@sorcery/shared";
import { describe, expect, it } from "vitest";
import { enginePrecons, toEngineDeck } from "@/lib/engine-mode/decks";
import { preGameSurface } from "./EnginePromptPanel";

/**
 * Guards the setup strand: an avatar whose `onSetup` hook pushes a prompt inside `createGame`
 * (the Dragonlord) makes the engine refuse every mulligan action until that prompt is
 * answered. If the UI shows the mulligan banner anyway, the match cannot start at all.
 */
describe("pre-game surface order", () => {
  const precon = () => toEngineDeck(enginePrecons[0]);

  it("shows the prompt, not the mulligan, when setup left one open", () => {
    const game = createGame([{ ...precon(), avatar: "Dragonlord" }, precon()], ["You", "Computer"], 3, 0);

    // the engine really does refuse the mulligan while this prompt is open
    expect(game.prompts[0]?.kind).toBe("nameCard");
    const refused = applyAction(game, 0, { t: "keepHand" });
    expect(refused.ok).toBe(false);
    expect(refused.error).toContain("Waiting for");

    expect(preGameSurface(game, true)).toBe("prompt");
  });

  it("still puts the Harbinger portal roll first", () => {
    const game = createGame([{ ...precon(), avatar: "Dragonlord" }, precon()], ["You", "Computer"], 3, 0);
    expect(preGameSurface(game, false)).toBe("portal");
  });

  it("shows the mulligan normally when setup left no prompt", () => {
    const game = createGame([precon(), precon()], ["You", "Computer"], 3, 0);
    expect(game.prompts).toHaveLength(0);
    expect(preGameSurface(game, true)).toBe("mulligan");
  });

  it("shows nothing once the hand is kept and no prompt is ours", () => {
    const game = createGame([precon(), precon()], ["You", "Computer"], 3, 0);
    expect(applyAction(game, 0, { t: "keepHand" }).ok).toBe(true);
    expect(preGameSurface(game, true)).toBe("none");
  });
});
