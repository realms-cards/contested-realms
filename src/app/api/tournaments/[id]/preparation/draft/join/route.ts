import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// POST /api/tournaments/[id]/preparation/draft/join
// Join or create a draft session for the tournament
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const userId = session.user.id;
    const registration = await prisma.tournamentRegistration.findFirst({
      where: {
        tournamentId: id,
        playerId: userId
      },
      include: {
        tournament: {
          select: {
            format: true,
            status: true,
            settings: true,
            registrations: {
              select: {
                playerId: true,
                preparationStatus: true,
                player: {
                  select: { name: true }
                }
              }
            }
          }
        }
      }
    });

    if (!registration) {
      return new Response(JSON.stringify({ error: 'Not registered for this tournament' }), { status: 404 });
    }

    if (registration.tournament.format !== 'draft') {
      return new Response(JSON.stringify({ error: 'Tournament is not draft format' }), { status: 400 });
    }

    if (registration.tournament.status !== 'preparing') {
      return new Response(JSON.stringify({ error: 'Tournament is not in preparation phase' }), { status: 400 });
    }

    // Auto-start preparation if not started yet
    if (registration.preparationStatus === 'notStarted') {
      const initialPreparationData = {
        draft: {
          draftCompleted: false,
          deckBuilt: false,
          draftSessionId: null,
          deckList: []
        }
      };

      await prisma.tournamentRegistration.update({
        where: { id: registration.id },
        data: {
          preparationStatus: 'inProgress',
          preparationData: JSON.parse(JSON.stringify(initialPreparationData))
        }
      });

      // Update local registration object
      registration.preparationStatus = 'inProgress';
      registration.preparationData = initialPreparationData;
    } else if (registration.preparationStatus !== 'inProgress') {
      return new Response(JSON.stringify({ error: `Invalid preparation status: ${registration.preparationStatus}` }), { status: 400 });
    }

    // Check if a draft session already exists for this tournament
    let draftSession = await prisma.draftSession.findFirst({
      where: { tournamentId: id },
      include: {
        participants: {
          include: {
            player: {
              select: { name: true }
            }
          }
        }
      }
    });

    // Create draft session if it doesn't exist
    if (!draftSession) {
      const settings = registration.tournament.settings as Record<string, unknown> || {};
      const draftConfig = (settings.draftConfig as Record<string, unknown>)
        || (settings.draft as Record<string, unknown>)
        || {};
      // Build pack configuration from packCounts when provided
      const packCounts = (draftConfig.packCounts as Record<string, number>) || {};
      let packConfiguration = (draftConfig.packConfiguration as Array<{ setId: string; packCount: number }>) || [];
      if (!Array.isArray(packConfiguration) || packConfiguration.length === 0) {
        const entries = Object.entries(packCounts).filter(([, n]) => (n || 0) > 0);
        if (entries.length) {
          packConfiguration = entries.map(([setName, n]) => ({ setId: setName, packCount: Number(n) || 0 }));
        } else {
          packConfiguration = [{ setId: 'Beta', packCount: 3 }];
        }
      }

      draftSession = await prisma.draftSession.create({
        data: {
          tournamentId: id,
          status: 'waiting',
          packConfiguration: JSON.parse(JSON.stringify(packConfiguration)),
          settings: JSON.parse(JSON.stringify({
            timePerPick: (draftConfig.draftTimeLimit as number) || 90,
            deckBuildingTime: (draftConfig.deckBuildingTimeLimit as number) || 30
          }))
        },
        include: {
          participants: {
            include: {
              player: {
                select: { name: true }
              }
            }
          }
        }
      });
    }

    // Check if player is already in the session
    const existingParticipant = draftSession.participants.find(p => p.playerId === userId);
    
    if (!existingParticipant) {
      // Add player to draft session
      await prisma.draftParticipant.create({
        data: {
          draftSessionId: draftSession.id,
          playerId: userId,
          seatNumber: draftSession.participants.length + 1,
          status: 'waiting'
        }
      });

      // Refresh session data
      draftSession = await prisma.draftSession.findUnique({
        where: { id: draftSession.id },
        include: {
          participants: {
            include: {
              player: {
                select: { name: true }
              }
            },
            orderBy: { seatNumber: 'asc' }
          }
        }
      });
    }

    if (!draftSession) {
      return new Response(JSON.stringify({ error: 'Failed to create or join draft session' }), { status: 500 });
    }

    // Check if all players have joined and we can start the draft
    const totalPlayers = registration.tournament.registrations.length;
    const joinedPlayers = draftSession.participants.length;
    
    if (joinedPlayers === totalPlayers && draftSession.status === 'waiting') {
      // All players joined, start the draft
      await prisma.draftSession.update({
        where: { id: draftSession.id },
        data: {
          status: 'active',
          startedAt: new Date()
        }
      });

      draftSession.status = 'active';
      console.log(`Draft session ${draftSession.id} started with ${totalPlayers} players`);
    }

    // Update player's preparation data with draft session ID
    const currentPrepData = registration.preparationData as Record<string, unknown> || {};
    const updatedPrepData = {
      ...currentPrepData,
      draft: {
        ...(currentPrepData.draft as Record<string, unknown> || {}),
        draftSessionId: draftSession.id,
        joinedAt: new Date().toISOString()
      }
    };

    await prisma.tournamentRegistration.update({
      where: { id: registration.id },
      data: {
        preparationData: JSON.parse(JSON.stringify(updatedPrepData))
      }
    });

    return new Response(JSON.stringify({
      success: true,
      draftSession: {
        id: draftSession.id,
        status: draftSession.status,
        participants: draftSession.participants.map(p => ({
          playerId: p.playerId,
          playerName: p.player.name,
          seatNumber: p.seatNumber,
          status: p.status
        })),
        settings: draftSession.settings,
        packConfiguration: draftSession.packConfiguration,
        startedAt: draftSession.startedAt?.toISOString() || null
      },
      playersJoined: joinedPlayers,
      totalPlayers,
      canStart: joinedPlayers === totalPlayers
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: unknown) {
    console.error('Error joining draft session:', e);
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
