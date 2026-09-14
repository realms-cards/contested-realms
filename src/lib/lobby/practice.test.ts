import { describe, expect, it } from "vitest";
import {
  isCpuPlayerId,
  isPracticeLobby,
  isPracticeMatch,
  practiceIcon,
  practiceLabel,
  practiceModeForMatchType,
  visibleLobbies,
  withoutForeignPracticeLobbies,
} from "@/lib/lobby/practice";
import type { LobbyInfo, PlayerInfo } from "@/lib/net/protocol";

function player(id: string): PlayerInfo {
  return {
    id,
    displayName: id,
    avatarUrl: null,
    seat: null,
    location: null,
    inLobby: true,
    inMatch: false,
    leagues: [],
  };
}

function lobby(
  id: string,
  playerIds: string[],
  extra: Partial<LobbyInfo> = {},
): LobbyInfo {
  return {
    id,
    name: null,
    hostId: playerIds[0] ?? "nobody",
    players: playerIds.map(player),
    status: "started",
    maxPlayers: 2,
    visibility: "private",
    readyPlayerIds: [],
    ...extra,
  };
}

describe("CPU detection", () => {
  it("recognises server bot ids only", () => {
    expect(isCpuPlayerId("cpu_ab12")).toBe(true);
    expect(isCpuPlayerId("user_cpu_ab12")).toBe(false);
    expect(isCpuPlayerId("cpu:legacy")).toBe(false);
    expect(isCpuPlayerId(null)).toBe(false);
    expect(isCpuPlayerId(undefined)).toBe(false);
  });

  it("flags lobbies and matches with a bot seat", () => {
    expect(isPracticeLobby(lobby("l1", ["me", "cpu_1"]))).toBe(true);
    expect(isPracticeLobby(lobby("l2", ["me", "friend"]))).toBe(false);
    expect(
      isPracticeMatch({ playerIds: ["me", "cpu_1"], players: [player("me")] }),
    ).toBe(true);
    expect(
      isPracticeMatch({ players: [player("me"), player("cpu_1")] }),
    ).toBe(true);
    expect(
      isPracticeMatch({
        playerIds: ["me", "friend"],
        players: [player("me"), player("friend")],
      }),
    ).toBe(false);
  });
});

describe("practice labels", () => {
  it("maps the match type to the practice mode", () => {
    expect(practiceModeForMatchType("precon")).toBe("vs_cpu");
    expect(practiceModeForMatchType("constructed")).toBe("goldfish");
    expect(practiceModeForMatchType(undefined)).toBe("vs_cpu");
  });

  it("names and illustrates each mode with Game Icons", () => {
    expect(practiceLabel("vs_cpu")).toBe("Practice vs CPU");
    expect(practiceLabel("goldfish")).toBe("Goldfish practice");
    expect(practiceIcon("vs_cpu")).toMatch(/^game-icons:/);
    expect(practiceIcon("goldfish")).toMatch(/^game-icons:/);
  });
});

describe("lobby list filtering", () => {
  const publicLobby = lobby("public", ["host", "guest"], {
    visibility: "open",
  });
  const mine = lobby("mine", ["me", "cpu_1"], { plannedMatchType: "precon" });
  const theirs = lobby("theirs", ["someone", "cpu_2"], {
    plannedMatchType: "constructed",
  });

  it("drops practice games the viewer is not in", () => {
    const all = [publicLobby, mine, theirs];
    expect(withoutForeignPracticeLobbies(all, "me").map((l) => l.id)).toEqual(
      ["public", "mine"],
    );
    expect(
      withoutForeignPracticeLobbies(all, "someone-else").map((l) => l.id),
    ).toEqual(["public"]);
    expect(withoutForeignPracticeLobbies(all, null).map((l) => l.id)).toEqual(
      ["public"],
    );
  });

  it("adds the joined practice lobby when the list omits it", () => {
    expect(
      visibleLobbies([publicLobby, theirs], "me", mine).map((l) => l.id),
    ).toEqual(["mine", "public"]);
  });

  it("does not duplicate a joined lobby already listed", () => {
    expect(
      visibleLobbies([publicLobby, mine], "me", mine).map((l) => l.id),
    ).toEqual(["public", "mine"]);
  });

  it("leaves non-practice lists untouched", () => {
    const joined = lobby("joined", ["me", "friend"]);
    expect(visibleLobbies([publicLobby], "me", joined)).toEqual([publicLobby]);
    expect(visibleLobbies([publicLobby], "me", null)).toEqual([publicLobby]);
  });
});
