import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LobbyPage from "@/app/online/lobby/page";
import type { LobbyInfo, MatchInfo, PlayerInfo } from "@/lib/net/protocol";

const h = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  online: {} as Record<string, unknown>,
  calls: [] as string[],
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: h.push,
    replace: h.replace,
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/online/lobby",
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    status: "authenticated",
    data: { user: { id: "user_me", name: "Morgana" } },
  }),
}));
vi.mock("@/app/online/online-context", () => ({
  useOnline: () => h.online,
}));
// Icon data is fetched from the Iconify API at runtime; not under test here.
vi.mock("@iconify/react", () => ({ Icon: () => null }));
vi.mock("@/components/ui/AppShell", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/auth/GuestGate", () => ({ default: () => null }));
vi.mock("@/components/chat/LobbyChatConsole", () => ({ default: () => null }));
vi.mock("@/components/online/InviteOverlay", () => ({ default: () => null }));
vi.mock("@/components/online/PlayersInvitePanel", () => ({
  default: () => null,
}));
vi.mock("@/components/online/SoatcLeagueBadge", () => ({
  SoatcLeagueCheckbox: () => null,
}));
vi.mock("@/components/online/lobby/LobbyActionStrip", () => ({
  default: () => <div>ACTION_STRIP</div>,
}));
vi.mock("@/components/online/lobby/LobbyHero", () => ({ default: () => null }));
vi.mock("@/components/online/lobby/LobbyPageFooter", () => ({
  default: () => null,
}));
vi.mock("@/contexts/RealtimeTournamentContext", () => ({
  useRealtimeTournaments: () => ({}),
}));
vi.mock("@/lib/config/features", () => ({
  tournamentFeatures: { isEnabled: () => false },
}));
vi.mock("@/lib/guest/guestSession", () => ({
  useGuestSession: () => ({ status: "ready", guest: null }),
}));
vi.mock("@/lib/hooks/useSoatcStatus", () => ({
  useSoatcStatus: () => ({ status: null, loading: false }),
  useSharedTournament: () => ({ status: null }),
}));
vi.mock("@/lib/hooks/useAvailableSets", () => ({
  useAvailableSets: () => ({
    sets: [],
    setNames: [],
    loading: false,
    error: null,
  }),
  buildDefaultPackCounts: () => ({}),
  DEFAULT_SET: "Beta",
  DEFAULT_DRAFTABLE_SETS: ["Beta"],
}));

function player(id: string, displayName: string): PlayerInfo {
  return {
    id,
    displayName,
    avatarUrl: null,
    seat: null,
    location: null,
    inLobby: true,
    inMatch: true,
    leagues: [],
  };
}

const ME = player("user_me", "Morgana");
const BOT = player("cpu_ab12", "CPU Bot ab12");
const HUMAN = player("user_opp", "Sir Opp");

type PlannedType = "precon" | "constructed";

function lobbyOf(id: string, other: PlayerInfo, type: PlannedType): LobbyInfo {
  return {
    id,
    name: null,
    hostId: ME.id,
    players: [ME, other],
    status: "started",
    maxPlayers: 2,
    visibility: "private",
    readyPlayerIds: [ME.id, other.id],
    plannedMatchType: type,
    matchId: `match_${id}`,
    matchStatus: "in_progress",
    hostReady: true,
  };
}

function matchOf(id: string, other: PlayerInfo, type: PlannedType): MatchInfo {
  return {
    id,
    players: [ME, other],
    playerIds: [ME.id, other.id],
    status: "in_progress",
    seed: "seed",
    matchType: type,
    maxPlayers: 2,
    isMultiplayer: false,
  };
}

function online(overrides: Record<string, unknown>): Record<string, unknown> {
  const noop = vi.fn();
  return {
    connected: true,
    isGuest: false,
    lobby: null,
    match: null,
    me: ME,
    joinLobby: noop,
    createLobby: noop,
    startMatch: noop,
    leaveLobby: vi.fn(() => {
      h.calls.push("leaveLobby");
    }),
    leaveMatch: vi.fn(() => {
      h.calls.push("leaveMatch");
    }),
    sendChat: noop,
    chatLog: [],
    chatHasMore: false,
    chatLoading: false,
    requestMoreChatHistory: noop,
    resync: noop,
    lobbies: [],
    players: [],
    availablePlayers: [],
    availablePlayersNextCursor: null,
    availablePlayersLoading: false,
    playersError: null,
    invites: [],
    requestLobbies: noop,
    requestPlayers: noop,
    setLobbyVisibility: noop,
    setLobbyPlan: noop,
    inviteToLobby: noop,
    dismissInvite: noop,
    addCpuBot: noop,
    removeCpuBot: noop,
    matchmaking: {
      status: "idle",
      preferences: null,
      queuePosition: null,
      estimatedWait: null,
      matchedPlayerId: null,
      matchedPlayerName: null,
      youAccepted: false,
      isHost: null,
      queueSize: 0,
      confirmExpiresAt: null,
      queueBySource: null,
    },
    acceptMatchmaking: noop,
    declineMatchmaking: noop,
    voice: null,
    transport: { on: () => () => {}, emit: noop, off: noop },
    ...overrides,
  };
}

beforeEach(() => {
  h.push.mockReset();
  h.replace.mockReset();
  h.calls.length = 0;
  sessionStorage.clear();
  const memory = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, String(value));
    },
    removeItem: (key: string) => {
      memory.delete(key);
    },
    clear: () => memory.clear(),
    key: () => null,
    length: 0,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({}) })),
  );
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("lobby page: practice game (vs CPU / goldfish)", () => {
  it("shows the practice panel with no countdown and no auto navigation", () => {
    const lobby = lobbyOf("lobby_pr", BOT, "precon");
    const match = matchOf("match_pr", BOT, "precon");
    h.online = online({ lobby, match, lobbies: [lobby] });
    render(<LobbyPage />);

    const panel = screen.getByRole("region", { name: "Practice vs CPU" });
    expect(screen.queryByText(/Joining in/)).toBeNull();
    expect(screen.queryByText("Match Controls")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(h.push).not.toHaveBeenCalled();

    fireEvent.click(within(panel).getByRole("button", { name: "Resume" }));
    expect(h.push).toHaveBeenCalledWith("/online/play/match_pr");
  });

  it("End practice leaves the match, then the lobby, once and without a dialog", () => {
    const lobby = lobbyOf("lobby_end", BOT, "precon");
    const match = matchOf("match_end", BOT, "precon");
    h.online = online({ lobby, match, lobbies: [lobby] });
    const { rerender } = render(<LobbyPage />);

    const panel = screen.getByRole("region", { name: "Practice vs CPU" });
    fireEvent.click(within(panel).getByRole("button", { name: "End practice" }));
    expect(h.calls).toEqual(["leaveMatch", "leaveLobby"]);
    expect(screen.queryByRole("dialog")).toBeNull();

    // The provider clears match and lobby once both leaves went out
    h.online = { ...h.online, lobby: null, match: null, lobbies: [] };
    rerender(<LobbyPage />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByRole("region", { name: "Practice vs CPU" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(h.calls).toEqual(["leaveMatch", "leaveLobby"]);
  });

  it("opens no Leave match dialog when a practice match ends", () => {
    const lobby = lobbyOf("lobby_gf", BOT, "constructed");
    const match = matchOf("match_gf", BOT, "constructed");
    h.online = online({ lobby, match, lobbies: [lobby] });
    const { rerender } = render(<LobbyPage />);

    h.online = { ...h.online, match: { ...match, status: "ended" } };
    rerender(<LobbyPage />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.queryByText(/Leave match/i)).toBeNull();
    const panel = screen.getByRole("region", { name: "Goldfish practice" });
    expect(within(panel).queryByRole("button", { name: "Resume" })).toBeNull();
  });

  it("does not list another player's practice game", () => {
    const theirs: LobbyInfo = {
      ...lobbyOf("lobby_theirs", BOT, "precon"),
      hostId: HUMAN.id,
      players: [HUMAN, BOT],
      readyPlayerIds: [HUMAN.id, BOT.id],
    };
    const duel: LobbyInfo = {
      ...lobbyOf("lobby_duel", player("user_x", "Xan"), "constructed"),
      name: "Other Duel",
      hostId: HUMAN.id,
      players: [HUMAN, player("user_x", "Xan")],
      readyPlayerIds: [HUMAN.id, "user_x"],
      visibility: "open",
    };
    h.online = online({ lobbies: [theirs, duel] });
    render(<LobbyPage />);

    expect(screen.queryByText(/CPU Bot ab12/)).toBeNull();
    expect(screen.getByText("Other Duel")).toBeTruthy();
  });
});

describe("lobby page: non-practice match unchanged", () => {
  it("keeps the auto-join countdown and navigation", () => {
    const lobby = lobbyOf("lobby_h", HUMAN, "constructed");
    const match = matchOf("match_h", HUMAN, "constructed");
    h.online = online({ lobby, match, lobbies: [lobby] });
    render(<LobbyPage />);

    expect(screen.getByText(/Joining in/)).toBeTruthy();
    expect(screen.queryByRole("region", { name: /practice/i })).toBeNull();
    act(() => {
      vi.advanceTimersByTime(3100);
    });
    expect(h.push).toHaveBeenCalledWith("/online/play/match_h");
  });

  it("Leave still asks for confirmation before leaving a normal match", () => {
    sessionStorage.setItem("auto_joined_match_h2", "true");
    const lobby = lobbyOf("lobby_h2", HUMAN, "constructed");
    const match = matchOf("match_h2", HUMAN, "constructed");
    h.online = online({ lobby, match, lobbies: [lobby] });
    render(<LobbyPage />);

    expect(screen.queryByText(/Joining in/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Leave" }));
    act(() => {
      vi.advanceTimersByTime(10);
    });
    expect(h.calls).toEqual([]);
    expect(screen.getAllByText(/Leave match/i).length).toBeGreaterThan(0);
  });
});
