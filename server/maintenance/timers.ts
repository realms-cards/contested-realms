"use strict";

import type { PrismaClient } from "@prisma/client";
import type { Redis } from "ioredis";
import type { Server as SocketIOServer } from "socket.io";
import { computeAllMetaStats } from "../modules/meta-stats-compute";
import type { AnyRecord, LobbyState, ServerMatchState } from "../types";

export interface MaintenanceTimerDeps {
  lobbies: Map<string, LobbyState>;
  matches: Map<string, ServerMatchState>;
  botManager: {
    cleanupBotsForLobby: (lobbyId: string) => void;
  };
  broadcastLobbies: () => void;
  broadcastPlayers: () => void;
  reapStalePlayers: () => number;
  lobbyHasHumanPlayers: (lobby: LobbyState | null | undefined) => boolean;
  matchHasHumanPlayers: (match: ServerMatchState | null | undefined) => boolean;
  cleanupMatchNow: (
    matchId: string,
    reason: string,
    force: boolean,
  ) => Promise<void>;
  getOrClaimMatchLeader: (matchId: string) => Promise<string | null>;
  instanceId: string;
  io: SocketIOServer;
  storeRedis: Redis | null;
  matchControlChannel: string;
  staleWaitingMs: number;
  inactiveMatchCleanupMs: number;
  staleMatchHumanMs: number;
  staleMatchBotMs: number;
  prisma: PrismaClient;
  safeErrorMessage: (err: unknown) => unknown;
}

export function startMaintenanceTimers({
  lobbies,
  matches,
  botManager,
  broadcastLobbies,
  broadcastPlayers,
  reapStalePlayers,
  lobbyHasHumanPlayers,
  matchHasHumanPlayers,
  cleanupMatchNow,
  getOrClaimMatchLeader,
  instanceId,
  io,
  storeRedis,
  matchControlChannel,
  staleWaitingMs,
  inactiveMatchCleanupMs,
  staleMatchHumanMs,
  staleMatchBotMs,
  prisma,
  safeErrorMessage,
}: MaintenanceTimerDeps): NodeJS.Timeout[] {
  const timers: NodeJS.Timeout[] = [];

  // Periodic player list heartbeat: reap stale entries then re-broadcast every 60s
  // so clients stay in sync even if they missed a connect/disconnect event.
  timers.push(
    setInterval(() => {
      try {
        const reaped = reapStalePlayers();
        if (reaped > 0) {
          try {
            console.log(
              `[maintenance] Reaped ${reaped} stale player(s) from online list`,
            );
          } catch {}
        }
        broadcastPlayers();
      } catch {
        // Ignore broadcast errors
      }
    }, 60 * 1000),
  );

  timers.push(
    setInterval(() => {
      for (const lobby of lobbies.values()) {
        if (!lobby || lobby.status !== "open") continue;
        if (!lobbyHasHumanPlayers(lobby)) {
          lobby.status = "closed";
          try {
            botManager.cleanupBotsForLobby(lobby.id);
          } catch {
            // Ignore bot cleanup errors
          }
          lobbies.delete(lobby.id);
          broadcastLobbies();
        }
      }

      for (const match of matches.values()) {
        if (!match) continue;
        if (matchHasHumanPlayers(match)) continue;

        const age = Date.now() - (Number(match.lastTs) || Date.now());
        const shouldCleanup =
          match.status === "completed" || age >= 10 * 60 * 1000;

        if (shouldCleanup) {
          try {
            console.log(
              `[Match] Periodic cleanup of bot-only match ${match.id} (status=${
                match.status
              }, age=${Math.floor(age / 1000)}s)`,
            );
          } catch {
            // Ignore logging failures
          }
          cleanupMatchNow(match.id, "bot_only_periodic", true).catch((err) => {
            try {
              console.warn(
                `[Match] Failed to cleanup bot match ${match.id}:`,
                err,
              );
            } catch {
              // Ignore logging failures
            }
          });
        }
      }
    }, 30 * 1000),
  );

  timers.push(
    setInterval(async () => {
      const now = Date.now();

      for (const match of matches.values()) {
        if (!match) continue;

        const age = now - (Number(match.lastTs) || now);

        if (match.status === "waiting" && age >= staleWaitingMs) {
          const room = `match:${match.id}`;
          let roomEmpty = true;
          try {
            if (typeof io.in(room).allSockets === "function") {
              const sockets = await io.in(room).allSockets();
              roomEmpty = !sockets || sockets.size === 0;
            }
          } catch {
            // Ignore room inspection errors
          }
          if (!roomEmpty) continue;

          try {
            const leader = await getOrClaimMatchLeader(match.id);
            if (leader && leader !== instanceId) {
              if (storeRedis) {
                await storeRedis.publish(
                  matchControlChannel,
                  JSON.stringify({
                    type: "match:cleanup",
                    matchId: match.id,
                    reason: "stale_waiting",
                    force: true,
                  } satisfies AnyRecord),
                );
              }
              continue;
            }
            await cleanupMatchNow(match.id, "stale_waiting", true);
          } catch {
            // Ignore cleanup errors; logging handled downstream
          }
          continue;
        }

        if (age >= inactiveMatchCleanupMs) {
          if (match.tournamentId) continue;

          const room = `match:${match.id}`;
          let roomEmpty = true;
          try {
            if (typeof io.in(room).allSockets === "function") {
              const sockets = await io.in(room).allSockets();
              roomEmpty = !sockets || sockets.size === 0;
            }
          } catch {
            // Ignore room inspection errors
          }
          if (!roomEmpty) continue;

          try {
            const leader = await getOrClaimMatchLeader(match.id);
            if (leader && leader !== instanceId) {
              if (storeRedis) {
                await storeRedis.publish(
                  matchControlChannel,
                  JSON.stringify({
                    type: "match:cleanup",
                    matchId: match.id,
                    reason: "inactive_timeout",
                    force: true,
                  } satisfies AnyRecord),
                );
              }
              continue;
            }
            try {
              console.log(
                `[match] cleanup inactive match ${match.id} (status: ${
                  match.status
                }, age: ${Math.round(age / 1000 / 60)}min)`,
              );
            } catch {
              // Ignore logging failures
            }
            await cleanupMatchNow(match.id, "inactive_timeout", true);
          } catch {
            // Ignore cleanup errors; downstream logs capture failures
          }
        }
      }
    }, 60 * 1000),
  );

  // NOTE: We only clean up "completed" and "cancelled" sessions here.
  // "ended" sessions are preserved for replay functionality indefinitely.
  // The replay retention pruner has been DISABLED - replays are kept permanently.
  // To re-enable retention, see REPLAY_RETENTION_DAYS in server/index.ts.
  // Deleting "ended" sessions would cascade-delete OnlineMatchAction records.
  timers.push(
    setInterval(
      async () => {
        try {
          const threshold = new Date(Date.now() - inactiveMatchCleanupMs);
          const result = await prisma.onlineMatchSession.deleteMany({
            where: {
              status: { in: ["completed", "cancelled"] },
              updatedAt: { lt: threshold },
            },
          });

          if (result.count > 0) {
            try {
              console.log(
                `[db] cleaned up ${result.count} old match(es) from database`,
              );
            } catch {
              // Ignore logging failures
            }
          }
        } catch (err) {
          try {
            console.warn(`[db] cleanup failed:`, safeErrorMessage(err));
          } catch {
            // Ignore logging failures
          }
        }
      },
      5 * 60 * 1000,
    ),
  );

  // Auto-close stale matches: 7 days for human matches, 2 days for bot matches
  timers.push(
    setInterval(
      async () => {
        try {
          const now = Date.now();
          const humanThreshold = new Date(now - staleMatchHumanMs);
          const botThreshold = new Date(now - staleMatchBotMs);

          // Find stale sessions still in active states
          const staleSessions = await prisma.onlineMatchSession.findMany({
            where: {
              status: { in: ["waiting", "deck_construction", "in_progress"] },
              updatedAt: { lt: humanThreshold },
            },
            select: {
              id: true,
              playerIds: true,
              status: true,
              updatedAt: true,
            },
          });

          // Also find bot matches that are stale at the shorter threshold
          const botStaleSessions =
            staleMatchBotMs < staleMatchHumanMs
              ? await prisma.onlineMatchSession.findMany({
                  where: {
                    status: {
                      in: ["waiting", "deck_construction", "in_progress"],
                    },
                    updatedAt: { gte: humanThreshold, lt: botThreshold },
                  },
                  select: {
                    id: true,
                    playerIds: true,
                    status: true,
                    updatedAt: true,
                  },
                })
              : [];

          // Filter bot-only matches from the second query
          const isBotOnly = (playerIds: string[]) =>
            playerIds.length > 0 &&
            playerIds.every((pid) => pid.startsWith("cpu_"));

          const toCancel: string[] = [];

          // All matches past human threshold get cancelled regardless
          for (const s of staleSessions) {
            toCancel.push(s.id);
          }

          // Bot-only matches past bot threshold but before human threshold
          for (const s of botStaleSessions) {
            if (isBotOnly(s.playerIds)) {
              toCancel.push(s.id);
            }
          }

          if (toCancel.length === 0) return;

          // Cancel stale sessions in DB
          const result = await prisma.onlineMatchSession.updateMany({
            where: { id: { in: toCancel } },
            data: { status: "cancelled" },
          });

          // Remove from in-memory map
          for (const id of toCancel) {
            matches.delete(id);
          }

          if (result.count > 0) {
            try {
              console.log(
                `[maintenance] auto-closed ${result.count} stale match(es): ${toCancel.join(", ")}`,
              );
            } catch {
              // Ignore logging failures
            }
          }
        } catch (err) {
          try {
            console.warn(
              `[maintenance] stale match cleanup failed:`,
              safeErrorMessage(err),
            );
          } catch {
            // Ignore logging failures
          }
        }
      },
      60 * 60 * 1000,
    ), // Run every hour
  );

  // Pre-compute meta statistics every 10 minutes
  // Also run on startup after a short delay to populate initial cache
  const META_STATS_INTERVAL = 10 * 60 * 1000; // 10 minutes
  setTimeout(() => {
    computeAllMetaStats(prisma).catch((err) => {
      try {
        console.warn(
          "[maintenance] Initial meta stats computation failed:",
          safeErrorMessage(err),
        );
      } catch {
        // Ignore logging failures
      }
    });
  }, 15_000); // 15s delay for startup
  timers.push(
    setInterval(() => {
      computeAllMetaStats(prisma).catch((err) => {
        try {
          console.warn(
            "[maintenance] Meta stats computation failed:",
            safeErrorMessage(err),
          );
        } catch {
          // Ignore logging failures
        }
      });
    }, META_STATS_INTERVAL),
  );

  return timers;
}
