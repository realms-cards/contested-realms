import "server-only";

import { Prisma } from "@prisma/client";
import Redis from "ioredis";
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
    const cleanPath = healthUrl.pathname.replace(/\/+$/, "") || "";
    if (cleanPath.toLowerCase().endsWith("/healthz") || cleanPath.toLowerCase() === "healthz") {
      return healthUrl.toString();
    }
    if (cleanPath === "" || cleanPath === "/") {
      healthUrl.pathname = "/healthz";
    } else {
      healthUrl.pathname = `${cleanPath}/healthz`;
    }
    return healthUrl.toString();
  }
  return null;
}

function resolveCdnCheck(): { origin: string; path: string } | null {
  const rawOrigin =
    process.env.ADMIN_CDN_ORIGIN ||
    process.env.ASSET_CDN_ORIGIN ||
    process.env.NEXT_PUBLIC_TEXTURE_ORIGIN ||
    process.env.NEXT_PUBLIC_ASSET_ORIGIN;
  if (!rawOrigin) return null;
  const url = toHttpUrl(rawOrigin);
  if (!url) return null;
  const path = (process.env.ADMIN_CDN_TEST_PATH || "/").trim() || "/";
  return { origin: url.toString(), path: path.startsWith("/") ? path : `/${path}` };
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
      const redisUrl = process.env.REDIS_URL || null;
      const password = process.env.REDIS_PASSWORD || undefined;
      if (redisUrl) {
        const client = new Redis(redisUrl, {
          lazyConnect: true,
          password,
        });
        try {
          await client.connect();
          await client.ping();
        } finally {
          await client.quit().catch(() => {
            /* ignore */
          });
        }
        return;
      }
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

  const probe = async (target: string): Promise<ConnectionTestResult> => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const { result: response, latency } = await timing(async () => {
        return fetch(target, {
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
      const message =
        error instanceof DOMException && error.name === "AbortError"
          ? "Request timed out after 5s"
          : error instanceof Error
            ? error.message
            : String(error);
      return {
        id: "socket",
        label: "Socket server health",
        status: "error",
        details: message,
      };
    }
  };

  const primary = await probe(healthUrl);
  if (primary.status === "ok") {
    return primary;
  }

  const url = new URL(healthUrl);
  if (url.hostname !== "localhost") {
    return primary;
  }

  const fallbackUrl = new URL(healthUrl);
  fallbackUrl.hostname = "127.0.0.1";
  const secondary = await probe(fallbackUrl.toString());

  if (secondary.status === "ok") {
    return {
      ...secondary,
      details:
        secondary.details ??
        `Primary localhost probe failed (${primary.details ?? "unknown error"}); fallback to 127.0.0.1 succeeded`,
    };
  }

  return {
    ...secondary,
    details: `${primary.details ?? "Primary localhost probe failed"}; fallback to 127.0.0.1 failed${secondary.details ? `: ${secondary.details}` : ""}`,
  };
}

async function testCdn(): Promise<ConnectionTestResult> {
  const cdnCheck = resolveCdnCheck();
  if (!cdnCheck) {
    return {
      id: "cdn",
      label: "Asset CDN",
      status: "skipped",
      details:
        "Set ASSET_CDN_ORIGIN or ADMIN_CDN_ORIGIN to enable this check.",
    };
  }
  try {
    const requestUrl = `${cdnCheck.origin.replace(/\/+$/, "")}${cdnCheck.path}`;
    const attempt = async (method: "HEAD" | "GET") => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const timingResult = await timing(async () => {
        return fetch(requestUrl, {
          method,
          cache: "no-store",
          signal: controller.signal,
        });
      });
      clearTimeout(timeout);
      return timingResult;
    };

    let { result: response, latency } = await attempt("HEAD");

    if (!response.ok && [401, 403, 405, 501].includes(response.status)) {
      const fallback = await attempt("GET");
      response = fallback.result;
      latency = fallback.latency;
    }

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
