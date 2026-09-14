import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CpuCardPick from "@/components/game/CpuCardPick";

vi.mock("next/image", () => ({
  default: (props: {src: string; alt: string; className?: string}) => <span data-src={props.src} className={props.className} />,
}));

afterEach(cleanup);

const art = (button: HTMLElement) => button.querySelector("[data-src]");

describe("CPU card pick row", () => {
  it("shows each card by its art with its badge, marks the picked one and picks the clicked one", () => {
    const onPick = vi.fn<(id: string) => void>();
    render(<CpuCardPick title="Choose a card" selected="b" onPick={onPick} items={[
      {id:"a",card:{name:"Mountain Giant",slug:"mountain_giant",cardId:7,type:"Minion"},badge:"3 damage"},
      {id:"b",card:{name:"Geomancer",cardId:9,type:"Avatar"},badge:"3 damage"},
    ]} />);
    const row = screen.getByRole("region",{name:"Choose a card"});
    const giant = within(row).getByRole("button",{name:"Mountain Giant, 3 damage"});
    const geomancer = within(row).getByRole("button",{name:"Geomancer, 3 damage"});
    expect(giant.getAttribute("aria-pressed")).toBe("false");
    expect(geomancer.getAttribute("aria-pressed")).toBe("true");
    expect(art(giant)?.getAttribute("data-src")).toBe("/api/images/mountain_giant");
    // Without a slug the art is found by card id.
    expect(art(geomancer)?.getAttribute("data-src")).toBe("/api/images/9");
    expect(within(row).getAllByText("3 damage")).toHaveLength(2);
    fireEvent.click(giant);
    expect(onPick).toHaveBeenCalledWith("a");
    expect(screen.queryByRole("button",{name:/^Close/})).toBeNull();
  });

  it("turns sites sideways and names a card that has no art", () => {
    render(<CpuCardPick title="Triggers" onPick={vi.fn()} items={[
      {id:"s",card:{name:"Arid Desert",slug:"arid_desert",cardId:3,type:"Site"},badge:"Genesis"},
      {id:"l",card:{name:"Lucky Charm",cardId:0,type:"Artifact"},badge:"choose random outcome"},
    ]} />);
    expect(art(screen.getByRole("button",{name:"Arid Desert, Genesis"}))?.className).toContain("rotate-90");
    const charm = screen.getByRole("button",{name:"Lucky Charm, choose random outcome"});
    expect(art(charm)).toBeNull();
    expect(within(charm).getByText("Lucky Charm")).toBeTruthy();
  });

  it("draws a hidden card face down, without its name or art", () => {
    render(<CpuCardPick title="Choose a card" onPick={vi.fn()} items={[{id:"h",card:{name:"Lightning Bolt",slug:"lightning_bolt",cardId:1},badge:"Discard",hidden:true}]} />);
    const hidden = screen.getByRole("button",{name:"Hidden card, Discard"});
    expect(art(hidden)).toBeNull();
    expect(screen.queryByText("Lightning Bolt")).toBeNull();
  });

  it("uses a given accessible name and closes from the header", () => {
    const onPick = vi.fn<(id: string) => void>(), onClose = vi.fn<() => void>();
    render(<CpuCardPick title="Triggers" onPick={onPick} onClose={onClose} items={[{id:"t",card:{name:"Sinkhole: Genesis"},label:"Sinkhole: Genesis"}]} />);
    fireEvent.click(screen.getByRole("button",{name:"Sinkhole: Genesis"}));
    expect(onPick).toHaveBeenCalledWith("t");
    fireEvent.click(screen.getByRole("button",{name:"Close Triggers"}));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
