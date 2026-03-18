import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import {
  DEFAULT_OPEN_TOURNAMENT_SETTINGS,
  type OpenTournamentSettings,
} from "@/lib/open-tournament/types";
import {
  CreateOpenTournamentSchema,
} from "@/lib/open-tournament/validation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** GET /api/open-tournaments — List open-format tournaments */
export async function GET(req: NextRequest) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") || 50)));
  const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
  const q = (url.searchParams.get("q") || "").trim();
  const statusParam = url.searchParams.get("status");

  const statusFilter = statusParam === "all"
    ? undefined
    : statusParam
      ? { in: statusParam.split(",").filter(Boolean) as ("active" | "completed" | "cancelled")[] }
      : { in: ["active" as const] };

  const where = {
    format: "open" as const,
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
    OR: [
      { isPrivate: false },
      { creatorId: session.user.id },
      { registrations: { some: { playerId: session.user.id } } },
    ],
  };

  const [tournaments, total] = await Promise.all([
    prisma.tournament.findMany({
      where,
      include: {
        registrations: {
          include: { player: { select: { id: true, name: true } } },
        },
        standings: {
          orderBy: [
            { matchPoints: "desc" },
            { gameWinPercentage: "desc" },
          ],
        },
        rounds: { orderBy: { roundNumber: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.tournament.count({ where }),
  ]);

  return Response.json({ tournaments, total, limit, offset });
}

/** POST /api/open-tournaments — Create a new open tournament */
export async function POST(req: NextRequest) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: unknown = await req.json();
  const parsed = CreateOpenTournamentSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const input = parsed.data;

  // Build settings
  const settings: OpenTournamentSettings = {
    ...DEFAULT_OPEN_TOURNAMENT_SETTINGS,
    playNetworkUrl: input.playNetworkUrl,
    matchResolution: {
      ...DEFAULT_OPEN_TOURNAMENT_SETTINGS.matchResolution,
      ...input.matchResolution,
    },
    pairing: {
      ...DEFAULT_OPEN_TOURNAMENT_SETTINGS.pairing,
      ...input.pairing,
    },
  };

  const tournament = await prisma.tournament.create({
    data: {
      name: input.name,
      format: "open",
      status: "active", // Open tournaments skip registering/preparing
      maxPlayers: input.maxPlayers,
      isPrivate: input.isPrivate,
      creatorId: session.user.id,
      settings: JSON.parse(JSON.stringify(settings)),
    },
    include: {
      registrations: true,
      standings: true,
    },
  });

  return Response.json({ tournament }, { status: 201 });
}
