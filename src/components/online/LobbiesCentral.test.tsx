import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LobbiesCentral from "@/components/online/LobbiesCentral";
import type { LobbyInfo, PlayerInfo } from "@/lib/net/protocol";

// Icon data is fetched from the Iconify API at runtime; not under test here.
vi.mock("@iconify/react", () => ({ Icon: () => null }));

function player(id: string, displayName: string): PlayerInfo {
  return {
    id,
    displayName,
    avatarUrl: null,
    seat: null,
    location: null,
    inLobby: true,
    inMatch: false,
    leagues: [],
  };
}

const ME = player("user_me", "Morgana");
const BOT = player("cpu_ab12", "CPU Bot ab12");

const openLobby: LobbyInfo = {
  id: "lobby_public1234",
  name: "Friday Duel",
  hostId: "user_host",
  players: [player("user_host", "Hostess")],
  status: "open",
  maxPlayers: 2,
  visibility: "open",
  readyPlayerIds: ["user_host"],
  plannedMatchType: "constructed",
  hostReady: true,
};

function practiceLobby(
  id: string,
  human: PlayerInfo,
  bot: PlayerInfo,
  plannedMatchType: "precon" | "constructed",
): LobbyInfo {
  return {
    id,
    name: null,
    hostId: human.id,
    players: [human, bot],
    status: "started",
    maxPlayers: 2,
    visibility: "private",
    readyPlayerIds: [human.id, bot.id],
    plannedMatchType,
    matchId: `match_${id}`,
    matchStatus: "in_progress",
    hostReady: true,
  };
}

function renderCentral(
  props: Partial<Parameters<typeof LobbiesCentral>[0]> & {
    lobbies: LobbyInfo[];
  },
) {
  return render(
    <LobbiesCentral
      tournaments={[]}
      tournamentsEnabled={false}
      myId={ME.id}
      joinedLobbyId={null}
      onJoin={vi.fn()}
      onCreate={vi.fn()}
      onRefresh={vi.fn()}
      {...props}
    />,
  );
}

/** Lobby rows in render order (the first grid row is the column header). */
function lobbyRows(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(".rc-games-grid"),
  ).slice(1);
}

describe("LobbiesCentral practice games", () => {
  it("does not list another player's practice game and leaves normal lobbies unchanged", () => {
    const theirs = practiceLobby(
      "lobby_theirs",
      player("user_other", "Sir Other"),
      player("cpu_zz99", "CPU Bot zz99"),
      "constructed",
    );
    const { container } = renderCentral({ lobbies: [theirs, openLobby] });

    const rows = lobbyRows(container);
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText("Friday Duel")).toBeTruthy();
    expect(within(rows[0]).getByText("Hostess")).toBeTruthy();
    expect(within(rows[0]).getByRole("button", { name: "Join" })).toBeTruthy();
    expect(screen.getByText(/^1 lobby/)).toBeTruthy();
    expect(screen.queryByText(/Sir Other/)).toBeNull();
    expect(screen.queryByText("Goldfish practice")).toBeNull();
    expect(screen.queryByText("End practice")).toBeNull();
  });

  it("pins my own practice game with its label and a one-click End practice", () => {
    const mine = practiceLobby("lobby_mine", ME, BOT, "precon");
    const onEndPractice = vi.fn();
    const onLeaveLobby = vi.fn();
    const { container } = renderCentral({
      lobbies: [openLobby, mine],
      joinedLobbyId: mine.id,
      onEndPractice,
      onLeaveLobby,
    });

    const [first, second] = lobbyRows(container);
    expect(within(first).getByText("Practice vs CPU")).toBeTruthy();
    expect(within(first).queryByText(/vs CPU Bot/)).toBeNull();
    expect(within(first).queryByText(/invite only/)).toBeNull();
    expect(within(first).queryByText("Spectate")).toBeNull();
    expect(within(first).queryByRole("button", { name: "Join" })).toBeNull();
    expect(within(first).queryByText("Copy invite link")).toBeNull();
    expect(within(second).getByText("Friday Duel")).toBeTruthy();

    // The header Leave Lobby would only half-leave (lobby, not match)
    expect(screen.queryByRole("button", { name: "Leave Lobby" })).toBeNull();

    fireEvent.click(within(first).getByRole("button", { name: "End practice" }));
    expect(onEndPractice).toHaveBeenCalledTimes(1);
    expect(onLeaveLobby).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("labels a goldfish practice game", () => {
    const mine = practiceLobby("lobby_goldfish", ME, BOT, "constructed");
    const { container } = renderCentral({
      lobbies: [mine],
      joinedLobbyId: mine.id,
      onEndPractice: vi.fn(),
    });
    const [row] = lobbyRows(container);
    expect(within(row).getByText("Goldfish practice")).toBeTruthy();
    expect(within(row).getByRole("button", { name: "End practice" })).toBeTruthy();
  });

  it("offers End practice on my practice game when no lobby is joined (reconnect)", () => {
    const mine = practiceLobby("lobby_reconnected", ME, BOT, "precon");
    const onEndPractice = vi.fn();
    const { container } = renderCentral({
      lobbies: [mine],
      joinedLobbyId: null,
      onEndPractice,
    });
    const [row] = lobbyRows(container);
    expect(within(row).getByText("Practice vs CPU")).toBeTruthy();
    fireEvent.click(within(row).getByRole("button", { name: "End practice" }));
    expect(onEndPractice).toHaveBeenCalledTimes(1);
  });

  it("does not offer End practice on a practice card while another lobby is joined", () => {
    const mine = practiceLobby("lobby_leftover", ME, BOT, "precon");
    const current: LobbyInfo = {
      ...openLobby,
      id: "lobby_current",
      name: "Current Table",
      hostId: ME.id,
      players: [ME],
      readyPlayerIds: [ME.id],
    };
    const { container } = renderCentral({
      lobbies: [mine, current],
      joinedLobbyId: current.id,
      onEndPractice: vi.fn(),
    });
    const practiceRow = lobbyRows(container).find((row) =>
      within(row).queryByText("Practice vs CPU"),
    );
    expect(practiceRow).toBeTruthy();
    if (!practiceRow) return;
    expect(
      within(practiceRow).queryByRole("button", { name: "End practice" }),
    ).toBeNull();
    expect(within(practiceRow).getByText("practice game")).toBeTruthy();
  });

  it("keeps the regular controls for a normal joined lobby", () => {
    const hosted: LobbyInfo = {
      ...openLobby,
      id: "lobby_hosted",
      name: "My Table",
      hostId: ME.id,
      players: [ME],
      readyPlayerIds: [ME.id],
    };
    const { container } = renderCentral({
      lobbies: [hosted],
      joinedLobbyId: hosted.id,
      onEndPractice: vi.fn(),
      onLeaveLobby: vi.fn(),
    });
    const [row] = lobbyRows(container);
    expect(within(row).getByText("My Table")).toBeTruthy();
    expect(within(row).getByText("Copy invite link")).toBeTruthy();
    expect(within(row).queryByText("End practice")).toBeNull();
    expect(screen.getByRole("button", { name: "Leave Lobby" })).toBeTruthy();
  });
});
