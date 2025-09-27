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
});
