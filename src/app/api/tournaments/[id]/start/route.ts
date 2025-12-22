import {
  TournamentStatus as DBTournamentStatus,
  TournamentFormat as DBTournamentFormat,
} from "@prisma/client";
import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { tournamentSocketService } from "@/lib/services/tournament-broadcast";
import { TournamentDraftEngine } from "@/lib/services/tournament-draft-engine";
import { deriveDraftSetupFromSettings } from "@/lib/tournament/draft-config";
import { getRegistrationSettings, isActiveSeat } from "@/lib/tournament/registration";

export const dynamic = "force-dynamic";

// POST /api/tournaments/[id]/start
export async function POST(
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
    const tournament = await prisma.tournament.findUnique({
      where: { id },
      include: { registrations: true },
    });

    if (!tournament) {
      return new Response(JSON.stringify({ error: "Tournament not found" }), {
        status: 404,
      });
    }

    // Only tournament creator can start the tournament
    if (tournament.creatorId !== session.user.id) {
      return new Response(
        JSON.stringify({
          error: "Only tournament creator can start the tournament",
        }),
        { status: 403 }
      );
    }

    if (tournament.status !== DBTournamentStatus.registering) {
      return new Response(
        JSON.stringify({ error: "Tournament already started" }),
        { status: 400 }
      );
    }

    const registrationSettings = getRegistrationSettings(tournament.settings);
    const activeRegistrations = tournament.registrations.filter(isActiveSeat);
    if (registrationSettings.mode === "open") {
      if (activeRegistrations.length < 2) {
        return new Response(
          JSON.stringify({
            error: "At least 2 active players are required to start",
          }),
          { status: 400 }
        );
      }
    } else if (activeRegistrations.length !== tournament.maxPlayers) {
      return new Response(
        JSON.stringify({
          error: `All players must join before starting (${activeRegistrations.length}/${tournament.maxPlayers})`,
        }),
        { status: 400 }
      );
    }

    let draftSessionId: string | null = null;

    if (tournament.format === DBTournamentFormat.draft) {
      const draftSetup = deriveDraftSetupFromSettings(tournament.settings);

      let draftSession = await prisma.draftSession.findFirst({
        where: { tournamentId: id },
        include: { participants: true },
      });

      if (!draftSession) {
        draftSession = await prisma.draftSession.create({
          data: {
            tournamentId: id,
            status: "waiting",
            packConfiguration: JSON.parse(
              JSON.stringify(draftSetup.packConfiguration)
            ),
            settings: JSON.parse(
              JSON.stringify({
                timePerPick: draftSetup.timePerPick,
                deckBuildingTime: draftSetup.deckBuildingTime,
                cubeId: draftSetup.cubeId, // Include cube ID for cube drafts
                includeCubeSideboardInStandard:
                  draftSetup.includeCubeSideboardInStandard === true,
              })
            ),
          },
          include: { participants: true },
        });
      }

      draftSessionId = draftSession.id;

      const participantsByPlayer = new Map(
        draftSession.participants.map((p) => [p.playerId, p])
      );
      const sortedRegistrations = [...activeRegistrations].sort((a, b) => {
        const aTime =
          a.registeredAt?.getTime?.() ??
          new Date(a.registeredAt ?? new Date(0)).getTime();
        const bTime =
          b.registeredAt?.getTime?.() ??
          new Date(b.registeredAt ?? new Date(0)).getTime();
        return aTime - bTime;
      });

      const participantOps = [] as Parameters<
        typeof prisma.draftParticipant.update
      >[0][];
      const participantCreates = [] as Parameters<
        typeof prisma.draftParticipant.create
      >[0][];
      const registrationOps = [] as Parameters<
        typeof prisma.tournamentRegistration.update
      >[0][];

      let seatNumber = 1;
      for (const reg of sortedRegistrations) {
        const existing = participantsByPlayer.get(reg.playerId);
        if (existing) {
          if (
            existing.seatNumber !== seatNumber ||
            existing.status !== "waiting"
          ) {
            participantOps.push({
              where: { id: existing.id },
              data: { seatNumber, status: "waiting" },
            });
          }
        } else {
          participantCreates.push({
            data: {
              draftSessionId: draftSession.id,
              playerId: reg.playerId,
              seatNumber,
              status: "waiting",
            },
          });
        }

        const currentPrep =
          (reg.preparationData as Record<string, unknown> | null) ?? {};
        const nextDraftData = {
          ...((currentPrep.draft as Record<string, unknown> | undefined) ?? {}),
          draftSessionId: draftSession.id,
          seatNumber,
          draftCompleted: false,
          deckBuilt: false,
        };

        registrationOps.push({
          where: { id: reg.id },
          data: {
            preparationStatus: "inProgress",
            deckSubmitted: false,
            preparationData: JSON.parse(
              JSON.stringify({
                ...currentPrep,
                draft: nextDraftData,
              })
            ),
          },
        });

        seatNumber += 1;
      }

      const txOps = [
        ...participantCreates.map((args) =>
          prisma.draftParticipant.create(args)
        ),
        ...participantOps.map((args) => prisma.draftParticipant.update(args)),
        ...registrationOps.map((args) =>
          prisma.tournamentRegistration.update(args)
        ),
      ];
      if (txOps.length > 0) {
        await prisma.$transaction(txOps);
      }

      if (draftSession.status === "waiting") {
        const engine = new TournamentDraftEngine(draftSession.id);
        await engine.initialize();
        await engine.broadcastStateUpdate();
      }
    }

    // Determine next status based on format
    // Change: constructed tournaments also enter 'preparing' so players can submit a deck used for ALL matches
    let nextStatus: DBTournamentStatus = DBTournamentStatus.preparing;
    if (
      tournament.format === DBTournamentFormat.draft ||
      tournament.format === DBTournamentFormat.sealed
    ) {
      nextStatus = DBTournamentStatus.preparing;
    } else {
      // constructed
      nextStatus = DBTournamentStatus.preparing;
    }

    // We no longer support starting directly into 'active'. The tournament starts in 'preparing'.

    // Start tournament
    const updatedTournament = await prisma.tournament.update({
      where: { id },
      data: {
        status: nextStatus,
        startedAt: new Date(),
      },
    });

    // Broadcast phase change event via Socket.io (fire-and-forget so API response is instant)
        tournamentSocketService
          .broadcastPhaseChanged(id, nextStatus, {
            previousStatus: tournament.status,
            startedAt: updatedTournament.startedAt?.toISOString(),
            format: tournament.format,
            totalPlayers: activeRegistrations.length,
          })
          .catch((socketError) => {
            console.warn("Failed to broadcast phase changed event:", socketError);
          });
    // Also broadcast a full tournament snapshot so lists sync immediately
    tournamentSocketService
      .broadcastTournamentUpdateById(id)
      .catch((socketError) => {
        console.warn("Failed to broadcast tournament update:", socketError);
      });

    if (draftSessionId) {
      tournamentSocketService
        .broadcastDraftReady(id, {
          draftSessionId,
          totalPlayers: activeRegistrations.length,
        })
        .catch((socketError) => {
          console.warn("Failed to broadcast draft ready event:", socketError);
        });
    }

    // If we ever reintroduce direct start into 'active', re-add round creation here.

    return new Response(
      JSON.stringify({
        success: true,
        tournamentId: id,
        draftSessionId,
        status: updatedTournament.status,
        startedAt: updatedTournament.startedAt?.getTime(),
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
