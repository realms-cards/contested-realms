import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  createMatchmakingFeature,
} = require("../../server/features/matchmaking/constructed-queue");

interface FakePlayer {
  id: string;
  displayName: string;
  socketId: string | null;
  lobbyId: string | null;
  matchId: string | null;
}

interface LobbyControlMsg {
  type: string;
  playerId?: string;
  lobbyId?: string;
}

function createHarness() {
  const players = new Map<string, FakePlayer>();
  const lobbies = new Map<string, Record<string, unknown>>();
  const lobbyJoins: LobbyControlMsg[] = [];
  const emitted: Array<{ socketId: string; event: string; payload: unknown }> =
    [];

  const io = {
    to: (socketId: string) => ({
      emit: (event: string, payload: unknown) =>
        emitted.push({ socketId, event, payload }),
    }),
    emit: () => {},
  };

  const feature = createMatchmakingFeature({
    io,
    storeRedis: null,
    instanceId: "test-instance",
    getOrClaimLobbyLeader: async () => "test-instance",
    handleLobbyControlAsLeader: async (msg: LobbyControlMsg) => {
      lobbyJoins.push(msg);
      const player = players.get(msg.playerId || "");
      if (player && msg.lobbyId) player.lobbyId = msg.lobbyId;
    },
    ensurePlayerCached: async (playerId: string) =>
      players.get(playerId) || null,
    players,
    matchmakingChannel: "test:matchmaking",
    lobbies,
    reservePrivateLobby: (hostId: string) => {
      const lobby = {
        id: `lobby-${hostId}`,
        hostId,
        visibility: "private",
        status: "open",
        matchId: null,
        isMatchmakingLobby: true,
        playerIds: new Set<string>(),
        maxPlayers: 2,
        createdAt: Date.now(),
      };
      lobbies.set(lobby.id, lobby);
      return lobby;
    },
    setMatchmakingLobbyConfirmationRequired: async () => {},
    cancelReservedLobby: async (lobbyId: string) => {
      lobbies.delete(lobbyId);
    },
    addLobbyInvite: () => true,
  });

  function addPlayer(id: string): FakePlayer {
    const player: FakePlayer = {
      id,
      displayName: id,
      socketId: `socket-${id}`,
      lobbyId: null,
      matchId: null,
    };
    players.set(id, player);
    return player;
  }

  function addOpenLobby(id: string) {
    lobbies.set(id, {
      id,
      hostId: "host",
      visibility: "open",
      status: "open",
      playerIds: new Set(["host"]),
      maxPlayers: 2,
      isMatchmakingLobby: false,
      plannedMatchType: "constructed",
      // Older than the settings grace period so it is pairable immediately.
      createdAt: Date.now() - 60_000,
    });
  }

  return { feature, players, lobbies, lobbyJoins, emitted, addPlayer, addOpenLobby };
}

describe("constructed queue: players who enter a game outside the queue", () => {
  let harness: ReturnType<typeof createHarness>;

  beforeEach(() => {
    harness = createHarness();
  });

  afterEach(() => {
    harness.feature.stopMatchChecking();
    vi.restoreAllMocks();
  });

  it("drops the queue slot when the player joins a lobby elsewhere", async () => {
    const { feature, addPlayer } = harness;
    const alice = addPlayer("alice");

    await feature.joinQueue(alice.id, alice.socketId, { source: "web" });
    expect(feature.queue.has(alice.id)).toBe(true);

    alice.lobbyId = "friend-lobby";
    await feature.handlePlayerEnteredGame(alice.id, {
      lobbyId: "friend-lobby",
      reason: "joined_lobby",
    });

    expect(feature.queue.has(alice.id)).toBe(false);
  });

  it("never force-joins a player who is already in a match into another lobby", async () => {
    const { feature, lobbyJoins, addPlayer, addOpenLobby } = harness;
    const alice = addPlayer("alice");

    await feature.joinQueue(alice.id, alice.socketId, { source: "web" });
    // Alice starts a game outside the queue without her slot being released.
    alice.matchId = "running-match";
    addOpenLobby("someone-elses-lobby");

    await feature.checkForMatches();

    expect(lobbyJoins).toEqual([]);
    expect(alice.matchId).toBe("running-match");
    expect(feature.queue.has(alice.id)).toBe(false);
  });

  it("does not pair an in-game player when someone else joins the queue", async () => {
    const { feature, addPlayer } = harness;
    const alice = addPlayer("alice");
    const bob = addPlayer("bob");

    await feature.joinQueue(alice.id, alice.socketId, { source: "web" });
    alice.matchId = "running-match";

    await feature.joinQueue(bob.id, bob.socketId, { source: "web" });

    expect(feature.getPendingMatch(alice.id)).toBeNull();
    expect(feature.getPendingMatch(bob.id)).toBeNull();
    expect(feature.queue.has(alice.id)).toBe(false);
    expect(feature.queue.has(bob.id)).toBe(true);
  });

  it("keeps pairing players who are not in a game", async () => {
    const { feature, addPlayer } = harness;
    const alice = addPlayer("alice");
    const bob = addPlayer("bob");

    await feature.joinQueue(alice.id, alice.socketId, { source: "web" });
    await feature.joinQueue(bob.id, bob.socketId, { source: "web" });

    expect(feature.getPendingMatch(alice.id)).toMatchObject({
      opponentPlayerId: bob.id,
      status: "confirming",
    });
    expect(feature.getPendingMatch(bob.id)).toMatchObject({
      opponentPlayerId: alice.id,
    });
  });

  it("leaves the matchmade lobby's own pending match intact until the match starts", async () => {
    const { feature, addPlayer } = harness;
    const alice = addPlayer("alice");
    const bob = addPlayer("bob");

    await feature.joinQueue(alice.id, alice.socketId, { source: "web" });
    await feature.joinQueue(bob.id, bob.socketId, { source: "web" });

    const pending = feature.getPendingMatch(alice.id);
    expect(pending).not.toBeNull();

    alice.lobbyId = pending.lobbyId;
    await feature.handlePlayerEnteredGame(alice.id, {
      lobbyId: pending.lobbyId,
      reason: "joined_lobby",
    });
    expect(feature.getPendingMatch(alice.id)).not.toBeNull();

    alice.matchId = "matchmade-match";
    await feature.handlePlayerEnteredGame(alice.id, {
      lobbyId: pending.lobbyId,
      matchStarted: true,
      reason: "match_started",
    });
    expect(feature.getPendingMatch(alice.id)).toBeNull();
  });

  it("releases the reservation so the opponent is requeued when a player walks off", async () => {
    const { feature, addPlayer } = harness;
    const alice = addPlayer("alice");
    const bob = addPlayer("bob");

    await feature.joinQueue(alice.id, alice.socketId, { source: "web" });
    await feature.joinQueue(bob.id, bob.socketId, { source: "web" });
    await feature.respondToMatchmaking(bob.id, "accept");

    alice.lobbyId = "friend-lobby";
    await feature.handlePlayerEnteredGame(alice.id, {
      lobbyId: "friend-lobby",
      reason: "joined_lobby",
    });

    expect(feature.getPendingMatch(alice.id)).toBeNull();
    expect(feature.queue.has(alice.id)).toBe(false);
    // Bob accepted, so he goes back to searching instead of waiting out the
    // confirmation window against someone who is no longer available.
    expect(feature.queue.has(bob.id)).toBe(true);
  });

  it("refuses an external (Discord) queue join from a player in a match", async () => {
    const { feature, addPlayer } = harness;
    const alice = addPlayer("alice");
    alice.matchId = "running-match";

    const result = await feature.joinExternalQueue(alice.id, {
      discordId: "123",
    });

    expect(result.status).toBe("already_in_game");
    expect(feature.queue.has(alice.id)).toBe(false);
  });
});
