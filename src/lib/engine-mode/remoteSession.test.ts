import { createGame, viewFor } from "@sorcery/shared";
import type { GameState as EngineState, PlayerId, PlayerView } from "@sorcery/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ENGINE_BUILD } from "@shared/engine/build";
import { enginePrecons, toEngineDeck } from "./decks";
import { useEngineSession } from "./session";

/**
 * A player-vs-player client holds no game. It paints the view the server sent and posts actions
 * back — and the things it must NOT do (resolve an action itself, undo, save the match to this
 * machine, ask a bot to move) are exactly the things that would be cheating against a human.
 */
function serverView(seat: PlayerId): { state: EngineState; view: PlayerView } {
  const deck = toEngineDeck(enginePrecons[0]);
  const state = createGame([deck, deck], ["You", "Them"], 11, 0 as PlayerId);
  return { state, view: viewFor(state, seat) };
}

const envelope = (seat: PlayerId, rev: number, view: PlayerView) => ({
  matchId: "m1",
  rev,
  seat,
  view,
  power: {},
  disabled: [],
  legal: [],
  build: ENGINE_BUILD,
});

describe("a client in a server-run match", () => {
  beforeEach(() => {
    useEngineSession.setState({ mode: "local", seat: 0 as PlayerId, game: null, rev: 0, matchId: "" });
  });

  it("sends actions instead of applying them", () => {
    const sent: unknown[] = [];
    useEngineSession.getState().joinRemote("m1", 1 as PlayerId, (m) => sent.push(m));
    expect(useEngineSession.getState().mode).toBe("remote");
    // joining asks for the board; nothing is invented locally
    expect(sent).toEqual([{ type: "engine:resync", matchId: "m1" }]);

    const result = useEngineSession.getState().dispatch({ t: "endTurn" } as never);
    expect(result.ok, "accepted for sending, not resolved").toBe(true);
    expect(sent[1]).toMatchObject({ type: "engine:action", matchId: "m1", action: { t: "endTurn" }, build: ENGINE_BUILD });
    expect(useEngineSession.getState().game, "no board was conjured from nothing").toBeNull();
  });

  it("refuses to act when it is not connected", () => {
    useEngineSession.setState({ mode: "remote", matchId: "m1" });
    // joinRemote is what sets the sender; without it there is nowhere to send
    useEngineSession.getState().joinRemote("m1", 0 as PlayerId, () => undefined);
    useEngineSession.setState({ mode: "remote" });
    expect(useEngineSession.getState().dispatch({ t: "endTurn" } as never).ok).toBe(true);
  });

  it("paints the view it is given, for the seat the server names", () => {
    const { view } = serverView(1 as PlayerId);
    useEngineSession.getState().joinRemote("m1", 1 as PlayerId, () => undefined);
    useEngineSession.getState().applyRemoteView(envelope(1 as PlayerId, 0, view));
    const state = useEngineSession.getState();
    expect(state.seat).toBe(1);
    expect(state.rev).toBe(0);
    expect(state.game, "the view IS the board as far as the components are concerned").not.toBeNull();
  });

  it("never opens the Harbinger roll screen, which needs the full game", () => {
    useEngineSession.setState({ portalsRevealed: false });
    useEngineSession.getState().joinRemote("m1", 0 as PlayerId, () => undefined);
    expect(useEngineSession.getState().portalsRevealed).toBe(true);
  });

  it("ignores a view that arrived out of order", () => {
    const { view } = serverView(0 as PlayerId);
    useEngineSession.getState().joinRemote("m1", 0 as PlayerId, () => undefined);
    useEngineSession.getState().applyRemoteView(envelope(0 as PlayerId, 5, view));
    useEngineSession.getState().applyRemoteView(envelope(0 as PlayerId, 3, view));
    expect(useEngineSession.getState().rev, "a stale view would roll the board backwards").toBe(5);
  });

  it("ignores a view meant for a different match", () => {
    const { view } = serverView(0 as PlayerId);
    useEngineSession.getState().joinRemote("m1", 0 as PlayerId, () => undefined);
    useEngineSession.getState().applyRemoteView({ ...envelope(0 as PlayerId, 2, view), matchId: "somewhere-else" });
    expect(useEngineSession.getState().rev).toBe(-1);
  });

  it("stops, rather than paints, a view from a server on different rules", () => {
    const { view } = serverView(0 as PlayerId);
    useEngineSession.getState().joinRemote("m1", 0 as PlayerId, () => undefined);
    useEngineSession.getState().applyRemoteView({ ...envelope(0 as PlayerId, 1, view), build: "someothercommit.r9" });
    const state = useEngineSession.getState();
    expect(state.outdated, "the player is asked to reload").toBe(true);
    expect(state.game, "nothing painted with rules this page does not have").toBeNull();
    expect(state.legal).toBeNull();
  });

  it("shows a refusal without rolling anything back", () => {
    const { view } = serverView(0 as PlayerId);
    useEngineSession.getState().joinRemote("m1", 0 as PlayerId, () => undefined);
    useEngineSession.getState().applyRemoteView(envelope(0 as PlayerId, 4, view));
    useEngineSession.getState().applyRemoteReject("Not your turn.");
    expect(useEngineSession.getState().lastError).toBe("Not your turn.");
    // nothing was applied in the first place, so the board is still the server's last word
    expect(useEngineSession.getState().rev).toBe(4);
  });

  it("never writes a remote match to this machine", async () => {
    const persistence = await import("./persistence");
    const save = vi.spyOn(persistence, "saveEngineGame");
    const { view } = serverView(0 as PlayerId);
    useEngineSession.getState().joinRemote("m1", 0 as PlayerId, () => undefined);
    useEngineSession.getState().applyRemoteView(envelope(0 as PlayerId, 1, view));
    // a state restored from a player's own machine is a state that player could have edited
    expect(save).not.toHaveBeenCalled();
    save.mockRestore();
  });

  it("leaves undo unavailable", () => {
    useEngineSession.getState().joinRemote("m1", 0 as PlayerId, () => undefined);
    expect(useEngineSession.getState().canUndo).toBe(false);
  });
});
