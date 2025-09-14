"use client";

import { createContext, useContext } from "react";
import type {
  LobbyInfo,
  MatchInfo,
  ServerChatPayloadT,
  PlayerInfo,
  LobbyInvitePayloadT,
  LobbyVisibility,
  ChatScope,
} from "@/lib/net/protocol";
import type { SocketTransport } from "@/lib/net/socketTransport";
import type { StartMatchConfig } from "@/lib/net/transport";

export type OnlineContextValue = {
  transport: SocketTransport | null;
  connected: boolean;
  displayName: string;
  setDisplayName: () => void;
  me: PlayerInfo | null;
  lobby: LobbyInfo | null;
  match: MatchInfo | null;
  ready: boolean;
  toggleReady: () => void;
  joinLobby: (id?: string) => Promise<void>;
  createLobby: (options?: { name?: string; visibility?: LobbyVisibility; maxPlayers?: number }) => Promise<void>;
  leaveLobby: () => void;
  startMatch: (matchConfig?: StartMatchConfig) => void;
  joinMatch: (id: string) => Promise<void>;
  leaveMatch: () => void;
  sendChat: (msg: string, scope?: ChatScope) => void;
  resync: () => void;
  resyncing: boolean;
  chatLog: ServerChatPayloadT[];
  // Extended state
  lobbies: LobbyInfo[];
  players: PlayerInfo[];
  invites: LobbyInvitePayloadT[];
  // Extended actions
  requestLobbies: () => void;
  requestPlayers: () => void;
  setLobbyVisibility: (visibility: LobbyVisibility) => void;
  setLobbyPlan?: (planned: "constructed" | "sealed" | "draft") => void;
  inviteToLobby: (targetPlayerId: string, lobbyId?: string) => void;
  dismissInvite: (lobbyId: string, fromId: string) => void;
  // Server-managed CPU bot (host-only)
  addCpuBot?: (displayName?: string) => void;
  removeCpuBot?: (playerId?: string) => void;
};

export const OnlineContext = createContext<OnlineContextValue | undefined>(undefined);

export function useOnline(): OnlineContextValue {
  const ctx = useContext(OnlineContext);
  if (!ctx) throw new Error("useOnline must be used within <OnlineLayout>");
  return ctx;
}
