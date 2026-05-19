import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function findSetupStartIndex(actions: Array<{ patch: unknown; timestamp: number; playerId: string }>): number {
  for (let i = 0; i < actions.length; i++) {
    const p = actions[i]?.patch;
    if (!p || typeof p !== "object") continue;
    const patch = p as Record<string, unknown>;
    if (patch.setupWinner === "p1" || patch.setupWinner === "p2") return i;
    const dr = patch.d20Rolls as Record<string, unknown> | undefined;
    if (dr && (dr.p1 != null || dr.p2 != null)) return i;
  }
  return -1;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
): Promise<NextResponse> {
  const { matchId } = await params;
  if (!matchId) return NextResponse.json({ error: "Missing matchId" }, { status: 400 });

  try {
    const session = await prisma.onlineMatchSession.findUnique({ where: { id: matchId } });
    const actionRows = await prisma.onlineMatchAction.findMany({
      where: { matchId },
      orderBy: { timestamp: "asc" },
    });

    if (!session && actionRows.length === 0) {
      return NextResponse.json({ error: "Recording not found" }, { status: 404 });
    }

    const actions = actionRows.map((a) => ({
      patch: a.patch,
      timestamp: Number(a.timestamp || 0),
      playerId: a.playerId || "system",
    }));

    const initialState = {
      playerIds: Array.isArray(session?.playerIds) ? (session.playerIds as string[]) : [],
      seed: session?.seed || "",
      matchType: session?.matchType || "constructed",
      playerDecks: session?.playerDecks || null,
    };

    const mr = await prisma.matchResult.findFirst({ where: { matchId } });
    let playerNames: string[] = [];
    if (mr && Array.isArray(mr.players)) {
      playerNames = (mr.players as Record<string, unknown>[]).map((p) =>
        p && typeof p === "object" ? String(p.displayName || p.id || "Player") : "Player"
      );
      if (initialState.playerIds.length === 0) {
        initialState.playerIds = (mr.players as Record<string, unknown>[])
          .map((p) => (p && typeof p === "object" ? String(p.id || "") : ""))
          .filter(Boolean);
      }
    } else if (initialState.playerIds.length > 0) {
      const users = await prisma.user.findMany({
        where: { id: { in: initialState.playerIds } },
        select: { id: true, name: true },
      });
      const nameById = new Map(users.map((u) => [u.id, u.name || u.id]));
      playerNames = initialState.playerIds.map((pid) => nameById.get(pid) || pid);
    }

    const endTime = mr?.completedAt
      ? new Date(mr.completedAt).getTime()
      : session?.updatedAt
        ? new Date(session.updatedAt).getTime()
        : undefined;

    let startTime: number;
    if (mr?.completedAt && mr.duration != null) {
      startTime = (endTime ?? 0) - Number(mr.duration) * 1000;
    } else if (session?.createdAt) {
      startTime = new Date(session.createdAt).getTime();
    } else if (actions.length > 0) {
      startTime = actions[0].timestamp;
    } else {
      startTime = Date.now();
    }

    const cutIdx = findSetupStartIndex(actions);
    if (cutIdx > 0 && cutIdx < actions.length) {
      const t0 = actions[cutIdx].timestamp;
      actions.splice(0, cutIdx);
      startTime = t0;
    }

    const recording = { matchId, playerNames, startTime, endTime, initialState, actions };
    return NextResponse.json({ recording });
  } catch (e) {
    console.error("[api/replays] load error:", e);
    return NextResponse.json({ error: "Recording not found" }, { status: 500 });
  }
}
