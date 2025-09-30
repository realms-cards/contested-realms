import { beforeEach, describe, expect, it } from "vitest";
import { useGameStore } from "@/lib/game/store";
import type { GameTransport } from "@/lib/net/transport";
import type { CardRef } from "@/lib/game/store";

function createMockTransport(sent: unknown[]): GameTransport {
  return {
    connect: async () => {},
    disconnect: () => {},
    createLobby: async () => ({ lobbyId: "mock" }),
    joinLobby: async () => ({ lobbyId: "mock" }),
    joinMatch: async () => {},
    leaveMatch: () => {},
    leaveLobby: () => {},
    ready: () => {},
    startMatch: () => {},
    sendAction: (action: unknown) => {
      sent.push(action);
    },
    mulliganDone: () => {},
    sendChat: () => {},
    resync: () => {},
    requestLobbies: () => {},
    requestPlayers: () => {},
    setLobbyVisibility: () => {},
    inviteToLobby: () => {},
    on: () => () => {},
  } as unknown as GameTransport;
}

describe("game store network sanitiser", () => {
  beforeEach(() => {
    const state = useGameStore.getState();
    state.resetGameState();
    state.setTransport(null);
    state.setActorKey(null);
  });

  it("allows zone updates when actor seat not yet known", () => {
    const sent: any[] = [];
    const transport = createMockTransport(sent);
    const store = useGameStore.getState();
    store.setTransport(transport);

    const card: CardRef = {
      cardId: 42,
      name: "Test Card",
      type: "Spell",
      slug: "test-card",
    };

    store.trySendPatch({
      zones: {
        p1: {
          hand: [card],
        },
      },
    });

    expect(sent).toHaveLength(1);
    const payload = sent[0] as { zones?: Record<string, { hand: CardRef[] }> };
    expect(payload?.zones?.p1?.hand).toEqual([card]);

    // Cleanup
    store.setTransport(null);
  });

  it("strips opponent zone writes once actor seat is known", () => {
    const sent: any[] = [];
    const transport = createMockTransport(sent);
    const store = useGameStore.getState();
    store.setTransport(transport);
    store.setActorKey("p1");

    const card: CardRef = {
      cardId: 7,
      name: "Another Card",
      type: "Spell",
      slug: "another-card",
    };

    store.trySendPatch({
      zones: {
        p1: { hand: [card] },
        p2: { hand: [card] },
      },
    });

    expect(sent).toHaveLength(1);
    const payload = sent[0] as { zones?: Record<string, { hand: CardRef[] }> };
    expect(payload?.zones?.p1?.hand).toEqual([card]);
    expect(payload?.zones?.p2).toBeUndefined();

    // Cleanup
    store.setTransport(null);
  });
});
