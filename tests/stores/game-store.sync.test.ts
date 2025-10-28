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
    expect(sent.length).toBeGreaterThan(0);

    const ack = sent[sent.length - 1] as ServerPatchT;

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

  it("queues avatar tap until seat is known then flushes", () => {
    const sent: unknown[] = [];
    const transport = createMockTransport(sent);
    const store = useGameStore.getState();
    store.setTransport(transport);

    // Actor seat not yet known – should queue patch
    store.toggleTapAvatar("p1");
    const avatarPatchesBefore = sent.filter(
      (payload) => (payload as ServerPatchT).avatars
    );
    expect(avatarPatchesBefore).toHaveLength(0);
    expect(useGameStore.getState().pendingPatches).toHaveLength(1);

    // Set seat; pending patches should flush
    store.setActorKey("p1");
    const avatarPatchesAfter = sent.filter(
      (payload) => (payload as ServerPatchT).avatars
    );
    expect(avatarPatchesAfter).toHaveLength(1);
    expect(useGameStore.getState().pendingPatches).toHaveLength(0);

    store.setTransport(null);
  });

  it("sends tap delta with version when toggling a permanent", () => {
    const sent: unknown[] = [];
    const transport = createMockTransport(sent);
    const store = useGameStore.getState();
    store.setTransport(transport);
    store.setActorKey("p1");

    const card: CardRef = {
      cardId: 42,
      name: "Test Permanent",
      type: "Spell",
      slug: "test-permanent",
      instanceId: "perm-test-1",
      owner: "p1",
    };

    useGameStore.setState((state) => ({
      ...state,
      permanents: {
        ...state.permanents,
        "0,0": [
          {
            owner: 1,
            card,
            instanceId: card.instanceId,
            tapped: false,
            tapVersion: 0,
          },
        ],
      },
    }));

    store.toggleTapPermanent("0,0", 0);
    const permanentPatches = sent
      .map((payload) => payload as ServerPatchT)
      .filter((patch) => patch.permanents?.["0,0"]);
    expect(permanentPatches).toHaveLength(1);
    const patch = permanentPatches[0];
    const entry = patch.permanents?.["0,0"]?.[0] as Record<string, unknown>;
    expect(entry).toBeDefined();
    expect(entry.instanceId).toBe(card.instanceId);
    expect(entry.tapped).toBe(true);
    expect(entry.tapVersion).toBe(1);
    expect(entry.version).toBe(1);
    expect(Object.keys(entry).sort()).toEqual([
      "instanceId",
      "tapVersion",
      "tapped",
      "version",
    ]);

    store.setTransport(null);
  });

  it("sends removal delta when moving a permanent to a zone", () => {
    const sent: unknown[] = [];
    const transport = createMockTransport(sent);
    const store = useGameStore.getState();
    store.setTransport(transport);
    store.setActorKey("p1");

    const card: CardRef = {
      cardId: 77,
      name: "Departing Unit",
      type: "Spell",
      slug: "departing-unit",
      instanceId: "perm-test-2",
      owner: "p1",
    };

    useGameStore.setState((state) => ({
      ...state,
      permanents: {
        ...state.permanents,
        "0,0": [
          {
            owner: 1,
            card,
            instanceId: card.instanceId,
            tapped: false,
            tapVersion: 0,
          },
        ],
      },
    }));

    store.movePermanentToZone("0,0", 0, "graveyard", "top");
    const permanentPatches = sent
      .map((payload) => payload as ServerPatchT)
      .filter((patch) => patch.permanents?.["0,0"]);
    expect(permanentPatches.length).toBeGreaterThan(0);
    const patch = permanentPatches[permanentPatches.length - 1];
    const removal = patch.permanents?.["0,0"]?.[0] as Record<string, unknown>;
    expect(removal).toBeDefined();
    expect(removal.instanceId).toBe(card.instanceId);
    expect(removal.__remove).toBe(true);
    const zones = patch.zones as Record<string, any>;
    expect(zones?.p1?.graveyard?.length).toBe(1);
    expect(zones?.p1?.graveyard?.[0]?.instanceId).toBe(card.instanceId);

    store.setTransport(null);
  });

  it("emits delta patches for board-to-board permanent moves", () => {
    const sent: unknown[] = [];
    const transport = createMockTransport(sent);
    const store = useGameStore.getState();
    store.setTransport(transport);
    store.setActorKey("p1");

    const mainCard: CardRef = {
      cardId: 200,
      name: "Frontliner",
      type: "Creature",
      slug: "frontliner",
      instanceId: "perm-main",
      owner: "p1",
    };
    const carriedToken: CardRef = {
      cardId: 201,
      name: "Banner",
      type: "Token",
      slug: "banner",
      instanceId: "perm-token-main",
      owner: "p1",
    };
    const allyCard: CardRef = {
      cardId: 202,
      name: "Ally",
      type: "Creature",
      slug: "ally",
      instanceId: "perm-ally",
      owner: "p1",
    };
    const allyToken: CardRef = {
      cardId: 203,
      name: "Ally Token",
      type: "Token",
      slug: "ally-token",
      instanceId: "perm-ally-token",
      owner: "p1",
    };

    useGameStore.setState((state) => ({
      ...state,
      permanents: {
        ...state.permanents,
        "0,0": [
          {
            owner: 1,
            card: mainCard,
            instanceId: mainCard.instanceId,
            tapped: false,
            tapVersion: 0,
          },
          {
            owner: 1,
            card: carriedToken,
            instanceId: carriedToken.instanceId,
            tapped: false,
            tapVersion: 0,
            attachedTo: { at: "0,0", index: 0 },
          },
          {
            owner: 1,
            card: allyCard,
            instanceId: allyCard.instanceId,
            tapped: false,
            tapVersion: 0,
          },
          {
            owner: 1,
            card: allyToken,
            instanceId: allyToken.instanceId,
            tapped: false,
            tapVersion: 0,
            attachedTo: { at: "0,0", index: 2 },
          },
        ],
        "1,0": [],
      },
      selectedPermanent: { at: "0,0", index: 0 },
    }));

    store.moveSelectedPermanentTo(1, 0);

    const permanentPatches = sent
      .map((payload) => payload as ServerPatchT)
      .filter((patch) => patch.permanents);
    expect(permanentPatches.length).toBeGreaterThan(0);
    const patch = permanentPatches[permanentPatches.length - 1];
    const fromEntries = patch.permanents?.["0,0"] as
      | Array<Record<string, any>>
      | undefined;
    const toEntries = patch.permanents?.["1,0"] as
      | Array<Record<string, any>>
      | undefined;
    expect(fromEntries).toBeTruthy();
    expect(toEntries).toBeTruthy();

    const removedIds = (fromEntries ?? [])
      .filter((entry) => entry.__remove === true)
      .map((entry) => entry.instanceId);
    expect(removedIds).toContain(mainCard.instanceId);
    expect(removedIds).toContain(carriedToken.instanceId);

    const allyTokenEntry = (fromEntries ?? []).find(
      (entry) =>
        entry.instanceId === allyToken.instanceId && entry.__remove !== true
    ) as Record<string, any>;
    expect(allyTokenEntry).toBeTruthy();
    expect(allyTokenEntry.attachedTo?.at).toBe("0,0");
    expect(allyTokenEntry.attachedTo?.index).toBe(0);
    expect(allyTokenEntry.version).toBeGreaterThan(0);

    const toIds = (toEntries ?? []).map((entry) => entry.instanceId);
    expect(toIds).toContain(mainCard.instanceId);
    expect(toIds).toContain(carriedToken.instanceId);

    const movedTokenEntry = (toEntries ?? []).find(
      (entry) => entry.instanceId === carriedToken.instanceId
    ) as Record<string, any>;
    expect(movedTokenEntry).toBeTruthy();
    expect(movedTokenEntry.attachedTo?.at).toBe("1,0");
    expect(movedTokenEntry.attachedTo?.index).toBe(0);
    expect(movedTokenEntry.version).toBeGreaterThan(0);

    store.setTransport(null);
  });

  it("includes offset data when moving a permanent with offset", async () => {
    const sent: unknown[] = [];
    const transport = createMockTransport(sent);
    const store = useGameStore.getState();
    store.setTransport(transport);
    store.setActorKey("p1");

    const card: CardRef = {
      cardId: 204,
      name: "Offset Runner",
      type: "Creature",
      slug: "offset-runner",
      instanceId: "perm-offset",
      owner: "p1",
    };

    useGameStore.setState((state) => ({
      ...state,
      permanents: {
        ...state.permanents,
        "0,0": [
          {
            owner: 1,
            card,
            instanceId: card.instanceId,
            tapped: false,
            tapVersion: 0,
          },
        ],
        "2,0": [],
      },
      selectedPermanent: { at: "0,0", index: 0 },
    }));

    store.moveSelectedPermanentToWithOffset(2, 0, [0.25, -0.4]);
    await new Promise((resolve) => setTimeout(resolve, 70));

    const permanentPatches = sent
      .map((payload) => payload as ServerPatchT)
      .filter((patch) => patch.permanents);
    expect(permanentPatches.length).toBeGreaterThan(0);
    const patch = permanentPatches[permanentPatches.length - 1];
    const toEntries = patch.permanents?.["2,0"] as
      | Array<Record<string, any>>
      | undefined;
    expect(toEntries).toBeTruthy();
    const moved = (toEntries ?? []).find(
      (entry) => entry.instanceId === card.instanceId
    ) as Record<string, any>;
    expect(moved).toBeTruthy();
    expect(moved.offset).toEqual([0.25, -0.4]);
    expect(moved.version).toBeGreaterThan(0);

    store.setTransport(null);
  });

  it("sends zone updates for both seats when transferring control", () => {
    const sent: unknown[] = [];
    const transport = createMockTransport(sent);
    const store = useGameStore.getState();
    store.setTransport(transport);
    store.setActorKey("p1");

    const card: CardRef = {
      cardId: 300,
      name: "Control Shifter",
      type: "Creature",
      slug: "control-shifter",
      instanceId: "perm-control",
      owner: "p1",
    };

    const initialZones = useGameStore.getState().zones;
    useGameStore.setState((state) => ({
      ...state,
      permanents: {
        ...state.permanents,
        "0,0": [
          {
            owner: 1,
            card,
            instanceId: card.instanceId,
            tapped: false,
            tapVersion: 0,
            version: 0,
          },
        ],
      },
      zones: {
        ...initialZones,
        p1: {
          ...initialZones.p1,
          battlefield: [card],
        },
        p2: {
          ...initialZones.p2,
          battlefield: [],
        },
      },
    }));

    store.transferPermanentControl("0,0", 0, 2);

    const zonePatches = sent
      .map((payload) => payload as ServerPatchT)
      .filter((patch) => patch.zones);

    expect(zonePatches.length).toBeGreaterThan(0);
    const patch = zonePatches.find((candidate) => {
      const keys = Object.keys((candidate.zones ?? {}) as Record<string, any>);
      return keys.includes("p1") && keys.includes("p2");
    }) as ServerPatchT | undefined;
    expect(patch).toBeDefined();
    if (!patch) return;
    const zones = patch.zones as Record<string, any>;
    expect(zones).toBeTruthy();

    const p1Battlefield = zones.p1?.battlefield ?? [];
    const p2Battlefield = zones.p2?.battlefield ?? [];
    expect(p1Battlefield.find((entry: any) => entry.instanceId === card.instanceId)).toBeUndefined();
    expect(
      p2Battlefield.find((entry: any) => entry.instanceId === card.instanceId)
    ).toBeDefined();

    store.setTransport(null);
  });

  it("hydrates missing instance ids from server patches before sending deltas", () => {
    const sent: unknown[] = [];
    const transport = createMockTransport(sent);
    const store = useGameStore.getState();
    store.setTransport(transport);
    store.setActorKey("p1");

    store.applyServerPatch(
      {
        permanents: {
          "0,0": [
            {
              owner: 1,
              card: {
                cardId: 555,
                name: "Ghostly Placeholder",
                type: "Creature",
              },
              tapped: false,
            } as any,
          ],
        },
      },
      Date.now()
    );

    const stateAfter = useGameStore.getState();
    const hydrated = stateAfter.permanents["0,0"]?.[0];
    expect(hydrated?.instanceId).toBeTruthy();

    store.toggleTapPermanent("0,0", 0);
    const permanentPatches = sent
      .map((payload) => payload as ServerPatchT)
      .filter((patch) => patch.permanents?.["0,0"]);
    expect(permanentPatches.length).toBeGreaterThan(0);
    const entry = permanentPatches[permanentPatches.length - 1].permanents?.[
      "0,0"
    ]?.[0] as Record<string, unknown>;
    expect(entry.instanceId).toBe(hydrated?.instanceId);
    expect(entry.tapVersion).toBe(1);

    store.setTransport(null);
  });
});
