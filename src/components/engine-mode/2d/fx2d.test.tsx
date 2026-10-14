import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BoardReveal } from "@/lib/engine-mode/projection";
import { useEngineSession } from "@/lib/engine-mode/session";
import { useCpuBoardPicker } from "@/lib/game/cpu/boardPicker";
import BoardMotion2D from "./BoardMotion2D";
import { attackOf, diffBoard, fateOf, snapBoard, trimmedSegment } from "./boardDiff";
import type { BoardSnap, FateSource } from "./boardDiff";
import EventFx2D, { FX_HIT_MS } from "./EventFx2D";
import { useBoard2DFocus } from "./focusStore";
import type { Placed } from "./layout2d";
import StatusLine2D from "./StatusLine2D";

vi.mock("next/image", () => ({
  default: (props: { src: string; alt: string; className?: string }) => (
    <span role="img" aria-label={props.alt} data-src={props.src} className={props.className} />
  ),
}));

const reveal = (over: Partial<BoardReveal>): BoardReveal => ({
  seq: 1,
  hits: [],
  sites: [],
  caster: null,
  name: "",
  element: "",
  card: null,
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers();
  useEngineSession.setState({ reveal: null, narration: null, botThinking: false });
  useCpuBoardPicker.getState().clear(useCpuBoardPicker.getState().request);
});
afterEach(() => {
  cleanup();
  useEngineSession.setState({ reveal: null, narration: null, botThinking: false });
  vi.useRealTimers();
});

describe("EventFx2D", () => {
  it("clears an earlier action's marks when the computer narrates its next one", () => {
    const { container } = render(<EventFx2D tileW={80} tileH={80} />);
    act(() => useEngineSession.setState({ reveal: reveal({ seq: 4, caster: "2,0", sites: ["2,1"], name: "Sparkmage plays Updraft Ridge" }) }));
    // the same action's narration lands with its reveal: the marks stay
    act(() => useEngineSession.setState({ narration: { text: "Plays Updraft Ridge at tile 8.", seq: 1 } }));
    expect(screen.getByText("Sparkmage plays Updraft Ridge")).toBeTruthy();
    // the next action, a beat later: the old caption and rings must not sit under it
    act(() => vi.advanceTimersByTime(900));
    act(() => useEngineSession.setState({ narration: { text: "Summons Spectral Stalker at tile 3.", seq: 2 } }));
    expect(container.firstChild).toBeNull();
  });

  it("draws the damage number and caption for a reveal, then clears itself", () => {
    const { container } = render(<EventFx2D tileW={80} tileH={80} />);
    expect(container.firstChild).toBeNull();
    act(() => useEngineSession.setState({ reveal: reveal({ hits: [{ at: "2,1", dmg: 3 }], sites: ["3,1"], name: "Bolt" }) }));
    expect(screen.getByText("−3")).toBeTruthy();
    expect(screen.getByText("Bolt")).toBeTruthy();
    expect(container.querySelectorAll('[data-fx="ring"]')).toHaveLength(2);
    // the damage ring sits on its tile, in px
    const damage = [...container.querySelectorAll<HTMLElement>('[data-fx="ring"]')].find((n) => n.style.left === "160px");
    expect(damage?.style.top).toBe("80px");
    // the number lives its full rise (FX_HIT_MS), then the layer clears itself
    act(() => vi.advanceTimersByTime(FX_HIT_MS - 300));
    expect(screen.getByText("−3")).toBeTruthy();
    act(() => vi.advanceTimersByTime(400));
    expect(container.firstChild).toBeNull();
  });

  it("lays a named spell as its card instead of a caption", () => {
    const { container } = render(<EventFx2D tileW={80} tileH={80} />);
    const card = { cardId: 1, name: "Fireball", slug: "fireball", type: "Magic" };
    act(() => useEngineSession.setState({ reveal: reveal({ seq: 2, card, caster: "1,1", name: "Fireball" }) }));
    // the layer is aria-hidden (pure decoration), so query the node directly
    expect(container.querySelector("[data-src]")?.getAttribute("data-src")).toBe("/api/images/fireball");
    expect(screen.queryByText("Fireball")).toBeNull();
  });

  it("draws a beam from the caster to every square it reached, but not to the caster itself", () => {
    const { container } = render(<EventFx2D tileW={80} tileH={80} />);
    act(() =>
      useEngineSession.setState({
        reveal: reveal({ seq: 3, caster: "0,0", hits: [{ at: "2,1", dmg: 2 }, { at: "0,0", dmg: 1 }], sites: ["4,3"], name: "Chain" }),
      }),
    );
    const beams = [...container.querySelectorAll<SVGPathElement>('[data-fx="beam"]')];
    expect(beams.map((b) => b.dataset.kind).sort()).toEqual(["affected", "damage"]);
    // the beam starts at the caster's centre side and ends short of the target
    const d = beams.find((b) => b.dataset.kind === "damage")?.getAttribute("d") ?? "";
    expect(d.startsWith("M")).toBe(true);
  });
});

const snap = (key: string, cell: string, over: Partial<BoardSnap> = {}): BoardSnap => {
  const [x, y] = cell.split(",").map(Number);
  return {
    key,
    token: key.startsWith("perm:") ? `unit:perm:${key.slice(5)}` : key,
    owner: "p2",
    card: { cardId: 1, name: key, type: "Minion", slug: null },
    cell,
    x: x + 0.5,
    y: y + 0.5,
    w: 0.4,
    h: 0.56,
    rotate: 0,
    damage: 0,
    ...over,
  };
};

describe("boardDiff", () => {
  it("diffs moves by cell, arrivals, damage and removals with a fate", () => {
    const before = [snap("perm:a", "1,1"), snap("perm:b", "2,2"), snap("perm:c", "3,3"), snap("avatar:p2", "2,0")];
    const after = [
      snap("perm:a", "1,2"),
      snap("perm:b", "2,2", { x: 2.3, damage: 2 }), // re-laid on its own tile: not a move
      snap("perm:d", "0,0"),
      snap("avatar:p2", "2,0"),
    ];
    const diff = diffBoard(before, after, (key) => (key === "perm:c" ? "dead" : "alive"));
    expect(diff.moves.map((m) => [m.key, m.ghost.cell, m.to.cell])).toEqual([["perm:a", "1,1", "1,2"]]);
    expect(diff.arrived.map((s) => s.key)).toEqual(["perm:d"]);
    expect(diff.hurt).toEqual(["perm:b"]);
    expect(diff.removed.map((r) => [r.snap.key, r.fate])).toEqual([["perm:c", "dead"]]);
    // a first snapshot is a baseline, never a burst of arrivals
    expect(diffBoard(null, after, () => "dead").arrived).toEqual([]);
    // a card still alive elsewhere (other layer, carried) is not a removal
    expect(diffBoard(before, [], () => "alive").removed).toEqual([]);
  });

  it("reads a vanished card's fate from the engine piles", () => {
    const game: FateSource = {
      units: { u1: {} },
      artifacts: {},
      auras: {},
      sites: {},
      players: [
        { cemetery: ["c2"], banished: [], hand: [] },
        { cemetery: [], banished: ["c3"], hand: ["c4"] },
      ],
    };
    const cards: Record<string, string> = { u2: "c2", u3: "c3", u4: "c4", u5: "c5" };
    const of = (key: string) => fateOf(key, game, (id) => cards[id]);
    expect(of("perm:u1")).toBe("alive");
    expect(of("perm:u2")).toBe("dead");
    expect(of("perm:u3")).toBe("banished");
    expect(of("perm:u4")).toBe("returned");
    expect(of("perm:u5")).toBe("gone");
    expect(of("avatar:p1")).toBe("alive");
    expect(fateOf("perm:u2", null, () => "c2")).toBe("alive");
  });

  it("trims lines at both ends and reads attacks out of the narration", () => {
    expect(trimmedSegment({ x: 0, y: 0 }, { x: 100, y: 0 }, 10, 20)).toEqual({ x1: 10, y1: 0, x2: 80, y2: 0 });
    expect(trimmedSegment({ x: 0, y: 0 }, { x: 20, y: 0 }, 10, 10)).toBeNull();
    expect(attackOf("Ogre moves to tile 8 and attacks Spire.", ["unit:perm:o", "2,1"])).toEqual({ attacker: "unit:perm:o", target: "2,1" });
    expect(attackOf("Ogre attacks Wolf.", ["unit:perm:o", "unit:perm:w"])?.target).toBe("unit:perm:w");
    expect(attackOf("Ogre moves from tile 3 to tile 8.", ["unit:perm:o", "2,1"])).toBeNull();
  });

  it("snaps placement into tile units, so a resize does not read as a move", () => {
    const placed = [{ key: "perm:a", token: "t", owner: "p1", card: { cardId: 1, name: "A", type: "Minion", slug: null }, cell: "1,1", x: 120, y: 120, w: 40, h: 56, rotate: 0, badges: { damage: 1 } }] as unknown as Placed[];
    expect(snapBoard(placed, { w: 80, h: 80 })[0]).toMatchObject({ x: 1.5, y: 1.5, w: 0.5, h: 0.7, damage: 1 });
    // a stretched tile: the centre in tile widths / heights, the card's size in the smaller edge
    expect(snapBoard(placed, { w: 120, h: 80 })[0]).toMatchObject({ x: 1, y: 1.5, w: 0.5, h: 0.7 });
  });
});

const placedOf = (s: BoardSnap, edge: number): Placed =>
  ({
    key: s.key,
    token: s.token,
    ref: { kind: "permanent", at: s.cell, index: 0 },
    card: s.card,
    owner: s.owner,
    cell: s.cell,
    span: null,
    x: s.x * edge,
    y: s.y * edge,
    w: s.w * edge,
    h: s.h * edge,
    rotate: s.rotate,
    z: 10,
    attachments: [],
    statuses: [],
    badges: { damage: s.damage, stats: null, counters: 0, layerState: null, carried: false },
    faded: false,
  }) satisfies Placed;

describe("BoardMotion2D", () => {
  it("trails an opponent's move, crumbles a dead card under a tombstone, glows an arrival, then clears", () => {
    const fate = vi.fn((key: string) => (key === "perm:dead" ? ("dead" as const) : ("alive" as const)));
    const first = [snap("perm:mover", "1,1"), snap("perm:dead", "3,2", { owner: "p1" })].map((s) => placedOf(s, 80));
    const { container, rerender } = render(<BoardMotion2D tile={{ w: 80, h: 80 }} placed={first} fateOf={fate} baseline="m:surface" />);
    expect(container.firstChild).toBeNull();
    const second = [snap("perm:mover", "2,1"), snap("perm:new", "4,0")].map((s) => placedOf(s, 80));
    rerender(<BoardMotion2D tile={{ w: 80, h: 80 }} placed={second} fateOf={fate} baseline="m:surface" />);
    expect(container.querySelector('[data-motion-removed="dead"]')).toBeTruthy();
    expect(container.querySelector("[title='perm:dead, to the cemetery']")).toBeTruthy();
    // the trail (a dark under-stroke and the marching line) and the arrival ring
    expect(container.querySelectorAll("svg g path").length).toBe(2);
    expect(container.querySelectorAll("[data-motion]").length).toBeGreaterThanOrEqual(3);
    act(() => vi.advanceTimersByTime(4000));
    expect(container.firstChild).toBeNull();
  });

  it("flashes the tiles the action feed asks to look at", () => {
    const { container } = render(<BoardMotion2D tile={{ w: 80, h: 80 }} placed={[]} fateOf={() => "alive"} baseline="m" />);
    act(() => useBoard2DFocus.getState().set(["1,2", "3,0"]));
    expect(container.querySelector('[data-motion="focus:1,2"]')).toBeTruthy();
    expect(container.querySelector('[data-motion="focus:3,0"]')).toBeTruthy();
    act(() => vi.advanceTimersByTime(2000));
    expect(container.firstChild).toBeNull();
  });

  it("a new baseline (layer switch) is not a diff", () => {
    const fate = () => "dead" as const;
    const first = [snap("perm:a", "1,1")].map((s) => placedOf(s, 80));
    const { container, rerender } = render(<BoardMotion2D tile={{ w: 80, h: 80 }} placed={first} fateOf={fate} baseline="m:surface" />);
    rerender(<BoardMotion2D tile={{ w: 80, h: 80 }} placed={[]} fateOf={fate} baseline="m:subsurface" />);
    expect(container.firstChild).toBeNull();
  });

  it("an attack in the computer's narration puts crossed swords on the target", () => {
    const placed = [snap("perm:o", "2,1", { y: 1.26 }), snap("perm:w", "2,1", { owner: "p1", y: 1.74 })].map((s) => placedOf(s, 80));
    const { container } = render(<BoardMotion2D tile={{ w: 80, h: 80 }} placed={placed} fateOf={() => "alive"} baseline="m" />);
    act(() => {
      useCpuBoardPicker.getState().setGlow("engine-cpu:9", ["unit:perm:o", "2,1", "unit:perm:w"]);
      useEngineSession.setState({ narration: { text: "Ogre moves to tile 8 and attacks Wolf.", seq: 9 } });
    });
    expect(container.querySelector("[data-board-motion]")).toBeTruthy();
    expect(container.querySelector("svg path[stroke-dasharray='1 1']")).toBeTruthy();
    // the strike line from the attacker to its victim
    expect(container.querySelectorAll("svg g path").length).toBe(2);
  });
});

describe("StatusLine2D", () => {
  it("holds the opponent's line for its dwell before the next one replaces it", () => {
    render(<StatusLine2D />);
    act(() => useEngineSession.setState({ narration: { text: "Computer draws a site.", seq: 1 } }));
    act(() => vi.advanceTimersByTime(300));
    act(() => useEngineSession.setState({ narration: { text: "Computer plays Arid Desert at tile 3.", seq: 2 } }));
    // the first line is not gone after a third of a second
    expect(screen.getByText("Computer draws a site.")).toBeTruthy();
    act(() => vi.advanceTimersByTime(1400));
    expect(screen.queryByText("Computer draws a site.")).toBeNull();
    expect(screen.getByText("Computer plays Arid Desert at tile 3.")).toBeTruthy();
  });

  it("shows the hovered token's label over the narration, and narration expires", () => {
    render(<StatusLine2D />);
    act(() => useEngineSession.setState({ narration: { text: "Computer summons a minion", seq: 7 } }));
    expect(screen.getByText("Computer summons a minion")).toBeTruthy();
    act(() => {
      const picker = useCpuBoardPicker.getState();
      picker.configure("engine:test", ["2,1"]);
      picker.setLabels("engine:test", { "2,1": "Move here" });
      picker.setHovered("2,1");
    });
    expect(screen.getByText("Move here")).toBeTruthy();
    act(() => useCpuBoardPicker.getState().setHovered(null));
    expect(screen.getByText("Computer summons a minion")).toBeTruthy();
    act(() => vi.advanceTimersByTime(2300));
    expect(screen.queryByText("Computer summons a minion")).toBeNull();
  });
});
