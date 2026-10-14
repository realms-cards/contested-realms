import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCpuBoardPicker } from "@/lib/game/cpu/boardPicker";
import { useGameStore } from "@/lib/game/store";
import type { CardRef, GameState } from "@/lib/game/store/types";
import FieldTargets2D, { PROMPT_DOCK_ID } from "./FieldTargets2D";

// A plain store copy without the CPU controller subscription, so test states stay as written.
vi.mock("@/lib/game/store", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/game/store")>();
  const { create } = await import("zustand");
  return {...actual,useGameStore:create<GameState>()(() => actual.useGameStore.getState())};
});

// jsdom has no PointerEvent, so fireEvent would drop `pointerType` and every press would read as
// touch; this keeps the mouse/finger split under test.
class TestPointerEvent extends MouseEvent {
  readonly pointerType: string;
  constructor(type: string, init: PointerEventInit = {}) { super(type,init); this.pointerType = init.pointerType ?? "mouse"; }
}
if (typeof window.PointerEvent === "undefined") vi.stubGlobal("PointerEvent",TestPointerEvent);

const picker = () => useCpuBoardPicker.getState();
const offer = (state: Partial<ReturnType<typeof picker>>) => act(() => { useCpuBoardPicker.setState(state); });
const card = (name: string, type = "Minion"): CardRef => ({cardId:1,name,type,slug:null});
const TILE = { w: 74, h: 74 };

beforeEach(() => {
  useGameStore.setState({opponentPlayerId:"engine",permanents:{},avatars:{p1:{card:null,pos:null},p2:{card:null,pos:null}}});
  useCpuBoardPicker.setState({request:"engine:main",tiles:[],selected:null,glow:[],sources:[],labels:{},hovered:null,sequence:false,areas:{}});
});
afterEach(() => { cleanup(); document.getElementById(PROMPT_DOCK_ID)?.remove(); });

describe("FieldTargets2D", () => {
  it("draws nothing for a request it does not own", () => {
    useCpuBoardPicker.setState({request:"tutorial",tiles:["1,1"]});
    const {container} = render(<FieldTargets2D tile={TILE} docked={false} />);
    expect(container.innerHTML).toBe("");
  });

  it("paints tile tones without taking the pointer, brackets only where a click is awaited", () => {
    const {container} = render(<FieldTargets2D tile={TILE} docked={false} />);
    offer({tiles:["1,1"],glow:["2,2"],sources:["3,3"]});
    const tiles = [...container.querySelectorAll<HTMLElement>("[data-pick-tile]")];
    expect(tiles.map(tile => [tile.dataset.pickTile,tile.dataset.tone])).toEqual([["3,3","source"],["2,2","target"],["1,1","candidate"]]);
    for (const tile of tiles) expect(tile.className).toContain("pointer-events-none");
    expect(container.querySelector("[data-engine-picks]")?.className).toContain("pointer-events-none");
    expect(container.querySelectorAll('[data-pick-tile="1,1"] path').length).toBe(3);
    expect(container.querySelectorAll('[data-pick-tile="2,2"] path').length).toBe(0);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    const candidate = tiles[2];
    expect([candidate.style.left,candidate.style.top,candidate.style.width]).toEqual(["74px","74px","74px"]);
  });

  it("slows the pulse mid-sequence", () => {
    const {container} = render(<FieldTargets2D tile={TILE} docked={false} />);
    offer({tiles:["1,1"],sequence:true});
    expect(container.querySelector('[data-pick-tile="1,1"] rect')?.getAttribute("class")).toContain("animation-duration:3.2s");
  });

  it("makes offered directions buttons and chosen ones plain marks", () => {
    const {container} = render(<FieldTargets2D tile={TILE} docked={false} />);
    offer({tiles:["dir:2,1:N"],glow:["dir:2,1:E"],labels:{"dir:2,1:N":"Fly north"}});
    fireEvent.click(screen.getByRole("button",{name:"Fly north"}));
    expect(picker().selected).toBe("dir:2,1:N");
    const chosen = container.querySelector<HTMLElement>('[data-pick-arrow="dir:2,1:E"]');
    expect(chosen?.tagName).toBe("DIV");
    expect(chosen?.className).toContain("pointer-events-none");
    const north = container.querySelector<HTMLElement>('[data-pick-arrow="dir:2,1:N"]');
    expect(Number.parseFloat(north?.style.width ?? "0")).toBeGreaterThanOrEqual(32);
  });

  it("previews an area anchor on a finger's first tap and places it on the second", () => {
    const {container} = render(<FieldTargets2D tile={TILE} docked={false} />);
    offer({tiles:["1,1","2,1"],areas:{"1,1":["1,1","2,1","1,2","2,2"],"2,1":["2,1","3,1","2,2","3,2"]}});
    const marker = container.querySelector<HTMLElement>('[data-engine-area="1,1"]');
    if (!marker) throw new Error("no marker");
    fireEvent.pointerDown(marker,{pointerType:"touch"});
    fireEvent.click(marker);
    expect(picker().selected).toBeNull();
    expect(picker().hovered).toBe("1,1");
    expect(screen.getByRole("status").textContent).toBe("Tap again to place");
    // the footprint is washed as `area`, the anchor tile is never painted as a square to choose
    const tones = Object.fromEntries([...container.querySelectorAll<HTMLElement>("[data-pick-tile]")].map(tile => [tile.dataset.pickTile,tile.dataset.tone]));
    expect(tones).toEqual({"1,1":"area","2,1":"area","1,2":"area","2,2":"area"});
    fireEvent.pointerDown(marker,{pointerType:"touch"});
    fireEvent.click(marker);
    expect(picker().selected).toBe("1,1");
  });

  it("lets a mouse hover preview and click place an area anchor", () => {
    const {container} = render(<FieldTargets2D tile={TILE} docked={false} />);
    offer({tiles:["2,1"],areas:{"2,1":["2,1","3,1","2,2","3,2"]}});
    const marker = container.querySelector<HTMLElement>('[data-engine-area="2,1"]');
    if (!marker) throw new Error("no marker");
    fireEvent.pointerEnter(marker,{pointerType:"mouse"});
    expect(picker().hovered).toBe("2,1");
    fireEvent.pointerLeave(marker,{pointerType:"mouse"});
    expect(picker().hovered).toBeNull();
    fireEvent.pointerDown(marker,{pointerType:"mouse"});
    fireEvent.click(marker);
    expect(picker().selected).toBe("2,1");
  });

  it("floats option rows at their tile when not docked", () => {
    const {container} = render(<FieldTargets2D tile={TILE} docked={false} />);
    offer({tiles:["opt:2,2:move","opt:2,2:skip"],labels:{"opt:2,2:move":"Move here","opt:2,2:skip":"Skip"}});
    const row = container.querySelector<HTMLElement>('[data-engine-options="2,2"]');
    expect(row?.className).toContain("pointer-events-auto");
    expect(row?.style.left).toBe("185px");
    fireEvent.click(screen.getByRole("button",{name:"Move here"}));
    expect(picker().selected).toBe("opt:2,2:move");
  });

  it("portals option rows into the prompt dock when docked, framing the tile each belongs to", () => {
    const dock = document.createElement("div");
    dock.id = PROMPT_DOCK_ID;
    document.body.appendChild(dock);
    const {container} = render(<FieldTargets2D tile={TILE} docked />);
    offer({tiles:["opt:2,2:move","opt:4,0:attack"],labels:{"opt:2,2:move":"Move here","opt:4,0:attack":"Attack the site"}});
    expect(container.querySelector("[data-engine-options]")).toBeNull();
    expect(dock.querySelectorAll("[data-engine-options]")).toHaveLength(2);
    expect(dock.textContent).toContain("Tile 13");
    expect(dock.textContent).toContain("Tile 5");
    const frame = container.querySelector<HTMLElement>('[data-engine-option-tile="2,2"]');
    expect(frame?.style.outline).toContain("dashed");
    const row = dock.querySelector<HTMLElement>('[data-engine-options="2,2"]');
    if (!row) throw new Error("no row");
    fireEvent.pointerEnter(row);
    expect(container.querySelector<HTMLElement>('[data-engine-option-tile="2,2"]')?.style.outline).toContain("solid");
    fireEvent.click(screen.getByRole("button",{name:"Attack the site"}));
    expect(picker().selected).toBe("opt:4,0:attack");
  });

  it("hands a crowded small tile to the inspector, and picks the card chosen there", () => {
    useGameStore.setState({
      permanents:{"2,3":[{card:card("Pudge Butcher"),owner:1,instanceId:"a"},{card:card("Kite Archer"),owner:2,instanceId:"b"}]},
      avatars:{p1:{card:card("Sorcerer","Avatar"),pos:[2,3]},p2:{card:null,pos:null}},
    });
    const {container} = render(<FieldTargets2D tile={TILE} docked={false} />);
    offer({tiles:["unit:perm:a","unit:perm:b","unit:avatar:p1","2,3"]});
    const inspect = container.querySelector<HTMLElement>('[data-engine-inspect="2,3"]');
    if (!inspect) throw new Error("no inspector hand-off");
    fireEvent.click(inspect);
    const dialog = screen.getByRole("dialog",{name:"Tile 18: choose a card"});
    expect(dialog).toBeTruthy();
    expect(screen.getByRole("button",{name:"Choose tile 18 itself"})).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Kite Archer, Opponent"}));
    expect(picker().selected).toBe("unit:perm:b");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("leaves a lone candidate, and every candidate on a big tile, to the card itself", () => {
    useGameStore.setState({
      permanents:{"2,3":[{card:card("Pudge Butcher"),owner:1,instanceId:"a"},{card:card("Kite Archer"),owner:2,instanceId:"b"}]},
    });
    const small = render(<FieldTargets2D tile={TILE} docked={false} />);
    offer({tiles:["unit:perm:a"]});
    expect(small.container.querySelector("[data-engine-inspect]")).toBeNull();
    small.unmount();
    const big = render(<FieldTargets2D tile={{w:96,h:96}} docked={false} />);
    offer({tiles:["unit:perm:a","unit:perm:b"]});
    expect(big.container.querySelector("[data-engine-inspect]")).toBeNull();
  });
});
