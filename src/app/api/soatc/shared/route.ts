import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkSharedTournament, isSoatcEnabled } from "@/lib/soatc";

export async function GET(request: NextRequest) {
  if (!isSoatcEnabled()) {
    return NextResponse.json(
      { error: "SOATC league features are disabled" },
      { status: 404 }
    );
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const opponentId = request.nextUrl.searchParams.get("opponentId");
  if (!opponentId) {
    return NextResponse.json(
      { error: "opponentId query parameter required" },
      { status: 400 }
    );
  }

  try {
    const [currentUser, opponent] = await Promise.all([
      prisma.user.findUnique({
        where: { id: session.user.id },
        select: { soatcUuid: true, soatcAutoDetect: true },
      }),
      prisma.user.findUnique({
        where: { id: opponentId },
        select: { soatcUuid: true, soatcAutoDetect: true },
      }),
    ]);

    if (!currentUser || !opponent) {
      return NextResponse.json({ shared: false, reason: "user_not_found" });
    }

    if (!currentUser.soatcUuid || !opponent.soatcUuid) {
      return NextResponse.json({ shared: false, reason: "missing_uuid" });
    }

    const result = await checkSharedTournament(
      currentUser.soatcUuid,
      opponent.soatcUuid
    );

    return NextResponse.json({
      shared: result.shared,
      tournament: result.tournament
        ? {
            id: result.tournament.id,
            name: result.tournament.name,
            gameType: result.tournament.game_type,
          }
        : null,
      currentUserAutoDetect: currentUser.soatcAutoDetect,
      opponentAutoDetect: opponent.soatcAutoDetect,
      bothAutoDetect: currentUser.soatcAutoDetect && opponent.soatcAutoDetect,
    });
  } catch (error) {
    console.error("Error checking shared SOATC tournament:", error);
    return NextResponse.json(
      { error: "Failed to check shared tournament" },
      { status: 500 }
    );
  }
}
