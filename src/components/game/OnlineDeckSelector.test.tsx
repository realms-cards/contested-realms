import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OnlineDeckSelector from "@/components/game/OnlineDeckSelector";
import { saveGoldfishDeck } from "@/lib/game/cpu/goldfishTesting";

const mocks = vi.hoisted(() => ({load:vi.fn(),phase:vi.fn(),emit:vi.fn()}));
vi.mock("@/app/online/online-context",() => ({useOnline:() => ({me:{id:"alice"},isGuest:false,transport:{emit:mocks.emit}})}));
vi.mock("@/lib/game/deckLoader",() => ({loadDeckFromData:mocks.load}));
vi.mock("@/lib/game/store",() => ({useGameStore:{getState:() => ({zones:{p1:{spellbook:[],hand:[],atlas:[]}},avatars:{},setPhase:mocks.phase})}}));

beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear();
  vi.stubGlobal("React",React);
  vi.stubGlobal("localStorage",{getItem:vi.fn().mockReturnValue(null),setItem:vi.fn()});
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async () => ({myDecks:[],publicDecks:[]})}));
  saveGoldfishDeck(sessionStorage,"alice",{name:"Saved test",deck:{spellbook:[{cardId:1,name:"Fireball",type:"Magic"},{cardId:2,name:"Unknown spell",type:"Magic"}]}});
});
afterEach(() => {cleanup();vi.unstubAllGlobals();});

describe("Goldfish coverage gate", () => {
  it("shows coverage before loading a reused deck and waits for explicit confirmation", async () => {
    mocks.load.mockResolvedValue(true);
    const complete = vi.fn();
    render(<OnlineDeckSelector myPlayerKey="p1" playerNames={{p1:"Alice",p2:"CPU"}} onPrepareComplete={complete} matchType="constructed" goldfishTesting />);
    fireEvent.click(await screen.findByRole("button",{name:"Reuse previous test deck"}));
    expect(screen.getByRole("heading",{name:"Automation coverage — Saved test"})).toBeTruthy();
    expect(screen.getByText("Manual / unverified: 1 cards")).toBeTruthy();
    expect(mocks.load).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"Load deck and continue"}));
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
    expect(mocks.load).toHaveBeenCalledTimes(1);
    expect(mocks.phase).toHaveBeenCalledWith("Setup");
  });
  it("does not expose cached test decks in human-vs-human play", async () => {
    render(<OnlineDeckSelector myPlayerKey="p1" playerNames={{p1:"Alice",p2:"Bob"}} onPrepareComplete={vi.fn()} matchType="constructed" />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByRole("button",{name:"Reuse previous test deck"})).toBeNull();
  });
  it("does not start setup when loading fails, and allows returning to deck selection", async () => {
    mocks.load.mockResolvedValue(false);
    const complete = vi.fn();
    render(<OnlineDeckSelector myPlayerKey="p1" playerNames={{p1:"Alice",p2:"CPU"}} onPrepareComplete={complete} matchType="constructed" goldfishTesting />);
    fireEvent.click(await screen.findByRole("button",{name:"Reuse previous test deck"}));
    fireEvent.click(screen.getByRole("button",{name:"Load deck and continue"}));
    await waitFor(() => expect(screen.getByRole("button",{name:"Load deck and continue"}).hasAttribute("disabled")).toBe(false));
    expect(mocks.load).toHaveBeenCalledTimes(1);
    expect(mocks.phase).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"Choose another deck"}));
    expect(screen.getByRole("button",{name:"Reuse previous test deck"})).toBeTruthy();
  });
});
