import Module from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StartMatchConfig } from "../../src/lib/net/transport";

/**
 * The host's engine-mode choice reaches the match record through a chain of
 * HAND-WRITTEN lists — the StartMatchConfig type, the socket payload whitelist,
 * the lobby-leader destructure, startMatchFromLobby's options and the match
 * literal. None of them errors on an unknown field: a flag missing from any one
 * of them is dropped in silence and the match quietly opens the legacy board.
 * So this drives the real chain end to end rather than any single link.
 */

interface LobbyRecord {
  id: string;
  playerIds: Set<string>;
  ready: Set<string>;
}

interface FakePlayer {
  id: string;
  displayName: string;
  socketId: string | null;
  lobbyId: string | null;
  matchId: string | null;
}

interface MatchRecord {
  id: string;
  engineMode?: boolean;
  enableSeer?: boolean;
  matchType?: string;
  game?: { engineMode?: boolean };
}

type SocketHandler = (payload?: Record<string, unknown>) => Promise<void> | void;

interface LobbyFeature {
  createLobby: (hostId: string) => LobbyRecord;
  registerSocketHandlers: (args: {
    socket: { id: string; on: (event: string, handler: SocketHandler) => void };
    isAuthed: () => boolean;
    getPlayerBySocket: () => FakePlayer | null;
  }) => void;
}

type CreateLobbyFeature = (deps: Record<string, unknown>) => LobbyFeature;

type NodeLoad = (request: string, parent: unknown, isMain: boolean) => unknown;

let createLobbyFeature: CreateLobbyFeature;
let restoreLoader: (() => void) | null = null;

beforeAll(async () => {
  // The lobby feature is CJS and is loaded by Node, not vite — but it requires a
  // TypeScript sibling, which Node cannot resolve. Hand it the module vite built.
  const listing = await import("../../server/modules/lobby/listing");
  const loader = Module as unknown as { _load: NodeLoad };
  const original = loader._load;
  loader._load = (request, parent, isMain) =>
    request.endsWith("modules/lobby/listing")
      ? listing
      : original(request, parent, isMain);
  restoreLoader = () => {
    loader._load = original;
  };

  const mod = await import("../../server/features/lobby/index.js");
  createLobbyFeature = (
    mod as unknown as { createLobbyFeature: CreateLobbyFeature }
  ).createLobbyFeature;
});

afterAll(() => {
  restoreLoader?.();
});

function createHarness() {
  const players = new Map<string, FakePlayer>();
  const matches = new Map<string, MatchRecord>();
  const handlers = new Map<string, SocketHandler>();

  const addPlayer = (id: string): FakePlayer => {
    const p: FakePlayer = {
      id,
      displayName: id,
      socketId: `sock_${id}`,
      lobbyId: null,
      matchId: null,
    };
    players.set(id, p);
    return p;
  };

  const io = {
    to: () => ({ emit: () => {} }),
    in: () => ({ socketsJoin: async () => {} }),
    emit: () => {},
  };

  let seq = 0;
  const feature = createLobbyFeature({
    io,
    storeRedis: null,
    instanceId: "test-instance",
    rid: (prefix: string) => `${prefix}_${++seq}`,
    ensurePlayerCached: async (id: string) => players.get(id) || addPlayer(id),
    players,
    matches,
    getPlayerInfo: (id: string) => ({ id, displayName: id }),
    // The real getMatchInfo lives in server/index.ts; the harness only needs it
    // not to throw, since the assertions read the match record directly.
    getMatchInfo: (match: MatchRecord) => match,
    lobbyHasHumanPlayers: () => true,
    createRngFromString: () => () => 0.5,
    generateBoosterDeterministic: async () => [],
    startMatchRecording: () => {},
    persistMatchCreated: async () => {},
    hydrateMatchFromDatabase: async () => {},
    lobbyControlChannel: "lobby:control",
    lobbyStateChannel: "lobby:state",
    cpuBotsEnabled: false,
    loadBotClientCtor: () => null,
    port: 0,
    isCpuPlayerId: () => false,
  });

  feature.registerSocketHandlers({
    socket: {
      id: "sock_host",
      on: (event, handler) => {
        handlers.set(event, handler);
      },
    },
    isAuthed: () => true,
    getPlayerBySocket: () => players.get("host") || null,
  });

  /** Two ready players in a lobby hosted by `host` — startMatch's precondition. */
  const seedReadyLobby = () => {
    const host = addPlayer("host");
    const guest = addPlayer("guest");
    const lobby = feature.createLobby(host.id);
    lobby.playerIds.add(host.id);
    lobby.playerIds.add(guest.id);
    lobby.ready.add(host.id);
    lobby.ready.add(guest.id);
    host.lobbyId = lobby.id;
    guest.lobbyId = lobby.id;
    return lobby;
  };

  const startMatch = async (payload: StartMatchConfig) => {
    const handler = handlers.get("startMatch");
    if (!handler) throw new Error("startMatch handler was never registered");
    await handler(payload as Record<string, unknown>);
    return Array.from(matches.values())[0] ?? null;
  };

  return { seedReadyLobby, startMatch };
}

describe("the host's engine-mode choice reaches the match record", () => {
  it("survives the whole socket -> leader -> match chain", async () => {
    const h = createHarness();
    h.seedReadyLobby();
    const match = await h.startMatch({
      matchType: "constructed",
      engineMode: true,
    });
    expect(match?.engineMode).toBe(true);
  });

  it("is persisted on the game snapshot too, for recovery after a restart", async () => {
    const h = createHarness();
    h.seedReadyLobby();
    const match = await h.startMatch({
      matchType: "constructed",
      engineMode: true,
    });
    expect(match?.game?.engineMode).toBe(true);
  });

  it("defaults to off when the host does not ask for it", async () => {
    const h = createHarness();
    h.seedReadyLobby();
    const match = await h.startMatch({ matchType: "constructed" });
    expect(match?.engineMode).toBe(false);
  });

  it("applies to precon, which shares the constructed deck format", async () => {
    const h = createHarness();
    h.seedReadyLobby();
    const match = await h.startMatch({
      matchType: "precon",
      engineMode: true,
    });
    expect(match?.engineMode).toBe(true);
  });

  it("is refused for sealed, whose pools the first cut does not support", async () => {
    const h = createHarness();
    h.seedReadyLobby();
    const match = await h.startMatch({
      matchType: "sealed",
      sealedConfig: {
        packCount: 6,
        setMix: ["Alpha"],
        timeLimit: 40,
        packCounts: { Alpha: 6 },
      },
      engineMode: true,
    });
    expect(match?.engineMode).toBe(false);
  });

  it("leaves the unrelated seer flag alone", async () => {
    const h = createHarness();
    h.seedReadyLobby();
    const match = await h.startMatch({
      matchType: "constructed",
      engineMode: true,
      enableSeer: true,
    });
    expect(match?.enableSeer).toBe(true);
    expect(match?.engineMode).toBe(true);
  });
});
