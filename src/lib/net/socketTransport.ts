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
  private reconnectionAttempts = 0;
  private maxReconnectionAttempts = 5;
  private reconnectionDelay = 1000; // Start with 1 second
  private connectionState: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' = 'disconnected';
  private isIntentionalDisconnect = false;

  private static getMessageType(m: unknown): string {
    if (m && typeof m === "object" && "type" in (m as Record<string, unknown>)) {
      const t = (m as Record<string, unknown>).type;
      return typeof t === "string" ? t : "unknown";
    }
    return "unknown";
  }

  async connect(opts: { playerId?: string; displayName: string }): Promise<void> {
    if (this.socket && this.socket.connected) return;
    
    this.connectionState = 'connecting';
    this.isIntentionalDisconnect = false;

    // Prefer explicit env; otherwise use the standard local Socket.IO dev port (3010)
    // Client runs on 3000/3002; signaling server on 3010.
    const defaultUrl = "http://localhost:3010";
    const url = process.env.NEXT_PUBLIC_WS_URL || defaultUrl;
    const path = process.env.NEXT_PUBLIC_WS_PATH || undefined;
    const transportsEnv = (process.env.NEXT_PUBLIC_WS_TRANSPORTS || 'websocket')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean) as Array<'polling' | 'websocket'>;
    // Sanitize and fallback the display name to avoid validation issues
    const trimmed = (opts.displayName ?? "").trim();
    const finalName = (trimmed || "Player").slice(0, 40);
    console.log(`[Transport] Connecting to ${url} as ${finalName}${opts.playerId ? ` (${opts.playerId})` : ''}`);
    const socket = io(url, {
      transports: transportsEnv.length ? transportsEnv : ["websocket"],
      autoConnect: true,
      path,
    }) as Socket;

    this.socket = socket;
    this.setupReconnectionHandlers(socket, opts);

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
      socket.on("connect", () => {
        this.connectionState = 'connected';
        this.reconnectionAttempts = 0;
        this.reconnectionDelay = 1000;
        sendHello();
      });
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
        console.warn(`[Transport] Connection error:`, err);
        this.connectionState = 'disconnected';
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

      // Tournament events
      socket.on("tournamentCreated", (payload) =>
        this.dispatch("tournamentCreated", payload)
      );
      socket.on("tournamentUpdated", (payload) =>
        this.dispatch("tournamentUpdated", payload)
      );
      socket.on("tournamentJoined", (payload) =>
        this.dispatch("tournamentJoined", payload)
      );
      socket.on("tournamentLeft", (payload) =>
        this.dispatch("tournamentLeft", payload)
      );
      socket.on("tournamentStarted", (payload) =>
        this.dispatch("tournamentStarted", payload)
      );
      socket.on("tournamentRoundStarted", (payload) =>
        this.dispatch("tournamentRoundStarted", payload)
      );
      socket.on("tournamentMatchReady", (payload) =>
        this.dispatch("tournamentMatchReady", payload)
      );
      socket.on("tournamentCompleted", (payload) =>
        this.dispatch("tournamentCompleted", payload)
      );
      socket.on("tournamentsListUpdated", (payload) =>
        this.dispatch("tournamentsListUpdated", payload)
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
    this.isIntentionalDisconnect = true;
    this.connectionState = 'disconnected';
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

  async createLobby(options?: { name?: string; visibility?: LobbyVisibility; maxPlayers?: number }): Promise<{ lobbyId: string }> {
    const s = this.requireSocket();
    const name = options?.name;
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
        Protocol.CreateLobbyPayload.parse({ name, visibility, maxPlayers })
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

  setLobbyPlan(planned: "constructed" | "sealed" | "draft"): void {
    this.requireSocket().emit(
      "setLobbyPlan",
      Protocol.SetLobbyPlanPayload.parse({ plannedMatchType: planned })
    );
  }

  addCpuBot(displayName?: string): void {
    // Host-only server handler will validate permissions.
    // Optional displayName allows picking a difficulty label.
    this.requireSocket().emit("addCpuBot", displayName ? { displayName } : {});
  }

  removeCpuBot(playerId?: string): void {
    // Host-only server handler will validate permissions.
    this.requireSocket().emit("removeCpuBot", playerId ? { playerId } : {});
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

  // Tournament methods implementation
  async createTournament(config: {
    name: string;
    format: "swiss" | "elimination" | "round_robin";
    matchType: "constructed" | "sealed" | "draft";
    maxPlayers: number;
    sealedConfig?: unknown;
    draftConfig?: unknown;
  }): Promise<{ tournamentId: string }> {
    const s = this.requireSocket();
    return new Promise((resolve, reject) => {
      const onCreated = (payload: unknown) => {
        const tournament = payload as { id: string };
        s.off("tournamentCreated", onCreated);
        resolve({ tournamentId: tournament.id });
      };
      const onError = (error: unknown) => {
        s.off("error", onError);
        reject(error);
      };
      s.on("tournamentCreated", onCreated);
      s.on("error", onError);
      s.emit("createTournament", config);
    });
  }

  async joinTournament(tournamentId: string, displayName?: string): Promise<void> {
    const s = this.requireSocket();
    return new Promise((resolve, reject) => {
      const onJoined = (payload: unknown) => {
        const data = payload as { tournamentId: string };
        if (data.tournamentId === tournamentId) {
          s.off("tournamentJoined", onJoined);
          resolve();
        }
      };
      const onError = (error: unknown) => {
        s.off("error", onError);
        reject(error);
      };
      s.on("tournamentJoined", onJoined);
      s.on("error", onError);
      s.emit("joinTournament", { tournamentId, displayName });
    });
  }

  async leaveTournament(tournamentId: string): Promise<void> {
    const s = this.requireSocket();
    return new Promise((resolve, reject) => {
      const onLeft = (payload: unknown) => {
        const data = payload as { tournamentId: string };
        if (data.tournamentId === tournamentId) {
          s.off("tournamentLeft", onLeft);
          resolve();
        }
      };
      const onError = (error: unknown) => {
        s.off("error", onError);
        reject(error);
      };
      s.on("tournamentLeft", onLeft);
      s.on("error", onError);
      s.emit("leaveTournament", { tournamentId });
    });
  }

  async startTournament(tournamentId: string): Promise<void> {
    const s = this.requireSocket();
    return new Promise((resolve, reject) => {
      const onStarted = (payload: unknown) => {
        const data = payload as { tournamentId: string };
        if (data.tournamentId === tournamentId) {
          s.off("tournamentStarted", onStarted);
          resolve();
        }
      };
      const onError = (error: unknown) => {
        s.off("error", onError);
        reject(error);
      };
      s.on("tournamentStarted", onStarted);
      s.on("error", onError);
      s.emit("startTournament", { tournamentId });
    });
  }

  requestTournaments(): void {
    console.log(`[Transport] Requesting tournaments list`);
    this.requireSocket().emit("requestTournaments", {});
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

  private setupReconnectionHandlers(socket: Socket, opts: { playerId?: string; displayName: string }): void {
    socket.on('disconnect', (reason: string) => {
      console.log(`[Transport] Disconnected: ${reason}`);
      this.connectionState = 'disconnected';
      
      if (!this.isIntentionalDisconnect && reason === 'io server disconnect') {
        // Server initiated disconnect, attempt reconnection
        this.attemptReconnection(opts);
      } else if (!this.isIntentionalDisconnect && reason === 'transport close') {
        // Network issue, attempt reconnection
        this.attemptReconnection(opts);
      }
    });

    socket.on('reconnect', (attemptNumber: number) => {
      console.log(`[Transport] Reconnected after ${attemptNumber} attempts`);
      this.connectionState = 'connected';
      this.reconnectionAttempts = 0;
    });

    socket.on('reconnect_error', (error: Error) => {
      console.warn(`[Transport] Reconnection error:`, error);
      this.connectionState = 'disconnected';
    });

    socket.on('reconnect_failed', () => {
      console.error('[Transport] All reconnection attempts failed');
      this.connectionState = 'disconnected';
      this.dispatch('error', { message: 'Failed to reconnect to server' });
    });
  }

  private attemptReconnection(opts: { playerId?: string; displayName: string }): void {
    if (this.reconnectionAttempts >= this.maxReconnectionAttempts) {
      console.error('[Transport] Max reconnection attempts reached');
      return;
    }

    this.connectionState = 'reconnecting';
    this.reconnectionAttempts++;
    
    console.log(`[Transport] Attempting reconnection ${this.reconnectionAttempts}/${this.maxReconnectionAttempts} in ${this.reconnectionDelay}ms`);
    
    setTimeout(() => {
      if (this.connectionState === 'reconnecting' && !this.isIntentionalDisconnect) {
        this.connect(opts).catch(error => {
          console.warn(`[Transport] Reconnection attempt ${this.reconnectionAttempts} failed:`, error);
          // Exponential backoff
          this.reconnectionDelay = Math.min(this.reconnectionDelay * 2, 30000);
        });
      }
    }, this.reconnectionDelay);
  }

  private requireSocket(): Socket {
    if (!this.socket || !this.socket.connected) {
      throw new Error(`Socket not connected (state: ${this.connectionState})`);
    }
    return this.socket;
  }

  getConnectionState(): 'disconnected' | 'connecting' | 'connected' | 'reconnecting' {
    return this.connectionState;
  }

  isConnected(): boolean {
    return this.connectionState === 'connected' && this.socket?.connected === true;
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
