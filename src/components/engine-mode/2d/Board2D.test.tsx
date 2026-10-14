import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEngineSession } from "@/lib/engine-mode/session";
import { useCpuBoardPicker } from "@/lib/game/cpu/boardPicker";
import { useGameStore } from "@/lib/game/store";
import type { CardRef, GameState } from "@/lib/game/store/types";
import Board2D from "./Board2D";
import { frameInset } from "./Card2D";

// A plain store copy without the CPU controller subscription, so test states stay as written.
vi.mock("@/lib/game/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/game/store")>();
  const { create } = await import("zustand");
  return { ...actual, useGameStore: create<GameState>()(() => actual.useGameStore.getState()) };
});

// jsdom has no PointerEvent; keep `pointerType` so mouse and finger presses stay apart.
class TestPointerEvent extends MouseEvent {
  readonly pointerType: string;
  readonly isPrimary = true;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerType = init.pointerType ?? "mouse";
  }
}
if (typeof window.PointerEvent === "undefined") vi.stubGlobal("PointerEvent", TestPointerEvent);

const card = (name: string, instanceId: string, type = "Minion"): CardRef => ({ cardId: 1, name, type, slug: null, instanceId });
const touchTap = (el: Element) => {
  fireEvent.pointerDown(el, { pointerType: "touch", button: 0 });
  fireEvent.pointerUp(el, { pointerType: "touch", button: 0 });
  fireEvent.click(el);
};

beforeEach(() => {
  useGameStore.setState({
    opponentPlayerId: "engine",
    previewCard: null,
    // the copied actions still write to the original store; point this one at the copy
    setPreviewCard: (previewCard) => useGameStore.setState({ previewCard }),
    board: { size: { w: 5, h: 4 }, sites: { "2,1": { owner: 1, tapped: false, card: card("Spire", "s1", "Site") } } },
    permanents: { "2,1": [{ card: card("Ogre", "u1"), owner: 2, instanceId: "u1", tapped: true, offset: null }] },
    avatars: { p1: { card: null, pos: null, tapped: false, offset: null }, p2: { card: null, pos: null, tapped: false, offset: null } },
    permanentPositions: {},
    portalState: null,
  });
  useEngineSession.setState({ layer: "surface", hidden: {} });
  useCpuBoardPicker.setState({ request: "engine:main", tiles: [], selected: null, glow: [], sources: [], labels: {}, hovered: null, sequence: false, areas: {} });
});
afterEach(cleanup);

describe("Board2D", () => {
  it("draws all twenty tiles and the card on its site", () => {
    render(<Board2D tileW={74} tileH={74} />);
    expect(screen.getAllByRole("button", { name: /^Tile \d+/ })).toHaveLength(20);
    expect(screen.getByRole("button", { name: "Tile 8, Spire" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Ogre, opponent's, tapped/ })).toBeTruthy();
  });

  it("lays the opponent's cards and sites upside down with a soft glow, never an owner outline", () => {
    act(() =>
      useGameStore.setState({
        board: {
          size: { w: 5, h: 4 },
          sites: {
            "2,1": { owner: 1, tapped: false, card: card("Spire", "s1", "Site") },
            "2,0": { owner: 2, tapped: false, card: card("Tower", "s2", "Site") },
          },
        },
        permanents: {
          "2,1": [
            { card: card("Ogre", "u1"), owner: 2, instanceId: "u1", tapped: true, offset: null },
            { card: card("Imp", "u2"), owner: 2, instanceId: "u2", tapped: false, offset: null },
            { card: card("Elf", "u3"), owner: 1, instanceId: "u3", tapped: false, offset: null },
          ],
        },
      }),
    );
    render(<Board2D tileW={74} tileH={74} />);
    const ogre = screen.getByRole("button", { name: /^Ogre, opponent's, tapped/ });
    const imp = screen.getByRole("button", { name: /^Imp, opponent's/ });
    const elf = screen.getByRole("button", { name: /^Elf, yours/ });
    expect(imp.style.transform).toBe("rotate(180deg)");
    expect(ogre.style.transform).toBe("rotate(270deg)");
    expect(elf.style.transform).toBe("");
    for (const el of [ogre, imp, elf]) expect(el.style.border).not.toContain("dashed");
    expect(imp.style.boxShadow).toContain("px");
    expect(elf.style.boxShadow).toBe("");
    // the status/stat badges live outside the turned button, so they read upright
    expect(imp.parentElement?.style.transform ?? "").toBe("");

    const theirs = screen.getByRole("button", { name: "Tile 3, Tower" });
    const ours = screen.getByRole("button", { name: "Tile 8, Spire" });
    expect(theirs.style.border).not.toContain("dashed");
    expect(theirs.querySelector("[data-owner-glow]")).toBeTruthy();
    expect(ours.querySelector("[data-owner-glow]")).toBeNull();
    // the tile number stays upright: only the art turns
    expect(theirs.querySelector<HTMLElement>("[data-tile-number]")?.closest("[style*='rotate']")).toBeNull();
  });

  it("names no site on the tile (the preview does) and sets the number on a dark plate over the art only", () => {
    act(() =>
      useGameStore.setState({
        board: { size: { w: 5, h: 4 }, sites: { "2,1": { owner: 1, tapped: false, card: { ...card("Spire", "s1", "Site"), slug: "spire" } } } },
      }),
    );
    const { container } = render(<Board2D tileW={74} tileH={74} />);
    // the name stays for assistive tech, but nothing paints it on the art
    expect(screen.queryByText("Spire")).toBeNull();
    const site = screen.getByRole("button", { name: "Tile 8, Spire" });
    const number = site.querySelector<HTMLElement>("[data-tile-number]");
    expect(number?.textContent).toBe("8");
    // no blend mode (it washed out on mid-tone art): a plate of its own under the number
    expect(number?.style.mixBlendMode).toBe("");
    expect(number?.style.background).not.toBe("");
    const empty = container.querySelector<HTMLElement>('[aria-label="Tile 1, empty"] [data-tile-number]');
    expect(empty?.style.background).toBe("");
  });

  it("an opponent unit that moves leaves a trail; a card that vanished with no known fate draws nothing", () => {
    const { container } = render(<Board2D tileW={74} tileH={74} />);
    expect(container.querySelector("[data-board-motion]")).toBeNull();
    act(() =>
      useGameStore.setState({
        permanents: { "3,1": [{ card: card("Ogre", "u1"), owner: 2, instanceId: "u1", tapped: true, offset: null }] },
      }),
    );
    expect(container.querySelector("[data-board-motion]")).toBeTruthy();
    expect(container.querySelectorAll("[data-board-motion] path").length).toBeGreaterThan(0);
    // no engine game in this test: a vanished card's fate is unknown, so nothing is drawn for it
    act(() => useGameStore.setState({ permanents: {} }));
    expect(container.querySelector("[data-motion-removed]")).toBeNull();
  });

  it("a tap on a pickable card selects its token", () => {
    useCpuBoardPicker.setState({ tiles: ["unit:perm:u1"] });
    render(<Board2D tileW={74} tileH={74} />);
    touchTap(screen.getByRole("button", { name: /^Ogre/ }));
    expect(useCpuBoardPicker.getState().selected).toBe("unit:perm:u1");
    // a finger has no hover: the touched token is what the status line explains
    expect(useCpuBoardPicker.getState().hovered).toBe("unit:perm:u1");
  });

  it("a card that is not pickable on a candidate tile picks the tile", () => {
    useCpuBoardPicker.setState({ tiles: ["2,1"] });
    render(<Board2D tileW={74} tileH={74} />);
    touchTap(screen.getByRole("button", { name: /^Ogre/ }));
    expect(useCpuBoardPicker.getState().selected).toBe("2,1");
  });

  it("otherwise a touch tap toggles the preview, and a mouse right-click opens the context menu", () => {
    render(<Board2D tileW={74} tileH={74} />);
    const ogre = screen.getByRole("button", { name: /^Ogre/ });
    touchTap(ogre);
    expect(useGameStore.getState().previewCard?.name).toBe("Ogre");
    touchTap(ogre);
    expect(useGameStore.getState().previewCard).toBeNull();

    const open = vi.fn();
    act(() => useGameStore.setState({ openContextMenu: open }));
    fireEvent.contextMenu(ogre, { clientX: 5, clientY: 6 });
    expect(open).toHaveBeenCalledWith({ kind: "permanent", at: "2,1", index: 0 }, { x: 5, y: 6 });
    fireEvent.contextMenu(screen.getByRole("button", { name: "Tile 8, Spire" }), { clientX: 1, clientY: 2 });
    expect(open).toHaveBeenLastCalledWith({ kind: "site", x: 2, y: 1 }, { x: 1, y: 2 });
  });

  it("hovering a clickable card with a mouse previews it and publishes the hover", () => {
    useCpuBoardPicker.setState({ tiles: ["unit:perm:u1"] });
    render(<Board2D tileW={74} tileH={74} />);
    const ogre = screen.getByRole("button", { name: /^Ogre/ });
    fireEvent.pointerEnter(ogre, { pointerType: "mouse" });
    expect(useCpuBoardPicker.getState().hovered).toBe("unit:perm:u1");
    expect(useGameStore.getState().previewCard?.name).toBe("Ogre");
    fireEvent.pointerLeave(ogre, { pointerType: "mouse" });
    expect(useCpuBoardPicker.getState().hovered).toBeNull();
  });

  it("below the surface the board is labelled, and a tile's badge for the units above switches back", () => {
    useEngineSession.setState({ layer: "subsurface", hidden: { "2,1": { underground: 0, underwater: 0, surface: 2 } } });
    render(<Board2D tileW={120} tileH={120} />);
    expect(screen.getByRole("group", { name: "Board, below the surface" }).dataset.layer).toBe("subsurface");
    expect(screen.getByText("Below the surface")).toBeTruthy();
    const badge = screen.getByRole("button", { name: /^2 above\. Show the surface/ });
    expect(badge.textContent).toContain("2 above");
    fireEvent.click(badge);
    expect(useEngineSession.getState().layer).toBe("surface");
  });

  it("on the surface there is no underground label, and burrowed units are counted on their tile", () => {
    useEngineSession.setState({ hidden: { "2,1": { underground: 1, underwater: 0, surface: 0 } } });
    render(<Board2D tileW={74} tileH={74} />);
    expect(screen.queryByText("Below the surface")).toBeNull();
    expect(screen.getByRole("button", { name: /^1 burrowed\. Show the subsurface layer/ })).toBeTruthy();
  });
});

describe("frameInset", () => {
  it("keeps a pick frame inside the board on its edge rows and columns", () => {
    const bounds = { w: 400, h: 320 };
    // well inside: the usual 3 px outside the card on every side
    expect(frameInset({ left: 100, top: 100, width: 50, height: 70 }, bounds)).toEqual({ top: -3, right: -3, bottom: -3, left: -3 });
    // flush with the bottom edge (tile 18 on a phone): the brackets stay on the board
    const flush = frameInset({ left: 100, top: 250, width: 50, height: 70 }, bounds);
    expect(flush.bottom).toBe(2);
    expect(flush.top).toBe(-3);
  });
});
