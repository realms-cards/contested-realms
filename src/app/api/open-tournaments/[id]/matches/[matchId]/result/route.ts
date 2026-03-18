import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { MATCH_APPROVAL_STATUS } from "@/lib/open-tournament/constants";
import type { OpenTournamentSettings } from "@/lib/open-tournament/types";
import {
  MatchApprovalSchema,
  MatchResultSchema,
} from "@/lib/open-tournament/validation";
import { prisma } from "@/lib/prisma";
import { updateStandingsAfterMatch } from "@/lib/tournament/pairing";

type RouteParams = { params: Promise<{ id: string; matchId: string }> };

/** POST — Report a match result */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, matchId } = await params;

  const tournament = await prisma.tournament.findUnique({
    where: { id, format: "open" },
  });

  if (!tournament) {
    return Response.json({ error: "Tournament not found" }, { status: 404 });
  }

  const match = await prisma.match.findUnique({
    where: { id: matchId, tournamentId: id },
  });

  if (!match) {
    return Response.json({ error: "Match not found" }, { status: 404 });
  }
  if (match.status === "completed") {
    return Response.json({ error: "Match already completed" }, { status: 400 });
  }

  const body: unknown = await req.json();
  const parsed = MatchResultSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { winnerId, loserId, isDraw, source } = parsed.data;

  // Validate players are in this match
  const matchPlayers = match.players as Array<{ id: string }>;
  const matchPlayerIds = new Set(matchPlayers.map((p) => p.id));
  if (!matchPlayerIds.has(winnerId) || !matchPlayerIds.has(loserId)) {
    return Response.json(
      { error: "Winner and loser must be players in this match" },
      { status: 400 },
    );
  }

  const settings = (tournament.settings ?? {}) as unknown as OpenTournamentSettings;
  const requireApproval =
    settings.matchResolution?.requireHostApproval &&
    source !== "realms";

  const isHost = tournament.creatorId === session.user.id;

  if (requireApproval && !isHost) {
    // Store as pending approval
    await prisma.match.update({
      where: { id: matchId },
      data: {
        status: "active",
        results: {
          winnerId,
          loserId,
          isDraw,
          source,
          approvalStatus: MATCH_APPROVAL_STATUS.PENDING,
        },
      },
    });

    return Response.json({ status: "pending_approval" });
  }

  // Apply result immediately
  await prisma.match.update({
    where: { id: matchId },
    data: {
      status: "completed",
      completedAt: new Date(),
      results: {
        winnerId,
        loserId,
        isDraw,
        source,
        approvalStatus: MATCH_APPROVAL_STATUS.APPROVED,
      },
    },
  });

  await updateStandingsAfterMatch(id, matchId, { winnerId, loserId, isDraw });

  return Response.json({ status: "completed" });
}

/** PATCH — Approve or reject a pending result */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, matchId } = await params;

  const tournament = await prisma.tournament.findUnique({
    where: { id, format: "open" },
  });

  if (!tournament) {
    return Response.json({ error: "Tournament not found" }, { status: 404 });
  }
  if (tournament.creatorId !== session.user.id) {
    return Response.json({ error: "Only the host can approve results" }, { status: 403 });
  }

  const match = await prisma.match.findUnique({
    where: { id: matchId, tournamentId: id },
  });

  if (!match) {
    return Response.json({ error: "Match not found" }, { status: 404 });
  }

  const results = match.results as Record<string, unknown> | null;
  if (!results || results.approvalStatus !== MATCH_APPROVAL_STATUS.PENDING) {
    return Response.json({ error: "No pending result to approve" }, { status: 400 });
  }

  const body: unknown = await req.json();
  const parsed = MatchApprovalSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (parsed.data.approved) {
    await prisma.match.update({
      where: { id: matchId },
      data: {
        status: "completed",
        completedAt: new Date(),
        results: {
          ...results,
          approvalStatus: MATCH_APPROVAL_STATUS.APPROVED,
        },
      },
    });

    await updateStandingsAfterMatch(id, matchId, {
      winnerId: results.winnerId as string,
      loserId: results.loserId as string,
      isDraw: results.isDraw as boolean,
    });

    return Response.json({ status: "approved" });
  } else {
    // Rejected — reset match to pending
    await prisma.match.update({
      where: { id: matchId },
      data: {
        status: "pending",
        results: {
          ...results,
          approvalStatus: MATCH_APPROVAL_STATUS.REJECTED,
        },
      },
    });

    return Response.json({ status: "rejected" });
  }
}
