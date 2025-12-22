import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { tournamentSocketService } from "@/lib/services/tournament-broadcast";
import { createRoundMatches, generatePairings } from "@/lib/tournament/pairing";
import { getRegistrationSettings } from "@/lib/tournament/registration";

export const dynamic = "force-dynamic";

// PATCH /api/tournaments/[id]/registration
// Body: { locked: boolean }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  try {
    const body = await req.json();
    const locked = Boolean(body?.locked);

    const tournament = await prisma.tournament.findUnique({
      where: { id },
    });

    if (!tournament) {
      return new Response(JSON.stringify({ error: "Tournament not found" }), {
        status: 404,
      });
    }

    if (tournament.creatorId !== session.user.id) {
      return new Response(
        JSON.stringify({ error: "Only tournament creator can update settings" }),
        { status: 403 }
      );
    }

    if (!["registering", "preparing", "active"].includes(tournament.status)) {
      return new Response(
        JSON.stringify({ error: "Tournament registration cannot be updated" }),
        { status: 400 }
      );
    }

    const registrationSettings = getRegistrationSettings(tournament.settings);
    if (registrationSettings.mode !== "open") {
      return new Response(
        JSON.stringify({ error: "Registration locking is only supported for open seat tournaments" }),
        { status: 400 }
      );
    }

    const currentSettings = (tournament.settings as Record<string, unknown>) || {};
    const updatedSettings = {
      ...currentSettings,
      registration: {
        ...((currentSettings.registration as Record<string, unknown> | undefined) ?? {}),
        mode: "open",
        locked,
      },
    };

    const updatedTournament = await prisma.tournament.update({
      where: { id },
      data: {
        settings: JSON.parse(JSON.stringify(updatedSettings)),
      },
    });

    if (locked && tournament.status === "preparing") {
      const activeRegistrations = await prisma.tournamentRegistration.findMany({
        where: { tournamentId: id, seatStatus: "active" },
        select: { preparationStatus: true, deckSubmitted: true },
      });
      const allReady =
        activeRegistrations.length > 0 &&
        activeRegistrations.every(
          (reg) =>
            reg.preparationStatus === "completed" && reg.deckSubmitted === true
        );

      if (allReady) {
        await prisma.tournament.update({
          where: { id },
          data: { status: "active" },
        });

        const existingRound = await prisma.tournamentRound.findFirst({
          where: { tournamentId: id },
          select: { id: true },
        });

        if (!existingRound) {
          const pairings = await generatePairings(id);
          const pendingRound = await prisma.tournamentRound.create({
            data: {
              tournamentId: id,
              roundNumber: 1,
              status: "pending",
              pairingData: {
                algorithm: "swiss",
                seed: Date.now(),
                byes: pairings.byes.map((bye) => bye.playerId),
              },
            },
          });

          await createRoundMatches(id, pendingRound.id, pairings, {
            assignMatches: false,
            applyByes: false,
          });
        }

        try {
          await tournamentSocketService.broadcastPhaseChanged(id, "active", {
            previousStatus: "preparing",
            message: "Registration locked. Host can start the next round when ready.",
          });
        } catch (socketError) {
          console.warn("Failed to broadcast phase change:", socketError);
        }
      }
    }

    try {
      await tournamentSocketService.broadcastTournamentUpdateById(id);
    } catch (socketErr) {
      console.warn("Failed to broadcast registration update:", socketErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        tournamentId: id,
        locked,
        settings: updatedTournament.settings,
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    );
  } catch (e: unknown) {
    const message =
      e instanceof Error
        ? e.message
        : typeof e === "string"
        ? e
        : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
