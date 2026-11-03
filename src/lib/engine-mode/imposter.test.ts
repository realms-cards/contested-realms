import { applyAction, createGame, makeCtx, viewFor } from "@sorcery/shared";
import type { Action, GameState, PlayerId } from "@sorcery/shared";
import { describe, expect, it } from "vitest";
import { legalActionsWithCasters } from "@shared/engine/casterActions";
import { enginePrecons, toEngineDeck } from "./decks";
import { imposterMaskOf, projectView } from "./projection";

const ME = 0 as PlayerId;

/** Seat 0's main phase with fewer than 4 sites, its Avatar renamed to `avatar`, untapped and with mana. */
function mainPhaseAs(avatar: string): { game: GameState; avatarId: string } {
  const deck = toEngineDeck(enginePrecons[0]);
  const game = createGame([deck, deck], ["You", "Computer"], 7, ME);
  game.phase = "main";
  game.activePlayer = ME;
  game.prompts = [];
  const unit = Object.values(game.units).find((u) => u.isAvatar && u.owner === ME)!;
  unit.name = avatar;
  game.cards[unit.cardId].name = avatar;
  unit.tapped = false;
  game.players[ME].mana = 10;
  return { game, avatarId: unit.id };
}

const abilitiesOf = (game: GameState, sourceId: string) =>
  legalActionsWithCasters(game, ME)
    .filter((a): a is Extract<Action, { t: "activate" }> => a.t === "activate" && a.sourceId === sourceId)
    .map((a) => a.ability);

function donMask(game: GameState, avatarId: string, mask: string) {
  game.players[ME].collection = { [mask]: 1 };
  expect(applyAction(game, ME, { t: "activate", sourceId: avatarId, ability: "imposter:mask" }).ok).toBe(true);
  const prompt = game.prompts[0];
  expect(prompt.kind).toBe("chooseCards");
  expect(applyAction(game, ME, { t: "prompt", promptId: prompt.id, choice: [0] }).ok).toBe(true);
}

describe("an Avatar's tap abilities are offered before 4 sites", () => {
  // upstream's bot list holds them back below 4 sites ("develop instead"); that's strategy, not a rule
  it("Sorcerer can draw a spell on an early turn", () => {
    const { game, avatarId } = mainPhaseAs("Sorcerer");
    expect(Object.values(game.sites).filter((s) => s.controller === ME).length).toBeLessThan(4);
    expect(abilitiesOf(game, avatarId)).toContain("drawSpell");
  });
});

describe("the Imposter wears its mask", () => {
  it("masked as Sorcerer, it has Sorcerer's draw, and using it taps and draws", () => {
    const { game, avatarId } = mainPhaseAs("Imposter");
    expect(abilitiesOf(game, avatarId)).not.toContain("drawSpell");
    donMask(game, avatarId, "Sorcerer");
    expect(abilitiesOf(game, avatarId)).toContain("drawSpell");
    const hand = game.players[ME].hand.length;
    expect(applyAction(game, ME, { t: "activate", sourceId: avatarId, ability: "drawSpell" }).ok).toBe(true);
    expect(game.units[avatarId].tapped).toBe(true);
    expect(game.players[ME].hand.length).toBe(hand + 1);
  });

  it("the board shows the mask's face on the Imposter's own card, until damage cracks it", () => {
    const { game, avatarId } = mainPhaseAs("Imposter");
    const cardId = game.units[avatarId].cardId;
    /** the card our board draws in seat 0's avatar slot — same instance, so nothing remounts */
    const shown = () => {
      const card = projectView(viewFor(game, ME)).avatars.p1?.card;
      expect(card?.instanceId).toBe(cardId);
      return card?.name;
    };
    expect(shown()).toBe("Imposter");

    donMask(game, avatarId, "Sorcerer");
    expect(imposterMaskOf(game, game.units[avatarId])).toBe("Sorcerer");
    expect(shown()).toBe("Sorcerer");

    makeCtx(game, avatarId, 1 as PlayerId, []).dealDamage({ unit: avatarId }, 1);
    expect(imposterMaskOf(game, game.units[avatarId])).toBeNull();
    expect(shown()).toBe("Imposter");
  });
});
