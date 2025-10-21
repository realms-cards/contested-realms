"use strict";

import type { IncomingMessage, ServerResponse } from "http";

import type { AnyRecord, PlayerState } from "../types";

export interface RequestHandlerDeps {
  io: import("socket.io").Server;
  serverConfig: {
    corsOrigins: string[];
  };
  isReady: () => boolean;
  collectMetricsSnapshot: () => AnyRecord;
  buildPromMetrics: () => string;
  metricsInc: (key: string, delta?: number) => void;
  players: Map<string, PlayerState>;
  tournamentBroadcast: {
    emitTournamentUpdate: (io: import("socket.io").Server, tournamentId: string, data: AnyRecord) => void;
    emitPhaseChanged: (io: import("socket.io").Server, tournamentId: string, newPhase: string, additionalData?: AnyRecord) => void;
    emitRoundStarted: (io: import("socket.io").Server, tournamentId: string, roundNumber: number, matches: unknown) => void;
    emitPlayerJoined: (
      io: import("socket.io").Server,
      tournamentId: string,
      playerId: string | undefined,
      playerName: string | undefined,
      currentPlayerCount: number | undefined
    ) => void;
    emitPlayerLeft: (
      io: import("socket.io").Server,
      tournamentId: string,
      playerId: string | undefined,
      playerName: string | undefined,
      currentPlayerCount: number | undefined
    ) => void;
    emitDraftReady: (
      io: import("socket.io").Server,
      tournamentId: string,
      payload: AnyRecord
    ) => void;
    emitPreparationUpdate: (
      io: import("socket.io").Server,
      tournamentId: string,
      playerId: string | undefined,
      preparationStatus: string | undefined,
      readyPlayerCount: number | undefined,
      totalPlayerCount: number | undefined,
      deckSubmitted?: boolean | undefined
    ) => void;
    emitStatisticsUpdate: (
      io: import("socket.io").Server,
      tournamentId: string,
      statistics: AnyRecord
    ) => void;
  };
  normalizeTournamentBroadcastData: (input: unknown) => AnyRecord;
  isTournamentBroadcastEvent: (value: unknown) => boolean;
  toOptionalString: (value: unknown) => string | null;
  toOptionalNumber: (value: unknown) => number | null;
  matchesMap: Map<string, AnyRecord>;
  safeErrorMessage: (err: unknown) => unknown;
}

export function createRequestHandler(deps: RequestHandlerDeps) {
  const {
    serverConfig,
    isReady,
    collectMetricsSnapshot,
    buildPromMetrics,
    metricsInc,
    tournamentBroadcast,
    normalizeTournamentBroadcastData,
    isTournamentBroadcastEvent,
    toOptionalString,
    toOptionalNumber,
    matchesMap,
    players,
    safeErrorMessage,
  } = deps;

  const CORS_ORIGINS = Array.isArray(serverConfig.corsOrigins)
    ? serverConfig.corsOrigins
    : [serverConfig.corsOrigins].filter(Boolean);

  function allowCors(res: ServerResponse, reqOrigin: string | null): void {
    if (reqOrigin && (CORS_ORIGINS.includes("*") || CORS_ORIGINS.includes(reqOrigin))) {
      res.setHeader("Access-Control-Allow-Origin", reqOrigin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }

  function allowCorsForOptions(res: ServerResponse, reqOrigin: string | null): void {
    allowCors(res, reqOrigin);
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }

  return async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const reqOrigin = (req && req.headers && req.headers.origin) || null;
      const method = (req && req.method) || "GET";
      const u = new URL((req && req.url) || "/", "http://localhost");
      const pathname = u.pathname;

      // Health endpoints
      if (
        pathname === "/healthz" ||
        pathname === "/readyz" ||
        pathname === "/status"
      ) {
        const dbOk = !!isReady();
        const body = JSON.stringify({
          ok: true,
          db: dbOk,
          matches: matchesMap.size,
          uptimeSec: Math.floor(process.uptime()),
        });
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(body);
        return;
      }

      // Metrics endpoints
      if (pathname === "/metrics" && method === "GET") {
        allowCors(res, reqOrigin);
        try {
          metricsInc("http.metrics.requests", 1);
        } catch {}
        const text = buildPromMetrics();
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
        res.end(text);
        return;
      }
      if (pathname === "/metrics.json" && method === "GET") {
        allowCors(res, reqOrigin);
        try {
          metricsInc("http.metrics_json.requests", 1);
        } catch {}
        const snap = collectMetricsSnapshot();
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(snap));
        return;
      }

      if (method === "OPTIONS") {
        allowCorsForOptions(res, reqOrigin);
        res.statusCode = 204;
        res.end();
        return;
      }

      if (pathname === "/tournament/broadcast" && method === "POST") {
        allowCors(res, reqOrigin);
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => {
          try {
            const body = Buffer.concat(chunks).toString();
            const parsed = JSON.parse(body) as { event?: string; data?: Record<string, unknown> };
            const event = isTournamentBroadcastEvent(parsed.event) ? parsed.event : null;
            if (!event) {
              throw new Error("Missing event");
            }

            const data = normalizeTournamentBroadcastData(parsed.data);

            switch (event) {
              case "TOURNAMENT_UPDATED": {
                const id = toOptionalString(data.id);
                if (id) {
                  tournamentBroadcast.emitTournamentUpdate(deps.io, id, data);
                }
                break;
              }
              case "PHASE_CHANGED": {
                const tournamentId = toOptionalString(data.tournamentId);
                const newPhase = toOptionalString(data.newPhase);
                if (tournamentId && newPhase) {
                  const { tournamentId: _ti, newPhase: _np, ...additionalData } = data;
                  tournamentBroadcast.emitPhaseChanged(deps.io, tournamentId, newPhase, additionalData);
                }
                break;
              }
              case "ROUND_STARTED": {
                const tournamentId = toOptionalString(data.tournamentId);
                const roundNumber = toOptionalNumber(data.roundNumber);
                const matchesPayload = Array.isArray(data.matches) ? data.matches : null;
                if (tournamentId && roundNumber !== null && matchesPayload) {
                  tournamentBroadcast.emitRoundStarted(deps.io, tournamentId, roundNumber, matchesPayload);
                }
                break;
              }
              case "PLAYER_JOINED": {
                const tournamentId = toOptionalString(data.tournamentId);
                const playerId = toOptionalString(data.playerId);
                if (tournamentId && playerId) {
                  const playerName = toOptionalString(data.playerName) ?? undefined;
                  const currentPlayerCount = toOptionalNumber(data.currentPlayerCount) ?? undefined;
                  tournamentBroadcast.emitPlayerJoined(
                    deps.io,
                    tournamentId,
                    playerId,
                    playerName,
                    currentPlayerCount
                  );
                }
                break;
              }
              case "PLAYER_LEFT": {
                const tournamentId = toOptionalString(data.tournamentId);
                const playerId = toOptionalString(data.playerId);
                if (tournamentId && playerId) {
                  const playerName = toOptionalString(data.playerName) ?? undefined;
                  const currentPlayerCount = toOptionalNumber(data.currentPlayerCount) ?? undefined;
                  tournamentBroadcast.emitPlayerLeft(
                    deps.io,
                    tournamentId,
                    playerId,
                    playerName,
                    currentPlayerCount
                  );
                }
                break;
              }
              case "DRAFT_READY": {
                const tournamentId = toOptionalString(data.tournamentId);
                const draftSessionId = toOptionalString(data.draftSessionId);
                if (tournamentId && draftSessionId) {
                  const { tournamentId: _ti, ...rest } = data;
                  tournamentBroadcast.emitDraftReady(deps.io, tournamentId, rest);
                }
                break;
              }
              case "UPDATE_PREPARATION": {
                const tournamentId = toOptionalString(data.tournamentId);
                const playerId = toOptionalString(data.playerId);
                if (tournamentId && playerId) {
                  const preparationStatus = toOptionalString(data.preparationStatus) ?? undefined;
                  const readyPlayerCount = toOptionalNumber(data.readyPlayerCount) ?? undefined;
                  const totalPlayerCount = toOptionalNumber(data.totalPlayerCount) ?? undefined;
                  const deckSubmitted =
                    typeof data.deckSubmitted === "boolean" ? data.deckSubmitted : undefined;
                  tournamentBroadcast.emitPreparationUpdate(
                    deps.io,
                    tournamentId,
                    playerId,
                    preparationStatus,
                    readyPlayerCount,
                    totalPlayerCount,
                    deckSubmitted
                  );
                }
                break;
              }
              case "STATISTICS_UPDATED": {
                const tournamentId = toOptionalString(data.tournamentId);
                if (tournamentId) {
                  tournamentBroadcast.emitStatisticsUpdate(deps.io, tournamentId, data);
                }
                break;
              }
              case "MATCH_ASSIGNED":
                console.log("[Tournament] MATCH_ASSIGNED broadcast received");
                break;
              case "matchEnded": {
                const matchId = toOptionalString(data.matchId);
                if (matchId) {
                  const match = matchesMap.get(matchId);
                  if (match) {
                    for (const playerId of Array.isArray(match.playerIds) ? match.playerIds : []) {
                      const player = players.get(playerId);
                      if (player && player.matchId === matchId) {
                        player.matchId = null;
                      }
                    }
                    deps.io.to(`match:${matchId}`).emit("matchEnded", data);
                    const reason = toOptionalString(data.reason) ?? "unknown_reason";
                    console.log(`[Match] Ended match ${matchId} due to ${reason}`);
                  }
                }
                break;
              }
            }

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true }));
          } catch (err) {
            console.error("[Tournament] Broadcast error:", safeErrorMessage(err));
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                error: "Invalid request",
                details: String(safeErrorMessage(err)),
              })
            );
          }
        });

        req.on("error", (err: Error) => {
          console.error("[Tournament] Request error:", safeErrorMessage(err));
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Server error" }));
        });

        return;
      }

      res.statusCode = 404;
      res.end("Not Found");
    } catch (e) {
      try {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            error: "internal_error",
            message: String(safeErrorMessage(e)),
          })
        );
      } catch {}
    }
  };
}
