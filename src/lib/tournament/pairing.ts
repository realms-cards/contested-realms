import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { buildTournamentDeckList, deckCardSelect, deckListHasMetadata, type DeckCardWithRelations } from '@/lib/tournament/deck-utils';
import { isActiveSeat } from '@/lib/tournament/registration';

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
  tournamentId: string
): Promise<TournamentPairingResult> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      registrations: {
        select: { playerId: true, seatStatus: true }
      },
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

  const activePlayerIds = new Set(
    tournament.registrations.filter(isActiveSeat).map((reg) => reg.playerId)
  );

  const activePlayers = tournament.standings
    .filter((standing) => activePlayerIds.has(standing.playerId))
    .map(standing => ({
    playerId: standing.playerId,
    displayName: standing.displayName,
    matchPoints: standing.matchPoints,
    gameWinPercentage: standing.gameWinPercentage,
    opponentMatchWinPercentage: standing.opponentMatchWinPercentage,
    isEliminated: standing.isEliminated
  }));

  // Tournament pairing is always Swiss
  return generateSwissPairings(
    activePlayers,
    tournament.matches as unknown as Array<{ players: Array<{ id: string }> }>
  );
}

/**
 * Swiss system pairing - players with similar records play each other
 * This is the only pairing system currently supported.
 */
function generateSwissPairings(
  players: PlayerPairing[],
  previousMatches: Array<{ players: Array<{ id: string }> }>
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
    const playerIds = match.players.map(p => p.id);
    if (playerIds.length === 2) {
      previousOpponents.get(playerIds[0])?.add(playerIds[1]);
      previousOpponents.get(playerIds[1])?.add(playerIds[0]);
    }
  }

  // Pair players with similar scores who haven't played before
  while (availablePlayers.length >= 2) {
    const player1 = availablePlayers.shift();
    if (!player1) break;
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
      if (!player2) {
        byes.push(player1);
        continue;
      }
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
 * Create match records in database for generated pairings
 */
export async function createRoundMatches(
  tournamentId: string,
  roundId: string,
  pairings: TournamentPairingResult,
  options?: { assignMatches?: boolean; applyByes?: boolean }
): Promise<string[]> {
  const matchIds: string[] = [];
  const assignMatches = options?.assignMatches !== false;
  const applyByes = options?.applyByes !== false;

  // Fetch tournament to get format and player deck data
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      registrations: {
        select: {
          playerId: true,
          preparationData: true
        }
      }
    }
  });

  // Build playerDecks map from registrations
  const playerDecksMap: Record<string, Prisma.JsonValue> = {};
  const deckCache = new Map<string, Prisma.JsonValue>();

  async function loadDeckListForConstructed(constructedData: Record<string, unknown> | null | undefined) {
    if (!constructedData) return null;

    const existing = constructedData.deckList as unknown;
    if (deckListHasMetadata(existing)) {
      return existing as unknown as Prisma.JsonValue;
    }

    const deckId = typeof constructedData.deckId === 'string' ? constructedData.deckId : null;
    if (!deckId) return null;

    if (deckCache.has(deckId)) {
      return deckCache.get(deckId) ?? null;
    }

    const deck = await prisma.deck.findUnique({
      where: { id: deckId },
      select: {
        cards: {
          select: deckCardSelect,
        }
      }
    });

    if (!deck) return null;

    const normalized = buildTournamentDeckList(deck.cards as DeckCardWithRelations[]);
    const jsonValue = JSON.parse(JSON.stringify(normalized)) as Prisma.JsonValue;
    deckCache.set(deckId, jsonValue);
    return jsonValue;
  }

  if (tournament?.registrations) {
    for (const reg of tournament.registrations) {
      const prepData = reg.preparationData as Record<string, unknown> | null;
      if (tournament.format === 'constructed' && prepData?.constructed) {
        const constructedData = prepData.constructed as Record<string, unknown>;
        const deckJson = await loadDeckListForConstructed(constructedData);
        if (deckJson) {
          playerDecksMap[reg.playerId] = deckJson;
        }
      } else if (tournament.format === 'sealed' && prepData?.sealed) {
        const sealedData = prepData.sealed as Record<string, unknown>;
        const deckList = sealedData.deckList;
        if (deckList !== undefined) {
          playerDecksMap[reg.playerId] = JSON.parse(JSON.stringify(deckList)) as Prisma.JsonValue;
        }
      } else if (tournament.format === 'draft' && prepData?.draft) {
        const draftData = prepData.draft as Record<string, unknown>;
        const deckList = draftData.deckList;
        if (deckList !== undefined) {
          playerDecksMap[reg.playerId] = JSON.parse(JSON.stringify(deckList)) as Prisma.JsonValue;
        }
      }
    }
  }

  // Create matches
  for (const pairing of pairings.matches) {
    // Build playerDecks for this specific match (only the two players)
    const matchPlayerDecks: Prisma.JsonObject = {};
    if (playerDecksMap[pairing.player1.playerId]) {
      matchPlayerDecks[pairing.player1.playerId] = playerDecksMap[pairing.player1.playerId];
    }
    if (playerDecksMap[pairing.player2.playerId]) {
      matchPlayerDecks[pairing.player2.playerId] = playerDecksMap[pairing.player2.playerId];
    }

    console.log('[Tournament Pairing] Creating match with playerDecks:', {
      player1: pairing.player1.playerId,
      player2: pairing.player2.playerId,
      hasPlayer1Deck: !!matchPlayerDecks[pairing.player1.playerId],
      hasPlayer2Deck: !!matchPlayerDecks[pairing.player2.playerId],
      deckCount: Object.keys(matchPlayerDecks).length
    });

    const matchData: Prisma.MatchUncheckedCreateInput & { playerDecks?: Prisma.InputJsonValue } = {
      tournamentId,
      roundId,
      status: 'pending',
      players: [
        { id: pairing.player1.playerId, name: pairing.player1.displayName },
        { id: pairing.player2.playerId, name: pairing.player2.displayName }
      ],
    };

    if (Object.keys(matchPlayerDecks).length > 0) {
      matchData.playerDecks = matchPlayerDecks as unknown as Prisma.InputJsonValue;
    }

    const match = await prisma.match.create({ data: matchData });
    matchIds.push(match.id);

    if (assignMatches) {
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
  }

  // Handle byes (automatic wins)
  if (applyByes) {
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

  console.log('[Tournament] updateStandingsAfterMatch:', {
    tournamentId,
    matchId,
    winnerId,
    loserId,
    isDraw
  });

  if (isDraw) {
    // Both players get 1 point for draw
    const updateResult = await prisma.playerStanding.updateMany({
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
    console.log('[Tournament] Draw standings updated:', {
      playersUpdated: updateResult.count,
      playerIds: [winnerId, loserId]
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
