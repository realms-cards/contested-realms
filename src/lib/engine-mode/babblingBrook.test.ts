import { applyAction, createGame, isDisabled, legalActions, viewFor } from "@sorcery/shared";
import type { Action, GameState as EngineState, PlayerId } from "@sorcery/shared";
import { botAction, botNeedsToAct } from "@untested-realm/bot/bot";
import { describe, expect, it } from "vitest";
import { legalActionsWithCasters } from "@shared/engine/casterActions";
import { enginePrecons, toEngineDeck } from "./decks";
import { disabledUnits, projectView, unitPower } from "./projection";

/**
 * Babbling Brook — "Genesis → Until your next turn, minions are disabled while atop nearby sites."
 *
 * The engine records it in `flow.areaDisables` and works the disable out on demand (statics.ts
 * `brookHits`); it never sets `unit.disabled`. The board used to read only that raw flag, so the
 * minions it shut down looked untouched. The session now derives the set (`disabledUnits`) and the
 * projection shows a Disabled token for it.
 */
type Site = EngineState["sites"][string];
type Unit = EngineState["units"][string];
const P0 = 0 as PlayerId;
const P1 = 1 as PlayerId;

const site = (id: string, x: number, y: number, controller: PlayerId): Site =>
  ({ id, cardId: `c_${id}`, name: "Spire", x, y, owner: controller, controller, isRubble: false, tapped: false }) as unknown as Site;

function toMain(): EngineState {
  const deck = toEngineDeck(enginePrecons[0]);
  const g = createGame([deck, deck], ["You", "Computer"], 7, P0);
  for (let i = 0; i < 400; i++) {
    if (g.phase === "main" && g.activePlayer === 0 && !g.prompts.length && g.turn >= 3) return g;
    const who: PlayerId | null = botNeedsToAct(g, P0) ? P0 : botNeedsToAct(g, P1) ? P1 : null;
    if (who === null) break;
    const r = applyAction(g, who, botAction(g, who));
    if (!r.ok) applyAction(g, who, g.prompts[0] ? { t: "prompt", promptId: g.prompts[0].id, choice: answerFor(g.prompts[0]) } : { t: "endTurn" });
  }
  throw new Error("could not reach main phase");
}

/** The engine only takes an offered answer: draw from the spellbook, the first site offered, otherwise decline. */
const answerFor = (p: EngineState["prompts"][number]) =>
  p.kind === "drawDeck" ? "spellbook" : p.kind === "firstSite" ? ((p.data as { ids?: string[] } | undefined)?.ids?.[0] ?? null) : null;

const settle = (g: EngineState) => {
  for (let i = 0; i < 20 && g.prompts.length; i++) {
    const p = g.prompts[0];
    expect(applyAction(g, p.player ?? P0, { t: "prompt", promptId: p.id, choice: answerFor(p) }).ok).toBe(true);
  }
};

/** A controlled board, then the Brook played for real at engine (2,1). */
function setup(): EngineState {
  const g = toMain();
  for (const [id, u] of Object.entries(g.units)) if (!u.isAvatar) delete g.units[id];
  for (const id of Object.keys(g.sites)) delete g.sites[id];
  for (const id of Object.keys(g.auras)) delete g.auras[id];
  const av0 = Object.values(g.units).find((u) => u.isAvatar && u.controller === 0)!;
  const av1 = Object.values(g.units).find((u) => u.isAvatar && u.controller === 1)!;
  av0.x = 0; av0.y = 3; av1.x = 4; av1.y = 0;
  g.sites.s_av0 = site("s_av0", 0, 3, P0);
  g.sites.s_av1 = site("s_av1", 4, 0, P1);
  g.sites.s_own = site("s_own", 1, 2, P0); // diagonal to the Brook
  g.sites.s_foe = site("s_foe", 2, 0, P1); // orthogonal to it, the opponent's
  g.sites.s_far = site("s_far", 4, 3, P0); // out of reach
  g.sites.s_nb = site("s_nb", 2, 2, P0); // the Brook needs an adjacent site of ours
  g.sites.s_far2 = site("s_far2", 3, 3, P0); // somewhere for the far minion to go
  const minion = (id: string, x: number, y: number, controller: PlayerId): Unit =>
    ({ ...av0, id, cardId: `c_${id}`, name: "Wild Boars", isAvatar: false, life: undefined, x, y, controller, owner: controller,
       region: "surface", tapped: false, damage: 0, enteredTurn: 0, modifiers: [], carrying: [], carryingUnits: [] }) as unknown as Unit;
  g.units.u_own = minion("u_own", 1, 2, P0);
  g.units.u_foe = minion("u_foe", 2, 0, P1);
  g.units.u_far = minion("u_far", 4, 3, P0);
  g.cards.c_brook = { id: "c_brook", name: "Babbling Brook", owner: 0 } as unknown as EngineState["cards"][string];
  g.players[0].hand.push("c_brook");
  const play = legalActions(g, P0).find(
    (a): a is Extract<Action, { t: "avatarSite" }> => a.t === "avatarSite" && a.mode === "play" && a.cardId === "c_brook" && a.x === 2 && a.y === 1,
  );
  expect(play, "the Brook is a legal play there").toBeTruthy();
  expect(applyAction(g, P0, play!)).toEqual({ ok: true });
  settle(g);
  return g;
}

const disabledTokens = (g: EngineState) =>
  Object.values(projectView(viewFor(g, P0), "surface", true, unitPower(g), disabledUnits(g)).permanents)
    .flat()
    .map((p) => String(p.instanceId))
    .filter((id) => id.endsWith(":disabled"))
    .sort();

describe("Babbling Brook", () => {
  it("disables minions of both sides atop nearby sites, without setting the raw flag", () => {
    const g = setup();
    expect(g.flow?.areaDisables).toHaveLength(1);
    expect(isDisabled(g, g.units.u_own)).toBe(true);
    expect(isDisabled(g, g.units.u_foe)).toBe(true);
    expect(isDisabled(g, g.units.u_far)).toBe(false);
    expect(g.units.u_own.disabled).toBeFalsy();
    expect([...disabledUnits(g)].sort()).toEqual(["u_foe", "u_own"]);
  });

  it("offers the human no move for a minion it disabled", () => {
    const g = setup();
    const moves = (id: string) => legalActionsWithCasters(g, P0).filter((a) => a.t === "moveAttack" && a.unitId === id);
    expect(moves("u_own")).toHaveLength(0);
    expect(moves("u_far").length).toBeGreaterThan(0);
  });

  it("puts a Disabled token on every minion it disables, and only those", () => {
    expect(disabledTokens(setup())).toEqual(["u_foe:disabled", "u_own:disabled"]);
  });

  it("drops the tokens when the effect ends at its controller's next turn", () => {
    const g = setup();
    applyAction(g, P0, { t: "endTurn" });
    settle(g);
    expect(g.activePlayer).toBe(1);
    expect(disabledTokens(g), "still on through the opponent's turn").toEqual(["u_foe:disabled", "u_own:disabled"]);
    applyAction(g, P1, { t: "endTurn" });
    settle(g);
    expect(g.activePlayer).toBe(0);
    expect(g.flow?.areaDisables ?? []).toHaveLength(0);
    expect(disabledTokens(g)).toEqual([]);
  });

  it("keeps showing a raw disabled flag without the derived set (avatars use that path)", () => {
    const g = setup();
    g.units.u_far.disabled = true;
    const tokens = Object.values(projectView(viewFor(g, P0)).permanents).flat().map((p) => p.instanceId);
    expect(tokens).toContain("u_far:disabled");
    expect(tokens).not.toContain("u_own:disabled");
  });
});
