import { beforeEach, describe, expect, it } from "vitest";
import { useGameStore } from "@/lib/game/store";
import type { GameTransport } from "@/lib/net/transport";
import type { CardRef, ServerPatchT } from "@/lib/game/store";

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

describe("game store sync safeguards", () => {
  beforeEach(() => {
    const state = useGameStore.getState();
    state.resetGameState();
    state.setTransport(null);
    state.setActorKey(null);
    useGameStore.setState({ pendingPatches: [] });
  });

  it("reapplies pending zone patches after a snapshot", () => {
    const store = useGameStore.getState();
    store.setActorKey("p1");

    const card: CardRef = {
      cardId: 101,
      name: "Snapshot Survivor",
      type: "Spell",
      slug: "snapshot-survivor",
      instanceId: "test-card-1",
      owner: "p1",
    };

    // Queue a pending patch (no transport available)
    store.trySendPatch({
      zones: {
        p1: {
          hand: [card],
          spellbook: [],
          atlas: [],
          graveyard: [],
          battlefield: [],
          banished: [],
        },
      },
    });

    const before = useGameStore.getState();
    expect(before.pendingPatches).toHaveLength(1);

    const snapshot: ServerPatchT = {
      __replaceKeys: ["zones"],
      zones: {
        p1: {
          hand: [],
          spellbook: [],
          atlas: [],
          graveyard: [],
          battlefield: [],
          banished: [],
        },
      },
    };

    // Apply snapshot; pending patch should be reconciled immediately
    store.applyServerPatch(snapshot, Date.now());

    const after = useGameStore.getState();
    expect(after.pendingPatches).toHaveLength(0);
    expect(after.zones.p1.hand).toHaveLength(1);
    expect(after.zones.p1.hand[0]?.owner).toBe("p1");
    expect(after.zones.p1.hand[0]?.instanceId).toBe(card.instanceId);
  });

  it("keeps server acknowledgement when local state diverges after sending patch", () => {
    const sent: unknown[] = [];
    const transport = createMockTransport(sent);
    const store = useGameStore.getState();
    store.setTransport(transport);
    store.setActorKey("p1");

    store.addTokenToHand("p1", "Bruin");
    expect(sent).toHaveLength(1);

    const ack = sent[0] as ServerPatchT;

    // Simulate local divergence before server acknowledgement arrives
    useGameStore.setState((state) => ({
      ...state,
      zones: {
        ...state.zones,
        p1: {
          ...state.zones.p1,
          hand: [],
        },
      },
    }));
    expect(useGameStore.getState().zones.p1.hand).toHaveLength(0);

    store.applyServerPatch(ack, Date.now());

    const reconciled = useGameStore.getState();
    expect(reconciled.zones.p1.hand).toHaveLength(1);

    store.setTransport(null);
  });
});
