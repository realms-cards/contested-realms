import { NextResponse } from "next/server";
import { recomputeLadder } from "@/lib/admin/actions";
import { AdminAccessError, requireAdminSession } from "@/lib/admin/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ladder moderation.
 *   POST { op: "unrate", matchId }               -> mark one result unrated
 *   POST { op: "exclude", userId, excluded }     -> toggle User.ladderExcluded
 * Both trigger a best-effort replay so the ladder reflects the change.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireAdminSession();
    const body = (await request.json().catch(() => null)) as
      | { op?: unknown; matchId?: unknown; userId?: unknown; excluded?: unknown }
      | null;
    const op = body?.op;

    if (op === "unrate") {
      const matchId = typeof body?.matchId === "string" ? body.matchId.trim() : "";
      if (!matchId) {
        return NextResponse.json({ error: "matchId is required" }, { status: 400 });
      }
      const existing = await prisma.matchResult.findUnique({ where: { matchId } });
      if (!existing) {
        return NextResponse.json({ error: "Match result not found" }, { status: 404 });
      }
      const updated = await prisma.matchResult.update({
        where: { matchId },
        data: { rated: false, ratedMode: "full", unratedReason: "admin" },
        select: { matchId: true, rated: true, unratedReason: true },
      });
      const replay = await recomputeLadder();
      return NextResponse.json({ ok: true, match: updated, replay });
    }

    if (op === "exclude") {
      const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
      const excluded = body?.excluded !== false;
      if (!userId) {
        return NextResponse.json({ error: "userId is required" }, { status: 400 });
      }
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      const updated = await prisma.user.update({
        where: { id: userId },
        data: { ladderExcluded: excluded },
        select: { id: true, name: true, ladderExcluded: true },
      });
      const replay = await recomputeLadder();
      return NextResponse.json({ ok: true, user: updated, replay });
    }

    return NextResponse.json({ error: "Unknown op (use unrate | exclude)" }, { status: 400 });
  } catch (error) {
    if (error instanceof AdminAccessError) {
      return new NextResponse("Forbidden", { status: 403 });
    }
    console.error("[admin] ladder moderation failed:", error);
    return NextResponse.json({ error: "Ladder moderation failed" }, { status: 500 });
  }
}
