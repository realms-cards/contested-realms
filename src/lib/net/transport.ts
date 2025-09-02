import type {
  LobbyUpdatedPayloadT,
  MatchStartedPayloadT,
  ResyncResponsePayloadT,
  ServerChatPayloadT,
  StatePatchPayloadT,
  ErrorPayloadT,
  WelcomePayloadT,
  LobbiesUpdatedPayloadT,
  PlayerListPayloadT,
  LobbyInvitePayloadT,
  LobbyVisibility,
  ChatScope,
  SealedConfig,
  DraftConfig,
} from "@/lib/net/protocol";

// Draft state type for client-server sync
export type DraftState = {
  phase: "waiting" | "picking" | "passing" | "complete";
  packIndex: number; // 0, 1, 2 for packs 1, 2, 3
  pickNumber: number; // 1-15 for picks in current pack
  currentPacks: unknown[][] | null; // Current packs for each player
  picks: unknown[][]; // Picked cards for each player [p1_picks, p2_picks]
  packDirection: "left" | "right"; // Pack passing direction
  packChoice: (string | null)[]; // Pack selection for this round [p1_choice, p2_choice]
  waitingFor: string[]; // Player IDs who haven't made their pick yet
};

export type TransportEventMap = {
  welcome: WelcomePayloadT;
  statePatch: StatePatchPayloadT;
  chat: ServerChatPayloadT;
  matchStarted: MatchStartedPayloadT;
  resync: ResyncResponsePayloadT;
  lobbyUpdated: LobbyUpdatedPayloadT;
  error: ErrorPayloadT;
  lobbiesUpdated: LobbiesUpdatedPayloadT;
  playerList: PlayerListPayloadT;
  lobbyInvite: LobbyInvitePayloadT;
  draftUpdate: DraftState;
};

export type TransportEvent = keyof TransportEventMap;
export type TransportHandler<E extends TransportEvent> = (payload: TransportEventMap[E]) => void;

// Optional match configuration for starting a match
export type StartMatchConfig = {
  matchType?: "constructed" | "sealed" | "draft";
  sealedConfig?: (SealedConfig & {
    // Extended fields used by the lobby UI; tolerated by server
    packCounts?: Record<string, number>;
    replaceAvatars?: boolean;
  });
  draftConfig?: DraftConfig;
};

export interface GameTransport {
  connect(opts: { displayName: string; playerId?: string }): Promise<void>;
  disconnect(): void;

  createLobby(options?: { visibility?: LobbyVisibility; maxPlayers?: number }): Promise<{ lobbyId: string }>;
  joinLobby(lobbyId?: string): Promise<{ lobbyId: string }>; // if omitted, auto-join/create
  joinMatch(matchId: string): Promise<void>;
  leaveMatch(): void;
  leaveLobby(): void;
  ready(ready: boolean): void;
  startMatch(matchConfig?: StartMatchConfig): void;

  sendAction(action: unknown): void;
  // Explicit mulligan completion signal (per-player)
  mulliganDone(): void;
  sendChat(content: string, scope?: ChatScope): void;

  resync(): void;

  requestLobbies(): void;
  requestPlayers(): void;
  setLobbyVisibility(visibility: LobbyVisibility): void;
  inviteToLobby(targetPlayerId: string, lobbyId?: string): void;

  // Draft-specific methods (optional, may not be implemented by all transports)
  startDraft?(config: { matchId: string; draftConfig: DraftConfig }): Promise<void>;
  makeDraftPick?(config: { matchId: string; cardId: string; packIndex: number; pickNumber: number }): void;
  chooseDraftPack?(config: { matchId: string; setChoice: string; packIndex: number }): void;
  submitDeck?(deck: unknown): void;

  on<E extends TransportEvent>(event: E, handler: TransportHandler<E>): () => void;
  off?<E extends TransportEvent>(event: E, handler: TransportHandler<E>): void;
}
