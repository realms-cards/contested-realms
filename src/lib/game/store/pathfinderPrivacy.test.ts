import { describe, expect, it, vi } from "vitest";
import { createGameStore } from "@/lib/game/store";
import type { CardRef, GameState } from "@/lib/game/store/types";

/**
 * Pathfinder: "Tap → If able, play the topmost site of your atlas to an adjacent location and
 * move there." The topmost site is face down until it is played — you choose the tile first.
 * Starting the ability used to log "Pathfinder selecting target for <site>" and send the site to
 * the opponent (and the overlay showed it, with a Cancel button: a free peek at your atlas).
 */
const site = (name: string): CardRef => ({ cardId: 1, variantId: null, name, type: "Site", slug: null, thresholds: null });

describe("Pathfinder keeps the topmost site face down while choosing", () => {
  it("names the site neither in the log nor in the message to the opponent", () => {
    const store = createGameStore();
    const sendMessage = vi.fn();
    const pathfinder: CardRef = { cardId: 2, variantId: null, name: "Pathfinder", type: "Avatar", slug: null, thresholds: null };
    const state = store.getState();
    store.setState({
      actorKey: null,
      transport: { sendMessage, sendAction: vi.fn() } as unknown as GameState["transport"],
      avatars: { ...state.avatars, p1: { ...state.avatars.p1, card: pathfinder, pos: [2, 3], tapped: false } },
      zones: { ...state.zones, p1: { ...state.zones.p1, atlas: [site("Remote Desert"), site("Spire")] } },
      board: { ...state.board, sites: { "2,3": { owner: 1, card: site("Bedrock"), tapped: false } } },
    } as Partial<GameState>);

    store.getState().beginPathfinderPlay("p1");

    const pending = store.getState().pendingPathfinderPlay;
    expect(pending?.phase, "the ability started").toBe("selectingTarget");
    expect(JSON.stringify(store.getState().events)).not.toContain("Remote Desert");
    const begin = sendMessage.mock.calls.map(([m]) => m).find((m) => m?.type === "pathfinderBegin");
    expect(begin, "the opponent is told the ability started").toBeTruthy();
    expect(JSON.stringify(begin)).not.toContain("Remote Desert");
  });
});
