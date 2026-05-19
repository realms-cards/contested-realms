import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RecordingSummary {
  matchId: string;
  playerNames: string[];
  startTime: number;
  endTime?: number;
  duration?: number;
  actionCount: number;
  matchType: string;
  playerIds: string[];
  isCpuMatch: boolean;
}

const CPU_PREFIX = "cpu:";

function tagCpuMatch(recording: Omit<RecordingSummary, "isCpuMatch">): RecordingSummary {
  const isCpuMatch = recording.playerIds.some(
    (pid) => pid.startsWith("cpu_") || pid.startsWith("host_")
  );
  return { ...recording, isCpuMatch };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = req.nextUrl;
    const limit = Math.min(Number(searchParams.get("limit") || "50"), 200);
    const cursorParam = searchParams.get("cursor");
    const playerId = searchParams.get("playerId") || null;
    const ownOnly = searchParams.get("ownOnly") === "true";
    const cursor = cursorParam ? new Date(cursorParam) : null;

    const globalWhere: Record<string, unknown> = {};
    if (cursor) globalWhere.completedAt = { lt: cursor };
    if (playerId && ownOnly) {
      globalWhere.OR = [{ winnerId: playerId }, { loserId: playerId }];
    }

    const globalResults = await prisma.matchResult.findMany({
      where: globalWhere,
      orderBy: { completedAt: "desc" },
      take: limit + 1,
    });

    let playerResults: typeof globalResults = [];
    if (playerId && !ownOnly) {
      const playerWhere: Record<string, unknown> = {
        OR: [{ winnerId: playerId }, { loserId: playerId }],
      };
      if (cursor) playerWhere.completedAt = { lt: cursor };
      playerResults = await prisma.matchResult.findMany({
        where: playerWhere,
        orderBy: { completedAt: "desc" },
        take: limit + 1,
      });
    }

    const seenIds = new Set<string>();
    const results: typeof globalResults = [];
    for (const r of [...globalResults, ...playerResults]) {
      if (!seenIds.has(r.matchId)) {
        seenIds.add(r.matchId);
        results.push(r);
      }
    }

    const finishedIds = results.map((r) => r.matchId);

    const sessionsForResults = finishedIds.length
      ? await prisma.onlineMatchSession.findMany({ where: { id: { in: finishedIds } } })
      : [];
    const sessionById = new Map(sessionsForResults.map((s) => [s.id, s]));

    let finishedCountsById = new Map<string, number>();
    if (finishedIds.length) {
      const grouped = await prisma.onlineMatchAction.groupBy({
        by: ["matchId"],
        where: { matchId: { in: finishedIds } },
        _count: { _all: true },
      });
      finishedCountsById = new Map(grouped.map((g) => [g.matchId, g._count._all]));
    }

    const finishedSummaries: Omit<RecordingSummary, "isCpuMatch">[] = results.map((mr) => {
      const session = sessionById.get(mr.matchId);
      const players = Array.isArray(mr.players) ? (mr.players as Record<string, unknown>[]) : [];
      const playerNames = players.map((p) =>
        p && typeof p === "object" ? String(p.displayName || p.id || "Player") : "Player"
      );
      const playerIds: string[] = players
        .map((p) => (p && typeof p === "object" ? String(p.id || "") : ""))
        .filter(Boolean);
      const endTime = mr.completedAt ? new Date(mr.completedAt).getTime() : undefined;
      let startTime: number;
      if (mr.completedAt && mr.duration != null) {
        startTime = (endTime ?? 0) - Number(mr.duration) * 1000;
      } else if (session?.createdAt) {
        startTime = new Date(session.createdAt).getTime();
      } else {
        startTime = endTime ?? Date.now();
      }
      const matchType = mr.format || session?.matchType || "constructed";
      return {
        matchId: mr.matchId,
        playerNames,
        startTime,
        endTime,
        duration: endTime && startTime ? endTime - startTime : undefined,
        actionCount: Number(finishedCountsById.get(mr.matchId) || 0),
        matchType,
        playerIds,
      };
    });

    const fallbackWhere: Record<string, unknown> = {
      status: { in: ["in_progress", "ended"] },
      id: { notIn: finishedIds },
    };
    if (cursor) fallbackWhere.updatedAt = { lt: cursor };
    if (playerId && ownOnly) fallbackWhere.playerIds = { has: playerId };

    const fallbackGlobal = await prisma.onlineMatchSession.findMany({
      where: fallbackWhere,
      orderBy: { updatedAt: "desc" },
      take: limit + 1,
    });

    let fallbackPlayer: typeof fallbackGlobal = [];
    if (playerId && !ownOnly) {
      const pw: Record<string, unknown> = {
        status: { in: ["in_progress", "ended"] },
        id: { notIn: finishedIds },
        playerIds: { has: playerId },
      };
      if (cursor) pw.updatedAt = { lt: cursor };
      fallbackPlayer = await prisma.onlineMatchSession.findMany({
        where: pw,
        orderBy: { updatedAt: "desc" },
        take: limit + 1,
      });
    }

    const seenSessionIds = new Set(finishedIds);
    const fallbackSessions: typeof fallbackGlobal = [];
    for (const s of [...fallbackGlobal, ...fallbackPlayer]) {
      if (!seenSessionIds.has(s.id)) {
        seenSessionIds.add(s.id);
        fallbackSessions.push(s);
      }
    }

    const allUserIds = Array.from(
      new Set(
        fallbackSessions.flatMap((s) => (Array.isArray(s.playerIds) ? (s.playerIds as string[]) : []))
      )
    );
    const users = allUserIds.length
      ? await prisma.user.findMany({ where: { id: { in: allUserIds } }, select: { id: true, name: true } })
      : [];
    const nameById = new Map(users.map((u) => [u.id, u.name || u.id]));

    let fallbackCountsById = new Map<string, number>();
    if (fallbackSessions.length) {
      const grouped = await prisma.onlineMatchAction.groupBy({
        by: ["matchId"],
        where: { matchId: { in: fallbackSessions.map((s) => s.id) } },
        _count: { _all: true },
      });
      fallbackCountsById = new Map(grouped.map((g) => [g.matchId, g._count._all]));
    }

    const fallbackSummaries: Omit<RecordingSummary, "isCpuMatch">[] = fallbackSessions.map((s) => {
      const pids: string[] = Array.isArray(s.playerIds) ? (s.playerIds as string[]) : [];
      const playerNames = pids.map((pid) => nameById.get(pid) || pid);
      const endTime = s.updatedAt ? new Date(s.updatedAt).getTime() : undefined;
      const startTime = s.createdAt ? new Date(s.createdAt).getTime() : endTime ?? Date.now();
      return {
        matchId: s.id,
        playerNames,
        startTime,
        endTime,
        duration: endTime && startTime ? endTime - startTime : undefined,
        actionCount: Number(fallbackCountsById.get(s.id) || 0),
        matchType: s.matchType || "constructed",
        playerIds: pids,
      };
    });

    const combined = [...finishedSummaries, ...fallbackSummaries]
      .filter((r) => r.actionCount > 0)
      .filter((r) => {
        const humanPlayers = r.playerIds.filter((pid) => pid && !pid.startsWith(CPU_PREFIX));
        return new Set(humanPlayers).size >= 2;
      });

    combined.sort((a, b) => {
      const at = a.endTime ?? a.startTime ?? 0;
      const bt = b.endTime ?? b.startTime ?? 0;
      return bt - at;
    });

    const hasMore = combined.length > limit;
    const recordings = combined.slice(0, limit).map(tagCpuMatch);

    let nextCursor: string | undefined;
    if (hasMore && recordings.length > 0) {
      const last = recordings[recordings.length - 1];
      const lastTime = last.endTime ?? last.startTime;
      if (lastTime) nextCursor = new Date(lastTime).toISOString();
    }

    return NextResponse.json({ recordings, hasMore, nextCursor });
  } catch (e) {
    console.error("[api/replays] list error:", e);
    return NextResponse.json({ recordings: [], hasMore: false }, { status: 500 });
  }
}
