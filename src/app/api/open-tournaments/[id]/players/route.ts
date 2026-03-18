import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { AddPlayerSchema } from "@/lib/open-tournament/validation";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ id: string }> };

/** GET /api/open-tournaments/[id]/players — List players */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const registrations = await prisma.tournamentRegistration.findMany({
    where: { tournamentId: id, tournament: { format: "open" } },
    include: {
      player: { select: { id: true, name: true, image: true } },
    },
  });

  const standings = await prisma.playerStanding.findMany({
    where: { tournamentId: id },
    orderBy: [
      { matchPoints: "desc" },
      { gameWinPercentage: "desc" },
    ],
  });

  const standingsMap = new Map(standings.map((s) => [s.playerId, s]));

  const players = registrations.map((reg) => {
    const standing = standingsMap.get(reg.playerId);
    const prepData = reg.preparationData as Record<string, unknown> | null;
    const openData = (prepData?.open ?? {}) as Record<string, unknown>;

    return {
      playerId: reg.playerId,
      displayName: reg.player.name ?? "Unknown",
      image: reg.player.image,
      seatStatus: reg.seatStatus,
      deckId: openData.deckId as string | undefined,
      curiosaUrl: openData.curiosaUrl as string | undefined,
      wins: standing?.wins ?? 0,
      losses: standing?.losses ?? 0,
      draws: standing?.draws ?? 0,
      matchPoints: standing?.matchPoints ?? 0,
      isEliminated: standing?.isEliminated ?? false,
    };
  });

  return Response.json({ players });
}

/** POST /api/open-tournaments/[id]/players — Add a player */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const tournament = await prisma.tournament.findUnique({
    where: { id, format: "open" },
    include: { registrations: { select: { playerId: true } } },
  });

  if (!tournament) {
    return Response.json({ error: "Tournament not found" }, { status: 404 });
  }
  if (tournament.creatorId !== session.user.id) {
    return Response.json({ error: "Only the host can add players" }, { status: 403 });
  }
  if (tournament.status === "completed" || tournament.status === "cancelled") {
    return Response.json({ error: "Tournament is not active" }, { status: 400 });
  }

  const body: unknown = await req.json();
  const parsed = AddPlayerSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { userId } = parsed.data;

  // Check player exists
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true },
  });
  if (!user) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  // Check not already registered
  const existing = tournament.registrations.find((r) => r.playerId === userId);
  if (existing) {
    return Response.json({ error: "Player already registered" }, { status: 409 });
  }

  // Create registration and standing in a transaction
  const [registration] = await prisma.$transaction([
    prisma.tournamentRegistration.create({
      data: {
        tournamentId: id,
        playerId: userId,
        seatStatus: "active",
        preparationStatus: "completed", // No preparation needed for open
        preparationData: {},
      },
    }),
    prisma.playerStanding.create({
      data: {
        tournamentId: id,
        playerId: userId,
        displayName: user.name ?? "Unknown",
        matchPoints: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        gameWinPercentage: 0,
        opponentMatchWinPercentage: 0,
        isEliminated: false,
      },
    }),
  ]);

  return Response.json({ registration }, { status: 201 });
}

/** DELETE /api/open-tournaments/[id]/players — Remove a player */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const tournament = await prisma.tournament.findUnique({
    where: { id, format: "open" },
  });

  if (!tournament) {
    return Response.json({ error: "Tournament not found" }, { status: 404 });
  }
  if (tournament.creatorId !== session.user.id) {
    return Response.json({ error: "Only the host can remove players" }, { status: 403 });
  }

  const body: unknown = await req.json();
  const { userId } = body as { userId: string };

  if (!userId) {
    return Response.json({ error: "userId is required" }, { status: 400 });
  }

  // Mark seat as vacant and player as eliminated (preserve history)
  await prisma.$transaction([
    prisma.tournamentRegistration.updateMany({
      where: { tournamentId: id, playerId: userId },
      data: { seatStatus: "vacant" },
    }),
    prisma.playerStanding.updateMany({
      where: { tournamentId: id, playerId: userId },
      data: { isEliminated: true },
    }),
  ]);

  return Response.json({ success: true });
}
