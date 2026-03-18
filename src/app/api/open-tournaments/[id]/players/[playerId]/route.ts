import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { UpdatePlayerDeckSchema } from "@/lib/open-tournament/validation";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ id: string; playerId: string }> };

/** PATCH /api/open-tournaments/[id]/players/[playerId] — Update player deck info */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, playerId } = await params;

  const tournament = await prisma.tournament.findUnique({
    where: { id, format: "open" },
  });

  if (!tournament) {
    return Response.json({ error: "Tournament not found" }, { status: 404 });
  }

  // Allow the player themselves or the host to update deck info
  const isHost = tournament.creatorId === session.user.id;
  const isSelf = session.user.id === playerId;
  if (!isHost && !isSelf) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const body: unknown = await req.json();
  const parsed = UpdatePlayerDeckSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const registration = await prisma.tournamentRegistration.findFirst({
    where: { tournamentId: id, playerId },
  });

  if (!registration) {
    return Response.json({ error: "Player not registered" }, { status: 404 });
  }

  const currentPrepData = (registration.preparationData ?? {}) as Record<string, unknown>;
  const currentOpenData = (currentPrepData.open ?? {}) as Record<string, unknown>;

  const updatedPrepData = {
    ...currentPrepData,
    open: {
      ...currentOpenData,
      ...(parsed.data.deckId !== undefined ? { deckId: parsed.data.deckId } : {}),
      ...(parsed.data.curiosaUrl !== undefined ? { curiosaUrl: parsed.data.curiosaUrl } : {}),
    },
  };

  await prisma.tournamentRegistration.updateMany({
    where: { tournamentId: id, playerId },
    data: { preparationData: updatedPrepData },
  });

  return Response.json({ success: true });
}
