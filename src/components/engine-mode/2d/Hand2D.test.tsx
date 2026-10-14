import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ColorBlindProvider } from "@/lib/contexts/ColorBlindContext";
import { enginePrecons, toEngineDeck } from "@/lib/engine-mode/decks";
import { useEngineSession } from "@/lib/engine-mode/session";
import { useCpuBoardPicker } from "@/lib/game/cpu/boardPicker";
import { pileToken } from "@/lib/game/cpu/pickTokens";
import { useGameStore } from "@/lib/game/store";
import type { CardRef } from "@/lib/game/store/types";
import type { PlayerId } from "@sorcery/shared";
import { createGame } from "@sorcery/shared";
import Hand2D from "./Hand2D";
import SeatBar2D from "./SeatBar2D";

vi.mock("next/image", () => ({
  default: (props: { alt: string }) => <span role="img" aria-label={props.alt} />,
}));

const card = (instanceId: string, type: string): CardRef => ({ cardId: 1, name: instanceId, type, instanceId });

beforeEach(() => {
  const deck = toEngineDeck(enginePrecons[0]);
  const game = createGame([deck, deck], ["You", "Computer"], 7, 0 as PlayerId);
  game.phase = "main";
  useEngineSession.setState({ game, rev: 1, legal: [], portalsRevealed: true });
  const zones = useGameStore.getState().zones;
  useGameStore.setState({ zones: { ...zones, p1: { ...zones.p1, hand: [card("a", "Site"), card("b", "Minion"), card("c", "Magic")] } } });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  act(() => useCpuBoardPicker.getState().clear(useCpuBoardPicker.getState().request));
  useEngineSession.setState({ game: null, legal: null });
});

const renderWith = (node: ReactNode) => render(<ColorBlindProvider>{node}</ColorBlindProvider>);

describe("Hand2D", () => {
  it("leaves mana and the hand's split to your seat's stats: no copy beside the cards", () => {
    renderWith(<Hand2D cardHeight={80} orientation="row" />);
    const hand = screen.getByRole("group", { name: "Your hand" });
    expect(within(hand).queryByLabelText("2 spells, 1 site in hand")).toBeNull();
    expect(within(hand).queryByLabelText(/^Mana /)).toBeNull();
  });

  it("fills the measured row height with a small hand", () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1100);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(168);
    renderWith(<Hand2D cardHeight={60} orientation="row" />);
    const spell = screen.getByRole("button", { name: "b" });
    // 168 - 2 x 4px strip padding
    expect(spell.style.height).toBe("160px");
  });

  it("on a phone held upright stacks the sites in a column beside the spells, using the whole box", () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(390);
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(844);
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(328);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(142);
    useGameStore.setState({
      zones: {
        ...useGameStore.getState().zones,
        p1: { ...useGameStore.getState().zones.p1, hand: [card("a", "Site"), card("b", "Site"), card("c", "Site"), card("d", "Minion"), card("e", "Magic"), card("f", "Aura")] },
      },
    });
    renderWith(<Hand2D cardHeight={60} orientation="row" />);
    const at = (name: string) => {
      const el = screen.getByRole("button", { name });
      return { left: parseFloat(el.style.left), top: parseFloat(el.style.top), w: parseFloat(el.style.width), h: parseFloat(el.style.height) };
    };
    const sites = ["a", "b", "c"].map(at);
    const spells = ["d", "e", "f"].map(at);
    // stacked in a column (or two), side by side with nothing covered: no two sites share a spot
    expect(new Set(sites.map((s) => s.left)).size).toBeLessThan(sites.length);
    expect(sites[1].top).toBeGreaterThan(sites[0].top);
    for (const a of sites)
      for (const b of sites)
        if (a !== b) expect(a.left + a.w <= b.left || b.left + b.w <= a.left || a.top + a.h <= b.top || b.top + b.h <= a.top).toBe(true);
    // the spells sit to the right of the column, side by side
    for (const sp of spells) expect(sp.left).toBeGreaterThan(Math.max(...sites.map((s) => s.left + s.w)));
    expect(spells[0].h).toBeGreaterThan(spells[0].w);
  });

  it("offers labelled draw buttons only while a deck pile is pickable, selecting the same token", () => {
    renderWith(<Hand2D cardHeight={80} orientation="row" />);
    expect(screen.queryByRole("button", { name: /^Draw a site/ })).toBeNull();
    act(() => useCpuBoardPicker.getState().configure("engine-prompt:4", [pileToken("p1", "atlas"), pileToken("p1", "spellbook")]));
    const site = screen.getByRole("button", { name: "Draw a site from your atlas" });
    expect(screen.getByRole("button", { name: "Draw a spell from your spellbook" })).toBeTruthy();
    fireEvent.click(site);
    expect(useCpuBoardPicker.getState().selected).toBe(pileToken("p1", "atlas"));
  });
});

describe("SeatBar2D piles", () => {
  it("names the avatar's draw-a-site ability on the highlighted atlas chip, with a tooltip on focus or hover", () => {
    renderWith(<SeatBar2D seat="p1" density="column" />);
    act(() => useCpuBoardPicker.getState().configure("engine:9", [pileToken("p1", "atlas")]));
    // using it taps the avatar, and the label says so
    const atlas = screen.getByRole("button", { name: /^Atlas \d+: Draw a site: avatar ability, taps (your avatar|\S.*)$/ });
    expect(atlas.getAttribute("data-pickable")).toBe("true");
    expect(screen.getByRole("button", { name: /^Spellbook \d+$/ }).getAttribute("data-pickable")).toBeNull();
    fireEvent.focus(atlas);
    expect(screen.getByRole("tooltip").textContent).toMatch(/^Draw a site: avatar ability, taps /);
  });

  it("shows the computer's hand split from the engine view", () => {
    renderWith(<SeatBar2D seat="p2" density="column" />);
    const bar = screen.getByRole("group", { name: "Computer's status" });
    expect(within(bar).getByLabelText(/^Hand \d+: \d+ spells?, \d+ sites? in hand$/)).toBeTruthy();
  });
});
