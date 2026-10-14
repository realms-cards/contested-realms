import { describe, expect, it } from "vitest";
import { spanEntities } from "@/lib/engine-mode/boardOverlays";
import type { SpanEntity } from "@/lib/engine-mode/boardOverlays";
import { enginePrecons, toEngineDeck } from "@/lib/engine-mode/decks";
import { projectView } from "@/lib/engine-mode/projection";
import type { AvatarState, CardRef, PermanentItem, Permanents, PlayerKey } from "@/lib/game/store/types";
import { createGame, viewFor } from "@sorcery/shared";
import type { GameState as EngineState, PlayerId } from "@sorcery/shared";
import { arrangeDrop, CARD_ASPECT, cardTone, cardTurn, layoutBoard2D, ownerGlow, resolveTap, siteOwnerGlow, spanTapCell, tileMarks } from "./layout2d";
import type { Placed } from "./layout2d";

const T = 100;
const TS = { w: T, h: T };
const card = (name: string, instanceId: string): CardRef => ({ cardId: 1, name, type: "Minion", instanceId });
const item = (id: string, owner: 1 | 2, extra: Partial<PermanentItem> = {}): PermanentItem => ({
  card: card(id, id),
  owner,
  instanceId: id,
  tapped: false,
  offset: null,
  ...extra,
});
const noAvatars = (): Record<PlayerKey, AvatarState> => ({
  p1: { card: null, pos: null, tapped: false, offset: null },
  p2: { card: null, pos: null, tapped: false, offset: null },
});
const layout = (permanents: Permanents, avatars = noAvatars(), spans: SpanEntity[] = []) =>
  layoutBoard2D({ permanents, avatars, spans, tile: TS });
const byKey = (placed: Placed[], key: string) => placed.find((p) => p.key === key)!;
/** the card's on-screen box after any rotation */
const box = (p: Placed) => {
  const fw = p.rotate ? p.h : p.w;
  const fh = p.rotate ? p.w : p.h;
  return { left: p.x - fw / 2, right: p.x + fw / 2, top: p.y - fh / 2, bottom: p.y + fh / 2 };
};

describe("layoutBoard2D: tile rows", () => {
  it("draws a lone minion centred on its tile, nudged toward its owner, as a pickable unit token", () => {
    const [p] = layout({ "2,1": [item("u1", 1)] });
    expect(p.token).toBe("unit:perm:u1");
    expect(p.ref).toEqual({ kind: "permanent", at: "2,1", index: 0 });
    expect(p.x).toBeCloseTo(2.5 * T);
    expect(p.y).toBeGreaterThan(1.5 * T); // p1 is the near (bottom) side
    expect(p.h).toBeCloseTo(0.66 * T);
    expect(p.w).toBeCloseTo(0.66 * T * CARD_ASPECT);
    const [q] = layout({ "2,1": [item("u2", 2)] });
    expect(q.y).toBeLessThan(1.5 * T);
  });

  it("lays a stretched tile out per axis, the card keeping its shape and sized to the smaller edge", () => {
    const tile = { w: 150, h: 90 };
    const placed = layoutBoard2D({ permanents: { "2,1": [item("u1", 1), item("u2", 2)] }, avatars: noAvatars(), spans: [], tile });
    for (const p of placed) {
      expect(p.x).toBeCloseTo(2.5 * tile.w, 0);
      expect(p.w / p.h).toBeCloseTo(CARD_ASPECT);
      expect(p.h).toBeLessThanOrEqual(0.66 * tile.h + 1e-9);
      // inside its tile
      expect(box(p).top).toBeGreaterThanOrEqual(tile.h - 1e-9);
      expect(box(p).bottom).toBeLessThanOrEqual(2 * tile.h + 1e-9);
    }
    // theirs in the far half, ours in the near half, split by the tile's own height
    expect(box(byKey(placed, "perm:u2")).bottom).toBeLessThanOrEqual(1.5 * tile.h + 1e-9);
    expect(box(byKey(placed, "perm:u1")).top).toBeGreaterThanOrEqual(1.5 * tile.h - 1e-9);
  });

  it("puts the opponent's row in the far half and ours in the near half, avatar first", () => {
    const avatars = noAvatars();
    avatars.p1 = { card: card("Sorcerer", "a1"), pos: [1, 2], tapped: false, offset: null };
    const placed = layout({ "1,2": [item("mine", 1), item("theirs", 2)] }, avatars);
    const avatar = byKey(placed, "avatar:p1");
    const mine = byKey(placed, "perm:mine");
    const theirs = byKey(placed, "perm:theirs");
    expect(avatar.token).toBe("unit:avatar:p1");
    expect(avatar.ref).toEqual({ kind: "avatar", who: "p1" });
    expect(avatar.x).toBeLessThan(mine.x);
    expect(avatar.y).toBe(mine.y);
    expect(box(theirs).bottom).toBeLessThanOrEqual(2.5 * T);
    expect(box(mine).top).toBeGreaterThanOrEqual(2.5 * T);
  });

  it("keeps every card of a crowded row inside its tile, shrinking to a floor and then overlapping", () => {
    const items = Array.from({ length: 6 }, (_, i) => item(`u${i}`, 1, { tapped: i === 2 }));
    const placed = layout({ "0,0": items });
    for (const p of placed) {
      const b = box(p);
      expect(b.left).toBeGreaterThanOrEqual(-0.001);
      expect(b.right).toBeLessThanOrEqual(T + 0.001);
      expect(p.h).toBeGreaterThanOrEqual(0.36 * T - 0.001);
    }
    expect(byKey(placed, "perm:u2").rotate).toBe(90);
    // left to right in store order, later cards stacked higher
    const xs = placed.map((p) => p.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    expect(placed[5].z).toBeGreaterThan(placed[0].z);
  });

  it("hangs status tokens as badges and carried artifacts as chips on their host, avatars included", () => {
    const avatars = noAvatars();
    avatars.p2 = { card: card("Witch", "a2"), pos: [3, 0], tapped: false, offset: null };
    const placed = layout(
      {
        "1,1": [
          item("u1", 1),
          item("u1:stealth", 1, { attachedTo: { at: "1,1", index: 0 } }),
          item("art", 1, { attachedTo: { at: "1,1", index: 0 } }),
        ],
        "3,0": [item("a2:ward", 2, { attachedTo: { at: "3,0", index: -1 } })],
      },
      avatars,
    );
    expect(placed.map((p) => p.key).sort()).toEqual(["avatar:p2", "perm:u1"]);
    const host = byKey(placed, "perm:u1");
    expect(host.statuses.map((s) => s.status)).toEqual(["stealth"]);
    expect(host.attachments.map((a) => a.token)).toEqual(["unit:perm:art"]);
    expect(host.attachments[0].ref).toEqual({ kind: "permanent", at: "1,1", index: 2 });
    expect(byKey(placed, "avatar:p2").statuses.map((s) => s.status)).toEqual(["ward"]);
  });

  it("turns Rubble and Flooded tokens into tile marks instead of cards", () => {
    const permanents = { "4,3": [item("s1:rubble", 1)], "0,3": [item("s2:flooded", 2), item("u1", 1)] };
    expect(layout(permanents).map((p) => p.key)).toEqual(["perm:u1"]);
    expect(tileMarks(permanents)).toEqual({
      "4,3": { rubble: true, flooded: false },
      "0,3": { rubble: false, flooded: true },
    });
  });

  it("fades a unit on the other layer and badges it burrowed or submerged, damage and stats too", () => {
    const placed = layoutBoard2D({
      permanents: { "2,2": [item("deep", 1, { faded: true, damage: 2, stats: { atk: 4, def: 3 } })] },
      avatars: noAvatars(),
      spans: [],
      positions: { deep: { permanentId: "deep", state: "burrowed", position: { x: 0, y: 0, z: 0 } } },
      tile: TS,
    });
    expect(placed[0].faded).toBe(true);
    expect(placed[0].badges).toMatchObject({ damage: 2, stats: { atk: 4, def: 3 }, layerState: "burrowed" });
  });
});

describe("layoutBoard2D: spans", () => {
  const aura: SpanEntity = {
    instanceId: "r1",
    kind: "aura",
    controller: "p1",
    cells: ["1,1", "2,1", "1,2", "2,2"],
    anchor: "2,2",
    centre: { x: 1.5, y: 1.5 },
  };

  it("centres an aura on the crossing of its four squares, under the tiles' own cards", () => {
    const placed = layout({ "2,2": [item("u1", 1), item("r1", 1)] }, noAvatars(), [aura]);
    const a = byKey(placed, "perm:r1");
    expect(a.span).toBe("aura");
    expect(a.x).toBeCloseTo(2 * T);
    expect(a.y).toBeCloseTo(2 * T);
    expect(a.h).toBeCloseTo(0.6 * T);
    expect(a.ref).toEqual({ kind: "permanent", at: "2,2", index: 1 });
    // the aura takes no slot: the unit sharing its anchor tile is laid out as if alone
    const u = byKey(placed, "perm:u1");
    expect(u.x).toBeCloseTo(2.5 * T);
    expect(u.h).toBeCloseTo(0.66 * T);
    expect(a.z).toBeLessThan(u.z);
  });

  it("does not cover a lone neighbour's card on the tiles around the crossing", () => {
    const placed = layout({ "1,1": [item("n", 1)], "2,2": [item("r1", 1)] }, noAvatars(), [aura]);
    const a = box(byKey(placed, "perm:r1"));
    const n = box(byKey(placed, "perm:n"));
    expect(a.left).toBeGreaterThan(n.right);
  });

  it("draws an oversized body as one card sized to its footprint, above the cells' cards", () => {
    const body: SpanEntity = { ...aura, instanceId: "big", kind: "body" };
    const placed = layout({ "2,2": [item("big", 1, { tapped: true })], "1,1": [item("n", 1)] }, noAvatars(), [body]);
    const b = byKey(placed, "perm:big");
    expect(b.span).toBe("body");
    expect(b.h).toBeGreaterThan(1.1 * T);
    expect(b.h).toBeLessThan(1.3 * T);
    expect(b.rotate).toBe(90);
    expect(b.z).toBeGreaterThan(byKey(placed, "perm:n").z);
  });
});

describe("layoutBoard2D on a real projection", () => {
  type Unit = EngineState["units"][string];
  const P0 = 0 as PlayerId;

  it("places a projected 2x2 aura and a 2x2 Enchantress-style body once each, centred on their area", () => {
    const deck = toEngineDeck(enginePrecons[0]);
    const game = createGame([deck, deck], ["You", "Computer"], 7, P0);
    const squares = [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }];
    game.cards.c_r1 = { id: "c_r1", name: "Crusade", owner: 0 } as EngineState["cards"][string];
    game.auras.r1 = { id: "r1", cardId: "c_r1", name: "Crusade", controller: P0, squares, enteredTurn: -1 };
    const avatar = Object.values(game.units).find((u) => u.isAvatar && u.owner === 0)!;
    game.units.big = { ...avatar, id: "big", isAvatar: false, x: 1, y: 0, size: "2x2", region: "surface", tapped: false } as Unit;

    const projected = projectView(viewFor(game, P0));
    const spans = spanEntities(game);
    const placed = layoutBoard2D({ permanents: projected.permanents, avatars: projected.avatars, spans, tile: TS });
    for (const id of ["r1", "big"]) {
      const cards = placed.filter((p) => p.key === `perm:${id}`);
      expect(cards).toHaveLength(1);
      const span = spans.find((s) => s.instanceId === id)!;
      expect(cards[0].x).toBeCloseTo((span.centre.x + 0.5) * T);
      expect(cards[0].y).toBeCloseTo((span.centre.y + 0.5) * T);
      expect(cards[0].token).toBe(`unit:perm:${id}`);
    }
  });
});

describe("resolveTap", () => {
  const base = { tiles: [] as string[], areas: {}, hovered: null, coarse: false, previewable: true };

  it("picks the card's own token first, then a status token, then the tile under it", () => {
    expect(resolveTap({ ...base, tokens: ["unit:perm:a", "2,1"], tiles: ["unit:perm:a", "2,1"] })).toEqual({
      kind: "select",
      token: "unit:perm:a",
    });
    expect(resolveTap({ ...base, tokens: ["unit:perm:a", "unit:perm:a:ward", "2,1"], tiles: ["unit:perm:a:ward"] })).toEqual({
      kind: "select",
      token: "unit:perm:a:ward",
    });
    expect(resolveTap({ ...base, tokens: ["unit:perm:a", "2,1"], tiles: ["2,1"] })).toEqual({ kind: "select", token: "2,1" });
  });

  it("previews what is not pickable, and does nothing on an empty unpickable tile", () => {
    expect(resolveTap({ ...base, tokens: ["unit:perm:a", "2,1"] })).toEqual({ kind: "preview" });
    expect(resolveTap({ ...base, tokens: ["2,1"], previewable: false })).toEqual({ kind: "none" });
  });

  it("asks a finger to tap an area anchor twice: the first shows the footprint", () => {
    const areaTap = { ...base, tokens: ["2,1"], tiles: ["2,1"], areas: { "2,1": ["1,0", "2,0", "1,1", "2,1"] } };
    expect(resolveTap({ ...areaTap, coarse: true })).toEqual({ kind: "hover", token: "2,1" });
    expect(resolveTap({ ...areaTap, coarse: true, hovered: "2,1" })).toEqual({ kind: "select", token: "2,1" });
    expect(resolveTap(areaTap)).toEqual({ kind: "select", token: "2,1" }); // a mouse already hovered it
  });
});

describe("cardTone", () => {
  const picker = { tiles: ["unit:perm:a"], glow: ["unit:perm:b"], sources: ["unit:avatar:p1"], selected: null, sequence: false };

  it("lights candidates, targets and sources like the 3D cards", () => {
    expect(cardTone(picker, "unit:perm:a")).toBe("candidate");
    expect(cardTone(picker, "unit:perm:b")).toBe("target");
    expect(cardTone(picker, "unit:avatar:p1")).toBe("source");
    expect(cardTone(picker, "unit:perm:z")).toBeNull();
    expect(cardTone({ ...picker, selected: "unit:perm:a" }, "unit:perm:a")).toBe("selected");
  });

  it("shows a mid-sequence candidate in the continue tone, as the tiles do", () => {
    expect(cardTone({ ...picker, sequence: true }, "unit:perm:a")).toBe("continue");
  });
});

describe("spanTapCell", () => {
  // a 2x2 card filed under "1,1" and drawn on the crossing of 1..2 x 1..2
  const span = { cell: "1,1", x: 2 * T, y: 2 * T, w: 90, h: 124, rotate: 0 as const };

  it("a tap on the part of the card over another tile picks that tile, not the anchor", () => {
    expect(spanTapCell(span, { x: 2 * T + 20, y: 2 * T + 30 }, TS)).toBe("2,2");
    expect(spanTapCell(span, { x: 2 * T - 20, y: 2 * T + 30 }, TS)).toBe("1,2");
    expect(spanTapCell(span, { x: 2 * T + 20, y: 2 * T - 30 }, TS)).toBe("2,1");
    expect(spanTapCell(span, { x: 2 * T - 20, y: 2 * T - 30 }, TS)).toBe("1,1");
  });

  it("a tap that did not land on the card (a keyboard click) keeps the anchor", () => {
    expect(spanTapCell(span, { x: 0, y: 0 }, TS)).toBe("1,1");
    expect(spanTapCell({ ...span, rotate: 90 }, { x: 2 * T + 60, y: 2 * T }, TS)).toBe("2,2");
    expect(spanTapCell(span, { x: 2 * T + 60, y: 2 * T }, TS)).toBe("1,1");
  });
});

describe("owner look: facing, not outlines", () => {
  it("lays the opponent's cards upside down and turns a tapped card a quarter from its owner's view", () => {
    expect(cardTurn({ owner: "p1", rotate: 0 })).toBe(0);
    expect(cardTurn({ owner: "p1", rotate: 90 })).toBe(90);
    expect(cardTurn({ owner: "p2", rotate: 0 })).toBe(180);
    expect(cardTurn({ owner: "p2", rotate: 90 })).toBe(270);
    // tapped stays distinct from untapped for both seats, and the on-screen box only follows `rotate`
    const [ogre] = layout({ "2,1": [item("u9", 2, { tapped: true })] });
    expect(cardTurn(ogre) % 180).toBe(90);
    expect(ogre.rotate).toBe(90);
  });

  it("glows only the opponent's cards and sites, softly in their colour, with no line", () => {
    expect(ownerGlow("p1", 60)).toBeUndefined();
    const glow = ownerGlow("p2", 60)!;
    expect(glow).toMatch(/^0 0 \d+px 1px #fca5a5[0-9a-f]{2}$/);
    // soft: blur, no hard offset; faint: alpha well under half-opaque-plus
    expect(parseInt(glow.slice(-2), 16)).toBeLessThanOrEqual(0x80);
    expect(ownerGlow("p2", 20)).toContain(" 4px ");
    expect(ownerGlow("p2", 400)).toContain(" 10px ");
    expect(siteOwnerGlow("p1", 100)).toBeUndefined();
    expect(siteOwnerGlow(null, 100)).toBeUndefined();
    expect(siteOwnerGlow("p2", 100)).toMatch(/^inset 0 0 \d+px #fca5a5[0-9a-f]{2}$/);
  });
});

describe("layoutBoard2D: the player's arrangement", () => {
  const tile = { w: 120, h: 90 };
  const three = () => ({ "2,1": [item("u1", 1), item("u2", 1), item("u3", 1)] });
  const arranged = (arrangement: Parameters<typeof layoutBoard2D>[0]["arrangement"], avatars = noAvatars(), avatarIds = {}) =>
    layoutBoard2D({ permanents: three(), avatars, spans: [], tile, arrangement, avatarIds });

  it("puts an arranged card at its offset from the tile's centre, leaving the row as it was", () => {
    const plain = arranged({});
    const moved = arranged({ u2: { at: "2,1", x: 0.1, y: -0.1, seq: 1 } });
    expect(byKey(moved, "perm:u2").x).toBeCloseTo(2.5 * tile.w + 0.1 * tile.w);
    expect(byKey(moved, "perm:u2").y).toBeCloseTo(1.5 * tile.h - 0.1 * tile.h);
    for (const key of ["perm:u1", "perm:u3"]) expect(byKey(moved, key)).toEqual(byKey(plain, key));
  });

  it("keeps it inside its tile, turned or not, and on top of the row, latest arranged highest", () => {
    const placed = arranged({ u1: { at: "2,1", x: 0.5, y: 0.5, seq: 2 }, u3: { at: "2,1", x: -0.5, y: -0.5, seq: 1 } });
    for (const key of ["perm:u1", "perm:u3"]) {
      const b = box(byKey(placed, key));
      expect(b.left).toBeGreaterThanOrEqual(2 * tile.w - 1e-9);
      expect(b.right).toBeLessThanOrEqual(3 * tile.w + 1e-9);
      expect(b.top).toBeGreaterThanOrEqual(tile.h - 1e-9);
      expect(b.bottom).toBeLessThanOrEqual(2 * tile.h + 1e-9);
    }
    const [u1, u2, u3] = ["perm:u1", "perm:u2", "perm:u3"].map((k) => byKey(placed, k).z);
    expect(u3).toBeGreaterThan(u2);
    expect(u1).toBeGreaterThan(u3);
  });

  it("ignores an override from another tile, and arranges an avatar by its unit id", () => {
    const plain = arranged({});
    expect(byKey(arranged({ u1: { at: "0,0", x: 0.4, y: 0, seq: 1 } }), "perm:u1")).toEqual(byKey(plain, "perm:u1"));
    const avatars = noAvatars();
    avatars.p1 = { card: card("Sorcerer", "av"), pos: [0, 3], tapped: false, offset: null };
    const placed = arranged({ uAv: { at: "0,3", x: -0.2, y: 0, seq: 1 } }, avatars, { p1: "uAv" });
    const avatar = byKey(placed, "avatar:p1");
    expect(avatar.arrangeId).toBe("uAv");
    expect(avatar.x).toBeCloseTo(0.5 * tile.w - 0.2 * tile.w);
  });

  it("gives a span card no arrange id: it keeps its place", () => {
    const span: SpanEntity = { kind: "aura", instanceId: "u1", controller: "p1", cells: ["2,1", "3,1"], anchor: "2,1", centre: { x: 2.5, y: 1 } };
    const placed = layoutBoard2D({ permanents: three(), avatars: noAvatars(), spans: [span], tile, arrangement: {} });
    expect(byKey(placed, "perm:u1").arrangeId).toBeNull();
    expect(byKey(placed, "perm:u2").arrangeId).toBe("u2");
  });

  it("turns a drag into a clamped spot and the offset the session saves", () => {
    const base = byKey(arranged({}), "perm:u2");
    const drop = arrangeDrop(base, 10, -5, tile);
    expect(drop.x).toBeCloseTo(base.x + 10);
    expect(drop.y).toBeCloseTo(base.y - 5);
    expect(drop.offset[0]).toBeCloseTo((base.x + 10 - 2.5 * tile.w) / tile.w);
    expect(drop.offset[1]).toBeCloseTo((base.y - 5 - 1.5 * tile.h) / tile.h);
    // far off the tile: pulled back to its edge
    const far = arrangeDrop(base, 1000, 0, tile);
    expect(far.x + base.w / 2).toBeCloseTo(3 * tile.w);
    expect(far.offset[0]).toBeLessThan(0.5);
  });
});
