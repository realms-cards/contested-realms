"use client";

import { io, Socket } from "socket.io-client";
import { Protocol } from "@/lib/net/protocol";
import type { LobbyVisibility, ChatScope } from "@/lib/net/protocol";
import type {
  GameTransport,
  TransportEvent,
  TransportEventMap,
  TransportHandler,
} from "@/lib/net/transport";

export class SocketTransport implements GameTransport {
  private handlers: Partial<Record<TransportEvent, Set<(payload: unknown) => void>>> = {};
  private socket?: Socket;

  async connect(opts: { playerId?: string; displayName: string }): Promise<void> {
    if (this.socket && this.socket.connected) return;

    // Prefer explicit env; otherwise pick a sensible default based on current dev port
    // If Next dev runs on 3002, we default WS to 3010 to avoid conflicts with other local apps
    const defaultUrl =
      typeof window !== "undefined" && window.location && window.location.port === "3002"
        ? "http://localhost:3010"
        : "http://localhost:3001";
    const url = process.env.NEXT_PUBLIC_WS_URL || defaultUrl;
    const socket = io(url, {
      transports: ["websocket"],
      autoConnect: true,
    }) as Socket;

    this.socket = socket;

    await new Promise<void>((resolve, reject) => {
      let resolved = false;
      const sendHello = () => {
        socket.emit(
          "hello",
          Protocol.HelloPayload.parse({
            displayName: opts.displayName,
            playerId: opts.playerId,
          })
        );
        if (!resolved) {
          resolved = true;
          resolve();
        }
      };
      const onError = (err: unknown) => {
        if (!resolved) reject(err);
      };

      // Send hello on every connect (initial and reconnects)
      socket.on("connect", sendHello);
      socket.once("connect_error", onError);

      // Wire server events
      socket.on("welcome", (payload) =>
        this.dispatch("welcome", Protocol.WelcomePayload.parse(payload))
      );
      socket.on("lobbyUpdated", (payload) =>
        this.dispatch(
          "lobbyUpdated",
          Protocol.LobbyUpdatedPayload.parse(payload)
        )
      );
      socket.on("joinedLobby", (payload) =>
        this.dispatch(
          "lobbyUpdated",
          Protocol.JoinedLobbyPayload.parse(payload)
        )
      );
      socket.on("lobbiesUpdated", (payload) =>
        this.dispatch(
          "lobbiesUpdated",
          Protocol.LobbiesUpdatedPayload.parse(payload)
        )
      );
      socket.on("playerList", (payload) =>
        this.dispatch(
          "playerList",
          Protocol.PlayerListPayload.parse(payload)
        )
      );
      socket.on("lobbyInvite", (payload) =>
        this.dispatch(
          "lobbyInvite",
          Protocol.LobbyInvitePayload.parse(payload)
        )
      );
      socket.on("matchStarted", (payload) =>
        this.dispatch(
          "matchStarted",
          Protocol.MatchStartedPayload.parse(payload)
        )
      );
      socket.on("statePatch", (payload) =>
        this.dispatch("statePatch", Protocol.StatePatchPayload.parse(payload))
      );
      socket.on("chat", (payload) =>
        this.dispatch("chat", Protocol.ServerChatPayload.parse(payload))
      );
      socket.on("resyncResponse", (payload) =>
        this.dispatch("resync", Protocol.ResyncResponsePayload.parse(payload))
      );
      socket.on("error", (payload) =>
        this.dispatch("error", Protocol.ErrorPayload.parse(payload))
      );
      socket.on("connect_error", (err: unknown) => {
        this.dispatch("error", { message: String(err) });
      });
    });
  }

  leaveLobby(): void {
    this.requireSocket().emit(
      "leaveLobby",
      Protocol.LeaveLobbyPayload.parse({})
    );
  }

  disconnect(): void {
    if (!this.socket) return;
    this.socket.disconnect();
    this.socket = undefined;
  }

  async joinLobby(lobbyId?: string): Promise<{ lobbyId: string }> {
    const s = this.requireSocket();

    return new Promise((resolve) => {
      const onJoin = (payload: unknown) => {
        const parsed = Protocol.JoinedLobbyPayload.parse(payload);
        this.dispatch("lobbyUpdated", parsed);
        s.off("joinedLobby", onJoin);
        resolve({ lobbyId: parsed.lobby.id });
      };
      s.on("joinedLobby", onJoin);
      s.emit("joinLobby", Protocol.JoinLobbyPayload.parse({ lobbyId }));
    });
  }

  async createLobby(options?: { visibility?: LobbyVisibility; maxPlayers?: number }): Promise<{ lobbyId: string }> {
    const s = this.requireSocket();
    const visibility = options?.visibility;
    const maxPlayers = options?.maxPlayers;
    return new Promise((resolve) => {
      const onJoin = (payload: unknown) => {
        const parsed = Protocol.JoinedLobbyPayload.parse(payload);
        this.dispatch("lobbyUpdated", parsed);
        s.off("joinedLobby", onJoin);
        resolve({ lobbyId: parsed.lobby.id });
      };
      s.on("joinedLobby", onJoin);
      s.emit(
        "createLobby",
        Protocol.CreateLobbyPayload.parse({ visibility, maxPlayers })
      );
    });
  }

  async joinMatch(matchId: string): Promise<void> {
    const s = this.requireSocket();
    return new Promise((resolve) => {
      const onMatch = (payload: unknown) => {
        const parsed = Protocol.MatchStartedPayload.parse(payload);
        this.dispatch("matchStarted", parsed);
        s.off("matchStarted", onMatch);
        resolve();
      };
      s.on("matchStarted", onMatch);
      s.emit("joinMatch", Protocol.JoinMatchPayload.parse({ matchId }));
    });
  }

  leaveMatch(): void {
    this.requireSocket().emit("leaveMatch", Protocol.LeaveMatchPayload.parse({}));
  }

  ready(ready: boolean): void {
    this.requireSocket().emit("ready", Protocol.ReadyPayload.parse({ ready }));
  }

  startMatch(): void {
    this.requireSocket().emit(
      "startMatch",
      Protocol.StartMatchPayload.parse({})
    );
  }

  sendAction(action: unknown): void {
    this.requireSocket().emit(
      "action",
      Protocol.ActionPayload.parse({ action })
    );
  }

  // Explicit mulligan completion signal (per-player)
  mulliganDone(): void {
    this.requireSocket().emit(
      "mulliganDone",
      Protocol.MulliganDonePayload.parse({})
    );
  }

  sendChat(content: string, scope?: ChatScope): void {
    this.requireSocket().emit("chat", Protocol.ChatPayload.parse({ content, scope }));
  }

  resync(): void {
    this.requireSocket().emit(
      "resyncRequest",
      Protocol.ResyncRequestPayload.parse({})
    );
  }

  requestLobbies(): void {
    this.requireSocket().emit(
      "requestLobbies",
      Protocol.RequestLobbiesPayload.parse({})
    );
  }

  requestPlayers(): void {
    this.requireSocket().emit(
      "requestPlayers",
      Protocol.RequestPlayersPayload.parse({})
    );
  }

  setLobbyVisibility(visibility: LobbyVisibility): void {
    this.requireSocket().emit(
      "setLobbyVisibility",
      Protocol.SetLobbyVisibilityPayload.parse({ visibility })
    );
  }

  inviteToLobby(targetPlayerId: string, lobbyId?: string): void {
    this.requireSocket().emit(
      "inviteToLobby",
      Protocol.InviteToLobbyPayload.parse({ targetPlayerId, lobbyId })
    );
  }

  on<E extends TransportEvent>(
    event: E,
    handler: TransportHandler<E>
  ): () => void {
    const set = (this.handlers[event] ??= new Set());
    // Store as unknown-typed wrapper to satisfy our internal map
    const wrapper: (payload: unknown) => void = (payload) =>
      handler(payload as TransportEventMap[E]);
    set.add(wrapper);
    return () => set.delete(wrapper);
  }

  private dispatch<E extends TransportEvent>(
    event: E,
    payload: TransportEventMap[E]
  ) {
    const set = this.handlers[event];
    if (!set) return;
    for (const h of Array.from(set)) h(payload as unknown);
  }

  private requireSocket(): Socket {
    if (!this.socket) throw new Error("Socket not connected");
    return this.socket;
  }
}
