import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { tournamentSocketService } from '@/lib/services/tournament-broadcast';

export const dynamic = 'force-dynamic';

// POST /api/tournaments/[id]/join
// Body: { displayName?: string }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const userId = session.user.id;
    // Handle empty request body gracefully
    let body: { displayName?: string } = {};
    try {
      const text = await req.text();
      if (text.trim()) {
        body = JSON.parse(text);
      }
    } catch (jsonError) {
      // If JSON parsing fails, use empty object (displayName will be inferred)
      console.log("Invalid or empty JSON body, using default:", jsonError);
    }
    
    console.log("Tournament join attempt:", { tournamentId: id, userId });
    
    // Get user info for display name fallback
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true }
    });
    
    if (!user) {
      console.error("User not found in database:", session.user.id);
      return new Response(JSON.stringify({ error: 'User not found' }), { status: 404 });
    }
    
    const displayName = String(
      body?.displayName || 
      user?.name || 
      (user?.email ? user.email.split('@')[0] : null) || 
      'Anonymous'
    ).trim();

    const tournament = await prisma.tournament.findUnique({
      where: { id },
      include: { registrations: true }
    });

    if (!tournament) {
      return new Response(JSON.stringify({ error: 'Tournament not found' }), { status: 404 });
    }

    if (tournament.status !== 'registering') {
      return new Response(JSON.stringify({ error: 'Tournament registration is closed' }), { status: 400 });
    }

    // Check if already registered (return success to avoid surfacing an error to existing participants)
    const existingRegistration = tournament.registrations.find(reg => reg.playerId === userId);
    if (existingRegistration) {
      return new Response(JSON.stringify({
        success: true,
        alreadyRegistered: true,
        registrationId: existingRegistration.id,
        playerId: userId,
        displayName,
        currentPlayerCount: tournament.registrations.length
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    if (tournament.registrations.length >= tournament.maxPlayers) {
      return new Response(JSON.stringify({ error: 'Tournament is full' }), { status: 400 });
    }

    // Enforce "one lobby rule" - check if user is in any other active tournament or lobby
    const existingTournamentRegistrations = await prisma.tournamentRegistration.findMany({
      where: {
        playerId: userId,
        tournamentId: { not: id }, // Not this tournament
        tournament: {
          status: { in: ['registering', 'preparing', 'active'] }
        }
      },
      include: { tournament: { select: { name: true } } }
    });

    if (existingTournamentRegistrations.length > 0) {
      const tournamentName = existingTournamentRegistrations[0]?.tournament?.name;
      return new Response(JSON.stringify({ 
        error: `You are already in tournament "${tournamentName}". Leave that tournament first.` 
      }), { status: 400 });
    }

    // Note: We should also check for lobby membership here, but that would require 
    // access to the WebSocket server state or a lobby membership table
    // For now, we'll rely on frontend validation for lobby conflicts

    // Create registration
    console.log("Creating tournament registration:", { tournamentId: id, playerId: userId, displayName });
    const registration = await prisma.tournamentRegistration.create({
      data: {
        tournamentId: id,
        playerId: userId
      }
    });

    // Create or revive standing (handle re-join after prior forfeit)
    console.log("Upserting player standing:", { tournamentId: id, playerId: userId, displayName });
    await prisma.playerStanding.upsert({
      where: {
        tournamentId_playerId: { tournamentId: id, playerId: userId }
      },
      create: {
        tournamentId: id,
        playerId: userId,
        displayName
      },
      update: {
        displayName,
        isEliminated: false,
        currentMatchId: null,
      }
    });

    // Get updated player count
    const updatedTournament = await prisma.tournament.findUnique({
      where: { id },
      include: { registrations: true }
    });
    const currentPlayerCount = updatedTournament?.registrations.length || 0;

    // Broadcast player joined event via Socket.io
    try {
      await tournamentSocketService.broadcastPlayerJoined(
        id,
        userId,
        displayName,
        currentPlayerCount
      );
      // Also broadcast a full tournament update snapshot
      await tournamentSocketService.broadcastTournamentUpdateById(id);
    } catch (socketError) {
      console.warn('Failed to broadcast player joined event:', socketError);
      // Don't fail the request if socket broadcast fails
    }

    return new Response(JSON.stringify({
      success: true,
      registrationId: registration.id,
      playerId: userId,
      displayName,
      currentPlayerCount
    }), {
      status: 201,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: unknown) {
    console.error('Error joining tournament:', e);
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
