import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  isSoatcEnabled,
  getOngoingTournaments,
  checkTournamentParticipation,
  getCacheStatus,
} from "@/lib/soatc";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const enabled = isSoatcEnabled();
  const hasToken = !!process.env.SORCERERS_AT_THE_CORE_APITOKEN;

  if (!enabled) {
    return NextResponse.json({
      enabled: false,
      hasToken,
      message: "SOATC_LEAGUE_ENABLED is not set to 'true'",
    });
  }

  if (!hasToken) {
    return NextResponse.json({
      enabled: true,
      hasToken: false,
      message: "SORCERERS_AT_THE_CORE_APITOKEN is not configured",
    });
  }

  try {
    // Get current user's SOATC UUID
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, soatcUuid: true, soatcAutoDetect: true, name: true },
    });

    // Fetch ongoing tournaments (force refresh to bypass cache)
    const tournaments = await getOngoingTournaments(true);

    // Check participation if user has UUID
    let participation = null;
    if (user?.soatcUuid) {
      participation = await checkTournamentParticipation(user.soatcUuid);
    }

    const cacheStatus = getCacheStatus();

    return NextResponse.json({
      enabled: true,
      hasToken: true,
      user: {
        id: user?.id,
        name: user?.name,
        soatcUuid: user?.soatcUuid,
        soatcAutoDetect: user?.soatcAutoDetect,
      },
      tournaments: tournaments.map((t) => ({
        id: t.id,
        name: t.name,
        gameType: t.game_type,
        isOngoing: t.is_ongoing,
        realmsCardsAllowed: t.realms_cards_allowed,
        playersCount: t.players_count,
      })),
      participation,
      cacheStatus,
    });
  } catch (error) {
    console.error("SOATC debug error:", error);
    return NextResponse.json({
      enabled: true,
      hasToken: true,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
