import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import type { ConnectionTestResult, AdminStats } from "./types";

function timing<T>(fn: () => Promise<T>): Promise<{ result: T; latency: number }> {
  const start = performance.now();
  return fn().then((result) => ({
    result,
    latency: performance.now() - start,
  }));
}

function toHttpUrl(raw: string): URL | null {
  if (!raw) return null;
  let candidate = raw.trim();
  if (!candidate) return null;
  if (!/^https?:\/\//i.test(candidate) && !/^wss?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }
  try {
    const url = new URL(candidate);
    if (url.protocol === "ws:") url.protocol = "http:";
    if (url.protocol === "wss:") url.protocol = "https:";
    url.pathname = url.pathname.replace(/\/+$/, "") || "";
    return url;
  } catch {
    return null;
  }
}

function resolveSocketHealthUrl(): string | null {
  const candidates = [
    process.env.ADMIN_SOCKET_HEALTH_URL,
    process.env.SOCKET_SERVER_URL,
    process.env.NEXT_PUBLIC_WS_URL,
    process.env.NEXT_PUBLIC_WS_HOST,
  ];

  for (const raw of candidates) {
    const url = raw ? toHttpUrl(raw) : null;
    if (!url) continue;
    const healthUrl = new URL(url.toString());
    healthUrl.pathname = `${healthUrl.pathname.replace(/\/+$/, "")}/healthz`;
    return healthUrl.toString();
  }
  return null;
}

function resolveCdnOrigin(): string | null {
  const raw =
    process.env.ADMIN_CDN_ORIGIN ||
    process.env.ASSET_CDN_ORIGIN ||
    process.env.NEXT_PUBLIC_TEXTURE_ORIGIN ||
    process.env.NEXT_PUBLIC_ASSET_ORIGIN;
  if (!raw) return null;
  const url = toHttpUrl(raw);
  return url ? url.toString() : null;
}

async function testDatabase(): Promise<ConnectionTestResult> {
  try {
    const { latency } = await timing(async () => {
      await prisma.$queryRaw(Prisma.sql`SELECT 1`);
    });
    return {
      id: "database",
      label: "Database (Prisma)",
      status: "ok",
      latencyMs: latency,
    };
  } catch (error) {
    return {
      id: "database",
      label: "Database (Prisma)",
      status: "error",
      details: error instanceof Error ? error.message : String(error),
    };
  }
}

async function testRedis(): Promise<ConnectionTestResult> {
  try {
    const { latency } = await timing(async () => {
      const redis = getRedis();
      await redis.ping();
    });
    return {
      id: "redis",
      label: "Redis",
      status: "ok",
      latencyMs: latency,
    };
  } catch (error) {
    return {
      id: "redis",
      label: "Redis",
      status: "error",
      details: error instanceof Error ? error.message : String(error),
    };
  }
}

async function testSocketServer(): Promise<ConnectionTestResult> {
  const healthUrl = resolveSocketHealthUrl();
  if (!healthUrl) {
    return {
      id: "socket",
      label: "Socket server health",
      status: "skipped",
      details:
        "Set SOCKET_SERVER_URL or ADMIN_SOCKET_HEALTH_URL to enable this check.",
    };
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const { result: response, latency } = await timing(async () => {
      return fetch(healthUrl, {
        cache: "no-store",
        signal: controller.signal,
      });
    });
    clearTimeout(timeout);
    if (!response.ok) {
      return {
        id: "socket",
        label: "Socket server health",
        status: "error",
        latencyMs: latency,
        details: `HTTP ${response.status}`,
      };
    }
    let responseDetails: string | undefined;
    try {
      const json = await response.json();
      if (json && typeof json === "object") {
        responseDetails = JSON.stringify(json);
      }
    } catch {
      responseDetails = undefined;
    }
    return {
      id: "socket",
      label: "Socket server health",
      status: "ok",
      latencyMs: latency,
      details: responseDetails,
    };
  } catch (error) {
    return {
      id: "socket",
      label: "Socket server health",
      status: "error",
      details: error instanceof Error ? error.message : String(error),
    };
  }
}

async function testCdn(): Promise<ConnectionTestResult> {
  const cdnOrigin = resolveCdnOrigin();
  if (!cdnOrigin) {
    return {
      id: "cdn",
      label: "Asset CDN",
      status: "skipped",
      details:
        "Set ASSET_CDN_ORIGIN or ADMIN_CDN_ORIGIN to enable this check.",
    };
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const requestUrl = `${cdnOrigin.replace(/\/+$/, "")}/`;
    const { result: response, latency } = await timing(async () => {
      return fetch(requestUrl, {
        method: "HEAD",
        cache: "no-store",
        signal: controller.signal,
      });
    });
    clearTimeout(timeout);
    if (!response.ok) {
      return {
        id: "cdn",
        label: "Asset CDN",
        status: "error",
        latencyMs: latency,
        details: `HTTP ${response.status}`,
      };
    }
    return {
      id: "cdn",
      label: "Asset CDN",
      status: "ok",
      latencyMs: latency,
      details: `Status ${response.status}${
        response.headers.get("server") ? ` • ${response.headers.get("server")}` : ""
      }`,
    };
  } catch (error) {
    return {
      id: "cdn",
      label: "Asset CDN",
      status: "error",
      details: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function runConnectionTests(): Promise<ConnectionTestResult[]> {
  const results: ConnectionTestResult[] = [];
  results.push(await testDatabase());
  results.push(await testRedis());
  results.push(await testSocketServer());
  results.push(await testCdn());
  return results;
}

export async function getAdminStats(): Promise<AdminStats> {
  const [
    userCount,
    tournamentCount,
    activeTournamentCount,
    matchResultsCount,
    replaySessionCount,
    leaderboardCount,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.tournament.count(),
    prisma.tournament.count({
      where: {
        status: {
          in: ["registering", "preparing", "active"],
        },
      },
    }),
    prisma.matchResult.count(),
    prisma.onlineMatchSession.count({
      where: {
        status: {
          in: ["completed", "ended"],
        },
      },
    }),
    prisma.leaderboardEntry.count(),
  ]);

  return {
    totals: {
      users: userCount,
      tournaments: tournamentCount,
      activeTournaments: activeTournamentCount,
      matches: matchResultsCount,
      replaySessions: replaySessionCount,
      leaderboardEntries: leaderboardCount,
    },
    updatedAt: new Date().toISOString(),
  };
}
