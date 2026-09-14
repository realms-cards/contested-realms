import { describe, expect, it } from "vitest";
import {
  STALE_MATCH_DISPLAY_MS,
  isLobbyListable,
  isPracticeLobby,
  lobbyListForViewer,
  partitionLobbyList,
  planLobbyListEmits,
  type ListableLobby,
  type ListableMatch,
} from "../../../server/modules/lobby/listing";

const NOW = 50_000_000;
const isCpu = (id: string): boolean => id.startsWith("cpu_");

function lobby(
  id: string,
  playerIds: string[],
  extra: Partial<ListableLobby> = {},
): ListableLobby {
  return {
    id,
    status: "open",
    playerIds: new Set(playerIds),
    lastActive: NOW,
    ...extra,
  };
}

function lookup(entries: Record<string, ListableMatch> = {}) {
  const map = new Map(Object.entries(entries));
  return (matchId: string): ListableMatch | undefined => map.get(matchId);
}

describe("isPracticeLobby", () => {
  it("is false for lobbies with only human players", () => {
    expect(isPracticeLobby(lobby("l1", ["user_a", "user_b"]), isCpu)).toBe(
      false,
    );
    expect(isPracticeLobby(lobby("l2", []), isCpu)).toBe(false);
    expect(isPracticeLobby({ playerIds: null }, isCpu)).toBe(false);
  });

  it("is true once a CPU bot holds a seat (vs CPU and goldfish alike)", () => {
    expect(isPracticeLobby(lobby("l1", ["user_a", "cpu_x1"]), isCpu)).toBe(
      true,
    );
    expect(isPracticeLobby({ playerIds: ["cpu_x1", "user_a"] }, isCpu)).toBe(
      true,
    );
  });

  it("is true for a lobby flagged by startCpuMatch before the bot joined", () => {
    expect(
      isPracticeLobby(lobby("l1", ["user_a"], { cpuPractice: true }), isCpu),
    ).toBe(true);
  });
});

describe("isLobbyListable", () => {
  it("hides closed lobbies and keeps open ones regardless of age", () => {
    expect(
      isLobbyListable(lobby("l1", [], { status: "closed" }), lookup(), NOW),
    ).toBe(false);
    expect(
      isLobbyListable(lobby("l2", [], { lastActive: 0 }), lookup(), NOW),
    ).toBe(true);
  });

  it("hides started lobbies whose match has ended", () => {
    const started = (matchId: string) =>
      lobby(matchId, [], { status: "started", matchId });
    const matches = lookup({
      ended: { status: "ended" },
      completed: { status: "completed" },
      finalized: { status: "in_progress", _finalized: true },
      live: { status: "in_progress" },
    });
    expect(isLobbyListable(started("ended"), matches, NOW)).toBe(false);
    expect(isLobbyListable(started("completed"), matches, NOW)).toBe(false);
    expect(isLobbyListable(started("finalized"), matches, NOW)).toBe(false);
    expect(isLobbyListable(started("live"), matches, NOW)).toBe(true);
  });

  it("hides started matches idle past the stale window, counting match activity", () => {
    const old = NOW - STALE_MATCH_DISPLAY_MS - 1;
    const stale = lobby("l1", [], {
      status: "started",
      matchId: "m1",
      lastActive: old,
    });
    expect(isLobbyListable(stale, lookup({ m1: { lastTs: old } }), NOW)).toBe(
      false,
    );
    expect(isLobbyListable(stale, lookup({ m1: { lastTs: NOW } }), NOW)).toBe(
      true,
    );
    const edge = lobby("l2", [], {
      status: "started",
      lastActive: NOW - STALE_MATCH_DISPLAY_MS,
    });
    expect(isLobbyListable(edge, lookup(), NOW)).toBe(true);
  });
});

describe("partitionLobbyList", () => {
  it("keeps practice games out of the public list, newest first", () => {
    const publicOld = lobby("public-old", ["user_a"], { lastActive: NOW - 50 });
    const publicNew = lobby("public-new", ["user_b", "user_c"], {
      status: "started",
      matchId: "m-public",
      lastActive: NOW - 10,
    });
    const vsCpu = lobby("vs-cpu", ["user_d", "cpu_1"], {
      status: "started",
      matchId: "m-cpu",
      lastActive: NOW - 20,
    });
    const goldfish = lobby("goldfish", ["user_e", "cpu_2"], {
      status: "started",
      matchId: "m-goldfish",
      lastActive: NOW - 5,
    });
    const closedPractice = lobby("closed-cpu", ["cpu_3"], {
      status: "closed",
    });
    const createdOnly = lobby("created-only", ["user_f"], {
      lastActive: null,
      createdAt: NOW - 30,
    });

    const { listed, practice } = partitionLobbyList(
      [publicOld, vsCpu, closedPractice, publicNew, goldfish, createdOnly],
      {
        getMatch: lookup({
          "m-public": { status: "in_progress" },
          "m-cpu": { status: "in_progress" },
          "m-goldfish": { status: "waiting" },
        }),
        isCpuPlayerId: isCpu,
        now: NOW,
      },
    );

    expect(listed.map((l) => l.id)).toEqual([
      "public-new",
      "created-only",
      "public-old",
    ]);
    expect(practice.map((l) => l.id)).toEqual(["goldfish", "vs-cpu"]);
  });
});

describe("planLobbyListEmits", () => {
  it("broadcasts to everyone when there is no practice game", () => {
    expect(planLobbyListEmits(["a", "b"], [])).toEqual([
      { room: null, exceptRooms: [], lobbies: ["a", "b"] },
    ]);
  });

  it("sends each practice lobby only to the player rooms of its players", () => {
    const emits = planLobbyListEmits(
      ["public"],
      [
        { id: "p1", playerIds: ["user_a"], info: "practice-1" },
        { id: "p2", playerIds: ["user_b"], info: "practice-2" },
      ],
    );
    expect(emits).toEqual([
      {
        room: null,
        exceptRooms: ["player:user_a", "player:user_b"],
        lobbies: ["public"],
      },
      {
        room: "player:user_a",
        exceptRooms: [],
        lobbies: ["practice-1", "public"],
      },
      {
        room: "player:user_b",
        exceptRooms: [],
        lobbies: ["practice-2", "public"],
      },
    ]);
    const broadcast = emits.find((emit) => emit.room === null);
    expect(broadcast?.lobbies).not.toContain("practice-1");
    expect(broadcast?.lobbies).not.toContain("practice-2");
  });

  it("gives a player in two practice lobbies one list holding both", () => {
    // e.g. a new practice game while an older one is still around: a socket
    // must never receive two lists, or the later one drops the other lobby.
    const emits = planLobbyListEmits(
      ["public"],
      [
        { id: "new", playerIds: ["user_c"], info: "practice-new" },
        { id: "old", playerIds: ["user_c", "user_c"], info: "practice-old" },
      ],
    );
    expect(emits).toEqual([
      { room: null, exceptRooms: ["player:user_c"], lobbies: ["public"] },
      {
        room: "player:user_c",
        exceptRooms: [],
        lobbies: ["practice-new", "practice-old", "public"],
      },
    ]);
    const toUserC = emits.filter((emit) => emit.room === "player:user_c");
    expect(toUserC).toHaveLength(1);
  });

  it("sends a viewer the same list it gets on request", () => {
    const practice = [
      { id: "new", playerIds: ["user_c"], info: "practice-new" },
      { id: "old", playerIds: ["user_c"], info: "practice-old" },
      { id: "p2", playerIds: ["user_d"], info: "practice-2" },
    ];
    for (const emit of planLobbyListEmits(["public"], practice)) {
      if (!emit.room) continue;
      const viewer = emit.room.slice("player:".length);
      expect(lobbyListForViewer(["public"], practice, viewer)).toEqual(
        emit.lobbies,
      );
    }
  });
});

describe("lobbyListForViewer", () => {
  const practice = [
    { id: "p1", playerIds: ["user_a", "cpu_1"], info: "practice-1" },
  ];

  it("adds the requesting player's own practice game", () => {
    expect(lobbyListForViewer(["public"], practice, "user_a")).toEqual([
      "practice-1",
      "public",
    ]);
  });

  it("never shows another player's practice game", () => {
    expect(lobbyListForViewer(["public"], practice, "user_b")).toEqual([
      "public",
    ]);
    expect(lobbyListForViewer(["public"], practice, null)).toEqual(["public"]);
  });
});
