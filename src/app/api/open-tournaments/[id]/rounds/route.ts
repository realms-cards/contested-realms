import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ id: string }> };

/** GET /api/open-tournaments/[id]/rounds — List rounds */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const rounds = await prisma.tournamentRound.findMany({
    where: { tournamentId: id, tournament: { format: "open" } },
    include: {
      matches: {
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { roundNumber: "asc" },
  });

  return Response.json({ rounds });
}

/** POST /api/open-tournaments/[id]/rounds — Create next round */
export async function POST(_req: NextRequest, { params }: RouteParams) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const tournament = await prisma.tournament.findUnique({
    where: { id, format: "open" },
    include: {
      rounds: { orderBy: { roundNumber: "desc" }, take: 1 },
    },
  });

  if (!tournament) {
    return Response.json({ error: "Tournament not found" }, { status: 404 });
  }
  if (tournament.creatorId !== session.user.id) {
    return Response.json({ error: "Only the host can create rounds" }, { status: 403 });
  }
  if (tournament.status !== "active") {
    return Response.json({ error: "Tournament is not active" }, { status: 400 });
  }

  // Check previous round is completed (if any)
  const lastRound = tournament.rounds[0];
  if (lastRound && lastRound.status !== "completed") {
    return Response.json(
      { error: "Previous round must be completed before starting a new one" },
      { status: 400 },
    );
  }

  const nextRoundNumber = (lastRound?.roundNumber ?? 0) + 1;

  const round = await prisma.tournamentRound.create({
    data: {
      tournamentId: id,
      roundNumber: nextRoundNumber,
      status: "active",
    },
  });

  return Response.json({ round }, { status: 201 });
}
