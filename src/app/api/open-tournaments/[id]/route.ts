import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import type { OpenTournamentSettings } from "@/lib/open-tournament/types";
import { UpdateOpenTournamentSchema } from "@/lib/open-tournament/validation";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ id: string }> };

/** GET /api/open-tournaments/[id] — Tournament detail */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const tournament = await prisma.tournament.findUnique({
    where: { id, format: "open" },
    include: {
      registrations: {
        include: { player: { select: { id: true, name: true, image: true } } },
      },
      standings: {
        orderBy: [
          { matchPoints: "desc" },
          { gameWinPercentage: "desc" },
          { opponentMatchWinPercentage: "desc" },
        ],
      },
      rounds: {
        include: {
          matches: true,
        },
        orderBy: { roundNumber: "asc" },
      },
    },
  });

  if (!tournament) {
    return Response.json({ error: "Tournament not found" }, { status: 404 });
  }

  return Response.json({ tournament });
}

/** PATCH /api/open-tournaments/[id] — Update tournament settings */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
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
    return Response.json({ error: "Only the host can update settings" }, { status: 403 });
  }

  const body: unknown = await req.json();
  const parsed = UpdateOpenTournamentSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const currentSettings = (tournament.settings ?? {}) as Record<string, unknown>;
  const currentMatchRes = (currentSettings.matchResolution ?? {}) as Record<string, unknown>;
  const currentPairing = (currentSettings.pairing ?? {}) as Record<string, unknown>;

  const updatedSettings: OpenTournamentSettings = {
    mode: "open",
    playNetworkUrl: input.playNetworkUrl !== undefined
      ? (input.playNetworkUrl ?? undefined)
      : (currentSettings.playNetworkUrl as string | undefined),
    matchResolution: {
      allowRealms: input.matchResolution?.allowRealms ?? (currentMatchRes.allowRealms as boolean) ?? true,
      allowManualReport: input.matchResolution?.allowManualReport ?? (currentMatchRes.allowManualReport as boolean) ?? true,
      requireHostApproval: input.matchResolution?.requireHostApproval ?? (currentMatchRes.requireHostApproval as boolean) ?? true,
    },
    pairing: {
      source: input.pairing?.source ?? (currentPairing.source as "swiss" | "manual") ?? "swiss",
      totalRounds: input.pairing?.totalRounds !== undefined
        ? (input.pairing.totalRounds ?? undefined)
        : (currentPairing.totalRounds as number | undefined),
    },
  };

  const updated = await prisma.tournament.update({
    where: { id },
    data: {
      ...(input.name ? { name: input.name } : {}),
      ...(input.maxPlayers ? { maxPlayers: input.maxPlayers } : {}),
      ...(input.isPrivate !== undefined ? { isPrivate: input.isPrivate } : {}),
      settings: JSON.parse(JSON.stringify(updatedSettings)),
    },
  });

  return Response.json({ tournament: updated });
}

/** DELETE /api/open-tournaments/[id] — Cancel tournament */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
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
    return Response.json({ error: "Only the host can cancel" }, { status: 403 });
  }

  await prisma.tournament.update({
    where: { id },
    data: { status: "cancelled" },
  });

  return Response.json({ success: true });
}
