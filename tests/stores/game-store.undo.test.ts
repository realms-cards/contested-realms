import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { useGameStore, type CardRef } from "@/lib/game/store";
import type { GameTransport } from "@/lib/net/transport";

function createFakeTransport() {
  const sendAction = vi.fn();
  const transport = {
    sendAction,
  } as unknown as GameTransport;
  return { transport, sendAction };
}

describe("Game store undo safety", () => {
  let originalLog: (text: string) => void;

  beforeEach(() => {
    const state = useGameStore.getState();
    state.resetGameState();
    originalLog = useGameStore.getState().log;
  });

  afterEach(() => {
    useGameStore.setState(() => ({
      log: originalLog,
      transport: null,
    }));
  });

  it("records per-seat history when drawing from a pile", () => {
    const card: CardRef = {
      cardId: 1,
      name: "Test Spell",
      type: "Spell",
      slug: "test-spell",
    };

    useGameStore.setState((state) => ({
      phase: "Main",
      zones: {
        ...state.zones,
        p1: { ...state.zones.p1, spellbook: [card], hand: [] },
      },
    }));

    useGameStore.getState().setActorKey("p1");

    expect(useGameStore.getState().historyByPlayer.p1).toHaveLength(0);

    useGameStore.getState().drawFrom("p1", "spellbook", 1);

    const after = useGameStore.getState();
    expect(after.historyByPlayer.p1).toHaveLength(1);
    expect(after.zones.p1.hand).toHaveLength(1);
    expect(after.zones.p1.spellbook).toHaveLength(0);
  });

  it("does not revert opponent state online when no seat history exists", () => {
    const { transport, sendAction } = createFakeTransport();
    const mockLog = vi.fn();

    useGameStore.setState((state) => ({
      phase: "Main",
      // resetGameState() leaves history in place, so clear it explicitly rather
      // than inheriting snapshots pushed by earlier tests.
      history: [],
      historyByPlayer: { p1: [], p2: [] },
      zones: {
        ...state.zones,
        p2: {
          ...state.zones.p2,
          spellbook: [
            {
              cardId: 2,
              name: "Opponent Card",
              type: "Spell",
              slug: "opponent-card",
            },
          ],
          hand: [],
        },
      },
    }));

    useGameStore.getState().setActorKey("p2");
    useGameStore.getState().pushHistory();
    useGameStore.getState().setActorKey(null);

    const drawnCard = useGameStore.getState().zones.p2.spellbook[0];

    useGameStore.setState((state) => ({
      zones: {
        ...state.zones,
        p2: {
          ...state.zones.p2,
          spellbook: [],
          hand: [drawnCard],
        },
      },
      transport,
      log: mockLog,
    }));

    useGameStore.getState().setActorKey("p1");

    useGameStore.getState().undo();

    const after = useGameStore.getState();
    expect(after.zones.p2.hand).toHaveLength(1);
    expect(after.zones.p2.spellbook).toHaveLength(0);
    expect(after.historyByPlayer.p1).toHaveLength(0);
    expect(after.history).toHaveLength(1);
    expect(sendAction).not.toHaveBeenCalled();
    expect(mockLog).toHaveBeenCalledWith("Nothing to undo for your seat yet");
  });

  it("restores local draw history when available online", () => {
    const { transport, sendAction } = createFakeTransport();
    const mockLog = vi.fn();
    const card: CardRef = {
      cardId: 3,
      name: "Local Spell",
      type: "Spell",
      slug: "local-spell",
    };

    useGameStore.setState((state) => ({
      phase: "Main",
      zones: {
        ...state.zones,
        p1: { ...state.zones.p1, spellbook: [card], hand: [] },
      },
      transport,
      log: mockLog,
    }));

    useGameStore.getState().setActorKey("p1");

    useGameStore.getState().drawFrom("p1", "spellbook", 1);

    expect(useGameStore.getState().historyByPlayer.p1).toHaveLength(1);

    sendAction.mockClear();

    useGameStore.setState((state) => ({
      lastServerTs: state.lastLocalActionTs,
    }));

    useGameStore.getState().undo();

    expect(sendAction).toHaveBeenCalledTimes(1);
    const [payload] = sendAction.mock.calls[0] ?? [{}];
    useGameStore.getState().applyServerPatch(payload);

    const after = useGameStore.getState();
    expect(after.zones.p1.hand).toHaveLength(0);
    expect(after.zones.p1.spellbook).toHaveLength(1);
    expect(after.historyByPlayer.p1).toHaveLength(0);
    expect(mockLog).toHaveBeenCalled();
  });

  // Regression: the undo patch used to send the whole board with "board" in
  // __replaceKeys. Any site the opponent played after our last snapshot was
  // absent from it and got deleted outright — it went nowhere, not to hand and
  // not to the cemetery.
  it("preserves a site the opponent played after our snapshot", () => {
    const { transport, sendAction } = createFakeTransport();
    const mockLog = vi.fn();

    const mySite: CardRef = {
      cardId: 10,
      name: "My Site",
      type: "Site",
      slug: "my-site",
      instanceId: "site-p2-1",
    };
    const theirSite: CardRef = {
      cardId: 11,
      name: "Their Site",
      type: "Site",
      slug: "their-site",
      instanceId: "site-p1-1",
    };
    const spell: CardRef = {
      cardId: 12,
      name: "Some Spell",
      type: "Spell",
      slug: "some-spell",
    };

    // P2 acts on their own turn — this is the snapshot undo will roll back to.
    // resetGameState() leaves history in place, so clear it explicitly.
    useGameStore.setState((state) => ({
      phase: "Main",
      currentPlayer: 2,
      transport,
      log: mockLog,
      history: [],
      historyByPlayer: { p1: [], p2: [] },
      board: {
        ...state.board,
        sites: { "0,0": { owner: 2, card: mySite } },
      },
      zones: {
        ...state.zones,
        p2: { ...state.zones.p2, spellbook: [spell], hand: [] },
      },
    }));

    useGameStore.getState().setActorKey("p2");
    useGameStore.getState().drawFrom("p2", "spellbook", 1);
    const snapshots = useGameStore.getState().historyByPlayer.p2;
    expect(snapshots).toHaveLength(1);
    // The snapshot must predate P1's site but already contain our own.
    expect(Object.keys(snapshots[0]?.board?.sites ?? {})).toEqual(["0,0"]);

    // P1 then takes their turn and plays a site, which reaches us as a patch.
    useGameStore.setState((state) => ({
      board: {
        ...state.board,
        sites: {
          ...state.board.sites,
          "4,3": { owner: 1, card: theirSite },
        },
      },
      lastServerTs: state.lastLocalActionTs,
    }));

    sendAction.mockClear();
    useGameStore.getState().undo();

    // Locally, P1's site must survive our undo.
    const after = useGameStore.getState();
    expect(after.board.sites["4,3"]?.card?.name).toBe("Their Site");
    expect(after.board.sites["0,0"]?.card?.name).toBe("My Site");

    // The broadcast patch must not replace the board wholesale, and must not
    // mention the opponent's cell at all.
    expect(sendAction).toHaveBeenCalledTimes(1);
    const [payload] = sendAction.mock.calls[0] ?? [{}];
    expect(payload.__replaceKeys ?? []).not.toContain("board");
    expect(Object.keys(payload.board?.sites ?? {})).not.toContain("4,3");

    // Applying the server echo must not drop it either.
    useGameStore.getState().applyServerPatch(payload);
    expect(useGameStore.getState().board.sites["4,3"]?.card?.name).toBe(
      "Their Site",
    );
  });

  it("still removes our own site played after the snapshot", () => {
    const { transport, sendAction } = createFakeTransport();
    const mockLog = vi.fn();

    const spell: CardRef = {
      cardId: 20,
      name: "Another Spell",
      type: "Spell",
      slug: "another-spell",
    };
    const mySite: CardRef = {
      cardId: 21,
      name: "Late Site",
      type: "Site",
      slug: "late-site",
      instanceId: "site-p2-late",
    };

    useGameStore.setState((state) => ({
      phase: "Main",
      currentPlayer: 2,
      transport,
      log: mockLog,
      history: [],
      historyByPlayer: { p1: [], p2: [] },
      board: { ...state.board, sites: {} },
      zones: {
        ...state.zones,
        p2: { ...state.zones.p2, spellbook: [spell], hand: [] },
      },
    }));

    useGameStore.getState().setActorKey("p2");
    useGameStore.getState().drawFrom("p2", "spellbook", 1);
    expect(useGameStore.getState().historyByPlayer.p2).toHaveLength(1);

    useGameStore.setState((state) => ({
      board: {
        ...state.board,
        sites: { "1,1": { owner: 2, card: mySite } },
      },
      lastServerTs: state.lastLocalActionTs,
    }));

    sendAction.mockClear();
    useGameStore.getState().undo();

    expect(useGameStore.getState().board.sites["1,1"]).toBeUndefined();

    const [payload] = sendAction.mock.calls[0] ?? [{}];
    expect(payload.board?.sites?.["1,1"]).toBeNull();
  });
});
