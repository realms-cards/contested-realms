/**
 * Tournament Broadcast Service
 * Sends tournament events to the Socket.IO server via HTTP
 */

import { prisma } from '@/lib/prisma';

// Use the same URL as WebSocket connections, but for HTTP broadcast endpoint
const SOCKET_SERVER_URL = process.env.SOCKET_SERVER_URL || process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3010';

async function broadcastToSocket(event: string, data: Record<string, unknown>) {
  try {
    await fetch(`${SOCKET_SERVER_URL}/tournament/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, data })
    });
  } catch (err) {
    console.warn(`Tournament broadcast failed for ${event}:`, err);
  }
}

export async function broadcastTournamentUpdate(tournamentData: {
  id: string;
  name?: string;
  format?: string;
  status?: string;
  maxPlayers?: number;
  currentPlayers?: number;
  creatorId?: string;
  settings?: unknown;
  createdAt?: string;
  startedAt?: string | null;
  completedAt?: string | null;
  registeredPlayers?: Array<{
    id: string;
    displayName: string;
    preparationStatus?: string;
    deckSubmitted?: boolean;
  }>;
}) {
  await broadcastToSocket('TOURNAMENT_UPDATED', tournamentData);
}

export async function broadcastTournamentUpdateById(tournamentId: string) {
  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        registrations: {
          include: {
            player: { select: { id: true, name: true, shortId: true } }
          }
        }
      }
    });

    if (!tournament) return;

    const registeredPlayers = tournament.registrations.map((reg) => {
      const playerName = reg.player?.name || reg.player?.shortId;
      return {
        id: reg.playerId,
        displayName: playerName || reg.playerId,
        preparationStatus: reg.preparationStatus,
        deckSubmitted: reg.deckSubmitted
      };
    });

    await broadcastTournamentUpdate({
      id: tournament.id,
      name: tournament.name,
      format: tournament.format,
      status: tournament.status,
      maxPlayers: tournament.maxPlayers,
      currentPlayers: tournament.registrations.length,
      creatorId: tournament.creatorId,
      settings: tournament.settings,
      createdAt: tournament.createdAt.toISOString(),
      startedAt: tournament.startedAt?.toISOString() ?? null,
      completedAt: tournament.completedAt?.toISOString() ?? null,
      registeredPlayers
    });
  } catch (err) {
    console.warn(`Failed to broadcast tournament update for ${tournamentId}:`, err);
  }
}

export async function broadcastPhaseChanged(
  tournamentId: string,
  newPhase: string,
  additionalData?: Record<string, unknown>
) {
  await broadcastToSocket('PHASE_CHANGED', {
    tournamentId,
    newPhase,
    ...additionalData
  });
}

export async function broadcastRoundStarted(
  tournamentId: string,
  roundNumber: number,
  matches: Array<{
    id: string;
    player1Id: string;
    player1Name: string;
    player2Id: string | null;
    player2Name: string | null;
  }>
) {
  await broadcastToSocket('ROUND_STARTED', {
    tournamentId,
    roundNumber,
    matches
  });
}

export async function broadcastPlayerJoined(
  tournamentId: string,
  playerId: string,
  playerName: string,
  currentPlayerCount: number
) {
  await broadcastToSocket('PLAYER_JOINED', {
    tournamentId,
    playerId,
    playerName,
    currentPlayerCount
  });
}

export async function broadcastPlayerLeft(
  tournamentId: string,
  playerId: string,
  playerName: string,
  currentPlayerCount: number
) {
  await broadcastToSocket('PLAYER_LEFT', {
    tournamentId,
    playerId,
    playerName,
    currentPlayerCount
  });
}

export async function broadcastPreparationUpdate(
  tournamentId: string,
  playerId: string,
  preparationStatus: string,
  readyPlayerCount: number,
  totalPlayerCount: number,
  deckSubmitted = false
) {
  await broadcastToSocket('UPDATE_PREPARATION', {
    tournamentId,
    playerId,
    preparationStatus,
    readyPlayerCount,
    totalPlayerCount,
    deckSubmitted
  });
}

export async function broadcastDraftReady(
  tournamentId: string,
  payload: { draftSessionId: string; totalPlayers?: number }
) {
  await broadcastToSocket('DRAFT_READY', {
    tournamentId,
    ...payload,
  });
}

export async function broadcastStatisticsUpdate(
  tournamentId: string,
  statistics: Record<string, unknown>
) {
  await broadcastToSocket('STATISTICS_UPDATED', {
    tournamentId,
    ...statistics
  });
}

export async function broadcastMatchAssigned(
  tournamentId: string,
  playerId: string,
  matchData: {
    matchId: string;
    opponentId: string | null;
    opponentName: string | null;
    lobbyName: string;
  }
) {
  await broadcastToSocket('MATCH_ASSIGNED', {
    tournamentId,
    playerId,
    ...matchData
  });
}

// Create a tournamentSocketService object with the same interface for compatibility
export async function broadcastToMatch(matchId: string, event: string, data: Record<string, unknown>) {
  await broadcastToSocket(event, {
    matchId,
    ...data
  });
}

export const tournamentSocketService = {
  broadcastTournamentUpdate,
  broadcastTournamentUpdateById,
  broadcastPhaseChanged,
  broadcastRoundStarted,
  broadcastPlayerJoined,
  broadcastPlayerLeft,
  broadcastPreparationUpdate,
  broadcastDraftReady,
  broadcastStatisticsUpdate,
  broadcastMatchAssigned,
  broadcastToMatch
};
