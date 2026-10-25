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
import PreviewPanel2D from "./PreviewPanel2D";

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
