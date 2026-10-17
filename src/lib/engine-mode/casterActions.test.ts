import { applyAction, cloneState, createGame, getCard, legalActions, nearbySquaresW, occupiedSquares, orthAdjacentWrapped, validateSummonAt } from "@sorcery/shared";
import type { Action, GameState, PlayerId, Region, UnitState } from "@sorcery/shared";
import { botAction, botNeedsToAct } from "@untested-realm/bot/bot";
import { describe, expect, it } from "vitest";
import { legalActionsWithCasters } from "@shared/engine/casterActions";
import { actionPaths, narrow } from "./actionPaths";
import { engineCellKey } from "./coords";
import { enginePrecons, toEngineDeck } from "./decks";
import { unitCell } from "./projection";

/** Squares upstream's generator tries for summons: on or beside a live site. */
function nearSiteSquares(game: GameState): Set<string> {
  const near = new Set<string>();
  for (const site of Object.values(game.sites)) {
    if (site.isRubble) continue;
    near.add(`${site.x},${site.y}`);
    for (const sq of orthAdjacentWrapped(game, site.x, site.y)) near.add(`${sq.x},${sq.y}`);
  }
  return near;
}

function playUntilMainWithMinion(seed: number): GameState | null {
  const fire = toEngineDeck(enginePrecons[0]);
  // a Voidwalk minion, since only Voidwalk may be summoned onto a bare portent square
  const harbinger = {
    ...fire,
    name: "Harbinger test",
    avatar: "Harbinger",
    spellbook: { ...fire.spellbook, "Barging Barghest": 4 },
  };
  const game = createGame([harbinger, fire], ["You", "Computer"], seed, (seed % 2) as PlayerId);
  for (let i = 0; i < 200 && game.phase !== "over"; i++) {
    const seat: PlayerId | null = botNeedsToAct(game, 0) ? 0 : botNeedsToAct(game, 1) ? 1 : null;
    if (seat === null) break;
    if (
      seat === 0 &&
      game.phase === "main" &&
      !game.prompts.length &&
      game.turn >= 4 &&
      game.players[0].hand.some((id) => getCard(game.cards[id].name).type === "Minion")
    ) {
      return game;
    }
    if (!applyAction(game, seat, botAction(game, seat)).ok)
      applyAction(game, seat, game.prompts[0] ? { t: "prompt", promptId: game.prompts[0].id, choice: null } : { t: "endTurn" });
  }
  return null;
}

describe("legalActionsWithCasters portent casts", () => {
  it("offers every avatar portent cast the engine accepts", () => {
    let checked = 0;
    for (const seed of [1, 2, 3]) {
      const game = playUntilMainWithMinion(seed);
      if (!game) continue;
      const legal = legalActionsWithCasters(game, 0);
      for (const sq of (game.flow?.harbinger?.[0] ?? []) as { x: number; y: number }[]) {
        for (const cardId of game.players[0].hand) {
          for (const region of ["surface", "void"] as Region[]) {
            const action = { t: "castSpell", cardId, casterId: game.players[0].avatarUnitId, at: { ...sq, region } } as const;
            if (!applyAction(cloneState(game), 0, action).ok) continue;
            checked++;
            expect(
              legal.some((a) => a.t === "castSpell" && a.cardId === cardId && a.at?.x === sq.x && a.at?.y === sq.y && a.at?.region === region),
            ).toBe(true);
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  }, 240_000);

  it("offers a portent cast in the void, away from every site", () => {
    const game = playUntilMainWithMinion(1);
    expect(game).not.toBeNull();
    if (!game) return;
    // force the away-square case: a portent on a square no site touches, mana to spare,
    // and a Voidwalk minion in hand (fish one out of the spellbook if needed)
    const near = nearSiteSquares(game);
    game.players[0].mana = 9;
    if (!game.players[0].hand.some((id) => game.cards[id].name === "Barging Barghest")) {
      const inDeck = game.players[0].spellbook.find((id) => game.cards[id].name === "Barging Barghest");
      expect(inDeck).toBeTruthy();
      if (!inDeck) return;
      game.players[0].spellbook.splice(game.players[0].spellbook.indexOf(inDeck), 1);
      game.players[0].hand.push(inDeck);
    }
    const minions = game.players[0].hand.filter((id) => getCard(game.cards[id].name).type === "Minion");
    let away: { x: number; y: number } | null = null;
    let minion: string | undefined;
    for (let y = 0; y < 4 && !minion; y++)
      for (let x = 0; x < 5 && !minion; x++) {
        if (near.has(`${x},${y}`)) continue;
        game.flow = { ...(game.flow ?? {}), harbinger: { 0: [{ x, y }] }, harbingerUsed: {} };
        for (const region of ["surface", "void"] as Region[]) {
          minion ??= minions.find((id) => validateSummonAt(game, 0, game.cards[id].name, { x, y, region }) === null);
          if (minion && !away) away = { x, y };
        }
      }
    expect(minion).toBeTruthy();
    expect(away).not.toBeNull();
    if (!minion || !away) return;
    // enough thresholds for any minion in the test deck (tempThresh is what affinity reads)
    game.flow = { ...(game.flow ?? {}), harbinger: { 0: [away] }, harbingerUsed: {}, tempThresh: { 0: { air: 9, earth: 9, fire: 9, water: 9 } } };
    const region = (["surface", "void"] as Region[]).find(
      (r) => validateSummonAt(game, 0, game.cards[minion!].name, { ...away!, region: r }) === null,
    );
    expect(region).toBeTruthy();
    if (!region) return;
    const action = { t: "castSpell", cardId: minion, casterId: game.players[0].avatarUnitId, at: { ...away, region } } as const;
    const verdict = applyAction(cloneState(game), 0, action);
    expect(verdict.error ?? "ok").toBe("ok");
    const legal = legalActionsWithCasters(game, 0);
    expect(
      legal.some((a) => a.t === "castSpell" && a.cardId === minion && a.at?.x === away!.x && a.at?.y === away!.y && a.at?.region === region),
    ).toBe(true);
  }, 120_000);

  it("offers a plain Voidwalk summon onto any bare square, no grant needed", () => {
    const game = playUntilMainWithMinion(2);
    expect(game).not.toBeNull();
    if (!game) return;
    // no portents, plenty of mana and thresholds — just the Voidwalk keyword
    game.flow = { ...(game.flow ?? {}), harbinger: { 0: [] }, tempThresh: { 0: { air: 9, earth: 9, fire: 9, water: 9 } } };
    game.players[0].mana = 9;
    if (!game.players[0].hand.some((id) => game.cards[id].name === "Barging Barghest")) {
      const inDeck = game.players[0].spellbook.find((id) => game.cards[id].name === "Barging Barghest");
      expect(inDeck).toBeTruthy();
      if (!inDeck) return;
      game.players[0].spellbook.splice(game.players[0].spellbook.indexOf(inDeck), 1);
      game.players[0].hand.push(inDeck);
    }
    const barghest = game.players[0].hand.find((id) => game.cards[id].name === "Barging Barghest");
    const near = nearSiteSquares(game);
    let away: { x: number; y: number } | null = null;
    for (let y = 0; y < 4 && !away; y++)
      for (let x = 0; x < 5 && !away; x++)
        if (!near.has(`${x},${y}`) && validateSummonAt(game, 0, "Barging Barghest", { x, y, region: "void" }) === null) away = { x, y };
    expect(away).not.toBeNull();
    if (!away || !barghest) return;
    const legal = legalActionsWithCasters(game, 0);
    expect(
      legal.some((a) => a.t === "castSpell" && a.cardId === barghest && a.at?.x === away!.x && a.at?.y === away!.y && a.at?.region === "void"),
    ).toBe(true);
  }, 120_000);
});

// ── multi-square attacks (workaround for vendor bot/moves.ts:265-272, anchor-only attacks) ──

const P0 = 0 as PlayerId;
const P1 = 1 as PlayerId;

/** Bot-played game paused at seat 0's main phase. */
function toMain(seed = 7): GameState {
  const deck = toEngineDeck(enginePrecons[0]);
  const g = createGame([deck, deck], ["You", "Computer"], seed, P0);
  for (let i = 0; i < 400; i++) {
    if (g.phase === "main" && g.activePlayer === 0 && !g.prompts.length) break;
    const seat: PlayerId | null = botNeedsToAct(g, P0) ? P0 : botNeedsToAct(g, P1) ? P1 : null;
    if (seat === null) break;
    if (!applyAction(g, seat, botAction(g, seat)).ok)
      applyAction(g, seat, g.prompts[0] ? { t: "prompt", promptId: g.prompts[0].id, choice: null } : { t: "endTurn" });
  }
  expect(g.phase).toBe("main");
  expect(g.activePlayer).toBe(0);
  return g;
}

let nextCard = 0;
function card(g: GameState, name: string, owner: PlayerId): string {
  const id = `ms_c${nextCard++}`;
  g.cards[id] = { id, name, owner } as unknown as GameState["cards"][string];
  return id;
}

function minion(g: GameState, id: string, name: string, controller: PlayerId, x: number, y: number, extra: Partial<UnitState> = {}): UnitState {
  const u = {
    id,
    cardId: card(g, name, controller),
    name,
    owner: controller,
    controller,
    isAvatar: false,
    x,
    y,
    region: "surface",
    tapped: false,
    damage: 0,
    enteredTurn: -5,
    modifiers: [],
    carrying: [],
    carryingUnits: [],
    usedThisTurn: {},
    ...extra,
  } as unknown as UnitState;
  g.units[id] = u;
  return u;
}

/** Empty board of our Spires, avatars parked in the top corners. */
function bareBoard(avatar?: string): GameState {
  const g = toMain();
  for (const id of Object.keys(g.units)) if (!g.units[id].isAvatar) delete g.units[id];
  for (const id of Object.keys(g.artifacts)) delete g.artifacts[id];
  for (const id of Object.keys(g.auras)) delete g.auras[id];
  for (const id of Object.keys(g.sites)) delete g.sites[id];
  for (let x = 0; x < 5; x++)
    for (let y = 0; y < 4; y++) {
      const id = `ms_s${x}${y}`;
      g.sites[id] = { id, cardId: card(g, "Spire", P0), name: "Spire", owner: 0, controller: 0, x, y, tapped: false, isRubble: false } as unknown as GameState["sites"][string];
    }
  const me = g.units[g.players[0].avatarUnitId];
  const foe = g.units[g.players[1].avatarUnitId];
  if (avatar) {
    me.name = avatar;
    g.cards[me.cardId].name = avatar;
  }
  me.x = 0;
  me.y = 0;
  foe.x = 4;
  foe.y = 0;
  return g;
}

/** Enchantress animates `aura` into a minion through the real trigger (cast a spell, pick the aura). */
function animate(g: GameState, aura: { name: string; squares: { x: number; y: number }[]; anchor?: { x: number; y: number }; edge?: { a: { x: number; y: number }; b: { x: number; y: number } } }): UnitState {
  const me = g.units[g.players[0].avatarUnitId];
  g.players[0].mana = 10;
  const auraId = "ms_aura";
  g.auras[auraId] = { id: auraId, cardId: card(g, aura.name, P0), name: aura.name, controller: 0, squares: aura.squares, ...(aura.anchor ? { anchor: aura.anchor } : {}), ...(aura.edge ? { edge: aura.edge } : {}), enteredTurn: -5 } as unknown as GameState["auras"][string];
  const kite = card(g, "Desecrator Kite", P0);
  g.players[0].hand.push(kite);
  expect(applyAction(g, P0, { t: "castSpell", cardId: kite, casterId: me.id, at: { x: 0, y: 1, region: "surface" } }).ok).toBe(true);
  const prompt = g.prompts[0];
  expect(prompt?.title).toContain("Enchantress");
  expect(applyAction(g, P0, { t: "prompt", promptId: prompt.id, choice: [auraId] }).ok).toBe(true);
  while (g.prompts.length && g.prompts[0].player === 0) applyAction(g, P0, { t: "prompt", promptId: g.prompts[0].id, choice: null });
  const animated = Object.values(g.units).find((u) => String(u.counters?.animatedAura ?? "") === auraId);
  expect(animated, "aura minion created").toBeTruthy();
  return animated as UnitState;
}

type MoveAttack = Extract<Action, { t: "moveAttack" }>;
const attacksBy = (acts: Action[], id: string) => acts.filter((a): a is MoveAttack => a.t === "moveAttack" && a.unitId === id && !!a.attack);
const unitTarget = (a: MoveAttack) => (a.attack && "unit" in a.attack ? a.attack.unit : null);
const siteTarget = (a: MoveAttack) => (a.attack && "site" in a.attack ? a.attack.site : null);
const SPHERE = [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }];

describe("legalActionsWithCasters multi-square attacks", () => {
  it("an Enchantress 2x2 aura minion attacks an enemy under a non-anchor square", () => {
    const g = bareBoard("Enchantress");
    const sphere = animate(g, { name: "Summoning Sphere", squares: SPHERE, anchor: { x: 1, y: 1 } });
    expect(sphere.size).toBe("2x2");
    minion(g, "ms_foe_anchor", "Eltham Townsfolk", P1, 1, 1);
    minion(g, "ms_foe_far", "Eltham Townsfolk", P1, 2, 2);
    const atk = attacksBy(legalActionsWithCasters(g, P0), sphere.id);
    const standing = atk.filter((a) => !a.path.length).map(unitTarget);
    expect(standing).toContain("ms_foe_anchor");
    expect(standing).toContain("ms_foe_far");
    for (const a of atk) expect(applyAction(cloneState(g), P0, a).ok).toBe(true);
  }, 60_000);

  it("an enemy on a non-anchor square may attack the 2x2 body", () => {
    const g = bareBoard("Enchantress");
    const sphere = animate(g, { name: "Summoning Sphere", squares: SPHERE, anchor: { x: 1, y: 1 } });
    minion(g, "ms_foe_far", "Eltham Townsfolk", P1, 2, 2);
    g.activePlayer = P1;
    const atk = attacksBy(legalActionsWithCasters(g, P1), "ms_foe_far").filter((a) => unitTarget(a) === sphere.id);
    expect(atk.some((a) => !a.path.length)).toBe(true);
  }, 60_000);

  it("an Enchantress wall (2x1) minion attacks from its extra square", () => {
    const g = bareBoard("Enchantress");
    const wall = animate(g, { name: "Wall of Ice", squares: [{ x: 1, y: 1 }, { x: 2, y: 1 }], edge: { a: { x: 1, y: 1 }, b: { x: 2, y: 1 } } });
    minion(g, "ms_foe_b", "Eltham Townsfolk", P1, 2, 1);
    const atk = attacksBy(legalActionsWithCasters(g, P0), wall.id);
    expect(atk.some((a) => !a.path.length && unitTarget(a) === "ms_foe_b")).toBe(true);
  }, 60_000);

  it("a Mountain Giant attacks enemy sites and units under its whole footprint, also after a step", () => {
    const g = bareBoard();
    const giant = minion(g, "ms_giant", "Mountain Giant", P0, 1, 1, { size: "2x2" });
    // an enemy site under a non-anchor square of the standing body
    const site = g.sites.ms_s22;
    site.controller = 1;
    site.owner = 1;
    // an enemy that only a step east puts under the body (its new right column, x=3)
    minion(g, "ms_foe_east", "Eltham Townsfolk", P1, 3, 2);
    const atk = attacksBy(legalActionsWithCasters(g, P0), giant.id);
    expect(atk.some((a) => !a.path.length && siteTarget(a) === site.id)).toBe(true);
    const east = atk.find((a) => a.path.length === 1 && a.path[0].x === 2 && a.path[0].y === 1 && unitTarget(a) === "ms_foe_east");
    expect(east).toBeTruthy();
    for (const a of atk) expect(applyAction(cloneState(g), P0, a).ok).toBe(true);
  }, 60_000);

  it("adds no duplicates and changes nothing on a board without multi-square units", () => {
    const g = toMain();
    expect(Object.values(g.units).some((u) => u.size === "2x2" || (u.extraSquares?.length ?? 0) > 0)).toBe(false);
    const legal = legalActionsWithCasters(g, P0);
    const keys = legal.map((a) => JSON.stringify(a));
    expect(new Set(keys).size).toBe(keys.length);
    const moves = (acts: Action[]) => acts.filter((a) => a.t === "moveAttack").map((a) => JSON.stringify(a)).sort();
    expect(moves(legal)).toEqual(moves(legalActions(g, P0)));
  }, 60_000);
});

describe("a growing body's move preview (Megamoeba)", () => {
  it("keys the destination and lights the footprint the engine will really cover", () => {
    const g = bareBoard();
    const moeba = minion(g, "ms_moeba", "Megamoeba", P0, 2, 1, { extraSquares: [{ x: 1, y: 1, region: "surface" }] } as Partial<UnitState>);
    const move: Action = { t: "moveAttack", unitId: moeba.id, path: [{ x: 3, y: 1, region: "surface" }] };
    const { paths } = actionPaths(g, [move]);
    const [path] = paths;
    const after = cloneState(g);
    expect(applyAction(after, P0, move).ok).toBe(true);
    const grown = after.units[moeba.id];
    const covered = occupiedSquares(grown).map((sq) => engineCellKey(sq.x, sq.y));
    expect(covered).toHaveLength(3);
    // the click lands where the card will be drawn, and the preview is the whole grown body
    expect(path.steps[1]).toBe(unitCell(grown));
    expect([...(path.areas?.[path.steps[1]] ?? [])].sort()).toEqual([...covered].sort());
  });

  it("previews a fresh moeba's first step as the two squares it will cover", () => {
    const g = bareBoard();
    const moeba = minion(g, "ms_moeba", "Megamoeba", P0, 2, 1);
    const move: Action = { t: "moveAttack", unitId: moeba.id, path: [{ x: 3, y: 1, region: "surface" }] };
    const [path] = actionPaths(g, [move]).paths;
    const after = cloneState(g);
    expect(applyAction(after, P0, move).ok).toBe(true);
    const covered = occupiedSquares(after.units[moeba.id]).map((sq) => engineCellKey(sq.x, sq.y));
    expect(covered).toHaveLength(2);
    expect([...(path.areas?.[path.steps[1]] ?? [])].sort()).toEqual([...covered].sort());
  });
});

// ── hand abilities (Slimy Mutants): surfaced on the avatar, startable from the hand card too ──

describe("actionPaths hand abilities", () => {
  /** Slimy Mutants in hand, a Coy Nixie (Submerge) on the board, `mana` to spend. */
  function slimyBoard(mana: number): { g: GameState; slimy: string } {
    const g = bareBoard();
    minion(g, "ms_nixie", "Coy Nixie", P0, 1, 1);
    const slimy = card(g, "Slimy Mutants", P0);
    g.players[0].hand.push(slimy);
    g.players[0].mana = mana;
    g.flow = { ...(g.flow ?? {}), tempThresh: { 0: { air: 9, earth: 9, fire: 9, water: 9 } } };
    return { g, slimy };
  }
  const isSlime = (a: Action, slimy: string) => a.t === "activate" && a.ability === `slime:${slimy}`;

  it("offers the ability from the hand card, held for an explicit click, and keeps the avatar path", () => {
    const { g, slimy } = slimyBoard(3); // the ability costs 3; summoning it costs 5
    const legal = legalActionsWithCasters(g, P0);
    expect(legal.some((a) => isSlime(a, slimy))).toBe(true);
    expect(legal.some((a) => a.t === "castSpell" && a.cardId === slimy)).toBe(false);
    const { paths, labels } = actionPaths(g, legal, P0);
    const hand = `hand:p1:${slimy}`;

    const fromHand = narrow(paths, [hand]);
    expect(fromHand.done).toBeNull();
    expect(fromHand.next).toHaveLength(1);
    expect(labels[fromHand.next[0]]).toContain("Slimy Mutants");
    const fired = narrow(paths, [hand, fromHand.next[0]]);
    expect(fired.next).toEqual([]);
    expect(fired.done && isSlime(fired.done, slimy)).toBe(true);

    // the avatar still offers it, through the same option (taken at once when it is the avatar's only move)
    const fromAvatar = narrow(paths, ["unit:avatar:p1"]);
    expect([...fromAvatar.prefix, ...fromAvatar.next]).toContain(fromHand.next[0]);
  }, 120_000);

  it("asks Cast or the ability when the card can do both", () => {
    const { g, slimy } = slimyBoard(10);
    const legal = legalActionsWithCasters(g, P0);
    expect(legal.some((a) => isSlime(a, slimy))).toBe(true);
    expect(legal.some((a) => a.t === "castSpell" && a.cardId === slimy)).toBe(true);
    const { paths, labels } = actionPaths(g, legal, P0);
    const hand = `hand:p1:${slimy}`;

    const first = narrow(paths, [hand]);
    expect(first.done).toBeNull();
    const words = first.next.map((t) => labels[t]);
    expect(first.next.every((t) => t.startsWith("opt:"))).toBe(true);
    expect(words).toContain("Cast Slimy Mutants");
    expect(words.some((w) => w?.startsWith("③"))).toBe(true);
    expect(words).toHaveLength(2);

    // "Cast" leads on to the summon squares, and every completed path is still a summon
    const cast = first.next.find((t) => labels[t] === "Cast Slimy Mutants")!;
    const summon = narrow(paths, [hand, cast]);
    expect(summon.next.length).toBeGreaterThan(0);
    expect(summon.matching.every((p) => p.action.t === "castSpell" && p.action.cardId === slimy)).toBe(true);
    const ability = first.next.find((t) => t !== cast)!;
    expect(narrow(paths, [hand, ability]).done).toEqual(legal.find((a) => isSlime(a, slimy)));
  }, 120_000);
});

/**
 * Pick Up is once per turn, but that one Pick Up may take any mix of the artifacts and allies at
 * the unit's location. The generator used to offer one unit OR the artifacts, never both, so a
 * carrier that picked up its artifact could no longer take its rider that turn.
 */
describe("one Pick Up takes artifacts and allies together", () => {
  it("offers the artifact and the ally in a single pick-up, and applies it", () => {
    const g = createGame([toEngineDeck(enginePrecons[0]), toEngineDeck(enginePrecons[1])], ["You", "Computer"], 7, 0 as PlayerId);
    g.phase = "main";
    g.activePlayer = 0 as PlayerId;
    g.prompts = [];
    const avatar = Object.values(g.units).find((u) => u.isAvatar && u.owner === 0)!;
    const unit = (id: string, name: string): UnitState =>
      (g.units[id] = { ...avatar, id, name, cardId: `c_${id}`, isAvatar: false, x: 1, y: 2, region: "surface", tapped: false, counters: {}, modifiers: [], usedThisTurn: {}, carrying: [], carryingUnits: [], carriedBy: null, enteredTurn: -5 } as unknown as UnitState);
    unit("horse", "War Horse");
    unit("rider", "Blacksmith Family");
    g.artifacts["lance"] = { id: "lance", cardId: "c_lance", name: "Lance", x: 1, y: 2, region: "surface", carriedBy: null, conjuredBy: 0, tapped: false } as unknown as GameState["artifacts"][string];

    const both = legalActionsWithCasters(g, 0 as PlayerId).find(
      (a) => a.t === "pickUp" && a.unitId === "horse" && a.artifactIds.includes("lance") && (a.unitIds ?? []).includes("rider"),
    );
    expect(both, "a pick-up of the Lance and the rider together").toBeTruthy();
    const { labels } = actionPaths(g, [both!]);
    expect(Object.values(labels)).toContain("Pick up Lance + carry Blacksmith Family");

    expect(applyAction(g, 0 as PlayerId, both!)).toEqual({ ok: true });
    expect(g.units["horse"].carrying).toEqual(["lance"]);
    expect(g.units["horse"].carryingUnits).toEqual(["rider"]);
  });
});

/**
 * Blink: "An ally teleports to a location it's nearby." The destination is nearby the ALLY (the
 * script's `whereOf: 0`). The generator validated every pick against the CASTER, so an ally away
 * from the avatar was only offered the few squares near both — "only lets me teleport to some
 * sites, not all nearby". (A 48-combination cap also cut later allies short on a crowded board;
 * dependent picks now get a larger one.)
 */
describe("Blink offers every location nearby the chosen ally", () => {
  it("measures the destination from the ally, for every ally", () => {
    const g = createGame([toEngineDeck(enginePrecons[0]), toEngineDeck(enginePrecons[1])], ["You", "Computer"], 7, 0 as PlayerId);
    g.phase = "main";
    g.activePlayer = 0 as PlayerId;
    g.prompts = [];
    const avatar = Object.values(g.units).find((u) => u.isAvatar && u.owner === 0)!;
    // unit target ids are read by prefix ("u…"), so the allies are named that way
    // sites everywhere, so every nearby location of an ally is a real destination
    for (let x = 0; x < 5; x++)
      for (let y = 0; y < 4; y++)
        if (!Object.values(g.sites).some((s) => s.x === x && s.y === y))
          g.sites[`s${x}${y}`] = { id: `s${x}${y}`, cardId: `cs${x}${y}`, name: "Spire", owner: 0, controller: 0, x, y, tapped: false, isRubble: false } as unknown as GameState["sites"][string];
    const ally = (id: string, x: number, y: number): UnitState => {
      g.cards[`c_${id}`] = { id: `c_${id}`, name: "Blacksmith Family", owner: 0 } as unknown as GameState["cards"][string];
      return (g.units[id] = { ...avatar, id, name: "Blacksmith Family", cardId: `c_${id}`, isAvatar: false, x, y, region: "surface", tapped: false, counters: {}, modifiers: [], usedThisTurn: {}, carrying: [], carryingUnits: [], carriedBy: null, enteredTurn: -5 } as unknown as UnitState);
    };
    const far = ally("ufar", avatar.x === 0 ? 4 : 0, avatar.y === 0 ? 3 : 0);
    // a couple of other allies, so the far one is not simply the only choice
    ally("ua0", 1, 1);
    ally("ua1", 3, 2);
    g.cards["c_blink"] = { id: "c_blink", name: "Blink", owner: 0 } as unknown as GameState["cards"][string];
    g.players[0].hand.push("c_blink");
    g.players[0].mana = 9;

    const dests = legalActionsWithCasters(g, 0 as PlayerId)
      .filter((a) => a.t === "castSpell" && a.cardId === "c_blink" && a.targets?.[0] === "ufar")
      .map((a) => (a as { targets: string[] }).targets[1]);
    const offered = [...new Set(dests.map((d) => d.slice(3).split(",").slice(0, 2).join(",")))].sort();
    const nearby = nearbySquaresW(g, far.x, far.y).map((sq) => `${sq.x},${sq.y}`).sort();
    expect(offered, "every location nearby the ally, measured from the ally").toEqual(nearby);
  });
});
