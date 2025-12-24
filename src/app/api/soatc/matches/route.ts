import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isSoatcEnabled } from "@/lib/soatc";

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

  const userId = session.user.id;
  const tournamentId = request.nextUrl.searchParams.get("tournamentId");
  const limit = parseInt(request.nextUrl.searchParams.get("limit") || "50");
  const offset = parseInt(request.nextUrl.searchParams.get("offset") || "0");

  try {
    const whereClause = {
      OR: [{ player1Id: userId }, { player2Id: userId }],
      ...(tournamentId ? { tournamentId } : {}),
    };

    const [matches, total] = await Promise.all([
      prisma.soatcMatchResult.findMany({
        where: whereClause,
        orderBy: { completedAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          player1: { select: { id: true, name: true, image: true } },
          player2: { select: { id: true, name: true, image: true } },
        },
      }),
      prisma.soatcMatchResult.count({ where: whereClause }),
    ]);

    const results = matches.map((match) => {
      const isPlayer1 = match.player1Id === userId;
      const opponent = isPlayer1 ? match.player2 : match.player1;
      const isWinner = match.winnerId === userId;

      return {
        id: match.id,
        matchId: match.matchId,
        tournamentId: match.tournamentId,
        tournamentName: match.tournamentName,
        opponent: {
          id: opponent.id,
          name: opponent.name,
          image: opponent.image,
        },
        result: match.isDraw ? "draw" : isWinner ? "win" : "loss",
        format: match.format,
        completedAt: match.completedAt.toISOString(),
        resultJson: match.resultJson,
      };
    });

    return NextResponse.json({
      matches: results,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Error fetching SOATC match history:", error);
    return NextResponse.json(
      { error: "Failed to fetch match history" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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
    const body = await request.json();
    const {
      matchId,
      tournamentId,
      tournamentName,
      player1Id,
      player1SoatcId,
      player2Id,
      player2SoatcId,
      winnerId,
      winnerSoatcId,
      isDraw,
      format,
      resultJson,
      startedAt,
    } = body;

    if (
      !matchId ||
      !tournamentId ||
      !tournamentName ||
      !player1Id ||
      !player1SoatcId ||
      !player2Id ||
      !player2SoatcId ||
      !format
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const existing = await prisma.soatcMatchResult.findUnique({
      where: { matchId },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Match result already recorded", id: existing.id },
        { status: 409 }
      );
    }

    const result = await prisma.soatcMatchResult.create({
      data: {
        matchId,
        tournamentId,
        tournamentName,
        player1Id,
        player1SoatcId,
        player2Id,
        player2SoatcId,
        winnerId: winnerId || null,
        winnerSoatcId: winnerSoatcId || null,
        isDraw: isDraw || false,
        format,
        resultJson: resultJson || {},
        startedAt: startedAt ? new Date(startedAt) : new Date(),
      },
    });

    return NextResponse.json({ id: result.id }, { status: 201 });
  } catch (error) {
    console.error("Error saving SOATC match result:", error);
    return NextResponse.json(
      { error: "Failed to save match result" },
      { status: 500 }
    );
  }
}
