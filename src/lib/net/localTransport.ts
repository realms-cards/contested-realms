"use client";

import type {
  InteractionEnvelope,
  InteractionRequestMessage,
  InteractionResponseMessage,
} from "@/lib/net/interactions";
import { wrapInteractionMessage } from "@/lib/net/interactions";
import { Protocol } from "@/lib/net/protocol";
import type { LobbyVisibility, ChatScope } from "@/lib/net/protocol";
import type {
  GameTransport,
  TransportEvent,
  TransportEventMap,
  TransportHandler,
  StartMatchConfig,
} from "@/lib/net/transport";

// Local, in-memory transport that simulates a server by immediately
// echoing actions as state patches and providing minimal lobby/match shims.
export class LocalTransport implements GameTransport {
  /** Identifies this as a local/offline transport - no server, no seat validation needed */
  readonly isLocal = true;

  private handlers: Partial<
    Record<TransportEvent, Set<(payload: unknown) => void>>
  > = {};
  private connected = false;
  private lobbyId: string | null = null;
  private matchId: string | null = null;
  private you: { id: string; displayName: string } | null = null;
  private pendingStartConfig?: StartMatchConfig;

  async connect(opts: {
    displayName: string;
    playerId?: string;
  }): Promise<void> {
    this.connected = true;
    const pid =
      opts.playerId || `local_${Math.random().toString(36).slice(2, 10)}`;
    this.you = { id: pid, displayName: opts.displayName };
    // Immediately emit a welcome event
    this.dispatch("welcome", Protocol.WelcomePayload.parse({ you: this.you }));
  }

  disconnect(): void {
    this.connected = false;
    this.lobbyId = null;
    this.matchId = null;
  }

  async createLobby(options?: {
    visibility?: LobbyVisibility;
    maxPlayers?: number;
  }): Promise<{ lobbyId: string }> {
    const id = `local-lobby-${Date.now()}`;
    this.lobbyId = id;
    const lobby = {
      id,
      hostId: this.you?.id || "local",
      players: this.you ? [this.you] : [],
      status: "open" as const,
      maxPlayers: options?.maxPlayers ?? 2,
      visibility: options?.visibility ?? "private",
    };
    this.dispatch(
      "lobbyUpdated",
      Protocol.LobbyUpdatedPayload.parse({ lobby })
    );
    return { lobbyId: id };
  }

  async joinLobby(lobbyId?: string): Promise<{ lobbyId: string }> {
    const id = lobbyId || `local-lobby-${Date.now()}`;
    this.lobbyId = id;
    const lobby = {
      id,
      hostId: this.you?.id || "local",
      players: this.you ? [this.you] : [],
      status: "open" as const,
      maxPlayers: 2,
      visibility: "private" as const,
    };
    // Mirror SocketTransport semantics: emit lobbyUpdated on join
    this.dispatch(
      "lobbyUpdated",
      Protocol.LobbyUpdatedPayload.parse({ lobby })
    );
    return { lobbyId: id };
  }

  async joinMatch(matchId: string): Promise<void> {
    this.matchId = matchId || `local-match-${Date.now()}`;
    const cfg = this.pendingStartConfig;
    this.pendingStartConfig = undefined;
    const isSealed = cfg?.matchType === "sealed" && !!cfg?.sealedConfig;
    const sealedCfg = cfg?.sealedConfig;
    const sealedConfig =
      isSealed && sealedCfg
        ? {
            packCount: sealedCfg.packCount,
            setMix: sealedCfg.setMix,
            timeLimit: sealedCfg.timeLimit,
            // Preserve extended optional fields
            packCounts: sealedCfg.packCounts,
            replaceAvatars: sealedCfg.replaceAvatars,
            // constructionStartTime optional; omit unless needed
          }
        : undefined;
    const match = {
      id: this.matchId,
      lobbyId: this.lobbyId ?? undefined,
      players: this.you ? [this.you] : [],
      status: isSealed ? "deck_construction" : "waiting",
      seed: Math.random().toString(36).slice(2, 10),
      matchType: cfg?.matchType,
      sealedConfig,
    };
    this.dispatch(
      "matchStarted",
      Protocol.MatchStartedPayload.parse({ match })
    );
  }

  leaveMatch(): void {
    this.matchId = null;
  }

  leaveLobby(): void {
    this.lobbyId = null;
  }

  ready(_ready: boolean): void {
    // no-op in local transport
    void _ready;
  }

  startMatch(matchConfig?: StartMatchConfig): void {
    this.pendingStartConfig = matchConfig;
    if (!this.matchId) {
      // Fire-and-forget; joinMatch will dispatch matchStarted
      void this.joinMatch(`local-match-${Date.now()}`);
    }
  }

  sendAction(action: unknown): void {
    if (!this.connected) return;
    const t = Date.now();
    // Echo the patch immediately as if the server validated/broadcasted it
    this.dispatch(
      "statePatch",
      Protocol.StatePatchPayload.parse({ patch: action, t })
    );
  }

  // Explicit mulligan completion signal (per-player)
  mulliganDone(): void {
    // no-op for local play
  }

  sendChat(content: string, scope?: ChatScope): void {
    const payload = {
      from: this.you ?? null,
      content,
      scope: scope ?? "match",
    };
    this.dispatch("chat", Protocol.ServerChatPayload.parse(payload));
  }

  sendInteractionEnvelope(envelope: InteractionEnvelope): void {
    this.dispatch("interaction", envelope);
    const message = envelope.message;
    if (message.type === "interaction:request") {
      this.dispatch("interaction:request", message);
    } else {
      this.dispatch("interaction:response", message);
    }
  }

  sendInteractionRequest(message: InteractionRequestMessage): void {
    const envelope = wrapInteractionMessage(message);
    this.sendInteractionEnvelope(envelope);
  }

  sendInteractionResponse(message: InteractionResponseMessage): void {
    const envelope = wrapInteractionMessage(message);
    this.sendInteractionEnvelope(envelope);
  }

  resync(): void {
    // Provide an empty snapshot; consumers may ignore for local play
    const snapshot = {};
    this.dispatch("resync", Protocol.ResyncResponsePayload.parse({ snapshot }));
  }

  requestLobbies(): void {
    const lobbies =
      this.lobbyId && this.you
        ? [
            {
              id: this.lobbyId,
              hostId: this.you.id,
              players: [this.you],
              status: "open" as const,
              maxPlayers: 2,
              visibility: "private" as const,
            },
          ]
        : [];
    this.dispatch(
      "lobbiesUpdated",
      Protocol.LobbiesUpdatedPayload.parse({ lobbies })
    );
  }

  requestPlayers(): void {
    const players = this.you ? [this.you] : [];
    this.dispatch("playerList", Protocol.PlayerListPayload.parse({ players }));
  }

  setLobbyVisibility(visibility: LobbyVisibility): void {
    if (!this.lobbyId || !this.you) return;
    const lobby = {
      id: this.lobbyId,
      hostId: this.you.id,
      players: [this.you],
      status: "open" as const,
      maxPlayers: 2,
      visibility,
    };
    this.dispatch(
      "lobbyUpdated",
      Protocol.LobbyUpdatedPayload.parse({ lobby })
    );
  }

  inviteToLobby(_targetPlayerId: string, _lobbyId?: string): void {
    // local mode: no-op
    void _targetPlayerId;
    void _lobbyId;
  }

  on<E extends TransportEvent>(
    event: E,
    handler: TransportHandler<E>
  ): () => void {
    const set = (this.handlers[event] ??= new Set());
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
    for (const h of Array.from(set)) {
      try {
        h(payload as unknown);
      } catch {
        // swallow handler errors to avoid breaking others
      }
    }
  }
}
