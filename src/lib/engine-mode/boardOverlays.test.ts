import { createGame, viewFor } from "@sorcery/shared";
import type { GameState as EngineState, PlayerId } from "@sorcery/shared";
import { describe, expect, it } from "vitest";
import { auraAreas, disableAreas, layerTints, multiSquareBodies, outlineEdges, spanEntities } from "./boardOverlays";
import { engineCellKey } from "./coords";
import { enginePrecons, toEngineDeck } from "./decks";
import { projectView } from "./projection";

type Site = EngineState["sites"][string];
type Unit = EngineState["units"][string];
const P0 = 0 as PlayerId;
const P1 = 1 as PlayerId;
const SQUARE_2X2 = [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }];

function newGame(): EngineState {
  const deck = toEngineDeck(enginePrecons[0]);
  return createGame([deck, deck], ["You", "Computer"], 7, P0);
}

function addSite(game: EngineState, id: string, x: number, y: number, name = "Spire", extra: Partial<Site> = {}) {
  game.cards[`c_${id}`] = { id: `c_${id}`, name, owner: 0 } as EngineState["cards"][string];
  game.sites[id] = {
    id, cardId: `c_${id}`, name, x, y, owner: 0, controller: 0, isRubble: false, tapped: false, ...extra,
  } as unknown as Site;
}

/** A minion cloned from seat 0's avatar record, so every field the engine reads is present. */
function addMinion(game: EngineState, id: string, x: number, y: number, extra: Partial<Unit> = {}): Unit {
  const avatar = Object.values(game.units).find((u) => u.isAvatar && u.owner === 0)!;
  const unit = { ...avatar, id, isAvatar: false, x, y, region: "surface", tapped: false, ...extra } as Unit;
  game.units[id] = unit;
  return unit;
}

function addAura(game: EngineState, id: string, squares: { x: number; y: number }[], controller: PlayerId = P0) {
  game.cards[`c_${id}`] = { id: `c_${id}`, name: "Crusade", owner: controller } as EngineState["cards"][string];
  game.auras[id] = { id, cardId: `c_${id}`, name: "Crusade", controller, squares, enteredTurn: -1 };
}

const sorted = (cells: string[]) => [...cells].sort();
/** Enchantress stores the aura's id under a counter the engine types as a number (enchantress.ts). */
const animatedBy = (auraId: string) => ({ animatedAura: auraId }) as unknown as Unit["counters"];

describe("auraAreas", () => {
  it("rotates each aura's squares onto board cells and colours it by controller", () => {
    const game = newGame();
    addAura(game, "r1", SQUARE_2X2, P0);
    addAura(game, "r2", [{ x: 0, y: 0 }, { x: 0, y: 0 }], P1);
    const areas = auraAreas(game);
    expect(areas).toContainEqual({ id: "r1", controller: "p1", cells: SQUARE_2X2.map((sq) => engineCellKey(sq.x, sq.y)) });
    // engine (0,0) is the far corner from seat 1's view: board 4,3; duplicates collapse
    expect(areas).toContainEqual({ id: "r2", controller: "p2", cells: ["4,3"] });
  });

  it("keeps an Enchantress-animated aura's area (the tint stays, only the card is shared)", () => {
    const game = newGame();
    addAura(game, "r1", SQUARE_2X2);
    addMinion(game, "uAnim", 1, 1, { size: "2x2", counters: animatedBy("r1") });
    expect(auraAreas(game).map((a) => a.id)).toContain("r1");
  });
});

describe("multiSquareBodies", () => {
  it("outlines 2x2 and stretched bodies, never 1x1, carried or avatar units", () => {
    const game = newGame();
    addMinion(game, "uBig", 1, 1, { size: "2x2" });
    addMinion(game, "uLong", 3, 0, { extraSquares: [{ x: 4, y: 0 }] });
    addMinion(game, "uSmall", 0, 3);
    addMinion(game, "uHeld", 1, 1, { size: "2x2", carriedBy: "uBig" });
    const bodies = multiSquareBodies(game);
    expect(bodies.map((b) => b.id).sort()).toEqual(["uBig", "uLong"]);
    const big = bodies.find((b) => b.id === "uBig")!;
    expect(big.controller).toBe("p1");
    expect(sorted(big.cells)).toEqual(sorted(SQUARE_2X2.map((sq) => engineCellKey(sq.x, sq.y))));
    expect(sorted(bodies.find((b) => b.id === "uLong")!.cells)).toEqual(["0,3", "1,3"]);
  });
});

describe("layerTints", () => {
  it("is empty on the surface and tints every standing site by terrain below", () => {
    const game = newGame();
    addSite(game, "sDry", 1, 1, "Spire");
    addSite(game, "sWet", 2, 1, "Spring River");
    addSite(game, "sGone", 3, 1, "Spire", { isRubble: true });
    expect(layerTints(game, "surface")).toEqual([]);
    const tints = layerTints(game, "subsurface");
    expect(tints).toContainEqual({ cell: engineCellKey(1, 1), water: false });
    expect(tints).toContainEqual({ cell: engineCellKey(2, 1), water: true });
    expect(tints.map((t) => t.cell)).not.toContain(engineCellKey(3, 1));
  });
});

describe("disableAreas", () => {
  it("covers the sites near each live Babbling Brook entry and drops one whose site is gone", () => {
    const game = newGame();
    for (const id of Object.keys(game.sites)) delete game.sites[id];
    addSite(game, "sBrook", 2, 1, "Babbling Brook");
    // every square of the 3x3 around engine (2,1) holds a site
    for (let x = 1; x <= 3; x++) for (let y = 0; y <= 2; y++) if (x !== 2 || y !== 1) addSite(game, `s${x}${y}`, x, y);
    game.flow = { ...(game.flow ?? {}), areaDisables: [{ siteId: "sBrook", player: 0, turn: 1 }, { siteId: "sMissing" }] };
    const areas = disableAreas(game);
    expect(areas).toHaveLength(1);
    expect(areas[0].id).toBe("sBrook-0");
    // nearby = the 3x3 around engine (2,1), which is board (2,2)
    expect(sorted(areas[0].cells)).toEqual(sorted(["1,1", "2,1", "3,1", "1,2", "2,2", "3,2", "1,3", "2,3", "3,3"]));
  });

  it("leaves out void squares (it bites only atop sites) but keeps rubble", () => {
    const game = newGame();
    for (const id of Object.keys(game.sites)) delete game.sites[id];
    addSite(game, "sBrook", 2, 1, "Babbling Brook");
    addSite(game, "sNear", 1, 0);
    addSite(game, "sRubble", 3, 2, "Spire", { isRubble: true });
    game.flow = { ...(game.flow ?? {}), areaDisables: [{ siteId: "sBrook", player: 0, turn: 1 }] };
    const [area] = disableAreas(game);
    expect(sorted(area.cells)).toEqual(sorted([engineCellKey(2, 1), engineCellKey(1, 0), engineCellKey(3, 2)]));
  });

  it("is empty with no Brook in play", () => {
    expect(disableAreas(newGame())).toEqual([]);
  });
});

describe("spanEntities", () => {
  it("lists auras and multi-square bodies, skipping an animated aura (the minion is the card)", () => {
    const game = newGame();
    addAura(game, "r1", SQUARE_2X2);
    addAura(game, "r2", [{ x: 3, y: 0 }, { x: 4, y: 0 }]);
    addMinion(game, "uAnim", 1, 1, { size: "2x2", counters: animatedBy("r1") });
    addMinion(game, "uSmall", 0, 3);
    const spans = spanEntities(game);
    expect(spans.map((s) => `${s.kind}:${s.instanceId}`).sort()).toEqual(["aura:r2", "body:uAnim"]);
  });

  it("anchors every span where the projection files its card, and gives the footprint's centre", () => {
    const game = newGame();
    for (const sq of SQUARE_2X2) addSite(game, `s${sq.x}${sq.y}`, sq.x, sq.y);
    addAura(game, "r1", [{ x: 0, y: 2 }, { x: 1, y: 2 }, { x: 0, y: 3 }, { x: 1, y: 3 }], P1);
    addAura(game, "r2", [{ x: 3, y: 0 }, { x: 4, y: 0 }, { x: 3, y: 1 }]);
    addMinion(game, "uBig", 1, 1, { size: "2x2" });
    const projected = projectView(viewFor(game, P0));
    const spans = spanEntities(game);
    expect(spans).toHaveLength(3);
    for (const span of spans) {
      const ids = (projected.permanents[span.anchor] ?? []).map((p) => p.instanceId);
      expect(ids, `${span.instanceId} filed under ${span.anchor}`).toContain(span.instanceId);
      expect(span.cells).toContain(span.anchor);
    }
    const big = spans.find((s) => s.instanceId === "uBig")!;
    // engine (1,1)-(2,2) is board (2,1)-(3,2): the four squares meet at (2.5, 1.5)
    expect(big.centre).toEqual({ x: 2.5, y: 1.5 });
    expect(big.controller).toBe("p1");
    expect(spans.find((s) => s.instanceId === "r1")!.controller).toBe("p2");
  });

  it("drops auras on the subsurface layer and keeps only bodies on that layer", () => {
    const game = newGame();
    addAura(game, "r1", SQUARE_2X2);
    addMinion(game, "uTop", 1, 1, { size: "2x2" });
    addMinion(game, "uDown", 2, 1, { size: "2x2", region: "underground" });
    expect(spanEntities(game, "subsurface").map((s) => s.instanceId)).toEqual(["uDown"]);
    // the surface view still draws the burrowed body (faded), like projectView
    expect(spanEntities(game, "surface").map((s) => s.instanceId).sort()).toEqual(["r1", "uDown", "uTop"]);
  });
});

describe("outlineEdges", () => {
  it("draws all four sides of a lone cell in cell-corner units", () => {
    expect(outlineEdges(["2,1"])).toEqual([
      { cell: "2,1", side: "top", x1: 2, y1: 1, x2: 3, y2: 1 },
      { cell: "2,1", side: "bottom", x1: 2, y1: 2, x2: 3, y2: 2 },
      { cell: "2,1", side: "left", x1: 2, y1: 1, x2: 2, y2: 2 },
      { cell: "2,1", side: "right", x1: 3, y1: 1, x2: 3, y2: 2 },
    ]);
  });

  it("leaves out sides shared between covered cells", () => {
    const square = outlineEdges(["1,1", "2,1", "1,2", "2,2"]);
    expect(square).toHaveLength(8);
    expect(square.some((e) => e.cell === "1,1" && (e.side === "right" || e.side === "bottom"))).toBe(false);
    // an L of three cells has a perimeter of 8 unit edges, duplicate keys counted once
    expect(outlineEdges(["0,0", "1,0", "0,1", "0,1"])).toHaveLength(8);
  });

  it("returns nothing for no cells", () => {
    expect(outlineEdges([])).toEqual([]);
  });
});
