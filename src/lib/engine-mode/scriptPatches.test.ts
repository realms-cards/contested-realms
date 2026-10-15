import { applyAction, createGame, getScript, legalActions, makeCtx, viewFor } from "@sorcery/shared";
import type { GameState as EngineState, PlayerId } from "@sorcery/shared";
import { describe, expect, it } from "vitest";
import { engineCellKey } from "./coords";
import { enginePrecons, toEngineDeck } from "./decks";
import { disabledUnits, projectView } from "./projection";
import { applyScriptPatches } from "@shared/engine/scriptPatches";

/**
 * Waveshaper: "Tap -> Flood a site near your body of water until you do so again. Tap minions
 * without submerge there. They don't untap the next time they would."
 * Guards the scriptPatches.ts workaround for vendor waveshaper.ts:45 (already-tapped minions got
 * no skipUntap marker). Once upstream is fixed and the patch deleted, these must still pass.
 */
type Unit = EngineState["units"][string];

function setup(opts: { enemyTapped: boolean }) {
  const deck = toEngineDeck({ ...enginePrecons[0], avatar: "Waveshaper" });
  const other = toEngineDeck(enginePrecons[1]);
  const g = createGame([deck, other], ["You", "Computer"], 7, 0 as PlayerId);
  g.phase = "main";
  g.activePlayer = 0 as PlayerId;
  g.prompts = [];
  const site = (id: string, x: number, y: number, name: string, c: 0 | 1) =>
    ({ id, name, x, y, owner: c, controller: c, isRubble: false, tapped: false }) as unknown as EngineState["sites"][string];
  g.sites["water"] = site("water", 2, 2, "Autumn River", 0);
  g.sites["dry"] = site("dry", 2, 1, "Lone Tower", 1);
  g.sites["dry2"] = site("dry2", 1, 2, "Dark Tower", 0);
  const avatar = Object.values(g.units).find((u) => u.isAvatar && u.owner === 0)!;
  avatar.tapped = false;
  const minion = (id: string, seat: 0 | 1, x: number, y: number, tapped: boolean): Unit =>
    ({
      ...avatar,
      id,
      name: "Blacksmith Family",
      cardId: `card_${id}`,
      isAvatar: false,
      owner: seat,
      controller: seat,
      x,
      y,
      region: "surface",
      tapped,
      counters: {},
      modifiers: [],
      damage: 0,
      usedThisTurn: {},
    }) as unknown as Unit;
  g.units["enemy"] = minion("enemy", 1, 2, 1, opts.enemyTapped);
  g.units["mine"] = minion("mine", 0, 1, 2, false);
  return { g, avatarId: avatar.id };
}

function wave(g: EngineState, avatarId: string, x: number, y: number) {
  const before = g.version;
  const res = applyAction(g, 0 as PlayerId, { t: "activate", sourceId: avatarId, ability: "wave" });
  const p = g.prompts.find((q) => q.player === 0);
  expect(
    p,
    `no square prompt; res=${JSON.stringify(res)} phase=${g.phase} active=${g.activePlayer} prompts=${JSON.stringify(g.prompts)} avatarTapped=${g.units[avatarId]?.tapped} v${before}`,
  ).toBeTruthy();
  applyAction(g, 0 as PlayerId, { t: "prompt", promptId: p!.id, choice: { x, y } });
}

function endTurn(g: EngineState) {
  const seat = g.activePlayer;
  applyAction(g, seat, { t: "endTurn" });
  // answer any start-of-turn prompt (draw choice etc.) with its first option
  for (let i = 0; i < 5 && g.prompts.length; i++) {
    const p = g.prompts[0];
    const data = p.data as { options?: unknown[] } | undefined;
    const choice = p.kind === "drawDeck" ? "spellbook" : data?.options?.[0] ?? null;
    applyAction(g, p.player, { t: "prompt", promptId: p.id, choice });
  }
  expect(g.activePlayer).not.toBe(seat);
}

const projectedTapped = (g: EngineState, id: string) => {
  const proj = projectView(viewFor(g, 0 as PlayerId));
  const u = g.units[id];
  return proj.permanents[engineCellKey(u.x, u.y)]?.find((p) => p.instanceId === id)?.tapped;
};

describe("Waveshaper keeps minions tapped down (scriptPatches)", () => {
  it("wraps the live script once, however often the patches are applied", () => {
    const wave = getScript("Waveshaper")?.conts?.wave;
    expect(wave).toBeTruthy();
    applyScriptPatches();
    applyScriptPatches();
    expect(getScript("Waveshaper")?.conts?.wave).toBe(wave);
  });

  it("an untapped enemy minion stays tapped through its controller's next untap", () => {
    const { g, avatarId } = setup({ enemyTapped: false });
    wave(g, avatarId, 2, 1);
    expect(g.sites["dry"].flooded).toBe(true);
    expect(g.units["enemy"].tapped).toBe(true);
    expect(g.units["enemy"].counters?.skipUntap).toBe(1);
    endTurn(g); // -> seat 1 untap step
    expect(g.units["enemy"].tapped).toBe(true);
    expect(projectedTapped(g, "enemy")).toBe(true);
    endTurn(g); // -> seat 0
    endTurn(g); // -> seat 1 again: now it untaps
    expect(g.units["enemy"].tapped).toBe(false);
  });

  it("an own minion stays tapped through our next untap", () => {
    const { g, avatarId } = setup({ enemyTapped: false });
    wave(g, avatarId, 1, 2);
    expect(g.units["mine"].tapped).toBe(true);
    endTurn(g);
    endTurn(g); // -> seat 0 untap step
    expect(g.units["mine"].tapped).toBe(true);
    expect(projectedTapped(g, "mine")).toBe(true);
  });

  it("an ALREADY-tapped enemy minion (it moved/attacked last turn) stays down too", () => {
    const { g, avatarId } = setup({ enemyTapped: true });
    const logBefore = JSON.stringify(g.log ?? []).split("dragged under the churn").length;
    wave(g, avatarId, 2, 1);
    expect(g.units["enemy"].counters?.skipUntap).toBe(1);
    // the patch adds no log line of its own (the wave did not tap it)
    expect(JSON.stringify(g.log ?? []).split("dragged under the churn").length).toBe(logBefore);
    endTurn(g);
    expect(g.units["enemy"].tapped, "already-tapped minion untapped at its controller's untap step").toBe(true);
    endTurn(g);
    endTurn(g); // the marker was spent: it untaps the turn after
    expect(g.units["enemy"].tapped).toBe(false);
  });

  it("re-waving the same site each turn keeps the enemy minion locked down (the lock loop)", () => {
    const { g, avatarId } = setup({ enemyTapped: false });
    wave(g, avatarId, 2, 1); // turn N: tapped + skipUntap
    endTurn(g); // seat 1 untap: skipped, marker consumed
    expect(g.units["enemy"].tapped).toBe(true);
    endTurn(g); // back to seat 0; avatar untaps
    // our test helper auto-answers start-of-turn prompts with option 0, which may spend the avatar
    g.units[avatarId].tapped = false;
    wave(g, avatarId, 2, 1); // FAQ3: same site may be re-selected; the minion is STILL tapped
    endTurn(g); // seat 1 untap
    expect(g.units["enemy"].tapped, "second wave on a still-tapped minion did not re-arm skipUntap").toBe(true);
    expect(projectedTapped(g, "enemy")).toBe(true);
  });

  it("leaves the avatar standing on the flooded site alone", () => {
    const { g, avatarId } = setup({ enemyTapped: false });
    const foeAvatar = Object.values(g.units).find((u) => u.isAvatar && u.owner === 1)!;
    foeAvatar.x = 2;
    foeAvatar.y = 1;
    foeAvatar.tapped = false;
    wave(g, avatarId, 2, 1);
    expect(foeAvatar.tapped).toBe(false);
    expect(foeAvatar.counters?.skipUntap).toBeUndefined();
  });
});

/**
 * Break Stealth → … : the engine strips Stealth on activation before the effect runs, so Frozen
 * Horror and Asmodeus fizzled with "No Stealth to break.". Guards the scriptPatches.ts workaround.
 */
describe("Break Stealth abilities resolve (scriptPatches)", () => {
  const hide = (g: EngineState, id: string, name: string, x: number, y: number, stealth: boolean) => {
    g.units[id] = { ...g.units["mine"], id, name, cardId: `card_${id}`, x, y, stealth, modifiers: [] } as unknown as Unit;
  };
  const offers = (g: EngineState, id: string) =>
    legalActions(g, 0 as PlayerId).filter((a) => a.t === "activate" && a.sourceId === id);

  it("Frozen Horror disables the other nearby minions", () => {
    const { g } = setup({ enemyTapped: false });
    hide(g, "horror", "Frozen Horror", 2, 2, true);
    const [terror] = offers(g, "horror");
    expect(terror).toBeTruthy();
    expect(applyAction(g, 0 as PlayerId, terror)).toEqual({ ok: true });
    expect(g.units["horror"].stealth).toBe(false);
    expect([...disabledUnits(g)].sort()).toEqual(["enemy", "mine"]);
  });

  it("Asmodeus destroys everything else at its location", () => {
    const { g } = setup({ enemyTapped: false });
    hide(g, "asmodeus", "Asmodeus", 2, 1, true);
    const [immolate] = offers(g, "asmodeus");
    expect(immolate).toBeTruthy();
    expect(applyAction(g, 0 as PlayerId, immolate)).toEqual({ ok: true });
    expect(g.units["enemy"]).toBeUndefined();
    expect(g.sites["dry"]).toBeUndefined();
  });

  it("is not offered once Stealth is gone", () => {
    const { g } = setup({ enemyTapped: false });
    hide(g, "horror", "Frozen Horror", 2, 2, false);
    expect(offers(g, "horror")).toEqual([]);
  });
});

describe("Slimy Mutants is only offered with a submerging ally (scriptPatches)", () => {
  const slimy = (g: EngineState) =>
    legalActions(g, 0 as PlayerId).filter((a) => a.t === "activate" && String(a.ability).startsWith("slime:"));

  it("needs an ally with Submerge", () => {
    const { g } = setup({ enemyTapped: false });
    g.cards["c_slime"] = { id: "c_slime", name: "Slimy Mutants", owner: 0 } as unknown as EngineState["cards"][string];
    g.players[0].hand.push("c_slime");
    g.players[0].mana = 9;
    expect(slimy(g)).toEqual([]);
    g.units["mine"] = { ...g.units["mine"], name: "Coy Nixie", modifiers: [] } as unknown as Unit;
    expect(slimy(g)).toHaveLength(1);
  });
});

describe("Sea Raider plunders the enemy's spellbook (scriptPatches)", () => {
  it("takes the killed enemy's controller's topmost spell, not its own", () => {
    const { g } = setup({ enemyTapped: false });
    g.units["mine"] = { ...g.units["mine"], name: "Sea Raider" } as unknown as Unit;
    const mine = [...g.players[0].spellbook];
    const theirs = [...g.players[1].spellbook];
    getScript("Sea Raider")!.onAttackKill!(makeCtx(g, "mine", 0 as PlayerId, []), { id: "enemy" } as Unit);
    expect(g.players[0].spellbook).toEqual(mine);
    expect(g.players[1].spellbook).toEqual(theirs.slice(1));
    expect(g.players[0].hand).toContain(theirs[0]);
  });
});

describe("The Manor at Daperyll Hill needs an enemy there (scriptPatches)", () => {
  const feast = (g: EngineState) =>
    legalActions(g, 0 as PlayerId).filter((a) => a.t === "activate" && a.ability === "feast");

  it("is offered only while an enemy stands at the Manor, and then heals", () => {
    const { g } = setup({ enemyTapped: false });
    g.sites["dry2"] = { ...g.sites["dry2"], name: "The Manor at Daperyll Hill" };
    for (let x = 0; x < 4; x++) {
      g.sites[`spire${x}`] = { ...g.sites["dry2"], id: `spire${x}`, name: "Spire", x, y: 3 };
    }
    expect(feast(g)).toEqual([]);
    g.units["enemy"] = { ...g.units["enemy"], x: 1, y: 2 };
    const [action] = feast(g);
    expect(action).toBeTruthy();
    const avatar = Object.values(g.units).find((u) => u.isAvatar && u.owner === 0)!;
    avatar.life = 10;
    applyAction(g, 0 as PlayerId, action);
    const p = g.prompts.find((q) => q.player === 0);
    if (p) applyAction(g, 0 as PlayerId, { t: "prompt", promptId: p.id, choice: ["enemy"] });
    expect(avatar.life).toBe(13);
  });
});

describe("Assimilator Snail shows the minion it copied", () => {
  it("projects the copied card on the board", () => {
    const { g } = setup({ enemyTapped: false });
    g.cards["card_mine"] = { id: "card_mine", name: "Assimilator Snail", owner: 0 } as unknown as EngineState["cards"][string];
    g.units["mine"] = { ...g.units["mine"], name: "Assimilator Snail" } as unknown as Unit;
    g.cards["c_dead"] = { id: "c_dead", name: "Sea Raider", owner: 1 } as unknown as EngineState["cards"][string];
    g.players[1].cemetery.push("c_dead");
    expect(applyAction(g, 0 as PlayerId, { t: "activate", sourceId: "mine", ability: "assimilate" })).toEqual({ ok: true });
    const p = g.prompts.find((q) => q.player === 0)!;
    applyAction(g, 0 as PlayerId, { t: "prompt", promptId: p.id, choice: "Sea Raider" });
    expect(g.units["mine"].name).toBe("Sea Raider");
    const proj = projectView(viewFor(g, 0 as PlayerId));
    const card = proj.permanents[engineCellKey(1, 2)]?.find((q) => q.instanceId === "mine")?.card;
    expect(card?.name).toBe("Sea Raider");
  });
});

describe("Waveshaper on an already-flooded site (scriptPatches)", () => {
  it("can wave a site Atlantean Fate flooded, and the site stays flooded when the wave moves on", () => {
    const { g, avatarId } = setup({ enemyTapped: false });
    g.sites["dry"].flooded = true; // flooded by Atlantean Fate, not by the wave
    applyAction(g, 0 as PlayerId, { t: "activate", sourceId: avatarId, ability: "wave" });
    const p = g.prompts.find((q) => q.player === 0)!;
    const squares = (p.data as { squares: { x: number; y: number }[] }).squares;
    expect(squares, "the flooded site is not offered").toContainEqual({ x: 2, y: 1 });
    applyAction(g, 0 as PlayerId, { t: "prompt", promptId: p.id, choice: { x: 2, y: 1 } });
    expect(g.units["enemy"].tapped).toBe(true);
    expect(g.units["enemy"].counters?.skipUntap).toBe(1);
    endTurn(g);
    endTurn(g);
    g.units[avatarId].tapped = false;
    wave(g, avatarId, 1, 2);
    expect(g.sites["dry2"].flooded).toBe(true);
    expect(g.sites["dry"].flooded, "the wave dried out a site Atlantean Fate flooded").toBe(true);
  });
});
