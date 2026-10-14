import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { SOATC_LEAGUE_SLUG } from "@/lib/leagues/membership";
import { prisma } from "@/lib/prisma";
import { checkTournamentParticipation, isSoatcEnabled } from "@/lib/soatc";

export async function GET() {
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

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        soatcUuid: true,
        soatcAutoDetect: true,
        leagueOptOuts: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Opted-out players keep their UUID but take no part in tournaments here
    if (user.leagueOptOuts.includes(SOATC_LEAGUE_SLUG)) {
      return NextResponse.json({
        soatcUuid: user.soatcUuid,
        soatcAutoDetect: user.soatcAutoDetect,
        isParticipant: false,
        optedOut: true,
      });
    }

    const participation = await checkTournamentParticipation(user.soatcUuid);

    return NextResponse.json({
      soatcUuid: user.soatcUuid,
      soatcAutoDetect: user.soatcAutoDetect,
      ...participation,
    });
  } catch (error) {
    console.error("Error checking SOATC status:", error);
    return NextResponse.json(
      { error: "Failed to check SOATC status" },
      { status: 500 }
    );
  }
}
