import { applyAction, createGame, findCard, legalActions } from "@sorcery/shared";
import type { Action, GameState as EngineState, PlayerId } from "@sorcery/shared";
import { botAction, botNeedsToAct } from "@untested-realm/bot/bot";
import { describe, expect, it } from "vitest";
import { buildActionFeed } from "@/components/engine-mode/2d/actionFeed";
import type { GameEvent } from "@/lib/game/store/types";
import { localizeEngineText } from "./coords";
import { enginePrecons, toEngineDeck } from "./decks";
import { narrate, narratePromptAnswer, snapshotPromptAnswer } from "./narration";
import type { EngineFeedNote } from "./narration";

type Site = EngineState["sites"][string];
type Unit = EngineState["units"][string];
const P0 = 0 as PlayerId;
const P1 = 1 as PlayerId;

/** Play a real game forward (both seats by the bot) to a main phase of `active`'s. */
function toMain(active: PlayerId, seed = 7): EngineState {
  const deck = toEngineDeck(enginePrecons[0]);
  const g = createGame([deck, deck], ["You", "Computer"], seed, P0);
  for (let i = 0; i < 400; i++) {
    if (g.phase === "main" && g.activePlayer === active && !g.prompts.length && g.turn >= 3) return g;
    const who: PlayerId | null = botNeedsToAct(g, P0) ? P0 : botNeedsToAct(g, P1) ? P1 : null;
    if (who === null) break;
    const r = applyAction(g, who, botAction(g, who));
    if (!r.ok) applyAction(g, who, g.prompts[0] ? { t: "prompt", promptId: g.prompts[0].id, choice: null } : { t: "endTurn" });
  }
  throw new Error("could not reach a main phase");
}

const site = (id: string, name: string, x: number, y: number, controller: PlayerId): Site =>
  ({ id, cardId: `c_${id}`, name, x, y, owner: controller, controller, isRubble: false, tapped: false }) as unknown as Site;

/**
 * Our Troll Bridge at engine (2,1), our River Rapids at (2,2), a CPU minion standing on the
 * Rapids. The human pushes it along the river onto the bridge: forced movement is "entering",
 * so the toll prompt goes to the computer.
 */
function tollPrompt(): EngineState {
  const g = toMain(P0);
  for (const [id, u] of Object.entries(g.units)) if (!u.isAvatar) delete g.units[id];
  for (const id of Object.keys(g.sites)) delete g.sites[id];
  for (const id of Object.keys(g.auras)) delete g.auras[id];
  const av0 = Object.values(g.units).find((u) => u.isAvatar && u.controller === 0);
  const av1 = Object.values(g.units).find((u) => u.isAvatar && u.controller === 1);
  if (!av0 || !av1) throw new Error("no avatars");
  Object.assign(av0, { x: 0, y: 3 });
  Object.assign(av1, { x: 4, y: 0 });
  g.sites.s_av0 = site("s_av0", "Spire", 0, 3, P0);
  g.sites.s_av1 = site("s_av1", "Spire", 4, 0, P1);
  g.sites.s_rap = site("s_rap", "River Rapids", 2, 2, P0);
  g.sites.s_bridge = site("s_bridge", "Troll Bridge", 2, 1, P0);
  g.units.u_foe = {
    ...av0,
    id: "u_foe",
    cardId: "c_u_foe",
    name: "Wild Boars",
    isAvatar: false,
    x: 2,
    y: 2,
    controller: P1,
    owner: P1,
    region: "surface",
    tapped: false,
    damage: 0,
    enteredTurn: 0,
    modifiers: [],
    carrying: [],
    carryingUnits: [],
  } as unknown as Unit;
  g.cards.c_u_foe = { id: "c_u_foe", name: "Wild Boars", owner: 1 } as unknown as EngineState["cards"][string];
  const push = legalActions(g, P0).find((a) => a.t === "activate" && a.sourceId === "s_rap");
  if (!push) throw new Error("River Rapids cannot push");
  expect(applyAction(g, P0, push)).toEqual({ ok: true });
  expect(applyAction(g, P0, { t: "prompt", promptId: g.prompts[0].id, choice: ["u_foe"] })).toEqual({ ok: true });
  expect(applyAction(g, P0, { t: "prompt", promptId: g.prompts[0].id, choice: { x: 2, y: 1 } })).toEqual({ ok: true });
  return g;
}

/** The projection's events for log lines [from, to). */
function eventsOf(g: EngineState, from = 0): GameEvent[] {
  return g.log.slice(from).map((l, i) => ({
    id: from + i,
    ts: 0,
    text: localizeEngineText(l.msg),
    turn: l.turn,
    player: l.player === null || l.player === undefined ? undefined : l.player === 0 ? 1 : 2,
  }));
}

describe("the computer's toll (a prompt answer that discards)", () => {
  it("is narrated with the card it cost, on the bridge's tile", () => {
    const g = tollPrompt();
    expect(g.prompts[0]?.player).toBe(P1);
    expect(g.prompts[0]?.title).toMatch(/toll/);
    const handBefore = [...g.players[1].hand];
    const answer = botAction(g, P1);
    expect(answer.t).toBe("prompt");
    const snap = snapshotPromptAnswer(g, answer);
    expect(snap).not.toBeNull();
    expect(snap?.sourceName).toBe("Troll Bridge");
    expect(applyAction(g, P1, answer)).toEqual({ ok: true });
    const story = snap ? narratePromptAnswer(snap, g, 3) : null;
    // the bot pays (it has cards to spare): one card left the hand for the cemetery
    expect(g.players[1].hand.length).toBe(handBefore.length - 1);
    const gone = handBefore.find((id) => !g.players[1].hand.includes(id));
    const name = gone ? g.cards[gone].name : "";
    expect(story?.text).toBe(`Computer pays the Troll Bridge toll: discards ${name}.`);
    // engine (2,1) is our tile 13 after the 180° turn: cell 2,2
    expect(story?.highlight).toEqual(["2,2"]);
    expect(story?.cells).toEqual(["2,2"]);
    expect(story?.discarded).toEqual([{ cardId: gone, name, seat: 1 }]);
    expect(story?.reveal).toMatchObject({ id: `discard:${gone}:3`, kind: "trigger" });
    expect(story?.reveal?.card.name).toBe(name);
    expect(story?.revealSeat).toBe("p2");
    expect(story?.weighty).toBe(true);
  });

  it("is a first-class feed entry with the discarded card, not a note under the push", () => {
    const g = tollPrompt();
    const pushLines = g.log.length;
    const answer = botAction(g, P1);
    const snap = snapshotPromptAnswer(g, answer);
    expect(applyAction(g, P1, answer)).toEqual({ ok: true });
    const story = snap ? narratePromptAnswer(snap, g) : null;
    expect(story).not.toBeNull();
    const lines: number[] = [];
    for (let i = pushLines; i < g.log.length; i++) lines.push(i);
    const note: EngineFeedNote = {
      lines,
      after: pushLines - 1,
      seat: "p2",
      kind: "discard",
      text: story?.text ?? "",
      card: story?.discarded[0]?.name ?? null,
      cells: story?.cells ?? [],
    };
    const ctx = {
      players: ["You", "Computer"] as const,
      cardType: (n: string) => findCard(n)?.type ?? null,
    };
    const plain = buildActionFeed(eventsOf(g, pushLines - 6), ctx);
    // without the note, the toll is the engine's bare line, folded under the push
    expect(plain[0].entries.some((e) => e.text === story?.text)).toBe(false);
    const feed = buildActionFeed(eventsOf(g, pushLines - 6), { ...ctx, notes: [note] });
    const top = feed[0].entries[0];
    expect(top).toMatchObject({ kind: "discard", seat: "p2", text: story?.text, card: story?.discarded[0]?.name, cells: ["2,2"] });
    // the engine's own "pays the troll's toll" line is said by the entry, not repeated under it
    expect(top.outcomes.some((o) => /troll's toll/.test(o.text))).toBe(false);
  });

  it("says so when the toll is refused (the strike would otherwise come from nowhere)", () => {
    const g = tollPrompt();
    const refuse: Action = { t: "prompt", promptId: g.prompts[0].id, choice: null };
    const snap = snapshotPromptAnswer(g, refuse);
    expect(applyAction(g, P1, refuse)).toEqual({ ok: true });
    const story = snap ? narratePromptAnswer(snap, g) : null;
    expect(story?.text).toBe("Computer refuses the Troll Bridge toll.");
    expect(story?.highlight).toEqual(["2,2"]);
  });

  it("stays silent for a prompt answer that cost nothing", () => {
    const g = tollPrompt();
    expect(snapshotPromptAnswer(g, { t: "endTurn" })).toBeNull();
    const snap = snapshotPromptAnswer(g, { t: "prompt", promptId: g.prompts[0].id, choice: null });
    if (!snap) throw new Error("no snapshot");
    // nothing applied, nothing discarded, and a non-toll title
    expect(narratePromptAnswer({ ...snap, title: "Choose a target" }, g)).toBeNull();
  });
});

describe("narration while the computer plays the human's turn (Courtesan Thaïs)", () => {
  /** our avatar, one square toward the opponent */
  function avatarStep(g: EngineState): Extract<Action, { t: "moveAttack" }> {
    const avatar = g.units[g.players[0].avatarUnitId];
    return { t: "moveAttack", unitId: avatar.id, path: [{ x: avatar.x, y: avatar.y > 0 ? avatar.y - 1 : avatar.y + 1 }] } as Extract<
      Action,
      { t: "moveAttack" }
    >;
  }

  it("speaks to the human about their own pieces", () => {
    const g = toMain(P0);
    const step = avatarStep(g);
    const name = g.units[step.unitId].name;
    const plain = narrate(g, step, 1);
    const piloted = narrate(g, step, 1, { pilotingHuman: true });
    expect(plain?.text).toMatch(new RegExp(`^${name} moves from tile \\d+ to tile \\d+\\.$`));
    expect(piloted?.text).toMatch(new RegExp(`^Computer moves your ${name} from tile \\d+ to tile \\d+\\.$`));
    // the board pieces it lights are the same
    expect(piloted?.highlight).toEqual(plain?.highlight);
    expect(narrate(g, { t: "endTurn" }, 1, { pilotingHuman: true })?.text).toBe("Computer ends your turn.");
    expect(narrate(g, { t: "endTurn" }, 1)?.text).toBe("Ends its turn.");
  });

  it("reveals a cast card as its owner's, whoever played it", () => {
    const g = toMain(P0);
    const spell = (seat: PlayerId) => g.players[seat].hand.find((id) => findCard(g.cards[id].name)?.type !== "Site");
    const ours = spell(P0);
    const theirs = spell(P1);
    if (!ours || !theirs) throw new Error("no spells in hand");
    const cast = (cardId: string, seat: PlayerId) =>
      ({ t: "castSpell", cardId, casterId: g.players[seat].avatarUnitId, targets: [] }) as unknown as Action;
    const piloted = narrate(g, cast(ours, P0), 1, { pilotingHuman: true });
    expect(piloted?.revealSeat).toBe("p1");
    expect(piloted?.text).toBe(`Computer casts your ${g.cards[ours].name}.`);
    // the computer's own card is still the computer's
    expect(narrate(g, cast(theirs, P1), 1)?.revealSeat).toBe("p2");
  });
});
