import { prisma } from '@/lib/prisma';
import { TournamentFormat } from '@prisma/client';

export interface PlayerPairing {
  playerId: string;
  displayName: string;
  matchPoints: number;
  gameWinPercentage: number;
  opponentMatchWinPercentage: number;
  isEliminated: boolean;
}

export interface MatchPairing {
  player1: PlayerPairing;
  player2: PlayerPairing;
}

export interface TournamentPairingResult {
  matches: MatchPairing[];
  byes: PlayerPairing[];
}

/**
 * Generate pairings for a tournament round based on format
 */
export async function generatePairings(
  tournamentId: string,
  roundNumber: number
): Promise<TournamentPairingResult> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      standings: {
        where: { isEliminated: false },
        orderBy: [
          { matchPoints: 'desc' },
          { gameWinPercentage: 'desc' },
          { opponentMatchWinPercentage: 'desc' }
        ]
      },
      matches: {
        where: { status: 'completed' }
      }
    }
  });

  if (!tournament) {
    throw new Error('Tournament not found');
  }

  const activePlayers = tournament.standings.map(standing => ({
    playerId: standing.playerId,
    displayName: standing.displayName,
    matchPoints: standing.matchPoints,
    gameWinPercentage: standing.gameWinPercentage,
    opponentMatchWinPercentage: standing.opponentMatchWinPercentage,
    isEliminated: standing.isEliminated
  }));

  switch (tournament.format) {
    case 'swiss':
      return generateSwissPairings(activePlayers, tournament.matches, roundNumber);
    case 'elimination':
      return generateEliminationPairings(activePlayers, roundNumber);
    case 'round_robin':
      return generateRoundRobinPairings(activePlayers, tournament.matches, roundNumber);
    default:
      throw new Error(`Unsupported tournament format: ${tournament.format}`);
  }
}

/**
 * Swiss system pairing - players with similar records play each other
 */
function generateSwissPairings(
  players: PlayerPairing[],
  previousMatches: any[],
  roundNumber: number
): TournamentPairingResult {
  const matches: MatchPairing[] = [];
  const byes: PlayerPairing[] = [];
  const availablePlayers = [...players];

  // Build map of previous opponents for each player
  const previousOpponents = new Map<string, Set<string>>();
  for (const player of players) {
    previousOpponents.set(player.playerId, new Set());
  }

  for (const match of previousMatches) {
    const playerIds = (match.players as any[]).map(p => p.id);
    if (playerIds.length === 2) {
      previousOpponents.get(playerIds[0])?.add(playerIds[1]);
      previousOpponents.get(playerIds[1])?.add(playerIds[0]);
    }
  }

  // Pair players with similar scores who haven't played before
  while (availablePlayers.length >= 2) {
    const player1 = availablePlayers.shift()!;
    let player2Index = -1;

    // Find best opponent (closest score, hasn't played before)
    for (let i = 0; i < availablePlayers.length; i++) {
      const candidate = availablePlayers[i];
      if (!previousOpponents.get(player1.playerId)?.has(candidate.playerId)) {
        player2Index = i;
        break;
      }
    }

    // If no opponent found who hasn't played before, pair with next available
    if (player2Index === -1 && availablePlayers.length > 0) {
      player2Index = 0;
    }

    if (player2Index >= 0) {
      const player2 = availablePlayers.splice(player2Index, 1)[0];
      matches.push({ player1, player2 });
    }
  }

  // Handle odd number of players (bye)
  if (availablePlayers.length === 1) {
    byes.push(availablePlayers[0]);
  }

  return { matches, byes };
}

/**
 * Single elimination pairing - winners advance, losers are eliminated
 */
function generateEliminationPairings(
  players: PlayerPairing[],
  roundNumber: number
): TournamentPairingResult {
  const matches: MatchPairing[] = [];
  const byes: PlayerPairing[] = [];
  const availablePlayers = [...players];

  // In elimination, pair players sequentially
  while (availablePlayers.length >= 2) {
    const player1 = availablePlayers.shift()!;
    const player2 = availablePlayers.shift()!;
    matches.push({ player1, player2 });
  }

  // Handle odd number of players (bye to next round)
  if (availablePlayers.length === 1) {
    byes.push(availablePlayers[0]);
  }

  return { matches, byes };
}

/**
 * Round robin pairing - each player plays every other player exactly once
 */
function generateRoundRobinPairings(
  players: PlayerPairing[],
  previousMatches: any[],
  roundNumber: number
): TournamentPairingResult {
  const matches: MatchPairing[] = [];
  const byes: PlayerPairing[] = [];

  // Build map of who has played whom
  const hasPlayed = new Map<string, Set<string>>();
  for (const player of players) {
    hasPlayed.set(player.playerId, new Set());
  }

  for (const match of previousMatches) {
    const playerIds = (match.players as any[]).map(p => p.id);
    if (playerIds.length === 2) {
      hasPlayed.get(playerIds[0])?.add(playerIds[1]);
      hasPlayed.get(playerIds[1])?.add(playerIds[0]);
    }
  }

  const availablePlayers = [...players];

  // Find pairings for players who haven't played each other
  while (availablePlayers.length >= 2) {
    const player1 = availablePlayers.shift()!;
    let player2Index = -1;

    // Find an opponent this player hasn't faced
    for (let i = 0; i < availablePlayers.length; i++) {
      const candidate = availablePlayers[i];
      if (!hasPlayed.get(player1.playerId)?.has(candidate.playerId)) {
        player2Index = i;
        break;
      }
    }

    if (player2Index >= 0) {
      const player2 = availablePlayers.splice(player2Index, 1)[0];
      matches.push({ player1, player2 });
    } else {
      // No valid opponent found, give bye
      byes.push(player1);
    }
  }

  // Handle remaining player
  if (availablePlayers.length === 1) {
    byes.push(availablePlayers[0]);
  }

  return { matches, byes };
}

/**
 * Create match records in database for generated pairings
 */
export async function createRoundMatches(
  tournamentId: string,
  roundId: string,
  pairings: TournamentPairingResult
): Promise<string[]> {
  const matchIds: string[] = [];

  // Create matches
  for (const pairing of pairings.matches) {
    const match = await prisma.match.create({
      data: {
        tournamentId,
        roundId,
        status: 'pending',
        players: [
          { id: pairing.player1.playerId, displayName: pairing.player1.displayName },
          { id: pairing.player2.playerId, displayName: pairing.player2.displayName }
        ]
      }
    });
    matchIds.push(match.id);

    // Update player standings with current match
    await prisma.playerStanding.updateMany({
      where: {
        tournamentId,
        playerId: { in: [pairing.player1.playerId, pairing.player2.playerId] }
      },
      data: {
        currentMatchId: match.id
      }
    });
  }

  // Handle byes (automatic wins)
  for (const byePlayer of pairings.byes) {
    await prisma.playerStanding.update({
      where: {
        tournamentId_playerId: {
          tournamentId,
          playerId: byePlayer.playerId
        }
      },
      data: {
        wins: { increment: 1 },
        matchPoints: { increment: 3 }, // Standard match points for bye
        currentMatchId: null
      }
    });
  }

  return matchIds;
}

/**
 * Update standings after a match completes
 */
export async function updateStandingsAfterMatch(
  tournamentId: string,
  matchId: string,
  results: { winnerId: string; loserId: string; isDraw?: boolean }
): Promise<void> {
  const { winnerId, loserId, isDraw = false } = results;

  if (isDraw) {
    // Both players get 1 point for draw
    await prisma.playerStanding.updateMany({
      where: {
        tournamentId,
        playerId: { in: [winnerId, loserId] }
      },
      data: {
        draws: { increment: 1 },
        matchPoints: { increment: 1 },
        currentMatchId: null
      }
    });
  } else {
    // Winner gets 3 points, loser gets 0
    await prisma.playerStanding.update({
      where: {
        tournamentId_playerId: {
          tournamentId,
          playerId: winnerId
        }
      },
      data: {
        wins: { increment: 1 },
        matchPoints: { increment: 3 },
        currentMatchId: null
      }
    });

    await prisma.playerStanding.update({
      where: {
        tournamentId_playerId: {
          tournamentId,
          playerId: loserId
        }
      },
      data: {
        losses: { increment: 1 },
        currentMatchId: null
      }
    });
  }

  // Recalculate tiebreakers for all players
  await recalculateTiebreakers(tournamentId);
}

/**
 * Recalculate game win percentage and opponent match win percentage
 */
async function recalculateTiebreakers(tournamentId: string): Promise<void> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      standings: true,
      matches: {
        where: { status: 'completed' }
      }
    }
  });

  if (!tournament) return;

  // TODO: Implement proper tiebreaker calculations
  // For now, just update game win percentage based on match points
  for (const standing of tournament.standings) {
    const totalMatches = standing.wins + standing.losses + standing.draws;
    const gameWinPercentage = totalMatches > 0 ? standing.wins / totalMatches : 0;

    await prisma.playerStanding.update({
      where: {
        tournamentId_playerId: {
          tournamentId,
          playerId: standing.playerId
        }
      },
      data: {
        gameWinPercentage,
        // Simplified opponent match win percentage calculation
        opponentMatchWinPercentage: gameWinPercentage * 0.75 // Placeholder
      }
    });
  }
}