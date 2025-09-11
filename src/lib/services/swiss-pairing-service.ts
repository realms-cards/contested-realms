/**
 * Swiss Pairing Service
 * Implements Swiss-system tournament pairing algorithm
 */

import { prisma } from '@/lib/prisma';
import { SWISS_PAIRING, calculateOptimalRounds } from '@/lib/tournament/constants';

export interface PairingResult {
  player1Id: string;
  player2Id: string | null; // null indicates bye
  player1Name: string;
  player2Name: string | null;
}

export interface PlayerRecord {
  playerId: string;
  playerName: string;
  matchPoints: number;
  wins: number;
  losses: number;
  draws: number;
  opponentIds: string[];
  receivedBye: boolean;
  isEliminated: boolean;
  tiebreakers: {
    opponentMatchWinPercentage: number;
    gameWinPercentage: number;
  };
}

export class SwissPairingService {
  /**
   * Generate Swiss pairings for a tournament round
   */
  async generateSwissPairings(
    tournamentId: string,
    roundNumber: number
  ): Promise<PairingResult[]> {
    // Get player records
    const playerRecords = await this.getPlayerRecords(tournamentId);
    
    if (playerRecords.length < 2) {
      throw new Error('Not enough players for pairing');
    }

    // Filter out eliminated players
    const activePlayers = playerRecords.filter(player => !player.isEliminated);
    
    if (activePlayers.length < 2) {
      throw new Error('Not enough active players for pairing');
    }

    // Sort players by standings (match points, then tiebreakers)
    const sortedPlayers = this.sortPlayersByStandings(activePlayers);

    // Generate pairings
    const pairings = roundNumber === 1 ? 
      this.generateFirstRoundPairings(sortedPlayers) :
      this.generateSubsequentRoundPairings(sortedPlayers);

    return pairings;
  }

  /**
   * Get player records with match history
   */
  private async getPlayerRecords(tournamentId: string): Promise<PlayerRecord[]> {
    const standings = await prisma.playerStanding.findMany({
      where: { tournamentId },
      include: {
        player: {
          select: { name: true }
        }
      }
    });

    return await Promise.all(
      standings.map(async (standing) => {
        const opponentIds = await this.getOpponentIds(tournamentId, standing.playerId);
        const receivedBye = await this.hasReceivedBye(tournamentId, standing.playerId);

        return {
          playerId: standing.playerId,
          playerName: standing.player.name || 'Unknown Player',
          matchPoints: standing.matchPoints,
          wins: standing.wins,
          losses: standing.losses,
          draws: standing.draws,
          opponentIds,
          receivedBye,
          isEliminated: standing.isEliminated,
          tiebreakers: {
            opponentMatchWinPercentage: standing.opponentMatchWinPercentage,
            gameWinPercentage: standing.gameWinPercentage
          }
        };
      })
    );
  }

  /**
   * Get list of opponent IDs a player has faced
   */
  private async getOpponentIds(tournamentId: string, playerId: string): Promise<string[]> {
    const matches = await prisma.match.findMany({
      where: {
        tournamentId,
        players: {
          path: '$',
          string_contains: `"${playerId}"`
        },
        status: {
          in: ['completed', 'active', 'pending']
        }
      },
      select: {
        players: true
      }
    });

    const opponentIds = new Set<string>();
    
    for (const match of matches) {
      const matchPlayers = Array.isArray(match.players) ? match.players : [];
      const opponentId = matchPlayers.find(id => String(id) !== playerId);
      if (opponentId) {
        opponentIds.add(String(opponentId));
      }
    }

    return Array.from(opponentIds);
  }

  /**
   * Check if player has received a bye
   */
  private async hasReceivedBye(tournamentId: string, playerId: string): Promise<boolean> {
    // Check for bye match (simplified check)
    const matches = await prisma.match.findMany({
      where: {
        tournamentId,
        players: {
          string_contains: `"${playerId}"`
        }
      }
    });
    
    // Find bye match (match where this player is the only player)
    const byeMatch = matches.find(match => {
      const players = Array.isArray(match.players) ? match.players : [];
      return players.length === 1 && String(players[0]) === playerId;
    });

    return !!byeMatch;
  }

  /**
   * Sort players by tournament standings
   */
  private sortPlayersByStandings(players: PlayerRecord[]): PlayerRecord[] {
    return players.sort((a, b) => {
      // Primary: Match points (descending)
      if (a.matchPoints !== b.matchPoints) {
        return b.matchPoints - a.matchPoints;
      }

      // Secondary: Opponent match win percentage (descending)
      if (a.tiebreakers.opponentMatchWinPercentage !== b.tiebreakers.opponentMatchWinPercentage) {
        return b.tiebreakers.opponentMatchWinPercentage - a.tiebreakers.opponentMatchWinPercentage;
      }

      // Tertiary: Game win percentage (descending)
      if (a.tiebreakers.gameWinPercentage !== b.tiebreakers.gameWinPercentage) {
        return b.tiebreakers.gameWinPercentage - a.tiebreakers.gameWinPercentage;
      }

      // Quaternary: Random (for equal records)
      return Math.random() - 0.5;
    });
  }

  /**
   * Generate first round pairings (random within groups)
   */
  private generateFirstRoundPairings(players: PlayerRecord[]): PairingResult[] {
    // For first round, pair randomly or use a seeding system
    const shuffledPlayers = [...players].sort(() => Math.random() - 0.5);
    return this.pairPlayersSequentially(shuffledPlayers);
  }

  /**
   * Generate subsequent round pairings using Swiss system
   */
  private generateSubsequentRoundPairings(players: PlayerRecord[]): PairingResult[] {
    const pairings: PairingResult[] = [];
    const unpaired = [...players];

    // Group players by match points
    const pointGroups = this.groupPlayersByPoints(unpaired);

    // Pair within each point group, then across groups if needed
    for (const group of Object.values(pointGroups).sort((a, b) => b[0].matchPoints - a[0].matchPoints)) {
      const groupPairings = this.pairWithinGroup(group);
      pairings.push(...groupPairings);
      
      // Remove paired players from unpaired list
      for (const pairing of groupPairings) {
        const player1Index = unpaired.findIndex(p => p.playerId === pairing.player1Id);
        if (player1Index >= 0) unpaired.splice(player1Index, 1);
        
        if (pairing.player2Id) {
          const player2Index = unpaired.findIndex(p => p.playerId === pairing.player2Id);
          if (player2Index >= 0) unpaired.splice(player2Index, 1);
        }
      }
    }

    // Handle remaining unpaired players
    if (unpaired.length > 0) {
      const remainingPairings = this.pairPlayersSequentially(unpaired);
      pairings.push(...remainingPairings);
    }

    return pairings;
  }

  /**
   * Group players by match points
   */
  private groupPlayersByPoints(players: PlayerRecord[]): Record<number, PlayerRecord[]> {
    const groups: Record<number, PlayerRecord[]> = {};
    
    for (const player of players) {
      if (!groups[player.matchPoints]) {
        groups[player.matchPoints] = [];
      }
      groups[player.matchPoints].push(player);
    }
    
    return groups;
  }

  /**
   * Pair players within a point group, avoiding rematches
   */
  private pairWithinGroup(players: PlayerRecord[]): PairingResult[] {
    if (players.length < 2) {
      return players.length === 1 ? [this.createByePairing(players[0])] : [];
    }

    // Try to find optimal pairings avoiding rematches
    const pairings = this.findOptimalPairings(players);
    return pairings;
  }

  /**
   * Find optimal pairings to avoid rematches
   */
  private findOptimalPairings(players: PlayerRecord[]): PairingResult[] {
    // Simple greedy approach for small groups
    if (players.length <= 4) {
      return this.findPairingsGreedy(players);
    }

    // For larger groups, use more sophisticated algorithm
    return this.findPairingsOptimized(players);
  }

  /**
   * Greedy pairing algorithm for small groups
   */
  private findPairingsGreedy(players: PlayerRecord[]): PairingResult[] {
    const pairings: PairingResult[] = [];
    const unpaired = [...players];

    while (unpaired.length >= 2) {
      const player1 = unpaired.shift();
      if (!player1) break;
      
      // Find best opponent for player1
      let bestOpponentIndex = -1;
      for (let i = 0; i < unpaired.length; i++) {
        const player2 = unpaired[i];
        
        // Check if they haven't played before
        if (!player1.opponentIds.includes(player2.playerId)) {
          bestOpponentIndex = i;
          break;
        }
      }

      if (bestOpponentIndex >= 0) {
        const player2 = unpaired.splice(bestOpponentIndex, 1)[0];
        pairings.push(this.createPairing(player1, player2));
      } else if (unpaired.length > 0) {
        // No valid opponent found, pair with first available
        const player2 = unpaired.shift();
        if (player2) {
          pairings.push(this.createPairing(player1, player2));
        }
      }
    }

    // Handle remaining unpaired player (bye)
    if (unpaired.length === 1) {
      pairings.push(this.createByePairing(unpaired[0]));
    }

    return pairings;
  }

  /**
   * Optimized pairing algorithm for larger groups
   */
  private findPairingsOptimized(players: PlayerRecord[]): PairingResult[] {
    // For now, use greedy approach. Can be enhanced with more sophisticated algorithms
    // like maximum weight matching or backtracking if needed
    return this.findPairingsGreedy(players);
  }

  /**
   * Pair players sequentially (used for first round or fallback)
   */
  private pairPlayersSequentially(players: PlayerRecord[]): PairingResult[] {
    const pairings: PairingResult[] = [];
    
    for (let i = 0; i < players.length; i += 2) {
      const player1 = players[i];
      const player2 = players[i + 1];

      if (player2) {
        pairings.push(this.createPairing(player1, player2));
      } else {
        pairings.push(this.createByePairing(player1));
      }
    }

    return pairings;
  }

  /**
   * Create a pairing between two players
   */
  private createPairing(player1: PlayerRecord, player2: PlayerRecord): PairingResult {
    return {
      player1Id: player1.playerId,
      player2Id: player2.playerId,
      player1Name: player1.playerName,
      player2Name: player2.playerName
    };
  }

  /**
   * Create a bye pairing for a single player
   */
  private createByePairing(player: PlayerRecord): PairingResult {
    return {
      player1Id: player.playerId,
      player2Id: null,
      player1Name: player.playerName,
      player2Name: null
    };
  }

  /**
   * Assign bye to player who needs it most (hasn't received one, lowest points)
   */
  private findByeCandidate(players: PlayerRecord[]): PlayerRecord {
    // Prefer player who hasn't received bye
    const noBye = players.filter(p => !p.receivedBye);
    if (noBye.length > 0) {
      // Among players without bye, choose one with lowest points
      return noBye.reduce((min, player) => 
        player.matchPoints < min.matchPoints ? player : min
      );
    }

    // If all have received bye, choose player with lowest points
    return players.reduce((min, player) => 
      player.matchPoints < min.matchPoints ? player : min
    );
  }

  /**
   * Validate pairings to ensure no issues
   */
  validatePairings(pairings: PairingResult[]): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    const playerIds = new Set<string>();

    for (const pairing of pairings) {
      // Check for duplicate player assignments
      if (playerIds.has(pairing.player1Id)) {
        errors.push(`Player ${pairing.player1Name} is assigned to multiple matches`);
      }
      playerIds.add(pairing.player1Id);

      if (pairing.player2Id) {
        if (playerIds.has(pairing.player2Id)) {
          errors.push(`Player ${pairing.player2Name} is assigned to multiple matches`);
        }
        playerIds.add(pairing.player2Id);
      }

      // Check for self-pairing
      if (pairing.player1Id === pairing.player2Id) {
        errors.push(`Player ${pairing.player1Name} cannot be paired with themselves`);
      }
    }

    // Check for multiple byes
    const byes = pairings.filter(p => !p.player2Id);
    if (byes.length > 1) {
      errors.push('Multiple bye assignments detected');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Create matches from pairings
   */
  async createMatchesFromPairings(
    tournamentId: string,
    roundId: string,
    pairings: PairingResult[]
  ): Promise<void> {
    const validation = this.validatePairings(pairings);
    if (!validation.isValid) {
      throw new Error(`Invalid pairings: ${validation.errors.join(', ')}`);
    }

    const matchPromises = pairings.map(pairing => {
      const players = pairing.player2Id ? 
        [pairing.player1Id, pairing.player2Id] : 
        [pairing.player1Id];

      return prisma.match.create({
        data: {
          tournamentId,
          roundId,
          status: 'pending',
          players,
          results: pairing.player2Id ? undefined : {
            winnerId: pairing.player1Id, // Bye wins automatically
            player1Wins: 1,
            player2Wins: 0,
            draws: 0
          }
        }
      });
    });

    await Promise.all(matchPromises);

    // For bye matches, immediately update standings
    const byePairings = pairings.filter(p => !p.player2Id);
    for (const byePairing of byePairings) {
      await prisma.playerStanding.update({
        where: {
          tournamentId_playerId: {
            tournamentId,
            playerId: byePairing.player1Id
          }
        },
        data: {
          wins: { increment: 1 },
          matchPoints: { increment: SWISS_PAIRING.BYE_WIN_POINTS }
        }
      });
    }
  }

  /**
   * Calculate recommended number of rounds for player count
   */
  calculateRounds(playerCount: number): number {
    return calculateOptimalRounds(playerCount);
  }

  /**
   * Check if tournament needs more rounds
   */
  async shouldContinueTournament(tournamentId: string): Promise<boolean> {
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        rounds: true,
        registrations: true
      }
    });

    if (!tournament) {
      return false;
    }

    const playerCount = tournament.registrations.length;
    const completedRounds = tournament.rounds.filter(r => r.status === 'completed').length;
    const optimalRounds = this.calculateRounds(playerCount);

    // Continue if we haven't reached optimal rounds
    if (completedRounds < optimalRounds) {
      return true;
    }

    // Check if there's a clear winner (someone significantly ahead)
    const standings = await prisma.playerStanding.findMany({
      where: { tournamentId },
      orderBy: { matchPoints: 'desc' },
      take: 2
    });

    if (standings.length >= 2) {
      const leader = standings[0];
      const second = standings[1];
      
      // If leader is 2+ match wins ahead, tournament can end
      const pointDifference = leader.matchPoints - second.matchPoints;
      if (pointDifference >= 6) { // 2 match wins = 6 points
        return false;
      }
    }

    // Don't exceed maximum rounds
    const maxRounds = optimalRounds + 1;
    return completedRounds < maxRounds;
  }
}

// Export singleton instance
export const swissPairingService = new SwissPairingService();