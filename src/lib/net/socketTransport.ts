"use client";

import { io, Socket } from "socket.io-client";
import { Protocol } from "@/lib/net/protocol";
import type { LobbyVisibility, ChatScope, DraftConfig } from "@/lib/net/protocol";
import type {
  GameTransport,
  TransportEvent,
  TransportEventMap,
  TransportHandler,
  StartMatchConfig,
  DraftState,
  CustomMessage,
} from "@/lib/net/transport";
import type { 
  CardPreviewEvent,
  StackInteractionEvent,
  UIUpdateEvent 
} from "@/types/draft-3d-events";

export class SocketTransport implements GameTransport {
  private handlers: Partial<Record<TransportEvent, Set<(payload: unknown) => void>>> = {};
  private socket?: Socket;

  private static getMessageType(m: unknown): string {
    if (m && typeof m === "object" && "type" in (m as Record<string, unknown>)) {
      const t = (m as Record<string, unknown>).type;
      return typeof t === "string" ? t : "unknown";
    }
    return "unknown";
  }

  async connect(opts: { playerId?: string; displayName: string }): Promise<void> {
    if (this.socket && this.socket.connected) return;

    // Prefer explicit env; otherwise pick a sensible default based on current dev port
    // If Next dev runs on 3002, we default WS to 3010 to avoid conflicts with other local apps
    const defaultUrl =
      typeof window !== "undefined" && window.location && window.location.port === "3002"
        ? "http://localhost:3010"
        : "http://localhost:3001";
    const url = process.env.NEXT_PUBLIC_WS_URL || defaultUrl;
    // Sanitize and fallback the display name to avoid validation issues
    const trimmed = (opts.displayName ?? "").trim();
    const finalName = (trimmed || "Player").slice(0, 40);
    console.log(`[Transport] Connecting to ${url} as ${finalName}${opts.playerId ? ` (${opts.playerId})` : ''}`);
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
            displayName: finalName,
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
      // Draft updates (server-emitted, custom payload)
      socket.on("draftUpdate", (payload) => {
        const s = payload as DraftState;
        const myPackSize = s.currentPacks && Array.isArray(s.currentPacks[0]) ? (s.currentPacks[0] as unknown[]).length : 0;
        console.log(`[Transport] draftUpdate <= phase=${s?.phase} pack=${s?.packIndex} pick=${s?.pickNumber} waitingFor=${(s?.waitingFor || []).length} (p1 pack ~${myPackSize})`);
        this.dispatch("draftUpdate", payload as unknown as TransportEventMap["draftUpdate"]);
      });
      socket.on("chat", (payload) =>
        this.dispatch("chat", Protocol.ServerChatPayload.parse(payload))
      );
      // Generic lightweight messages (e.g., draft ready toggles)
      socket.on("message", (payload) => {
        const m = payload as TransportEventMap["message"];
        const t = SocketTransport.getMessageType(m);
        console.log(`[Transport] message <= type=${t}`);
        this.dispatch("message", m);
      });
      socket.on("resyncResponse", (payload) =>
        this.dispatch("resync", Protocol.ResyncResponsePayload.parse(payload))
      );
      socket.on("error", (payload) =>
        this.dispatch("error", Protocol.ErrorPayload.parse(payload))
      );
      socket.on("connect_error", (err: unknown) => {
        this.dispatch("error", { message: String(err) });
      });

      // Draft-3D enhanced events for online integration
      socket.on("draft:card:preview", (payload) =>
        this.dispatch("draft:card:preview", payload)
      );
      socket.on("draft:card:preview_update", (payload) =>
        this.dispatch("draft:card:preview_update", payload)
      );
      socket.on("draft:stack:interact", (payload) =>
        this.dispatch("draft:stack:interact", payload)
      );
      socket.on("draft:stack:interaction_result", (payload) =>
        this.dispatch("draft:stack:interaction_result", payload)
      );
      socket.on("draft:stack:state_sync", (payload) =>
        this.dispatch("draft:stack:state_sync", payload)
      );
      socket.on("draft:ui:update", (payload) =>
        this.dispatch("draft:ui:update", payload)
      );
      socket.on("draft:ui:sync_batch", (payload) =>
        this.dispatch("draft:ui:sync_batch", payload)
      );
      socket.on("draft:session:join", (payload) =>
        this.dispatch("draft:session:join", payload)
      );
      socket.on("draft:session:joined", (payload) =>
        this.dispatch("draft:session:joined", payload)
      );
      socket.on("draft:session:leave", (payload) =>
        this.dispatch("draft:session:leave", payload)
      );
      socket.on("draft:error", (payload) =>
        this.dispatch("draft:error", payload)
      );
      socket.on("draft:system:reconnect", (payload) =>
        this.dispatch("draft:system:reconnect", payload)
      );
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

  startMatch(matchConfig?: StartMatchConfig): void {
    this.requireSocket().emit(
      "startMatch", 
      matchConfig ? matchConfig : Protocol.StartMatchPayload.parse({})
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

  // Generic lightweight message channel for transient signals (e.g., draft ready)
  sendMessage(msg: CustomMessage): void {
    const t = SocketTransport.getMessageType(msg);
    console.log(`[Transport] message -> type=${t}`);
    this.requireSocket().emit("message", msg);
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

  submitDeck(deck: unknown): void {
    this.requireSocket().emit("submitDeck", { deck });
  }

  // Draft-specific methods
  async startDraft(config: { matchId: string; draftConfig: DraftConfig }): Promise<void> {
    // Server currently derives match by socket's player; payload is optional
    console.log(`[Transport] startDraft -> match=${config.matchId} cfg=${JSON.stringify(config.draftConfig)}`);
    this.requireSocket().emit("startDraft", config);
  }

  makeDraftPick(config: { matchId: string; cardId: string; packIndex: number; pickNumber: number }): void {
    console.log(`[Transport] makeDraftPick -> cardId=${config.cardId} pack=${config.packIndex} pick=${config.pickNumber} match=${config.matchId}`);
    this.requireSocket().emit("makeDraftPick", config);
  }

  chooseDraftPack(config: { matchId: string; setChoice: string; packIndex: number }): void {
    console.log(`[Transport] chooseDraftPack -> pack=${config.packIndex} choice=${config.setChoice} match=${config.matchId}`);
    this.requireSocket().emit("chooseDraftPack", config);
  }

  // Draft-3D enhanced methods for online integration
  sendCardPreview(event: CardPreviewEvent): void {
    console.log(`[Transport] sendCardPreview -> cardId=${event.cardId} playerId=${event.playerId} type=${event.previewType}`);
    this.requireSocket().emit("draft:card:preview", event);
  }

  sendStackInteraction(event: StackInteractionEvent): void {
    console.log(`[Transport] sendStackInteraction -> type=${event.interactionType} cardIds=[${event.cardIds.join(',')}] playerId=${event.playerId}`);
    this.requireSocket().emit("draft:stack:interact", event);
  }

  sendUIUpdate(event: UIUpdateEvent): void {
    console.log(`[Transport] sendUIUpdate -> playerId=${event.playerId} updates=${event.uiUpdates.length}`);
    this.requireSocket().emit("draft:ui:update", event);
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

  // Generic methods for replay and other custom events
  emit(event: string, payload?: unknown): void {
    this.requireSocket().emit(event, payload);
  }

  // Generic on/off methods for arbitrary events (used by replay functionality)  
  // Note: This overloads the typed 'on' method for specific events
  onGeneric(event: string, handler: (payload: unknown) => void): void {
    if (!this.socket) return; // safely ignore if not connected
    this.socket.on(event, handler);
  }

  offGeneric(event: string, handler: (payload: unknown) => void): void {
    if (!this.socket) return; // safely ignore if not connected
    this.socket.off(event, handler);
  }
}
