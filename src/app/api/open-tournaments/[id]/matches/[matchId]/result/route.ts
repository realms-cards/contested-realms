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

  const reporterId = session.user.id;
  const isHost = tournament.creatorId === reporterId;

  // Only match participants or the host may report a result
  if (!isHost && !matchPlayerIds.has(reporterId)) {
    return Response.json(
      { error: "Only match participants or the host can report results" },
      { status: 403 },
    );
  }

  const settings = (tournament.settings ?? {}) as unknown as OpenTournamentSettings;

  // Enforce match resolution settings server-side (UI hiding alone is bypassable)
  const resolution = settings.matchResolution;
  if (resolution) {
    if (source === "realms" && !resolution.allowRealms) {
      return Response.json(
        { error: "Realms match reporting is disabled for this tournament" },
        { status: 400 },
      );
    }
    if (source !== "realms" && !resolution.allowManualReport) {
      return Response.json(
        { error: "Manual result reporting is disabled for this tournament" },
        { status: 400 },
      );
    }
  }

  // The reported source is client-supplied and unverifiable, so it must not
  // bypass host approval: all player-submitted results need approval when enabled
  const requireApproval = resolution?.requireHostApproval === true;

  // A non-host cannot overwrite another player's pending report
  const existingResults = match.results as Record<string, unknown> | null;
  if (
    !isHost &&
    existingResults?.approvalStatus === MATCH_APPROVAL_STATUS.PENDING
  ) {
    return Response.json(
      { error: "A result is already awaiting host approval" },
      { status: 409 },
    );
  }

  if (requireApproval && !isHost) {
    // Store as pending approval (guarded so a concurrent completion is not overwritten)
    const pendingRes = await prisma.match.updateMany({
      where: { id: matchId, status: { not: "completed" } },
      data: {
        status: "active",
        results: {
          winnerId,
          loserId,
          isDraw,
          source,
          reportedBy: reporterId,
          approvalStatus: MATCH_APPROVAL_STATUS.PENDING,
        },
      },
    });
    if (pendingRes.count === 0) {
      return Response.json({ error: "Match already completed" }, { status: 400 });
    }

    return Response.json({ status: "pending_approval" });
  }

  // Apply result immediately; completion and standings update are atomic and
  // the updateMany guard makes concurrent reports idempotent
  const completed = await prisma.$transaction(async (tx) => {
    const completeRes = await tx.match.updateMany({
      where: { id: matchId, status: { not: "completed" } },
      data: {
        status: "completed",
        completedAt: new Date(),
        results: {
          winnerId,
          loserId,
          isDraw,
          source,
          reportedBy: reporterId,
          approvalStatus: MATCH_APPROVAL_STATUS.APPROVED,
        },
      },
    });
    if (completeRes.count === 0) return false;

    await updateStandingsAfterMatch(id, matchId, { winnerId, loserId, isDraw }, tx);
    return true;
  });

  if (!completed) {
    return Response.json({ error: "Match already completed" }, { status: 400 });
  }

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
    // Atomic approval: guard against a concurrent completion and keep the
    // standings update in the same transaction as the match completion
    const approved = await prisma.$transaction(async (tx) => {
      const completeRes = await tx.match.updateMany({
        where: { id: matchId, status: { not: "completed" } },
        data: {
          status: "completed",
          completedAt: new Date(),
          results: {
            ...results,
            approvalStatus: MATCH_APPROVAL_STATUS.APPROVED,
          },
        },
      });
      if (completeRes.count === 0) return false;

      await updateStandingsAfterMatch(id, matchId, {
        winnerId: results.winnerId as string,
        loserId: results.loserId as string,
        isDraw: results.isDraw as boolean,
      }, tx);
      return true;
    });

    if (!approved) {
      return Response.json({ error: "Match already completed" }, { status: 400 });
    }

    return Response.json({ status: "approved" });
  } else {
    // Rejected — reset match to pending
    const rejectRes = await prisma.match.updateMany({
      where: { id: matchId, status: { not: "completed" } },
      data: {
        status: "pending",
        results: {
          ...results,
          approvalStatus: MATCH_APPROVAL_STATUS.REJECTED,
        },
      },
    });

    if (rejectRes.count === 0) {
      return Response.json({ error: "Match already completed" }, { status: 400 });
    }

    return Response.json({ status: "rejected" });
  }
}
