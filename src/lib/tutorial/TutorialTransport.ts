"use client";

/**
 * TutorialTransport — A local GameTransport for tutorial lessons.
 *
 * Extends the LocalTransport pattern: no server, no Socket.IO.
 * Intercepts sendAction() to validate against the TutorialEngine's
 * current step. Scripted opponent actions are executed via the engine.
 */

import { Protocol } from "@/lib/net/protocol";
import type { LobbyVisibility, ChatScope } from "@/lib/net/protocol";
import type {
  GameTransport,
  TransportEvent,
  TransportEventMap,
  TransportHandler,
  StartMatchConfig,
} from "@/lib/net/transport";
import type { TutorialEngine } from "./TutorialEngine";
import type { TutorialAction } from "./types";

/**
 * Callback used by the TutorialTransport to map a raw game action
 * (the patch object from sendAction) into a TutorialAction that
 * the engine can validate. This keeps the transport decoupled from
 * the game store's internal patch format.
 */
export type ActionMapper = (rawAction: unknown) => TutorialAction | null;

export class TutorialTransport implements GameTransport {
  readonly isLocal = true;

  private handlers: Partial<
    Record<TransportEvent, Set<(payload: unknown) => void>>
  > = {};
  private connected = false;
  private lobbyId: string | null = null;
  private matchId: string | null = null;
  private you: { id: string; displayName: string } | null = null;

  private engine: TutorialEngine | null = null;
  private actionMapper: ActionMapper | null = null;

  /** Bind the tutorial engine after construction. */
  setEngine(engine: TutorialEngine, mapper: ActionMapper): void {
    this.engine = engine;
    this.actionMapper = mapper;
  }

  // ──────────────────── GameTransport implementation ────────────────────

  async connect(opts: {
    displayName: string;
    playerId?: string;
  }): Promise<void> {
    this.connected = true;
    const pid =
      opts.playerId || `tutorial_${Math.random().toString(36).slice(2, 10)}`;
    this.you = { id: pid, displayName: opts.displayName };
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
    const id = `tutorial-lobby-${Date.now()}`;
    this.lobbyId = id;
    const lobby = {
      id,
      hostId: this.you?.id || "tutorial",
      players: this.you ? [this.you] : [],
      status: "open" as const,
      maxPlayers: options?.maxPlayers ?? 2,
      visibility: (options?.visibility ?? "private") as LobbyVisibility,
    };
    this.dispatch(
      "lobbyUpdated",
      Protocol.LobbyUpdatedPayload.parse({ lobby })
    );
    return { lobbyId: id };
  }

  async joinLobby(lobbyId?: string): Promise<{ lobbyId: string }> {
    const id = lobbyId || `tutorial-lobby-${Date.now()}`;
    this.lobbyId = id;
    return { lobbyId: id };
  }

  async joinMatch(matchId: string): Promise<void> {
    this.matchId = matchId || `tutorial-match-${Date.now()}`;
    const match = {
      id: this.matchId,
      lobbyId: this.lobbyId ?? undefined,
      players: this.you ? [this.you] : [],
      status: "waiting",
      seed: Math.random().toString(36).slice(2, 10),
      matchType: "constructed" as const,
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
    void _ready;
  }

  startMatch(_matchConfig?: StartMatchConfig): void {
    if (!this.matchId) {
      void this.joinMatch(`tutorial-match-${Date.now()}`);
    }
  }

  /**
   * Core override: intercept player actions and validate them against the
   * tutorial engine. Valid actions are echoed as state patches; invalid
   * actions trigger hints.
   */
  sendAction(action: unknown): void {
    if (!this.connected) return;

    // If no engine bound, behave like a normal local transport
    if (!this.engine || !this.actionMapper) {
      this.echoAction(action);
      return;
    }

    const step = this.engine.getCurrentStep();
    if (!step) {
      // Lesson complete — allow free play
      this.echoAction(action);
      return;
    }

    if (step.type === "forced_action") {
      const tutorialAction = this.actionMapper(action);
      if (!tutorialAction) {
        // Couldn't parse — ignore
        return;
      }

      if (this.engine.validateAction(tutorialAction)) {
        // Valid — echo the action so the game store picks it up
        this.echoAction(action);
      }
      // If invalid, the engine already emitted a hint via events
    } else {
      // Non-forced steps: echo normally (narration, highlight, etc.)
      this.echoAction(action);
    }
  }

  mulliganDone(): void {
    // no-op
  }

  sendChat(content: string, scope?: ChatScope): void {
    const payload = {
      from: this.you ?? null,
      content,
      scope: scope ?? ("match" as ChatScope),
    };
    this.dispatch("chat", Protocol.ServerChatPayload.parse(payload));
  }

  resync(): void {
    const snapshot = {};
    this.dispatch(
      "resync",
      Protocol.ResyncResponsePayload.parse({ snapshot })
    );
  }

  requestLobbies(): void {
    this.dispatch(
      "lobbiesUpdated",
      Protocol.LobbiesUpdatedPayload.parse({ lobbies: [] })
    );
  }

  requestPlayers(): void {
    const players = this.you ? [this.you] : [];
    this.dispatch("playerList", Protocol.PlayerListPayload.parse({ players }));
  }

  setLobbyVisibility(_visibility: LobbyVisibility): void {
    // no-op
  }

  inviteToLobby(_targetPlayerId: string, _lobbyId?: string): void {
    // no-op
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

  // ──────────────────── Internal ────────────────────

  private echoAction(action: unknown): void {
    const t = Date.now();
    this.dispatch(
      "statePatch",
      Protocol.StatePatchPayload.parse({ patch: action, t })
    );
  }

  private dispatch<E extends TransportEvent>(
    event: E,
    payload: TransportEventMap[E]
  ): void {
    const set = this.handlers[event];
    if (!set) return;
    for (const h of Array.from(set)) {
      try {
        h(payload as unknown);
      } catch {
        // swallow handler errors
      }
    }
  }
}
