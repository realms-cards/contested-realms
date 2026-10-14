import { act, cleanup, render, screen, within } from "@testing-library/react";
import { createGame } from "@sorcery/shared";
import type { PlayerId } from "@sorcery/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getUserBadgeSnapshot } from "@/components/auth/userBadgePresence";
import { soundManager } from "@/lib/audio/soundManager";
import { ColorBlindProvider } from "@/lib/contexts/ColorBlindContext";
import { enginePrecons, toEngineDeck } from "@/lib/engine-mode/decks";
import { useEngineSession } from "@/lib/engine-mode/session";
import { useGameStore } from "@/lib/game/store";
import EngineGame2D from "./EngineGame2D";
import { PROMPT_DOCK_ID } from "./FieldTargets2D";
import { useBoard2DFocus } from "./focusStore";

vi.mock("next/image", () => ({
  default: (props: { alt: string }) => <span role="img" aria-label={props.alt} />,
}));
// audio has no place in jsdom; the page only has to mount it
vi.mock("@/components/game/MusicGameSync", () => ({ default: () => null }));
vi.mock("@/lib/audio/gameSfx", () => ({ GameSoundEffects: () => null }));

/** In-memory Storage: Node's own `localStorage` global shadows jsdom's and is unusable here. */
function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key: string) => items.get(key) ?? null,
    key: (index: number) => [...items.keys()][index] ?? null,
    removeItem: (key: string) => {
      items.delete(key);
    },
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
  };
}

/** The page as the app mounts it: inside the colour-blind provider the end-turn dialog reads. */
const renderPage = () =>
  render(
    <ColorBlindProvider>
      <EngineGame2D onRestart={() => undefined} onExit={() => undefined} />
    </ColorBlindProvider>,
  );

/** jsdom does no layout: give every element the usable area the page would measure. */
function setFrame(width: number, height: number) {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(width);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(height);
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  const deck = toEngineDeck(enginePrecons[0]);
  const game = createGame([deck, deck], ["You", "Computer"], 7, 0 as PlayerId);
  // past the portal / mulligan screens, so the page shows its ordinary turn layout
  game.phase = "main";
  useEngineSession.setState({ game, rev: 1, legal: [], portalsRevealed: true });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  useEngineSession.setState({ game: null, legal: null });
  useGameStore.setState({ events: [], previewCard: null });
});

describe("EngineGame2D", () => {
  it("portrait: board, prompt dock, both seat bars, hand and actions in one column", () => {
    setFrame(390, 763);
    const { container } = renderPage();
    expect(screen.getByRole("group", { name: "Board" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Tile \d+/ })).toHaveLength(20);
    expect(screen.getByRole("group", { name: "Your status" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Computer's status" })).toBeTruthy();
    expect(screen.getByLabelText("Your hand")).toBeTruthy();
    expect(screen.getByRole("toolbar", { name: "Actions" }).className).toContain("flex-row");
    expect(container.querySelector(`#${PROMPT_DOCK_ID}`)).not.toBeNull();
    // the board is the computed 5 x 4 tiles: 74px at this size
    const board = screen.getByRole("group", { name: "Board" }) as HTMLElement;
    expect(board.style.width).toBe("370px");
    expect(board.style.height).toBe("296px");
  });

  it("phone landscape: the actions pack three abreast in the short side column, the hand runs under it", () => {
    setFrame(750, 369);
    renderPage();
    expect(screen.getByRole("toolbar", { name: "Actions" }).className).toContain("grid-cols-3");
    expect(screen.getByRole("group", { name: "Board" })).toBeTruthy();
  });

  it("rotating keeps every piece mounted (a half-made prompt survives)", () => {
    setFrame(390, 763);
    const { container } = renderPage();
    const dock = container.querySelector(`#${PROMPT_DOCK_ID}`);
    const board = screen.getByRole("group", { name: "Board" });
    const hand = screen.getByLabelText("Your hand");
    expect(screen.getByRole("toolbar", { name: "Actions" }).className).toContain("flex-row");
    vi.restoreAllMocks();
    setFrame(750, 369);
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(screen.getByRole("toolbar", { name: "Actions" }).className).toContain("grid-cols-3");
    expect(container.querySelector(`#${PROMPT_DOCK_ID}`)).toBe(dock);
    expect(screen.getByRole("group", { name: "Board" })).toBe(board);
    expect(screen.getByLabelText("Your hand")).toBe(hand);
  });

  it("phone portrait: both seat bars use the tight one-line layout with all four pile chips", () => {
    setFrame(390, 763);
    renderPage();
    for (const name of ["Your status", "Computer's status"]) {
      const bar = screen.getByRole("group", { name });
      expect(bar.getAttribute("data-density")).toBe("tight");
      for (const pile of ["Spellbook", "Atlas", "Cemetery"]) {
        expect(within(bar).getByRole("button", { name: new RegExp(`^${pile} \\d+`) })).toBeTruthy();
      }
    }
  });

  it("landscape: the seats are slim columns with all four count chips, the piles still tappable", () => {
    setFrame(750, 369);
    renderPage();
    for (const name of ["Your status", "Computer's status"]) {
      const bar = screen.getByRole("group", { name });
      expect(bar.getAttribute("data-density")).toBe("columnTight");
      expect(bar.className).toContain("flex-col");
      expect(within(bar).getByLabelText(/^Hand \d+/)).toBeTruthy();
      for (const pile of ["Spellbook", "Atlas", "Cemetery"]) {
        expect(within(bar).getByRole("button", { name: new RegExp(`^${pile} \\d+`) })).toBeTruthy();
      }
    }
  });

  it("desktop: the wide layout scales the board up and gives the seat bars panels", () => {
    setFrame(1424, 892);
    renderPage();
    const board = screen.getByRole("group", { name: "Board" }) as HTMLElement;
    expect(Number.parseInt(board.style.height, 10)).toBeGreaterThanOrEqual(600);
    expect(screen.getByRole("toolbar", { name: "Actions" }).className).toContain("grid-cols-2");
    expect(screen.getByRole("group", { name: "Computer's status" }).getAttribute("data-density")).toBe("column");
  });

  it("stands the floating account badge down while mounted", () => {
    setFrame(390, 763);
    expect(getUserBadgeSnapshot()).toBe(false);
    const { unmount } = renderPage();
    expect(getUserBadgeSnapshot()).toBe(true);
    unmount();
    expect(getUserBadgeSnapshot()).toBe(false);
  });

  it("unmounting (switching to the 3D board) leaves the match in the session", () => {
    setFrame(390, 763);
    const { unmount } = renderPage();
    const before = useEngineSession.getState().game;
    unmount();
    expect(useEngineSession.getState().game).toBe(before);
  });

  it("desktop: one inspector column holds the feed and the actions; the preview shows there, not floating", () => {
    setFrame(1512, 898);
    const { container } = renderPage();
    const inspector = screen.getByRole("complementary", { name: "Inspector" });
    expect(within(inspector).getByRole("region", { name: "Recent actions" })).toBeTruthy();
    expect(within(inspector).getByRole("toolbar", { name: "Actions" })).toBeTruthy();
    expect(within(inspector).getByRole("status")).toBeTruthy();
    // the prompt dock is part of the column too (it hides itself while empty)
    expect(inspector.querySelector(`#${PROMPT_DOCK_ID}`)).not.toBeNull();
    // capped, never a slab
    expect(Number.parseInt(inspector.style.width, 10)).toBeLessThanOrEqual(420);
    act(() => useGameStore.getState().setPreviewCard({ cardId: 0, name: "Lightning Bolt", type: "Magic", slug: null }));
    expect(within(inspector).getByRole("figure", { name: "Preview: Lightning Bolt" })).toBeTruthy();
    // no floating preview over the board
    expect(document.body.querySelector(".card-preview-saturation-portal")).toBeNull();
    expect(container).toBeTruthy();
  });

  it("portrait: no inspector; the status line and the feed share the dock's box", () => {
    setFrame(390, 763);
    renderPage();
    expect(screen.queryByRole("complementary", { name: "Inspector" })).toBeNull();
    const feed = screen.getByRole("region", { name: "Recent actions" });
    const column = feed.closest("[data-portrait-dock]");
    expect(column).toBeTruthy();
    // the status line sits in the same column (drawn on top), not in a row of its own over the board
    expect(column?.querySelector("[data-side-status] [role=status]")).toBeTruthy();
  });

  it("portrait: the card preview has its own box beside the dock; nothing floats over the board", () => {
    setFrame(390, 763);
    const { container } = renderPage();
    const slot = container.querySelector("[data-portrait-preview]") as HTMLElement;
    expect(slot).toBeTruthy();
    // placed left of the dock column, in the same row (relative to it)
    expect(Number.parseInt(slot.style.left, 10)).toBeLessThan(0);
    expect(slot.style.top).toBe("0px");
    act(() => useGameStore.getState().setPreviewCard({ cardId: 0, name: "Lightning Bolt", type: "Magic", slug: null }));
    expect(within(slot).getByRole("figure", { name: "Preview: Lightning Bolt" })).toBeTruthy();
    // the floating preview of the other modes is gone from this view
    expect(document.body.querySelector(".card-preview-saturation-portal")).toBeNull();
  });

  it("your turn starting is a line in the status strip, not a centred banner", () => {
    setFrame(390, 763);
    const gong = vi.spyOn(soundManager, "play").mockImplementation(() => undefined);
    const game = useEngineSession.getState().game;
    if (!game) throw new Error("no game");
    game.activePlayer = 1 as PlayerId;
    game.turn = 2;
    act(() => useEngineSession.setState({ game, rev: 2 }));
    renderPage();
    game.activePlayer = 0 as PlayerId;
    game.turn = 3;
    act(() => useEngineSession.setState({ game, rev: 3 }));
    expect(screen.getAllByRole("status").some((el) => el.textContent?.includes("Turn 3 — your turn."))).toBe(true);
    expect(screen.queryByText(/^Turn 3$/)).toBeNull();
    // the same gong the 3D table's banner rings
    expect(gong).toHaveBeenCalledWith("turnGong");
  });

  it("the feed groups the log per turn; tapping an entry previews its card and flashes its tile", () => {
    setFrame(1512, 898);
    act(() =>
      useGameStore.setState({
        events: [
          { id: 1, ts: 0, turn: 2, player: 2, text: "— Turn 2: Computer —" },
          { id: 2, ts: 0, turn: 2, player: 2, text: "Computer plays Dark Tower at tile 3." },
        ],
      }),
    );
    renderPage();
    const feed = screen.getByRole("region", { name: "Recent actions" });
    expect(within(feed).getByText("Turn 2")).toBeTruthy();
    const before = useBoard2DFocus.getState().seq;
    act(() => within(feed).getByRole("button", { name: /plays Dark Tower at tile 3/ }).click());
    expect(useGameStore.getState().previewCard?.name).toBe("Dark Tower");
    expect(useBoard2DFocus.getState().seq).toBe(before + 1);
    expect(useBoard2DFocus.getState().cells).toEqual(["2,0"]);
  });
});
