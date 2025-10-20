import type {
  ClientEventMap,
  JoinedLobbyPayloadT,
  LeftLobbyPayloadT,
  PlayerInfo,
} from "../src/lib/net/protocol";
import type {
  InteractionEnvelope,
  InteractionRequestMessage,
  InteractionResponseMessage,
} from "../src/lib/net/interactions";
import type {
  CustomMessage,
  DraftState,
  TransportEventMap,
} from "../src/lib/net/transport";

type EventHandler<T> = T extends void ? () => void : (payload: T) => void;

type ClientEventHandlers = {
  [K in keyof ClientEventMap]: EventHandler<ClientEventMap[K]>;
};

type ServerEventHandlers = {
  [K in keyof TransportEventMap]: EventHandler<TransportEventMap[K]>;
};

interface RTCParticipant {
  id: string;
  displayName?: string | null;
  lobbyId: string | null;
  matchId: string | null;
  roomId: string;
  joinedAt: number;
}

interface RTCSignalPayload {
  data?: Record<string, unknown>;
}

interface RTCRequestPayload {
  targetId: string;
  lobbyId?: string | null;
  matchId?: string | null;
}

interface RTCRequestResponsePayload {
  requestId: string;
  requesterId: string;
  accepted: boolean;
}

interface RTCConnectionFailedPayload {
  requestId: string;
  reason?: string;
  code?: string;
}

interface MatchRecordingRequestPayload {
  matchId: string;
}

interface DraftSessionJoinPayload {
  sessionId: string;
}

interface DraftSessionPresencePayload {
  sessionId: string;
  players: Array<{
    id: string;
    displayName: string | null;
    joinedAt: number;
  }>;
}

interface TournamentDraftStartPayload {
  matchId: string;
  draftConfig: unknown;
}

interface TournamentDraftPickPayload {
  matchId: string;
  cardId: string;
  packIndex: number;
  pickNumber: number;
}

interface TournamentDraftPackChoicePayload {
  matchId: string;
  setChoice: string;
  packIndex: number;
}

interface SubmitDeckPayload {
  deck: unknown;
}

interface EndMatchPayload {
  matchId: string;
  result?: unknown;
}

declare module "socket.io" {
  // Events emitted from the server to connected clients.
  interface ServerToClientEvents extends ServerEventHandlers {
    joinedLobby: JoinedLobbyPayloadT;
    leftLobby: LeftLobbyPayloadT;
    resyncResponse: { snapshot: unknown };
    "draft:session:joined": DraftSessionJoinPayload;
    "draft:session:presence": DraftSessionPresencePayload;
    "draft:session:update": { matchId: string; state: DraftState };
    "rtc:participants": { participants: RTCParticipant[] };
    "rtc:peer-joined": { from: PlayerInfo | null; participants: RTCParticipant[] };
    "rtc:peer-left": { from: string; participants: RTCParticipant[] };
    "rtc:peer-connection-failed": { from: string; reason: string; code: string; timestamp: number };
    "rtc:request": {
      requestId: string;
      from: PlayerInfo | null;
      lobbyId: string | null;
      matchId: string | null;
      timestamp: number;
    };
    "rtc:request:sent": {
      requestId: string;
      targetId: string;
      lobbyId: string | null;
      matchId: string | null;
      timestamp: number;
    };
    "rtc:request:accepted": {
      requestId: string;
      from: PlayerInfo | null;
      lobbyId: string | null;
      matchId: string | null;
      accepted: true;
      timestamp: number;
    };
    "rtc:request:declined": {
      requestId: string;
      from: PlayerInfo | null;
      lobbyId: string | null;
      matchId: string | null;
      accepted: false;
      timestamp: number;
    };
    "rtc:request:ack": {
      requestId: string;
      from: PlayerInfo | null;
      lobbyId: string | null;
      matchId: string | null;
      accepted: boolean;
      timestamp: number;
    };
    "rtc:signal": { from: string; data: Record<string, unknown> };
    "rtc:connection-failed": { playerId: string; matchId: string | null; lobbyId: string | null; reason: string; code: string };
  }

  // Events emitted by clients and handled on the server.
  interface ClientToServerEvents extends ClientEventHandlers {
    message: EventHandler<CustomMessage>;
    "interaction:request": EventHandler<Record<string, unknown>>;
    "interaction:response": EventHandler<Record<string, unknown>>;
    "draft:session:join": EventHandler<DraftSessionJoinPayload>;
    "draft:session:leave": EventHandler<DraftSessionJoinPayload>;
    startDraft: EventHandler<TournamentDraftStartPayload>;
    makeDraftPick: EventHandler<TournamentDraftPickPayload>;
    chooseDraftPack: EventHandler<TournamentDraftPackChoicePayload>;
    submitDeck: EventHandler<SubmitDeckPayload | unknown>;
    "rtc:join": () => void;
    "rtc:leave": () => void;
    "rtc:signal": EventHandler<RTCSignalPayload>;
    "rtc:request": EventHandler<RTCRequestPayload>;
    "rtc:request:respond": EventHandler<RTCRequestResponsePayload>;
    "rtc:connection-failed": EventHandler<RTCConnectionFailedPayload>;
    getMatchRecordings: () => void;
    getMatchRecording: EventHandler<MatchRecordingRequestPayload>;
    endMatch: EventHandler<EndMatchPayload>;
  }

  // Events forwarded between Socket.IO server instances (Redis adapter).
  interface InterServerEvents {
    "match:action": (payload: {
      matchId: string;
      playerId: string;
      socketId?: string;
      patch: unknown;
    }) => void;
    "match:join": (payload: {
      matchId: string;
      playerId: string;
      socketId: string;
    }) => void;
    "match:cleanup": (payload: {
      matchId: string;
      reason?: string;
    }) => void;
    [event: string]: (...args: unknown[]) => void;
  }

  interface SocketData {
    authUser?: {
      id: string;
      name?: string | null;
      email?: string | null;
    };
  }
}
