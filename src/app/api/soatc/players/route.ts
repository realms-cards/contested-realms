import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isSoatcEnabled, checkTournamentParticipation } from "@/lib/soatc";

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

  const userIdsParam = request.nextUrl.searchParams.get("userIds");
  if (!userIdsParam) {
    return NextResponse.json(
      { error: "userIds query parameter required" },
      { status: 400 }
    );
  }

  const userIds = userIdsParam.split(",").filter(Boolean).slice(0, 20); // Limit to 20
  if (userIds.length === 0) {
    return NextResponse.json({ players: {} });
  }

  try {
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, soatcUuid: true },
    });

    const results: Record<
      string,
      {
        soatcUuid: string | null;
        isParticipant: boolean;
        tournamentName?: string;
      }
    > = {};

    for (const user of users) {
      if (!user.soatcUuid) {
        results[user.id] = { soatcUuid: null, isParticipant: false };
        continue;
      }

      const participation = await checkTournamentParticipation(user.soatcUuid);
      results[user.id] = {
        soatcUuid: user.soatcUuid,
        isParticipant: participation.isParticipant,
        tournamentName: participation.tournament?.name,
      };
    }

    // Fill in missing users
    for (const id of userIds) {
      if (!results[id]) {
        results[id] = { soatcUuid: null, isParticipant: false };
      }
    }

    return NextResponse.json({ players: results });
  } catch (error) {
    console.error("Error fetching SOATC player status:", error);
    return NextResponse.json(
      { error: "Failed to fetch player status" },
      { status: 500 }
    );
  }
}
