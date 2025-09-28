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
import type { UseMatchWebRTCReturn } from "@/lib/rtc/useMatchWebRTC";

export type VoiceRequestPeer = Pick<PlayerInfo, "id" | "displayName">;

// HTTP-available players list item from the Socket server API
export type AvailablePlayer = {
  userId: string;
  shortUserId: string;
  displayName: string;
  avatarUrl: string | null;
  presence: { online: boolean; inMatch: boolean };
  isFriend: boolean;
  lastPlayedAt?: string | null;
  matchCountInLast10?: number | null;
};

export type VoiceIncomingRequest = {
  requestId: string;
  from: VoiceRequestPeer;
  lobbyId: string | null;
  matchId: string | null;
  timestamp: number;
};

export type VoiceOutgoingRequest = {
  requestId: string | null;
  targetId: string;
  lobbyId: string | null;
  matchId: string | null;
  status: "sending" | "pending" | "accepted" | "declined" | "cancelled";
  timestamp: number;
};

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
  players: PlayerInfo[]; // legacy socket-driven simple presence list (id/displayName)
  // HTTP-derived available players list (richer data for invites UI)
  availablePlayers: AvailablePlayer[];
  availablePlayersNextCursor: string | null;
  availablePlayersLoading: boolean;
  playersError?: string | null;
  invites: LobbyInvitePayloadT[];
  // Extended actions
  requestLobbies: () => void;
  // Fetch HTTP available players with optional query/sort/cursor. If reset=true, clears and loads first page.
  requestPlayers: (opts?: { q?: string; sort?: "recent" | "alphabetical"; cursor?: string | null; reset?: boolean }) => void;
  setLobbyVisibility: (visibility: LobbyVisibility) => void;
  setLobbyPlan?: (planned: "constructed" | "sealed" | "draft") => void;
  inviteToLobby: (targetPlayerId: string, lobbyId?: string) => void;
  dismissInvite: (lobbyId: string, fromId: string) => void;
  // Server-managed CPU bot (host-only)
  addCpuBot?: (displayName?: string) => void;
  removeCpuBot?: (playerId?: string) => void;
  voice: {
    enabled: boolean;
    playbackEnabled: boolean;
    setPlaybackEnabled: (enabled: boolean) => void;
    togglePlayback: () => void;
    rtc: UseMatchWebRTCReturn;
    requestConnection: (targetId: string) => void;
    respondToRequest: (requestId: string, requesterId: string, accepted: boolean) => void;
    dismissOutgoingRequest: () => void;
    clearIncomingRequest: () => void;
    incomingRequest: VoiceIncomingRequest | null;
    outgoingRequest: VoiceOutgoingRequest | null;
    connectedPeerIds: string[];
    connectedPeers: VoiceRequestPeer[];
  } | null;
};

export const OnlineContext = createContext<OnlineContextValue | undefined>(undefined);

export function useOnline(): OnlineContextValue {
  const ctx = useContext(OnlineContext);
  if (!ctx) throw new Error("useOnline must be used within <OnlineLayout>");
  return ctx;
}
