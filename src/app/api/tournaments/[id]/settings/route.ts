import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

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
    type TournamentSettingsUpdate = {
      name?: string;
      format?: 'swiss' | 'elimination' | 'round_robin';
      matchType?: 'constructed' | 'sealed' | 'draft';
      maxPlayers?: number;
      totalRounds?: number;
      sealedConfig?: Prisma.InputJsonValue;
      draftConfig?: Prisma.InputJsonValue;
    };
    const updates: TournamentSettingsUpdate = {};
    
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) {
        return new Response(JSON.stringify({ error: 'Tournament name cannot be empty' }), { status: 400 });
      }
      updates.name = name;
    }

    if (body.format !== undefined) {
      if (!['swiss', 'elimination', 'round_robin'].includes(body.format)) {
        return new Response(JSON.stringify({ error: 'Invalid tournament format' }), { status: 400 });
      }
      updates.format = body.format as 'swiss' | 'elimination' | 'round_robin';
    }

    if (body.matchType !== undefined) {
      if (!['constructed', 'sealed', 'draft'].includes(body.matchType)) {
        return new Response(JSON.stringify({ error: 'Invalid match type' }), { status: 400 });
      }
      updates.matchType = body.matchType;
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

    if (body.sealedConfig !== undefined) {
      updates.sealedConfig = body.sealedConfig;
    }

    if (body.draftConfig !== undefined) {
      updates.draftConfig = body.draftConfig;
    }

    // Recalculate total rounds if format changed
    if (updates.format !== undefined) {
      const maxPlayers = updates.maxPlayers || tournament.maxPlayers;
      let totalRounds = 3; // Default for swiss
      if (updates.format === 'elimination') {
        totalRounds = Math.ceil(Math.log2(maxPlayers));
      } else if (updates.format === 'round_robin') {
        totalRounds = maxPlayers - 1;
      }
      updates.totalRounds = totalRounds;
    } else if (updates.maxPlayers !== undefined) {
      // Recalculate if maxPlayers changed but format didn't
      let totalRounds = 3; // Default for swiss
      if (tournament.format === 'elimination') {
        totalRounds = Math.ceil(Math.log2(updates.maxPlayers));
      } else if (tournament.format === 'round_robin') {
        totalRounds = updates.maxPlayers - 1;
      }
      updates.totalRounds = totalRounds;
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
          matchType: tournament.matchType,
          totalRounds: tournament.totalRounds
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

    return new Response(JSON.stringify({
      message: 'Tournament settings updated successfully',
      tournament: {
        id: updatedTournament.id,
        name: updatedTournament.name,
        format: updatedTournament.format,
        status: updatedTournament.status,
        maxPlayers: updatedTournament.maxPlayers,
        matchType: updatedTournament.matchType,
        totalRounds: updatedTournament.totalRounds,
        sealedConfig: updatedTournament.sealedConfig,
        draftConfig: updatedTournament.draftConfig
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