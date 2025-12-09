"use strict";

import type { IncomingMessage, ServerResponse } from "http";
import type { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import type { AnyRecord, PlayerState } from "../types";

export interface RequestHandlerDeps {
  io: import("socket.io").Server;
  serverConfig: {
    corsOrigins: string[];
  };
  prisma: PrismaClient;
  isReady: () => boolean;
  collectMetricsSnapshot: () => AnyRecord;
  buildPromMetrics: () => string;
  metricsInc: (key: string, delta?: number) => void;
  players: Map<string, PlayerState>;
  tournamentBroadcast: {
    emitTournamentUpdate: (
      io: import("socket.io").Server,
      tournamentId: string,
      data: AnyRecord
    ) => void;
    emitPhaseChanged: (
      io: import("socket.io").Server,
      tournamentId: string,
      newPhase: string,
      additionalData?: AnyRecord
    ) => void;
    emitRoundStarted: (
      io: import("socket.io").Server,
      tournamentId: string,
      roundNumber: number,
      matches: unknown
    ) => void;
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

interface NextAuthJwtPayload {
  uid?: string;
  sub?: string;
}

export function createRequestHandler(deps: RequestHandlerDeps) {
  const {
    serverConfig,
    prisma,
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
    if (
      reqOrigin &&
      (CORS_ORIGINS.includes("*") || CORS_ORIGINS.includes(reqOrigin))
    ) {
      res.setHeader("Access-Control-Allow-Origin", reqOrigin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }

  function allowCorsForOptions(
    res: ServerResponse,
    reqOrigin: string | null
  ): void {
    allowCors(res, reqOrigin);
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );
  }

  // Normalize incoming event names and accept a few aliases to avoid brittle 400s
  const EVENT_ALIAS_MAP: Record<string, string> = {
    "tournament:updated": "TOURNAMENT_UPDATED",
    "tournament:phase:changed": "PHASE_CHANGED",
    "tournament:round:started": "ROUND_STARTED",
    "tournament:player:joined": "PLAYER_JOINED",
    "tournament:player:left": "PLAYER_LEFT",
    "tournament:draft:ready": "DRAFT_READY",
    "tournament:preparation:update": "UPDATE_PREPARATION",
    "tournament:statistics:updated": "STATISTICS_UPDATED",
    "tournament:match:assigned": "MATCH_ASSIGNED",
    // Common variations
    matchended: "matchEnded",
  };

  function normalizeEventName(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    const s = raw.trim();
    if (!s) return null;
    // Exact match first
    if (isTournamentBroadcastEvent(s)) return s;
    // Case-insensitive canonicalization
    const upper = s.toUpperCase();
    if (isTournamentBroadcastEvent(upper)) return upper;
    // Aliases (case-insensitive keys)
    const alias =
      EVENT_ALIAS_MAP[s] ||
      EVENT_ALIAS_MAP[s.toLowerCase()] ||
      EVENT_ALIAS_MAP[upper];
    if (alias && isTournamentBroadcastEvent(alias)) return alias;
    return null;
  }

  return async function handleRequest(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
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
        res.setHeader(
          "Content-Type",
          "text/plain; version=0.0.4; charset=utf-8"
        );
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

      if (pathname === "/players/available" && method === "GET") {
        allowCors(res, reqOrigin);

        const qRaw = (u.searchParams.get("q") || "").trim().toLowerCase();
        const sortParam = (
          u.searchParams.get("sort") || "recent"
        ).toLowerCase();
        const sort = sortParam === "alphabetical" ? "alphabetical" : "recent";
        const limitRaw = Number(u.searchParams.get("limit") || 100);
        const limit = Math.max(
          1,
          Math.min(100, Number.isFinite(limitRaw) ? limitRaw : 100)
        );
        let offset = Number(u.searchParams.get("cursor") || 0);
        if (!Number.isFinite(offset) || offset < 0) offset = 0;

        let requesterId: string | null = null;
        try {
          const auth = (req.headers && req.headers.authorization) || "";
          const match = auth.match(/^Bearer\s+(.+)$/i);
          if (match && process.env.NEXTAUTH_SECRET) {
            const payload = jwt.verify(
              match[1],
              process.env.NEXTAUTH_SECRET
            ) as NextAuthJwtPayload;
            requesterId =
              (payload && payload.uid && String(payload.uid)) ||
              (payload && payload.sub && String(payload.sub)) ||
              null;
          }
        } catch {
          requesterId = null;
        }

        try {
          console.info(
            `[http] GET /players/available q="${qRaw}" sort=${sort} limit=${limit} cursor=${offset} requester=${
              requesterId ? String(requesterId).slice(-6) : "anon"
            }`
          );
        } catch {
          // Ignore logging errors
        }

        const candidates: Array<{ id: string; displayName: string }> = [];
        for (const [playerId, player] of players.entries()) {
          if (!player) continue;
          if (!player.socketId || player.matchId) continue;
          const name = player.displayName || "Player";
          if (!qRaw || name.toLowerCase().includes(qRaw)) {
            candidates.push({ id: playerId, displayName: name });
          }
        }

        const ids = candidates.map((c) => c.id);
        const publicUsers: Array<{
          id: string;
          shortId: string | null;
          image: string | null;
        }> =
          ids.length > 0
            ? await prisma.user.findMany({
                where: { id: { in: ids }, presenceHidden: false },
                select: { id: true, shortId: true, image: true },
              })
            : [];
        const publicMap = new Map<
          string,
          { id: string; shortId: string | null; image: string | null }
        >(publicUsers.map((user) => [user.id, user]));
        const visible = candidates.filter((c) => publicMap.has(c.id));

        let friendSet = new Set<string>();
        if (requesterId && visible.length > 0) {
          const friendships: Array<{ targetUserId: string }> =
            await prisma.friendship.findMany({
              where: {
                ownerUserId: requesterId,
                targetUserId: { in: visible.map((v) => v.id) },
              },
              select: { targetUserId: true },
            });
          friendSet = new Set(
            friendships.map(
              (entry: { targetUserId: string }) => entry.targetUserId
            )
          );
        }

        const freq = new Map<string, number>();
        const lastAt = new Map<string, number>();
        if (requesterId && sort === "recent") {
          const recent = await prisma.matchResult.findMany({
            where: {
              OR: [{ winnerId: requesterId }, { loserId: requesterId }],
            },
            orderBy: { completedAt: "desc" },
            take: 10,
            select: {
              winnerId: true,
              loserId: true,
              completedAt: true,
              players: true,
            },
          });
          for (const result of recent) {
            const opponentIds: string[] = [];
            try {
              const raw = (result as AnyRecord).players;
              const arr = Array.isArray(raw)
                ? raw
                : typeof raw === "string"
                ? JSON.parse(raw)
                : [];
              if (Array.isArray(arr)) {
                for (const info of arr) {
                  if (!info || typeof info !== "object") continue;
                  const candidateId =
                    (info as AnyRecord).id ||
                    (info as AnyRecord).playerId ||
                    (info as AnyRecord).uid;
                  const normalized = candidateId ? String(candidateId) : null;
                  if (normalized && normalized !== requesterId) {
                    opponentIds.push(normalized);
                  }
                }
              }
            } catch {
              // Ignore JSON parse issues
            }
            if (opponentIds.length === 0) {
              const { winnerId, loserId } = result;
              if (winnerId && winnerId !== requesterId) {
                opponentIds.push(winnerId);
              }
              if (loserId && loserId !== requesterId) {
                opponentIds.push(loserId);
              }
            }
            const ts = result.completedAt
              ? new Date(result.completedAt).getTime()
              : Date.now();
            for (const oid of opponentIds) {
              const previous = freq.get(oid) || 0;
              freq.set(oid, previous + 1);
              const prevTs = lastAt.get(oid) || 0;
              if (ts > prevTs) lastAt.set(oid, ts);
            }
          }
        }

        const items = visible.map((candidate) => {
          const user = publicMap.get(candidate.id) as
            | {
                id: string;
                shortId: string | null;
                image: string | null;
              }
            | undefined;
          const matchCount = freq.has(candidate.id)
            ? freq.get(candidate.id)
            : null;
          const lastPlayedAt = lastAt.has(candidate.id)
            ? new Date(lastAt.get(candidate.id) || Date.now()).toISOString()
            : null;
          // Get player's location from in-memory state
          const player = players.get(candidate.id);
          const location = player?.location || null;
          return {
            userId: candidate.id,
            shortUserId: (user && user.shortId) || candidate.id.slice(-8),
            displayName: candidate.displayName,
            avatarUrl: (user && user.image) || null,
            presence: { online: true, inMatch: false, location },
            isFriend: requesterId ? friendSet.has(candidate.id) : false,
            lastPlayedAt,
            matchCountInLast10: matchCount,
          };
        });

        const alphaSort = (
          a: { displayName: string; userId: string },
          b: { displayName: string; userId: string }
        ): number => {
          const an = (a.displayName || "").toLowerCase();
          const bn = (b.displayName || "").toLowerCase();
          if (an < bn) return -1;
          if (an > bn) return 1;
          if (a.userId < b.userId) return -1;
          if (a.userId > b.userId) return 1;
          return 0;
        };

        let ordered = items;
        if (sort === "recent" && requesterId) {
          const groupA = items.filter(
            (item) =>
              typeof item.matchCountInLast10 === "number" &&
              (item.matchCountInLast10 || 0) > 0
          );
          const groupB = items.filter((item) => !groupA.includes(item));
          groupA.sort((x, y) => {
            const delta =
              (y.matchCountInLast10 || 0) - (x.matchCountInLast10 || 0);
            if (delta !== 0) return delta;
            const tx = x.lastPlayedAt ? Date.parse(x.lastPlayedAt) : 0;
            const ty = y.lastPlayedAt ? Date.parse(y.lastPlayedAt) : 0;
            if (ty !== tx) return ty - tx;
            return alphaSort(x, y);
          });
          groupB.sort(alphaSort);
          ordered = groupA.concat(groupB);
        } else {
          ordered = items.slice().sort(alphaSort);
        }

        const total = ordered.length;
        const page = ordered.slice(offset, offset + limit);
        const nextCursor =
          offset + limit < total ? String(offset + limit) : null;

        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ items: page, nextCursor }));
        return;
      }

      if (pathname === "/tournament/broadcast" && method === "POST") {
        allowCors(res, reqOrigin);
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => {
          try {
            const body = Buffer.concat(chunks).toString();
            const parsed = JSON.parse(body) as AnyRecord;
            const rawEvent = (parsed &&
              (parsed.event ?? parsed.type ?? parsed.name)) as unknown;
            const event = normalizeEventName(rawEvent);
            if (!event) {
              throw new Error(
                `Missing or invalid event${
                  typeof rawEvent === "string" ? `: ${rawEvent}` : ""
                }`
              );
            }

            const data = normalizeTournamentBroadcastData(
              (parsed && (parsed.data ?? parsed.payload)) as unknown
            );

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
                  const {
                    tournamentId: _ti,
                    newPhase: _np,
                    ...additionalData
                  } = data;
                  tournamentBroadcast.emitPhaseChanged(
                    deps.io,
                    tournamentId,
                    newPhase,
                    additionalData
                  );
                }
                break;
              }
              case "ROUND_STARTED": {
                const tournamentId = toOptionalString(data.tournamentId);
                const roundNumber = toOptionalNumber(data.roundNumber);
                const matchesPayload = Array.isArray(data.matches)
                  ? data.matches
                  : null;
                if (tournamentId && roundNumber !== null && matchesPayload) {
                  tournamentBroadcast.emitRoundStarted(
                    deps.io,
                    tournamentId,
                    roundNumber,
                    matchesPayload
                  );
                }
                break;
              }
              case "PLAYER_JOINED": {
                const tournamentId = toOptionalString(data.tournamentId);
                const playerId = toOptionalString(data.playerId);
                if (tournamentId && playerId) {
                  const playerName =
                    toOptionalString(data.playerName) ?? undefined;
                  const currentPlayerCount =
                    toOptionalNumber(data.currentPlayerCount) ?? undefined;
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
                  const playerName =
                    toOptionalString(data.playerName) ?? undefined;
                  const currentPlayerCount =
                    toOptionalNumber(data.currentPlayerCount) ?? undefined;
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
                  tournamentBroadcast.emitDraftReady(
                    deps.io,
                    tournamentId,
                    rest
                  );
                }
                break;
              }
              case "UPDATE_PREPARATION": {
                const tournamentId = toOptionalString(data.tournamentId);
                const playerId = toOptionalString(data.playerId);
                if (tournamentId && playerId) {
                  const preparationStatus =
                    toOptionalString(data.preparationStatus) ?? undefined;
                  const readyPlayerCount =
                    toOptionalNumber(data.readyPlayerCount) ?? undefined;
                  const totalPlayerCount =
                    toOptionalNumber(data.totalPlayerCount) ?? undefined;
                  const deckSubmitted =
                    typeof data.deckSubmitted === "boolean"
                      ? data.deckSubmitted
                      : undefined;
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
                  tournamentBroadcast.emitStatisticsUpdate(
                    deps.io,
                    tournamentId,
                    data
                  );
                }
                break;
              }
              case "MATCH_ASSIGNED": {
                const tournamentId = toOptionalString(data.tournamentId);
                const playerId = toOptionalString(data.playerId);
                const matchId = toOptionalString(data.matchId);
                const opponentId = toOptionalString(data.opponentId);
                const opponentName = toOptionalString(data.opponentName);
                const lobbyName = toOptionalString(data.lobbyName);
                if (tournamentId && playerId && matchId) {
                  const payload = {
                    tournamentId,
                    matchId,
                    opponentId,
                    opponentName,
                    lobbyName: lobbyName || undefined,
                  } as AnyRecord;
                  try {
                    const p = players.get(playerId) as unknown as
                      | { socketId?: string }
                      | undefined;
                    const sid =
                      typeof p?.socketId === "string"
                        ? (p.socketId as string)
                        : null;
                    if (typeof sid === "string" && sid.length > 0) {
                      deps.io.to(sid as string).emit("MATCH_ASSIGNED", payload);
                    }
                    // Fallback: also emit to the tournament room so clients listening there can react
                    deps.io
                      .to(`tournament:${tournamentId}`)
                      .emit("MATCH_ASSIGNED", { playerId, ...payload });
                  } catch {}
                }
                break;
              }
              case "matchEnded": {
                const matchId = toOptionalString(data.matchId);
                if (matchId) {
                  const match = matchesMap.get(matchId);
                  if (match) {
                    for (const playerId of Array.isArray(match.playerIds)
                      ? match.playerIds
                      : []) {
                      const player = players.get(playerId);
                      if (player && player.matchId === matchId) {
                        player.matchId = null;
                      }
                    }
                    deps.io.to(`match:${matchId}`).emit("matchEnded", data);
                    const reason =
                      toOptionalString(data.reason) ?? "unknown_reason";
                    console.log(
                      `[Match] Ended match ${matchId} due to ${reason}`
                    );
                  }
                }
                break;
              }
            }
            try {
              metricsInc("http.tournament.broadcast.ok", 1);
            } catch {}
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true }));
          } catch (err) {
            console.error(
              "[Tournament] Broadcast error:",
              safeErrorMessage(err)
            );
            try {
              metricsInc("http.tournament.broadcast.error", 1);
            } catch {}
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

      // Active matches endpoint for admin dashboard
      if (pathname === "/matches/active" && method === "GET") {
        allowCors(res, reqOrigin);
        try {
          const activeMatches: Array<{
            matchId: string;
            playerIds: string[];
            playerNames: string[];
            matchType: string;
            status: string;
            lobbyName: string | null;
            startedAt: number | null;
            tournamentId: string | null;
          }> = [];

          for (const [matchId, match] of matchesMap.entries()) {
            if (!match) continue;
            const status =
              typeof match.status === "string" ? match.status : "unknown";
            // Skip ended matches
            if (status === "ended" || status === "completed") continue;
            if (match._finalized) continue;

            const playerIds = Array.isArray(match.playerIds)
              ? match.playerIds.map((id: unknown) => String(id))
              : [];

            const playerNames = playerIds.map((pid: string) => {
              const player = players.get(pid);
              return player?.displayName || `Player ${pid.slice(-6)}`;
            });

            activeMatches.push({
              matchId,
              playerIds,
              playerNames,
              matchType:
                typeof match.matchType === "string"
                  ? match.matchType
                  : "constructed",
              status,
              lobbyName:
                typeof match.lobbyName === "string" ? match.lobbyName : null,
              startedAt: typeof match.lastTs === "number" ? match.lastTs : null,
              tournamentId:
                typeof match.tournamentId === "string"
                  ? match.tournamentId
                  : null,
            });
          }

          // Sort by most recent first
          activeMatches.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));

          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              matches: activeMatches,
              total: activeMatches.length,
            })
          );
        } catch (err) {
          console.error("[http] /matches/active error:", safeErrorMessage(err));
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Failed to fetch active matches" }));
        }
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
