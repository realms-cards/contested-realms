import { NextRequest } from "next/server";
import { getRequestPrincipal } from "@/lib/guest/request-principal.server";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ id: string }> };

/** GET /api/open-tournaments/[id]/standings — Current standings */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const principal = await getRequestPrincipal();
  if (!principal) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const tournament = await prisma.tournament.findUnique({
    where: { id, format: "open" },
    select: { id: true },
  });

  if (!tournament) {
    return Response.json({ error: "Tournament not found" }, { status: 404 });
  }

  const standings = await prisma.playerStanding.findMany({
    where: { tournamentId: id },
    orderBy: [
      { matchPoints: "desc" },
      { gameWinPercentage: "desc" },
      { opponentMatchWinPercentage: "desc" },
    ],
  });

  return Response.json({ standings });
}
