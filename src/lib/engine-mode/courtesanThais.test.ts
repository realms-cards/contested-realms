import { actingSeatFor, applyAction, createGame, getScript } from "@sorcery/shared";
import type { GameState as EngineState, PlayerId } from "@sorcery/shared";
import { botAction, botNeedsToAct } from "@untested-realm/bot/bot";
import { describe, expect, it } from "vitest";
import { pilotHandCards } from "@/components/engine-mode/useEngineInteraction";
import { actionPaths } from "./actionPaths";
import { legalActionsWithCasters } from "./casterActions";
import { enginePrecons, toEngineDeck } from "./decks";
import { controlSwap, humanDecisionSeat, isPiloting, linesForToast } from "./session";

/**
 * Courtesan Thaïs — "Genesis → During their next turn, each player is controlled by the previous
 * one." The script sets `flow.thaisPending = [0, 1]` whoever casts it; each seat's next turn
 * start turns that into `flow.thaisActive = <that seat>`, and the engine then hands that turn's
 * decisions to the other seat. The engine is right; these pin the UI's reading of it.
 */
const P0 = 0 as PlayerId;
const P1 = 1 as PlayerId;

function toMain(active: PlayerId): EngineState {
  const deck = toEngineDeck(enginePrecons[0]);
  const g = createGame([deck, deck], ["You", "Computer"], 11, P0);
  for (let i = 0; i < 400; i++) {
    if (g.phase === "main" && g.activePlayer === active && !g.prompts.length && g.turn >= 3) return g;
    const who: PlayerId | null = botNeedsToAct(g, P0) ? P0 : botNeedsToAct(g, P1) ? P1 : null;
    if (who === null) break;
    const r = applyAction(g, who, botAction(g, who));
    if (!r.ok) applyAction(g, who, g.prompts[0] ? { t: "prompt", promptId: g.prompts[0].id, choice: null } : { t: "endTurn" });
  }
  throw new Error("could not reach a main phase");
}

/** Courtesan Thaïs's Genesis, cast by `caster` (the script only touches the state and its controller). */
function thaisGenesis(g: EngineState, caster: PlayerId) {
  const genesis = getScript("Courtesan Thaïs")?.genesis;
  if (!genesis) throw new Error("Courtesan Thaïs has no Genesis script");
  genesis({ state: g, controller: caster } as unknown as Parameters<typeof genesis>[0]);
}

/** Answer whatever start-of-turn prompts are up, as `seat`. */
function clearPrompts(g: EngineState, seat: PlayerId) {
  for (let i = 0; i < 20 && g.prompts[0]; i++) {
    expect(applyAction(g, seat, { t: "prompt", promptId: g.prompts[0].id, choice: null }).ok).toBe(true);
  }
}

describe("Courtesan Thaïs, as the player sees it", () => {
  it("cast by the computer: announces, then 'the Computer is playing your turn', then ours to play theirs", () => {
    const g = toMain(P1);
    expect(controlSwap(g)).toBeNull();
    thaisGenesis(g, P1);
    // still the computer's turn: the heads-up for the next one
    expect(controlSwap(g)).toMatchObject({ kind: "computer-will-play-yours", now: false });
    expect(applyAction(g, P1, { t: "endTurn" }).ok).toBe(true);

    // our turn, played by the computer
    expect(g.activePlayer).toBe(P0);
    expect(controlSwap(g)).toEqual({
      kind: "computer-plays-yours",
      now: true,
      text: "Courtesan Thaïs: the Computer is playing your turn",
    });
    expect(humanDecisionSeat(g)).toBeNull();
    expect(botNeedsToAct(g, P1)).toBe(true);
    // it lasts the whole turn: through the computer's moves until it ends our turn
    for (let i = 0; i < 60 && botNeedsToAct(g, P1) && g.activePlayer === P0; i++) {
      expect(controlSwap(g)?.kind).toBe("computer-plays-yours");
      const r = applyAction(g, P1, botAction(g, P1));
      if (!r.ok) applyAction(g, P1, g.prompts[0] ? { t: "prompt", promptId: g.prompts[0].id, choice: null } : { t: "endTurn" });
    }

    // the computer's turn, played by us
    expect(g.activePlayer).toBe(P1);
    expect(controlSwap(g)).toEqual({
      kind: "you-play-theirs",
      now: true,
      text: "Courtesan Thaïs: you are playing the Computer's turn",
    });
    expect(isPiloting(g)).toBe(true);
    clearPrompts(g, P0);
    expect(applyAction(g, P0, { t: "endTurn" }).ok).toBe(true);
    // and then everything is back to normal
    expect(controlSwap(g)).toBeNull();
  });

  it("cast by the human: we play the computer's next turn first, then it plays ours", () => {
    const g = toMain(P0);
    thaisGenesis(g, P0);
    expect(controlSwap(g)).toMatchObject({ kind: "you-will-play-theirs", now: false });
    expect(applyAction(g, P0, { t: "endTurn" }).ok).toBe(true);
    expect(controlSwap(g)?.kind).toBe("you-play-theirs");
    expect(actingSeatFor(g, g.activePlayer)).toBe(P0);
    clearPrompts(g, P0);
    expect(applyAction(g, P0, { t: "endTurn" }).ok).toBe(true);
    expect(controlSwap(g)?.kind).toBe("computer-plays-yours");
  });

  it("lists the WHOLE piloted hand, with only the engine's playable cards clickable", () => {
    const g = toMain(P0);
    thaisGenesis(g, P0);
    expect(applyAction(g, P0, { t: "endTurn" }).ok).toBe(true);
    clearPrompts(g, P0);
    expect(humanDecisionSeat(g)).toBe(P1);
    // what session.requestLegal sends the worker: a copy without the pilot marker
    const clone = JSON.parse(JSON.stringify(g)) as EngineState;
    const flow: { thaisActive?: PlayerId } | undefined = clone.flow;
    delete flow?.thaisActive;
    const { paths } = actionPaths(g, legalActionsWithCasters(clone, P1), P1);
    const starts = new Set(paths.map((p) => p.steps[0]).filter((s): s is string => !!s));
    const cards = pilotHandCards(g, P1, starts);
    expect(cards.map((c) => c.cardId)).toEqual(g.players[1].hand);
    for (const card of cards) {
      expect(card.token).toBe(`hand:p2:${card.cardId}`);
      expect(card.name).toBe(g.cards[card.cardId].name);
      expect(card.playable).toBe(starts.has(card.token));
      // an inert card always says why
      if (!card.playable) expect(card.reason).toBeTruthy();
      else expect(card.reason).toBeNull();
    }
    expect(cards.some((c) => c.playable)).toBe(true);
  });
});

describe("linesForToast", () => {
  const log = [
    { player: P1, msg: "Computer plays Spire at (3,1)." },
    { player: P0, msg: "Flamecaller moves to b3." },
    { player: P0, msg: "💋 Thaïs's bargain: Computer plays this turn for You!" },
    { player: null, msg: "The troll lashes out at Wild Boars!" },
  ];

  it("keeps the computer's own lines, and Thaïs's bargain whichever seat it is tagged with", () => {
    expect(linesForToast(log, 0, false)).toEqual([log[0].msg, log[2].msg]);
  });

  it("adds the lines it writes on OUR seat only while it is playing our turn", () => {
    expect(linesForToast(log, 0, true)).toEqual([log[0].msg, log[1].msg, log[2].msg]);
    expect(linesForToast(log, 2, true)).toEqual([log[2].msg]);
  });
});
