import { NextRequest, NextResponse } from "next/server";
import {
  ensureGuestUser,
  getRequestPrincipal,
} from "@/lib/guest/request-principal.server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// POST /api/open-tournaments/[id]/join  { inviteToken, displayName? }
// Self-registration through the host's invite link. Open tournaments are
// host-managed, so the link is the invitation: it is required even for
// tournaments that are not private. Guests (invite-link players without an
// account) get a shadow User row so the registration/standing rows can exist.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const principal = await getRequestPrincipal();
  if (!principal) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const inviteToken =
    typeof body?.inviteToken === "string" ? body.inviteToken.trim() : "";
  const requestedName =
    typeof body?.displayName === "string" ? body.displayName.trim() : "";

  const tournament = await prisma.tournament.findUnique({
    where: { id, format: "open" },
    include: {
      registrations: { select: { playerId: true, seatStatus: true } },
    },
  });
  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }
  if (tournament.status === "completed" || tournament.status === "cancelled") {
    return NextResponse.json(
      { error: "Tournament is not active" },
      { status: 400 },
    );
  }
  if (!tournament.inviteToken || inviteToken !== tournament.inviteToken) {
    return NextResponse.json(
      { error: "This tournament can only be joined through its invite link" },
      { status: 403 },
    );
  }
  if (tournament.registrations.some((r) => r.playerId === principal.id)) {
    return NextResponse.json(
      { ok: true, alreadyRegistered: true },
      { status: 200 },
    );
  }
  if (tournament.registrations.length >= tournament.maxPlayers) {
    return NextResponse.json({ error: "Tournament is full" }, { status: 409 });
  }

  await ensureGuestUser(principal);
  const user = await prisma.user.findUnique({
    where: { id: principal.id },
    select: { name: true },
  });
  const displayName =
    requestedName || principal.name || user?.name || "Anonymous";

  const [registration] = await prisma.$transaction([
    prisma.tournamentRegistration.create({
      data: {
        tournamentId: id,
        playerId: principal.id,
        seatStatus: "active",
        preparationStatus: "completed", // No preparation needed for open
        preparationData: {},
      },
    }),
    prisma.playerStanding.create({
      data: {
        tournamentId: id,
        playerId: principal.id,
        displayName,
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

  return NextResponse.json({ registration }, { status: 201 });
}
