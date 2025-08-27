"use client";

import { io, Socket } from "socket.io-client";
import { Protocol } from "@/lib/net/protocol";
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

    const url = process.env.NEXT_PUBLIC_WS_URL || "http://localhost:3001";
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

  sendChat(content: string): void {
    this.requireSocket().emit("chat", Protocol.ChatPayload.parse({ content }));
  }

  resync(): void {
    this.requireSocket().emit(
      "resyncRequest",
      Protocol.ResyncRequestPayload.parse({})
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
