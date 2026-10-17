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

describe("deck categories", () => {
  const TOP_URL = "https://sorcerytcg.com/decks/abc";
  const route = (url: string): unknown => {
    if (url.startsWith("/api/decks/public")) return { decks: [{ id: "o1", name: "Other Deck", format: "Constructed", userName: "Bob", updatedAt: "" }] };
    if (url.startsWith("/api/summit/top-decks")) {
      return { eventName: "Grand Contest X", decks: [{ player: "Ann", deckName: "Fire Aggro", avatar: "Flamecaller", url: TOP_URL, placing: 1, elements: [] }] };
    }
    if (url.startsWith("/api/guest/deck")) return { spellbook: [{ cardId: 1, name: "Fireball", type: "Magic" }], atlas: [] };
    return { myDecks: [{ id: "m1", name: "Mine", format: "Constructed" }], publicDecks: [{ id: "pc1", name: "Beta Precon – Fire", format: "Constructed", userName: "System" }] };
  };
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => route(url) })));
    Element.prototype.scrollIntoView = vi.fn(); // the dropdown scrolls its highlighted row; jsdom has no layout
  });
  const calls = (prefix: string) => (fetch as unknown as { mock: { calls: [string, RequestInit?][] } }).mock.calls.filter(([u]) => u.startsWith(prefix));
  const openPicker = async () => {
    fireEvent.click(await screen.findByRole("button", { name: "Select a deck..." }));
  };

  it("groups your decks, precons, the latest top 8 and — only once asked for — other players' public decks", async () => {
    render(<OnlineDeckSelector myPlayerKey="p1" playerNames={{ p1: "Alice", p2: "Bob" }} onPrepareComplete={vi.fn()} matchType="constructed" />);
    await waitFor(() => expect(calls("/api/summit/top-decks").length).toBe(1));
    await openPicker();
    for (const header of ["Your decks", "Precons", "Top 8 — Grand Contest X", "Public decks"]) expect(await screen.findByText(header)).toBeTruthy();
    expect(screen.getByText("1st · Ann — Fire Aggro (Flamecaller)")).toBeTruthy();
    expect(calls("/api/decks/public"), "public decks are lazy").toHaveLength(0);

    fireEvent.click(screen.getByText("Show other players' public decks…"));
    await waitFor(() => expect(calls("/api/decks/public")).toHaveLength(1));
    await openPicker();
    expect(await screen.findByText("Other Deck — Bob (Constructed)")).toBeTruthy();
  });

  it("plays a top-8 deck straight from its link", async () => {
    mocks.load.mockResolvedValue(true);
    const complete = vi.fn();
    render(<OnlineDeckSelector myPlayerKey="p1" playerNames={{ p1: "Alice", p2: "Bob" }} onPrepareComplete={complete} matchType="constructed" />);
    await waitFor(() => expect(calls("/api/summit/top-decks").length).toBe(1));
    await openPicker();
    fireEvent.click(await screen.findByText("1st · Ann — Fire Aggro (Flamecaller)"));
    fireEvent.click(screen.getByRole("button", { name: "Ready to Play" }));
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
    const [, init] = calls("/api/guest/deck")[0];
    expect(JSON.parse(String(init?.body))).toEqual({ url: TOP_URL });
    expect(mocks.load).toHaveBeenCalledWith("p1", expect.objectContaining({ spellbook: [expect.objectContaining({ name: "Fireball" })] }), expect.any(Function));
  });
});
