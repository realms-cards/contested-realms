import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { invalidateCache, CacheKeys } from "@/lib/cache/redis-cache";
import { getRequestPrincipal } from "@/lib/guest/request-principal.server";
import { prisma } from "@/lib/prisma";
import { buildTournamentInvitePath } from "@/lib/tournament/invite-links";

export const dynamic = "force-dynamic";

// POST /api/tournaments/[id]/invite-link  { rotate?: boolean }
// Host only. Returns the shareable invite link for a tournament (regular or
// open), minting the token on first use. `rotate` replaces it, which
// invalidates every link handed out so far.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const principal = await getRequestPrincipal();
  if (!principal) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const tournament = await prisma.tournament.findUnique({
    where: { id },
    select: { creatorId: true, format: true, inviteToken: true, status: true },
  });
  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }
  if (tournament.creatorId !== principal.id) {
    return NextResponse.json(
      { error: "Only the host can create invite links" },
      { status: 403 },
    );
  }
  if (tournament.status === "completed" || tournament.status === "cancelled") {
    return NextResponse.json(
      { error: "Tournament is already over" },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const rotate = body?.rotate === true;
  let token = tournament.inviteToken;
  if (!token || rotate) {
    token = randomBytes(16).toString("hex");
    await prisma.tournament.update({
      where: { id },
      data: { inviteToken: token },
    });
    await invalidateCache(`${CacheKeys.tournaments.detail(id)}*`);
  }

  const kind = tournament.format === "open" ? "open" : "tournament";
  return NextResponse.json({
    inviteToken: token,
    path: buildTournamentInvitePath(kind, id, token),
  });
}
