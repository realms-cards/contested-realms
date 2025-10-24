"use strict";

import type { Redis } from "ioredis";
import type { Server as SocketIOServer } from "socket.io";

import type { AnyRecord, LobbyState, ServerMatchState } from "../types";

export interface PubSubListenerDeps {
  subscriber: Redis | null;
  io: SocketIOServer;
  instanceId: string;
  channels: {
    matchControl: string;
    lobbyControl: string;
    lobbyState: string;
    draftState: string;
  };
  isClusterReady: () => boolean;
  safeErrorMessage: (err: unknown) => unknown;
  getOrClaimMatchLeader: (matchId: string) => Promise<string | null>;
  ensurePlayerCached: (playerId: string) => Promise<unknown>;
  leaderJoinMatch: (
    matchId: string,
    playerId: string,
    socketId: string
  ) => Promise<void>;
  leaderApplyAction: (
    matchId: string,
    playerId: string,
    patch: AnyRecord | null,
    socketId: string | null
  ) => Promise<void>;
  leaderHandleInteractionRequest: (
    matchId: string,
    playerId: string,
    payload: AnyRecord | null
  ) => Promise<unknown>;
  leaderHandleInteractionResponse: (
    matchId: string,
    playerId: string,
    payload: AnyRecord | null
  ) => Promise<unknown>;
  leaderDraftPlayerReady: (
    matchId: string,
    playerId: string,
    ready: boolean
  ) => Promise<void>;
  getOrLoadMatch: (
    matchId: string
  ) => Promise<ServerMatchState | null | undefined>;
  leaderStartDraft: (
    matchId: string,
    playerId: string,
    draftConfig: AnyRecord | null,
    socketId: string | null
  ) => Promise<void>;
  leaderMakeDraftPick: (
    matchId: string,
    playerId: string,
    payload: { cardId: unknown; packIndex: number; pickNumber: number }
  ) => Promise<void>;
  leaderChooseDraftPack: (
    matchId: string,
    playerId: string,
    payload: { setChoice: unknown; packIndex: number }
  ) => Promise<void>;
  leaderHandleMulliganDone: (
    matchId: string,
    playerId: string
  ) => Promise<void>;
  cleanupMatchNow: (
    matchId: string,
    reason: string,
    force: boolean
  ) => Promise<void>;
  getOrClaimLobbyLeader: () => Promise<string | null>;
  handleLobbyControlAsLeader: (payload: AnyRecord) => Promise<void>;
  upsertLobbyFromSerialized: (payload: AnyRecord) => void;
  lobbies: Map<string, LobbyState>;
}

export function registerPubSubListeners({
  subscriber,
  io,
  instanceId,
  channels,
  isClusterReady,
  safeErrorMessage,
  getOrClaimMatchLeader,
  ensurePlayerCached,
  leaderJoinMatch,
  leaderApplyAction,
  leaderHandleInteractionRequest,
  leaderHandleInteractionResponse,
  leaderDraftPlayerReady,
  getOrLoadMatch,
  leaderStartDraft,
  leaderMakeDraftPick,
  leaderChooseDraftPack,
  leaderHandleMulliganDone,
  cleanupMatchNow,
  getOrClaimLobbyLeader,
  handleLobbyControlAsLeader,
  upsertLobbyFromSerialized,
  lobbies,
}: PubSubListenerDeps): void {
  if (!subscriber) return;

  const { matchControl, lobbyControl, lobbyState, draftState } = channels;

  const logSubscribeError =
    (channel: string) =>
    (err: Error | null | undefined, _result: unknown): void => {
      if (!err) return;
      try {
        console.warn(
          `[store] subscribe ${channel} failed:`,
          safeErrorMessage(err)
        );
      } catch {
        // Swallow logging errors
      }
    };

  try {
    subscriber.subscribe(matchControl, logSubscribeError(matchControl));
    subscriber.subscribe(lobbyControl, logSubscribeError(lobbyControl));
    subscriber.subscribe(lobbyState, logSubscribeError(lobbyState));
    subscriber.subscribe(draftState, logSubscribeError(draftState));
  } catch {
    // Ignore subscription errors at bootstrap; message handler will guard on readiness.
  }

  subscriber.on("message", async (channel: string, message: string) => {
    if (!isClusterReady()) return;

    let payload: AnyRecord | null = null;
    try {
      payload = JSON.parse(message) as AnyRecord;
    } catch {
      return;
    }

    if (channel === matchControl) {
      const msg = payload as AnyRecord;
      const msgType =
        msg && typeof msg === "object" && typeof msg.type === "string"
          ? msg.type
          : null;
      if (!msgType) return;
      const { matchId } = msg as { matchId?: string };
      if (!matchId) return;

      try {
        const leader = await getOrClaimMatchLeader(matchId);
        if (leader !== instanceId) return;
      } catch {
        return;
      }

      try {
        if (msgType === "join" && msg.playerId && msg.socketId) {
          await ensurePlayerCached(String(msg.playerId));
          await leaderJoinMatch(
            matchId,
            String(msg.playerId),
            String(msg.socketId)
          );
        } else if (msgType === "action" && msg.playerId) {
          await leaderApplyAction(
            matchId,
            String(msg.playerId),
            (msg.patch as AnyRecord | null) ?? null,
            (msg.socketId as string | null) ?? null
          );
        } else if (msgType === "interaction:request" && msg.playerId) {
          await leaderHandleInteractionRequest(
            matchId,
            String(msg.playerId),
            (msg.payload as AnyRecord | null) ?? null
          );
        } else if (msgType === "interaction:response" && msg.playerId) {
          await leaderHandleInteractionResponse(
            matchId,
            String(msg.playerId),
            (msg.payload as AnyRecord | null) ?? null
          );
        } else if (
          msgType === "draft:playerReady" &&
          typeof msg.ready === "boolean" &&
          msg.playerId
        ) {
          await leaderDraftPlayerReady(
            matchId,
            String(msg.playerId),
            Boolean(msg.ready)
          );
        } else if (msgType === "draft:start" && msg.playerId) {
          const match = await getOrLoadMatch(matchId);
          if (!match || match.matchType !== "draft" || !match.draftState) {
            return;
          }
          if (match.draftState.phase !== "waiting") {
            try {
              io.to(`match:${match.id}`).emit("draftUpdate", match.draftState);
            } catch {
              // Ignore emission failures
            }
          } else {
            await leaderStartDraft(
              matchId,
              String(msg.playerId),
              (msg.draftConfig as AnyRecord | null) ?? null,
              (msg.socketId as string | null) ?? null
            );
          }
        } else if (msgType === "draft:pick" && msg.playerId && msg.cardId) {
          await leaderMakeDraftPick(matchId, String(msg.playerId), {
            cardId: msg.cardId,
            packIndex: Number(msg.packIndex || 0),
            pickNumber: Number(msg.pickNumber || 1),
          });
        } else if (
          msgType === "draft:choosePack" &&
          msg.playerId &&
          msg.setChoice
        ) {
          await leaderChooseDraftPack(matchId, String(msg.playerId), {
            setChoice: msg.setChoice,
            packIndex: Number(msg.packIndex || 0),
          });
        } else if (msgType === "mulligan:done" && msg.playerId) {
          await leaderHandleMulliganDone(matchId, String(msg.playerId));
        } else if (msgType === "match:cleanup" && msg.reason) {
          await cleanupMatchNow(
            matchId,
            String(msg.reason),
            Boolean(msg.force)
          );
        }
      } catch (err) {
        try {
          console.warn(
            "[match:control] handler error:",
            safeErrorMessage(err)
          );
        } catch {
          // Ignore logging errors
        }
      }

      return;
    }

    if (channel === draftState) {
      try {
        const { sessionId, draftState: draftPayload, instanceId: origin } =
          (payload as {
            sessionId?: string;
            draftState?: AnyRecord;
            instanceId?: string;
          }) || {};
        if (!sessionId) return;
        if (origin && origin === instanceId) return;
        io.to(`draft:${sessionId}`).emit("draftUpdate", draftPayload);
      } catch (err) {
        try {
          console.warn(
            "[draft] failed to forward state:",
            safeErrorMessage(err)
          );
        } catch {
          // Ignore logging errors
        }
      }
      return;
    }

    if (channel === lobbyControl) {
      const msg = payload as AnyRecord;
      const msgType =
        msg && typeof msg === "object" && typeof msg.type === "string"
          ? msg.type
          : null;
      if (!msgType) return;
      try {
        const leader = await getOrClaimLobbyLeader();
        if (leader !== instanceId) return;
      } catch {
        return;
      }
      try {
        await handleLobbyControlAsLeader(msg as AnyRecord);
      } catch (err) {
        try {
          console.warn(
            "[lobby:control] handler error:",
            safeErrorMessage(err)
          );
        } catch {
          // Ignore logging errors
        }
      }
      return;
    }

    if (channel === lobbyState) {
      const msg = payload as AnyRecord;
      if (!msg || typeof msg !== "object") return;
      const msgType =
        typeof msg.type === "string" ? (msg.type as string) : null;
      if (
        msgType === "upsert" &&
        msg.lobby &&
        typeof msg.lobby === "object" &&
        msg.lobby !== null &&
        "id" in msg.lobby
      ) {
        try {
          upsertLobbyFromSerialized(msg.lobby as AnyRecord);
        } catch {
          // Ignore deserialization failures
        }
      } else if (msgType === "delete") {
        const lobbyId = msg.id;
        if (typeof lobbyId !== "string" && typeof lobbyId !== "number") {
          return;
        }
        try {
          lobbies.delete(String(lobbyId));
        } catch {
          // Ignore deletion failures
        }
      }
    }
  });
}
