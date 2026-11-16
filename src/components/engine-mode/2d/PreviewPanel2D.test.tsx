import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ColorBlindProvider } from "@/lib/contexts/ColorBlindContext";
import { cardRefFor } from "@/lib/engine-mode/cardIndex";
import { enginePrecons, toEngineDeck } from "@/lib/engine-mode/decks";
import { useEngineSession } from "@/lib/engine-mode/session";
import { useGameStore } from "@/lib/game/store";
import type { CardRef, PermanentItem } from "@/lib/game/store/types";
import type { GameState, PlayerId } from "@sorcery/shared";
import { createGame } from "@sorcery/shared";
import PreviewPanel2D, { rulesTextPieces } from "./PreviewPanel2D";

vi.mock("next/image", () => ({
  default: (props: { alt: string }) => <span role="img" aria-label={props.alt} />,
}));

/** A Wild Boars on the board, disabled, +2 power and Airborne until end of turn. */
function boarsOnTheBoard(): { game: GameState; card: CardRef } {
  const deck = toEngineDeck(enginePrecons[0]);
  const game = createGame([deck, deck], ["You", "Computer"], 7, 0 as PlayerId);
  game.phase = "main";
  const avatar = Object.values(game.units).find((u) => u.isAvatar && u.controller === 0)!;
  game.cards["c-boars"] = { id: "c-boars", name: "Wild Boars", owner: 0 };
  game.units["u-boars"] = {
    ...avatar,
    id: "u-boars",
    cardId: "c-boars",
    name: "Wild Boars",
    isAvatar: false,
    damage: 0,
    tapped: false,
    carrying: [],
    carryingUnits: [],
    modifiers: [{ kind: "keyword", keyword: "airborne", duration: "endOfTurn", turn: 1, sourcePlayer: 1 as PlayerId }],
  };
  const card: CardRef = { ...(cardRefFor("Wild Boars") as CardRef), instanceId: "c-boars", owner: "p1" };
  const boars: PermanentItem = { card, owner: 1, instanceId: "u-boars", tapped: false, offset: null, stats: { atk: 4, def: 2 } };
  const disabled: PermanentItem = { card: { ...card, instanceId: "u-boars:disabled" }, owner: 1, instanceId: "u-boars:disabled", tapped: false, offset: null };
  useEngineSession.setState({ game, rev: 1, legal: [], portalsRevealed: true });
  useGameStore.setState({ permanents: { "2,2": [boars, disabled] }, previewCard: card, cardPreviewsEnabled: true });
  return { game, card };
}

beforeEach(() => {
  boarsOnTheBoard();
});
afterEach(() => {
  cleanup();
  useEngineSession.setState({ game: null, legal: null });
  useGameStore.setState({ permanents: {}, previewCard: null });
});

describe("the 2D preview shows what is going on with the card", () => {
  it("statuses as chips, and the effects behind them in words", () => {
    render(
      <ColorBlindProvider>
        <PreviewPanel2D />
      </ColorBlindProvider>,
    );
    const section = screen.getByRole("region", { name: "Wild Boars: status" });
    expect(section.textContent).toContain("Disabled");
    expect(section.textContent).toContain("Power 4 (+2)");
    expect(section.textContent).toContain("Gains Airborne until end of turn.");
  });

  it("a silenced site shows the chip and what it means for a site", () => {
    const { game } = boarsOnTheBoard();
    game.sites.s90 = { id: "s90", cardId: "c90", name: "Sulfur Vents", x: 1, y: 1, owner: 1, controller: 1, isRubble: false, tapped: false } as (typeof game.sites)[string];
    const site: CardRef = { ...(cardRefFor("Sulfur Vents") as CardRef), instanceId: "s90", owner: "p2" };
    const token: PermanentItem = { card: { ...site, name: "Silenced", instanceId: "s90:silenced" }, owner: 2, instanceId: "s90:silenced", tapped: false, offset: null };
    useGameStore.setState({ permanents: { "1,2": [token] }, previewCard: site });
    render(
      <ColorBlindProvider>
        <PreviewPanel2D />
      </ColorBlindProvider>,
    );
    const section = screen.getByRole("region", { name: "Sulfur Vents: status" });
    expect(section.textContent).toContain("Silenced");
    expect(section.textContent).toContain("the site loses its printed abilities");
  });

  it("your own face-down trap shows the real card and how to spring it; the foe's only that it is a trap", () => {
    const { game } = boarsOnTheBoard();
    for (const seat of [0, 1] as PlayerId[]) {
      game.sites[`sTrap${seat}`] = {
        id: `sTrap${seat}`, cardId: `cTrap${seat}`, name: "Wasteland", x: seat, y: 0, owner: seat, controller: seat, isRubble: false, tapped: false,
        trap: { element: "fire", realName: "Spike Trap", realCardId: `cTrap${seat}` },
      } as (typeof game.sites)[string];
    }
    useEngineSession.setState({ seat: 0 as PlayerId });
    const look = (siteId: string) => {
      cleanup();
      useGameStore.setState({ permanents: {}, previewCard: { ...(cardRefFor("Wasteland") as CardRef), instanceId: siteId, owner: "p1" } });
      render(
        <ColorBlindProvider>
          <PreviewPanel2D />
        </ColorBlindProvider>,
      );
    };

    look("sTrap0");
    expect(screen.getByRole("region", { name: "Spike Trap: card text" }).textContent).toContain("Deal 3 damage to a unit here.");
    const mine = screen.getByRole("region", { name: "Spike Trap: status" });
    expect(mine.textContent).toContain("Your face-down trap");
    expect(mine.textContent).toContain("your opponent sees Wasteland");

    look("sTrap1");
    const theirs = screen.getByRole("region", { name: "Wasteland: status" });
    expect(theirs.textContent).toContain("Face-down trap");
    expect(document.body.textContent).not.toContain("Spike Trap");
  });

  it("a card with nothing going on shows no status section", () => {
    useGameStore.setState({ permanents: {}, previewCard: { ...(cardRefFor("Wild Boars") as CardRef), instanceId: "c-nothing" } });
    render(
      <ColorBlindProvider>
        <PreviewPanel2D />
      </ColorBlindProvider>,
    );
    expect(screen.queryByRole("region", { name: /status/ })).toBeNull();
  });
});

describe("the 2D preview spells the card out below the art", () => {
  const renderPreviewOf = (name: string) => {
    useGameStore.setState({ permanents: {}, previewCard: { ...(cardRefFor(name) as CardRef), instanceId: `c-${name}` } });
    render(
      <ColorBlindProvider>
        <PreviewPanel2D />
      </ColorBlindProvider>,
    );
    return screen.getByRole("region", { name: `${name}: card text` });
  };

  it("cost, thresholds, type line, power and rules text", () => {
    const section = renderPreviewOf("Chart");
    expect(section.querySelector("h3")?.textContent).toBe("Chart");
    expect(screen.getByLabelText("Cost").textContent).toBe("2");
    expect(screen.getByLabelText("Cost").querySelectorAll('[role="img"]')).toHaveLength(2);
    expect(section.textContent).toContain("Ordinary Magic");
    expect(section.textContent).toContain("Draw two sites.");
  });

  it("a site lists what it provides, a unit its power", () => {
    renderPreviewOf("Steppe");
    expect(screen.getByLabelText("Provides").querySelectorAll('[role="img"]')).toHaveLength(2);
    cleanup();
    const talus = renderPreviewOf("Iron Man Talus");
    // automatons play as minions (Codex), and the engine says so
    expect(talus.textContent).toContain("Exceptional Minion · Automaton");
    expect(talus.textContent).toContain("Power 3");
  });

  it("a card the engine does not know shows no text section and does not throw", () => {
    useGameStore.setState({ previewCard: { ...(cardRefFor("Chart") as CardRef), name: "Not A Real Card", type: null, text: null, instanceId: "c-x" } });
    render(
      <ColorBlindProvider>
        <PreviewPanel2D />
      </ColorBlindProvider>,
    );
    expect(screen.queryByRole("region", { name: /card text/ })).toBeNull();
  });

  it("picks the element and mana symbols out of the text", () => {
    expect(rulesTextPieces("Tap → Play a site.\n\n(E)(F), (3) → Pull apart.")).toEqual([
      [{ kind: "text", text: "Tap → Play a site." }],
      [
        { kind: "element", key: "earth" },
        { kind: "element", key: "fire" },
        { kind: "text", text: ", " },
        { kind: "mana", text: "3" },
        { kind: "text", text: " → Pull apart." },
      ],
    ]);
  });
});
