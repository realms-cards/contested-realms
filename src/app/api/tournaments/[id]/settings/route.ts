import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { tournamentSocketService } from '@/lib/services/tournament-socket-service';

// PUT /api/tournaments/[id]/settings
// Update tournament settings (only during registration phase and only by creator)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const body = await req.json();
    
    // First, check if tournament exists and get its current state
    const tournament = await prisma.tournament.findUnique({
      where: { id },
      include: { 
        registrations: {
          include: {
            player: {
              select: { id: true }
            }
          }
        }
      }
    });

    if (!tournament) {
      return new Response(JSON.stringify({ error: 'Tournament not found' }), { status: 404 });
    }

    // Only tournament creator can modify settings
    if (tournament.creatorId !== session.user.id) {
      return new Response(JSON.stringify({ error: 'Only tournament creator can modify settings' }), { status: 403 });
    }

    // Can only modify during registration phase
    if (tournament.status !== 'registering') {
      return new Response(JSON.stringify({ error: 'Tournament settings can only be modified during registration' }), { status: 400 });
    }

    // TODO: Add player ready check once player ready system is implemented
    // For now, we'll allow settings changes during registration phase

    // Validate the settings
    const updates: Record<string, unknown> = {};
    
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) {
        return new Response(JSON.stringify({ error: 'Tournament name cannot be empty' }), { status: 400 });
      }
      updates.name = name;
    }

    if (body.format !== undefined) {
      if (!['sealed', 'draft', 'constructed'].includes(body.format)) {
        return new Response(JSON.stringify({ error: 'Invalid tournament format' }), { status: 400 });
      }
      updates.format = body.format as 'sealed' | 'draft' | 'constructed';
    }

    if (body.maxPlayers !== undefined) {
      const maxPlayers = Number(body.maxPlayers);
      if (![2, 4, 8, 16, 32].includes(maxPlayers)) {
        return new Response(JSON.stringify({ error: 'Invalid max players count' }), { status: 400 });
      }
      
      // Check if reducing max players would kick out existing registrations
      if (maxPlayers < tournament.registrations.length) {
        return new Response(JSON.stringify({ 
          error: `Cannot reduce max players to ${maxPlayers} - ${tournament.registrations.length} players already registered` 
        }), { status: 400 });
      }
      
      updates.maxPlayers = maxPlayers;
    }

    // Handle settings updates
    if (body.settings !== undefined) {
      const currentSettings = tournament.settings as Record<string, unknown> || {};
      updates.settings = {
        ...currentSettings,
        ...body.settings
      };
    }

    // Calculate tournament settings based on format and maxPlayers
    if (updates.format !== undefined || updates.maxPlayers !== undefined) {
      const maxPlayers = (updates.maxPlayers as number) || tournament.maxPlayers;
      
      // Calculate optimal rounds based on player count (Swiss system)
      const optimalRounds = Math.ceil(Math.log2(maxPlayers));
      const currentSettings = tournament.settings as Record<string, unknown> || {};
      
      // Update settings with calculated values
      updates.settings = {
        ...currentSettings,
        totalRounds: Math.max(3, optimalRounds), // Minimum 3 rounds
        roundTimeLimit: currentSettings.roundTimeLimit || 50, // 50 minutes default
        matchTimeLimit: currentSettings.matchTimeLimit || 60 // 60 minutes default
      };
    }

    // If no updates provided, return current tournament
    if (Object.keys(updates).length === 0) {
      return new Response(JSON.stringify({
        message: 'No settings updated',
        tournament: {
          id: tournament.id,
          name: tournament.name,
          format: tournament.format,
          status: tournament.status,
          maxPlayers: tournament.maxPlayers,
          settings: tournament.settings
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    // Update the tournament
    const updatedTournament = await prisma.tournament.update({
      where: { id },
      data: {
        ...updates,
        updatedAt: new Date()
      }
    });

    console.log(`Tournament settings updated by ${session.user.id}:`, updates);

    // Broadcast updated tournament to all clients (global + room)
    try {
      await tournamentSocketService.broadcastTournamentUpdateById(id);
    } catch (socketErr) {
      console.warn('Failed to broadcast tournament update after settings change:', socketErr);
    }

    return new Response(JSON.stringify({
      message: 'Tournament settings updated successfully',
      tournament: {
        id: updatedTournament.id,
        name: updatedTournament.name,
        format: updatedTournament.format,
        status: updatedTournament.status,
        maxPlayers: updatedTournament.maxPlayers,
        settings: updatedTournament.settings,
        updatedAt: updatedTournament.updatedAt.getTime()
      }
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: unknown) {
    console.error('Error updating tournament settings:', e);
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
