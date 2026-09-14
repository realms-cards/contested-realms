import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CpuPlayReveal from "@/components/game/CpuPlayReveal";
import cards from "@/lib/game/cpu/cards.json";
import { useCpuReveals } from "@/lib/game/cpu/revealQueue";
import type { CardRef } from "@/lib/game/store/types";

vi.mock("next/image", () => ({
  default: (props: {src: string; alt: string; className?: string}) => <span role="img" aria-label={props.alt} data-src={props.src} className={props.className} />,
}));

const card = (name: keyof typeof cards, slug: string | null = "test_slug"): CardRef => ({cardId:1,name,type:cards[name].type,slug,instanceId:name});
const reveals = () => useCpuReveals.getState();

beforeEach(() => { vi.useFakeTimers(); reveals().reset(); reveals().setHidden(false); });
afterEach(() => { cleanup(); reveals().reset(); vi.useRealTimers(); });

describe("CPU play reveal", () => {
  it("renders the card large with its action, rules text and backlog, then steps to the next", () => {
    act(() => {
      reveals().show({id:"giant",seat:"p2",card:card("Mountain Giant"),kind:"permanent",action:"summons at Tile #8"});
      reveals().show({id:"tower",seat:"p2",card:card("Lone Tower"),kind:"site",action:"plays at Tile #3"});
    });
    render(<CpuPlayReveal />);
    const panel = screen.getByRole("status",{name:"CPU play"});
    expect(screen.getByRole("heading",{name:"Mountain Giant"})).toBeTruthy();
    expect(screen.getByText("CPU summons at Tile #8")).toBeTruthy();
    expect(screen.getByText(cards["Mountain Giant"].rulesText)).toBeTruthy();
    expect(screen.getByText("+1 more")).toBeTruthy();
    expect(screen.getByRole("img",{name:"Mountain Giant"}).getAttribute("data-src")).toBe("/api/images/test_slug");
    expect(panel.getAttribute("style")).toContain("border-color");
    act(() => { vi.advanceTimersByTime(4000); });
    expect(screen.getByRole("heading",{name:"Lone Tower"})).toBeTruthy();
    // Sites keep landscape art like the hover preview.
    expect(screen.getByRole("img",{name:"Lone Tower"}).className).toContain("rotate-90");
    fireEvent.click(screen.getByRole("button",{name:"Dismiss"}));
    expect(screen.queryByRole("status",{name:"CPU play"})).toBeNull();
  });

  it("shows a spell as choosing until its effect label arrives, and holds while hovered", () => {
    act(() => { reveals().show({id:"bolt",seat:"p2",card:card("Lightning Bolt",null),kind:"spell",action:"casts",detail:null}); });
    render(<CpuPlayReveal />);
    expect(screen.getByText("Choosing…")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    act(() => { reveals().update("bolt",{detail:"Geomancer: strike Flamecaller"}); });
    expect(screen.getByText("Geomancer: strike Flamecaller")).toBeTruthy();
    fireEvent.pointerEnter(screen.getByRole("status",{name:"CPU play"}));
    expect(screen.getByText("Held while hovered")).toBeTruthy();
    expect(screen.getByTestId("cpu-reveal-timer").style.animationPlayState).toBe("paused");
    act(() => { vi.advanceTimersByTime(30000); });
    expect(screen.getByRole("status",{name:"CPU play"})).toBeTruthy();
    fireEvent.pointerLeave(screen.getByRole("status",{name:"CPU play"}));
    act(() => { vi.advanceTimersByTime(4000); });
    expect(screen.queryByRole("status",{name:"CPU play"})).toBeNull();
  });

  it("releases a hover hold when unmounted", () => {
    act(() => { reveals().show({id:"goons",seat:"p2",card:card("Ogre Goons"),kind:"permanent",action:"summons at Tile #8"}); });
    const view = render(<CpuPlayReveal />);
    fireEvent.pointerEnter(screen.getByRole("status",{name:"CPU play"}));
    expect(reveals().held).toBe(true);
    view.unmount();
    expect(reveals().held).toBe(false);
  });
});
