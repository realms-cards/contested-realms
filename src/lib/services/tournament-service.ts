/**
 * Tournament Service
 * Core business logic for tournament management
 */

import { prisma } from '@/lib/prisma';
import { 
  TOURNAMENT_PLAYER_LIMITS
} from '@/lib/tournament/constants';
import type {
  CreateTournamentRequest,
  UpdateTournamentRequest,
  TournamentResponse,
  TournamentRegistrationResponse,
  TournamentFormat,
  TournamentStatus
} from '@/lib/tournament/validation';
import {
  CreateTournamentRequestSchema,
  UpdateTournamentRequestSchema,
  validateTournamentName,
  validatePlayerCount,
  validateTournamentSettings
} from '@/lib/tournament/validation';

export class TournamentService {
  /**
   * Create a new tournament
   */
  async createTournament(
    request: CreateTournamentRequest, 
    creatorId: string
  ): Promise<TournamentResponse> {
    // Validate request
    const validatedRequest = CreateTournamentRequestSchema.parse(request);
    
    // Additional business rule validations
    const nameValidation = validateTournamentName(validatedRequest.name);
    if (!nameValidation.isValid) {
      throw new Error(nameValidation.error);
    }

    const playerCountValidation = validatePlayerCount(
      validatedRequest.maxPlayers, 
      validatedRequest.format
    );
    if (!playerCountValidation.isValid) {
      throw new Error(playerCountValidation.error);
    }

    const settingsValidation = validateTournamentSettings(
      validatedRequest.format, 
      validatedRequest.settings
    );
    if (!settingsValidation.isValid) {
      throw new Error(settingsValidation.error);
    }

    // Check user's concurrent tournament limit
    const activeUserTournaments = await prisma.tournament.count({
      where: {
        creatorId,
        status: {
          in: ['registering', 'preparing', 'active']
        }
      }
    });

    if (activeUserTournaments >= 3) { // Max 3 concurrent tournaments per user
      throw new Error('Maximum concurrent tournaments limit reached');
    }

    // Create tournament
    const tournament = await prisma.tournament.create({
      data: {
        name: validatedRequest.name,
        format: validatedRequest.format,
        maxPlayers: validatedRequest.maxPlayers,
        status: 'registering',
        creatorId,
        settings: JSON.parse(JSON.stringify(validatedRequest.settings)),
        featureFlags: undefined
      }
    });

    return this.mapTournamentToResponse(tournament);
  }

  /**
   * Update existing tournament (only allowed during registration phase)
   */
  async updateTournament(
    tournamentId: string,
    request: UpdateTournamentRequest,
    userId: string
  ): Promise<TournamentResponse> {
    const validatedRequest = UpdateTournamentRequestSchema.parse(request);

    // Get existing tournament
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId }
    });

    if (!tournament) {
      throw new Error('Tournament not found');
    }

    if (tournament.creatorId !== userId) {
      throw new Error('Only tournament creator can update settings');
    }

    if (tournament.status !== 'registering') {
      throw new Error('Can only update tournaments in registering phase');
    }

    // Validate updates
    if (validatedRequest.name) {
      const nameValidation = validateTournamentName(validatedRequest.name);
      if (!nameValidation.isValid) {
        throw new Error(nameValidation.error);
      }
    }

    if (validatedRequest.settings) {
      const settingsValidation = validateTournamentSettings(
        tournament.format as TournamentFormat,
        validatedRequest.settings
      );
      if (!settingsValidation.isValid) {
        throw new Error(settingsValidation.error);
      }
    }

    // Update tournament
    const updatedTournament = await prisma.tournament.update({
      where: { id: tournamentId },
      data: {
        ...(validatedRequest.name && { name: validatedRequest.name }),
        ...(validatedRequest.settings && { settings: JSON.parse(JSON.stringify(validatedRequest.settings)) }),
        updatedAt: new Date()
      }
    });

    return this.mapTournamentToResponse(updatedTournament);
  }

  /**
   * Join a tournament
   */
  async joinTournament(
    tournamentId: string,
    playerId: string
  ): Promise<TournamentRegistrationResponse> {
    // Get tournament with current registrations
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        registrations: true
      }
    });

    if (!tournament) {
      throw new Error('Tournament not found');
    }

    if (tournament.creatorId === playerId) {
      throw new Error('Tournament creator cannot register as participant');
    }

    if (tournament.status !== 'registering') {
      throw new Error('Tournament is not accepting registrations');
    }

    if (tournament.registrations.length >= tournament.maxPlayers) {
      throw new Error('Tournament is full');
    }

    // Check for existing registration
    const existingRegistration = tournament.registrations.find(
      reg => reg.playerId === playerId
    );

    if (existingRegistration) {
      throw new Error('Already registered for this tournament');
    }

    // Get player info
    const player = await prisma.user.findUnique({
      where: { id: playerId }
    });

    if (!player) {
      throw new Error('Player not found');
    }

    // Create registration
    const registration = await prisma.tournamentRegistration.create({
      data: {
        tournamentId,
        playerId,
        preparationStatus: 'notStarted',
        deckSubmitted: false,
        preparationData: undefined
      }
    });

    // Check if tournament should transition to preparing phase
    const newPlayerCount = tournament.registrations.length + 1;
    if (newPlayerCount >= TOURNAMENT_PLAYER_LIMITS.MIN_PLAYERS && newPlayerCount === tournament.maxPlayers) {
      await this.transitionToPreparing(tournamentId);
    }

    return {
      id: registration.id,
      tournamentId: registration.tournamentId,
      playerId: registration.playerId,
      playerName: player.name || 'Unknown Player',
      registeredAt: registration.registeredAt.toISOString(),
      preparationStatus: registration.preparationStatus,
      deckSubmitted: registration.deckSubmitted
    };
  }

  /**
   * Get tournament by ID
   */
  async getTournament(tournamentId: string): Promise<TournamentResponse | null> {
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        registrations: true
      }
    });

    if (!tournament) {
      return null;
    }

    return this.mapTournamentToResponse(tournament);
  }

  /**
   * List tournaments with optional filtering
   */
  async listTournaments(filters?: {
    status?: TournamentStatus;
    format?: TournamentFormat;
    creatorId?: string;
  }): Promise<TournamentResponse[]> {
    const tournaments = await prisma.tournament.findMany({
      where: {
        ...(filters?.status && { status: filters.status }),
        ...(filters?.format && { format: filters.format }),
        ...(filters?.creatorId && { creatorId: filters.creatorId })
      },
      include: {
        registrations: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return tournaments.map(tournament => this.mapTournamentToResponse(tournament));
  }

  /**
   * Cancel tournament (only by creator, only during registration)
   */
  async cancelTournament(tournamentId: string, userId: string): Promise<TournamentResponse> {
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId }
    });

    if (!tournament) {
      throw new Error('Tournament not found');
    }

    if (tournament.creatorId !== userId) {
      throw new Error('Only tournament creator can cancel tournament');
    }

    if (!['registering', 'preparing'].includes(tournament.status)) {
      throw new Error('Cannot cancel tournament that has already started');
    }

    const cancelledTournament = await prisma.tournament.update({
      where: { id: tournamentId },
      data: {
        status: 'cancelled',
        completedAt: new Date()
      },
      include: {
        registrations: true
      }
    });

    return this.mapTournamentToResponse(cancelledTournament);
  }

  /**
   * Transition tournament to preparing phase
   */
  private async transitionToPreparing(tournamentId: string): Promise<void> {
    await prisma.tournament.update({
      where: { id: tournamentId },
      data: {
        status: 'preparing',
        startedAt: new Date()
      }
    });
  }

  /**
   * Check if tournament can transition phases and handle transition
   */
  async checkAndTransitionPhase(tournamentId: string): Promise<TournamentResponse> {
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        registrations: true
      }
    });

    if (!tournament) {
      throw new Error('Tournament not found');
    }

    let updatedTournament = tournament;

    switch (tournament.status) {
      case 'registering':
        // Check if we have enough players and tournament is full
        if (tournament.registrations.length >= TOURNAMENT_PLAYER_LIMITS.MIN_PLAYERS &&
            tournament.registrations.length === tournament.maxPlayers) {
          updatedTournament = await prisma.tournament.update({
            where: { id: tournamentId },
            data: {
              status: 'preparing',
              startedAt: new Date()
            },
            include: {
              registrations: true
            }
          });
        }
        break;

      case 'preparing':
        // Check if all players have completed preparation
        const allReady = tournament.registrations.every(
          reg => reg.preparationStatus === 'completed' && reg.deckSubmitted
        );

        if (allReady && tournament.registrations.length > 0) {
          updatedTournament = await prisma.tournament.update({
            where: { id: tournamentId },
            data: {
              status: 'active'
            },
            include: {
              registrations: true
            }
          });

          // Generate first round pairings
          await this.generateFirstRound(tournamentId);
        }
        break;
    }

    return this.mapTournamentToResponse(updatedTournament);
  }

  /**
   * Generate first round Swiss pairings
   */
  private async generateFirstRound(tournamentId: string): Promise<void> {
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        registrations: true
      }
    });

    if (!tournament) {
      throw new Error('Tournament not found');
    }

    const playerIds = tournament.registrations.map(reg => reg.playerId);
    
    // Create first round
    const round = await prisma.tournamentRound.create({
      data: {
        tournamentId,
        roundNumber: 1,
        status: 'active',
        startedAt: new Date(),
        pairingData: {
          algorithm: 'swiss',
          seed: Date.now()
        }
      }
    });

    // Generate random pairings for round 1
    const shuffledPlayers = [...playerIds].sort(() => Math.random() - 0.5);
    const matches = [];

    for (let i = 0; i < shuffledPlayers.length; i += 2) {
      const player1Id = shuffledPlayers[i];
      const player2Id = shuffledPlayers[i + 1] || null; // null for bye

      matches.push({
        tournamentId,
        roundId: round.id,
        status: 'pending' as const,
        players: player2Id ? [player1Id, player2Id] : [player1Id],
        results: undefined
      });
    }

    // Create matches
    await Promise.all(
      matches.map(match => 
        prisma.match.create({
          data: match
        })
      )
    );
  }

  /**
   * Handle preparation timeout - eliminate unready players
   */
  async handlePreparationTimeout(tournamentId: string): Promise<TournamentResponse> {
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        registrations: true
      }
    });

    if (!tournament) {
      throw new Error('Tournament not found');
    }

    if (tournament.status !== 'preparing') {
      throw new Error('Tournament is not in preparation phase');
    }

    // Find ready players
    const readyPlayers = tournament.registrations.filter(
      reg => reg.preparationStatus === 'completed' && reg.deckSubmitted
    );

    if (readyPlayers.length < TOURNAMENT_PLAYER_LIMITS.MIN_PLAYERS) {
      // Not enough ready players - cancel tournament
      const cancelledTournament = await prisma.tournament.update({
        where: { id: tournamentId },
        data: {
          status: 'cancelled',
          completedAt: new Date()
        },
        include: {
          registrations: true
        }
      });

      return this.mapTournamentToResponse(cancelledTournament);
    }

    // Remove unready players
    const unreadyPlayers = tournament.registrations.filter(
      reg => reg.preparationStatus !== 'completed' || !reg.deckSubmitted
    );

    await prisma.tournamentRegistration.deleteMany({
      where: {
        tournamentId,
        id: {
          in: unreadyPlayers.map(reg => reg.id)
        }
      }
    });

    // Transition to active
    const activeTournament = await prisma.tournament.update({
      where: { id: tournamentId },
      data: {
        status: 'active'
      },
      include: {
        registrations: true
      }
    });

    // Generate first round with remaining players
    await this.generateFirstRound(tournamentId);

    return this.mapTournamentToResponse(activeTournament);
  }

  /**
   * Complete tournament when all rounds finished
   */
  async completeTournament(tournamentId: string): Promise<TournamentResponse> {
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        rounds: {
          include: {
            matches: true
          }
        },
        registrations: true
      }
    });

    if (!tournament) {
      throw new Error('Tournament not found');
    }

    // Check if all rounds are completed
    const allRoundsComplete = tournament.rounds.every(round => 
      round.status === 'completed' &&
      round.matches.every(match => match.status === 'completed')
    );

    if (!allRoundsComplete) {
      throw new Error('Tournament has incomplete rounds');
    }

    // Calculate final rankings
    await this.calculateFinalRankings(tournamentId);

    const completedTournament = await prisma.tournament.update({
      where: { id: tournamentId },
      data: {
        status: 'completed',
        completedAt: new Date()
      },
      include: {
        registrations: true
      }
    });

    return this.mapTournamentToResponse(completedTournament);
  }

  /**
   * Calculate final rankings based on match points and tiebreakers
   */
  async calculateFinalRankings(tournamentId: string): Promise<void> {
    const standings = await prisma.playerStanding.findMany({
      where: { tournamentId },
      orderBy: [
        { matchPoints: 'desc' },
        { opponentMatchWinPercentage: 'desc' },
        { gameWinPercentage: 'desc' }
      ]
    });

    // Update final rankings
    await Promise.all(
      standings.map((standing, index) =>
        prisma.tournamentStatistics.upsert({
          where: {
            tournamentId_playerId: {
              tournamentId,
              playerId: standing.playerId
            }
          },
          create: {
            tournamentId,
            playerId: standing.playerId,
            wins: standing.wins,
            losses: standing.losses,
            draws: standing.draws,
            matchPoints: standing.matchPoints,
            tiebreakers: {
              opponentMatchWinPercentage: standing.opponentMatchWinPercentage,
              gameWinPercentage: standing.gameWinPercentage
            },
            finalRanking: index + 1
          },
          update: {
            finalRanking: index + 1
          }
        })
      )
    );
  }

  /**
   * Map database tournament to response format
   */
  private mapTournamentToResponse(tournament: {
    id: string;
    name: string;
    format: string;
    status: string;
    maxPlayers: number;
    creatorId: string;
    settings: unknown;
    createdAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
    registrations?: Array<{ id: string }>;
  }): TournamentResponse {
    return {
      id: tournament.id,
      name: tournament.name,
      format: tournament.format as TournamentFormat,
      status: tournament.status as TournamentStatus,
      maxPlayers: tournament.maxPlayers,
      currentPlayers: tournament.registrations?.length || 0,
      creatorId: tournament.creatorId,
      settings: tournament.settings as Record<string, unknown>,
      createdAt: tournament.createdAt.toISOString(),
      startedAt: tournament.startedAt?.toISOString() || null,
      completedAt: tournament.completedAt?.toISOString() || null
    };
  }
}

// Export singleton instance
export const tournamentService = new TournamentService();