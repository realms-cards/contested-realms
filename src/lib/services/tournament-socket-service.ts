/**
 * Tournament Socket Service
 * Handles real-time tournament events and WebSocket communication
 */

import { Server as SocketIOServer } from 'socket.io';
import type { Socket } from 'socket.io';
import { prisma } from '@/lib/prisma';
import { TOURNAMENT_SOCKET_EVENTS, PERFORMANCE_LIMITS } from '@/lib/tournament/constants';
import type {
  TournamentResponse,
  TournamentStatisticsResponse,
  TournamentStatus
} from '@/lib/tournament/validation';

export interface TournamentSocketData {
  userId: string;
  tournamentId?: string;
  isSpectator?: boolean;
}

export interface RateLimitData {
  count: number;
  resetTime: number;
}

export class TournamentSocketService {
  private io: SocketIOServer | null = null;
  private rateLimits = new Map<string, RateLimitData>();
  private tournamentRooms = new Map<string, Set<string>>(); // tournamentId -> Set<socketId>

  /**
   * Initialize socket service with Socket.IO server
   */
  initialize(io: SocketIOServer): void {
    this.io = io;
    this.setupSocketHandlers();
    this.startCleanupInterval();
  }

  /**
   * Set up socket event handlers
   */
  private setupSocketHandlers(): void {
    if (!this.io) return;

    this.io.on('connection', (socket: Socket) => {
      console.log(`Tournament socket connected: ${socket.id}`);

      // Rate limiting middleware
      socket.use((packet, next) => {
        if (this.isRateLimited(socket.id)) {
          next(new Error('Rate limit exceeded'));
          return;
        }
        next();
      });

      // Join tournament room
      socket.on(TOURNAMENT_SOCKET_EVENTS.JOIN_TOURNAMENT, async (data: { tournamentId: string }) => {
        try {
          await this.handleJoinTournament(socket, data.tournamentId);
        } catch (error) {
          socket.emit(TOURNAMENT_SOCKET_EVENTS.ERROR, {
            code: 'JOIN_FAILED',
            message: 'Failed to join tournament',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      });

      // Leave tournament room
      socket.on(TOURNAMENT_SOCKET_EVENTS.LEAVE_TOURNAMENT, async (data: { tournamentId: string }) => {
        try {
          await this.handleLeaveTournament(socket, data.tournamentId);
        } catch (error) {
          console.error('Error leaving tournament:', error);
        }
      });

      // Update preparation status
      socket.on(TOURNAMENT_SOCKET_EVENTS.UPDATE_PREPARATION, async (data: {
        tournamentId: string;
        preparationData: Record<string, unknown>;
      }) => {
        try {
          await this.handlePreparationUpdate(socket, data.tournamentId, data.preparationData);
        } catch (error) {
          socket.emit(TOURNAMENT_SOCKET_EVENTS.ERROR, {
            code: 'PREPARATION_UPDATE_FAILED',
            message: 'Failed to update preparation',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      });

      // Submit match result
      socket.on(TOURNAMENT_SOCKET_EVENTS.SUBMIT_MATCH_RESULT, async (data: {
        matchId: string;
        result: Record<string, unknown>;
      }) => {
        try {
          await this.handleMatchResult(socket, data.matchId, data.result);
        } catch (error) {
          socket.emit(TOURNAMENT_SOCKET_EVENTS.ERROR, {
            code: 'MATCH_RESULT_FAILED',
            message: 'Failed to submit match result',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log(`Tournament socket disconnected: ${socket.id}`);
        this.handleDisconnect(socket);
      });
    });
  }

  /**
   * Handle joining a tournament room
   */
  private async handleJoinTournament(socket: Socket, tournamentId: string): Promise<void> {
    // Validate tournament exists
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        registrations: true
      }
    });

    if (!tournament) {
      throw new Error('Tournament not found');
    }

    // Check room capacity
    const currentRoom = this.tournamentRooms.get(tournamentId);
    if (currentRoom && currentRoom.size >= PERFORMANCE_LIMITS.MAX_SPECTATORS_PER_TOURNAMENT) {
      throw new Error('Tournament room is full');
    }

    // Join socket room
    socket.join(`tournament:${tournamentId}`);

    // Track in our room map
    if (!this.tournamentRooms.has(tournamentId)) {
      this.tournamentRooms.set(tournamentId, new Set());
    }
    const roomSet = this.tournamentRooms.get(tournamentId);
    if (roomSet) roomSet.add(socket.id);

    // Store tournament data in socket
    socket.data.tournamentId = tournamentId;

    // Send current tournament state
    const tournamentData = this.mapTournamentToResponse(tournament);
    socket.emit(TOURNAMENT_SOCKET_EVENTS.TOURNAMENT_UPDATED, tournamentData);

    console.log(`Socket ${socket.id} joined tournament ${tournamentId}`);
  }

  /**
   * Handle leaving a tournament room
   */
  private async handleLeaveTournament(socket: Socket, tournamentId: string): Promise<void> {
    socket.leave(`tournament:${tournamentId}`);

    // Remove from room map
    const room = this.tournamentRooms.get(tournamentId);
    if (room) {
      room.delete(socket.id);
      if (room.size === 0) {
        this.tournamentRooms.delete(tournamentId);
      }
    }

    // Clear tournament data from socket
    delete socket.data.tournamentId;

    console.log(`Socket ${socket.id} left tournament ${tournamentId}`);
  }

  /**
   * Handle preparation status updates
   */
  private async handlePreparationUpdate(
    socket: Socket,
    tournamentId: string,
    preparationData: Record<string, unknown>
  ): Promise<void> {
    // Validate user is registered for tournament
    const userId = socket.data.userId;
    if (!userId) {
      throw new Error('Authentication required');
    }

    const registration = await prisma.tournamentRegistration.findUnique({
      where: {
        tournamentId_playerId: {
          tournamentId,
          playerId: userId
        }
      }
    });

    if (!registration) {
      throw new Error('Not registered for this tournament');
    }

    // Update preparation status
    await prisma.tournamentRegistration.update({
      where: { id: registration.id },
      data: {
        preparationData: JSON.parse(JSON.stringify(preparationData)),
        preparationStatus: preparationData.isComplete ? 'completed' : 'inProgress',
        deckSubmitted: Boolean(preparationData.deckSubmitted)
      }
    });

    // Get updated registration counts
    const registrations = await prisma.tournamentRegistration.findMany({
      where: { tournamentId },
      include: {
        player: {
          select: { name: true }
        }
      }
    });

    const readyCount = registrations.filter(reg => 
      reg.preparationStatus === 'completed' && reg.deckSubmitted
    ).length;

    // Broadcast preparation update
    this.broadcastToTournament(tournamentId, TOURNAMENT_SOCKET_EVENTS.UPDATE_PREPARATION, {
      tournamentId,
      playerId: userId,
      preparationStatus: preparationData.isComplete ? 'completed' : 'inProgress',
      deckSubmitted: Boolean(preparationData.deckSubmitted),
      readyPlayerCount: readyCount,
      totalPlayerCount: registrations.length
    });
  }

  /**
   * Handle match result submission
   */
  private async handleMatchResult(socket: Socket, matchId: string, result: Record<string, unknown>): Promise<void> {
    const userId = socket.data.userId;
    if (!userId) {
      throw new Error('Authentication required');
    }

    // Validate match and user participation
    const match = await prisma.match.findUnique({
      where: { id: matchId }
    });

    if (!match) {
      throw new Error('Match not found');
    }

    const matchPlayers = Array.isArray(match.players) ? match.players.map(String) : [];
    if (!matchPlayers.includes(userId)) {
      throw new Error('Not authorized to report this match');
    }

    // Update match result
    await prisma.match.update({
      where: { id: matchId },
      data: {
        status: 'completed',
        results: JSON.parse(JSON.stringify(result)),
        completedAt: new Date()
      }
    });

    // Update player standings
    if (match.tournamentId) {
      await this.updatePlayerStandingsFromMatch(match.tournamentId, matchPlayers, result);
    }

    // Broadcast match completion
    if (match.tournamentId) {
      this.broadcastToTournament(match.tournamentId, TOURNAMENT_SOCKET_EVENTS.STATISTICS_UPDATED, {
        tournamentId: match.tournamentId,
        matchId,
        result,
        updateType: 'match-completed'
      });
    }
  }

  /**
   * Handle socket disconnection
   */
  private handleDisconnect(socket: Socket): void {
    const tournamentId = socket.data.tournamentId;
    if (tournamentId) {
      const room = this.tournamentRooms.get(tournamentId);
      if (room) {
        room.delete(socket.id);
        if (room.size === 0) {
          this.tournamentRooms.delete(tournamentId);
        }
      }
    }

    // Clean up rate limiting
    this.rateLimits.delete(socket.id);
  }

  /**
   * Broadcast player joined event
   */
  async broadcastPlayerJoined(
    tournamentId: string,
    playerId: string,
    playerName: string,
    currentPlayerCount: number
  ): Promise<void> {
    this.broadcastToTournament(tournamentId, TOURNAMENT_SOCKET_EVENTS.PLAYER_JOINED, {
      playerId,
      playerName,
      currentPlayerCount
    });
  }

  /**
   * Broadcast player left event
   */
  async broadcastPlayerLeft(
    tournamentId: string,
    playerId: string,
    playerName: string,
    currentPlayerCount: number
  ): Promise<void> {
    this.broadcastToTournament(tournamentId, TOURNAMENT_SOCKET_EVENTS.PLAYER_LEFT, {
      playerId,
      playerName,
      currentPlayerCount
    });
  }

  /**
   * Broadcast tournament phase change
   */
  async broadcastPhaseChanged(
    tournamentId: string,
    newPhase: TournamentStatus,
    additionalData?: Record<string, unknown>
  ): Promise<void> {
    this.broadcastToTournament(tournamentId, TOURNAMENT_SOCKET_EVENTS.PHASE_CHANGED, {
      tournamentId,
      newPhase,
      newStatus: newPhase,
      timestamp: new Date().toISOString(),
      ...additionalData
    });
  }

  /**
   * Broadcast round started
   */
  async broadcastRoundStarted(
    tournamentId: string,
    roundNumber: number,
    matches: Array<{
      id: string;
      player1Id: string;
      player1Name: string;
      player2Id: string | null;
      player2Name: string | null;
    }>
  ): Promise<void> {
    this.broadcastToTournament(tournamentId, TOURNAMENT_SOCKET_EVENTS.ROUND_STARTED, {
      tournamentId,
      roundNumber,
      matches
    });
  }

  /**
   * Broadcast match assignment to specific player
   */
  async broadcastMatchAssigned(
    tournamentId: string,
    playerId: string,
    matchData: {
      matchId: string;
      opponentId: string | null;
      opponentName: string | null;
      lobbyName: string;
    }
  ): Promise<void> {
    // Send to specific player
    this.broadcastToPlayer(playerId, TOURNAMENT_SOCKET_EVENTS.MATCH_ASSIGNED, {
      tournamentId,
      ...matchData
    });
  }

  /**
   * Broadcast statistics update
   */
  async broadcastStatisticsUpdate(
    tournamentId: string,
    statistics: TournamentStatisticsResponse
  ): Promise<void> {
    this.broadcastToTournament(tournamentId, TOURNAMENT_SOCKET_EVENTS.STATISTICS_UPDATED, statistics);
  }

  /**
   * Broadcast tournament update
   */
  async broadcastTournamentUpdate(tournamentData: TournamentResponse): Promise<void> {
    this.broadcastToTournament(tournamentData.id, TOURNAMENT_SOCKET_EVENTS.TOURNAMENT_UPDATED, tournamentData);
  }

  /**
   * Broadcast preparation status update
   */
  async broadcastPreparationUpdate(
    tournamentId: string,
    playerId: string,
    preparationStatus: string,
    readyPlayerCount: number,
    totalPlayerCount: number
  ): Promise<void> {
    this.broadcastToTournament(tournamentId, TOURNAMENT_SOCKET_EVENTS.UPDATE_PREPARATION, {
      tournamentId,
      playerId,
      preparationStatus,
      readyPlayerCount,
      totalPlayerCount
    });
  }

  /**
   * Send message to all sockets in a tournament room
   */
  private broadcastToTournament(tournamentId: string, event: string, data: Record<string, unknown>): void {
    if (!this.io) return;

    this.io.to(`tournament:${tournamentId}`).emit(event, data);
  }

  /**
   * Send message to specific player (if connected)
   */
  private broadcastToPlayer(playerId: string, event: string, data: Record<string, unknown>): void {
    if (!this.io) return;

    // Find sockets for this user
    const sockets = Array.from(this.io.sockets.sockets.values()).filter(
      socket => socket.data.userId === playerId
    );

    for (const socket of sockets) {
      socket.emit(event, data);
    }
  }

  /**
   * Check if socket is rate limited
   */
  private isRateLimited(socketId: string): boolean {
    const now = Date.now();
    const limit = this.rateLimits.get(socketId);

    if (!limit || now > limit.resetTime) {
      // Reset or create new limit
      this.rateLimits.set(socketId, {
        count: 1,
        resetTime: now + 1000 // 1 second window
      });
      return false;
    }

    if (limit.count >= PERFORMANCE_LIMITS.SOCKET_EVENT_RATE_LIMIT_PER_SECOND) {
      return true;
    }

    limit.count++;
    return false;
  }

  /**
   * Update player standings from match result
   */
  private async updatePlayerStandingsFromMatch(
    tournamentId: string,
    playerIds: string[],
    result: Record<string, unknown>
  ): Promise<void> {
    if (playerIds.length < 2) return;

    const [player1Id, player2Id] = playerIds;
    const player1Won = result.winnerId === player1Id;
    const player2Won = result.winnerId === player2Id;
    const isDraw = !result.winnerId;

    // Update player 1 standings
    await this.updatePlayerStanding(tournamentId, player1Id, {
      won: player1Won,
      draw: isDraw,
      gameWins: typeof result.player1Wins === 'number' ? result.player1Wins : 0,
      gameLosses: typeof result.player2Wins === 'number' ? result.player2Wins : 0
    });

    // Update player 2 standings
    await this.updatePlayerStanding(tournamentId, player2Id, {
      won: player2Won,
      draw: isDraw,
      gameWins: typeof result.player2Wins === 'number' ? result.player2Wins : 0,
      gameLosses: typeof result.player1Wins === 'number' ? result.player1Wins : 0
    });
  }

  /**
   * Update individual player standing
   */
  private async updatePlayerStanding(
    tournamentId: string,
    playerId: string,
    matchResult: {
      won: boolean;
      draw: boolean;
      gameWins: number;
      gameLosses: number;
    }
  ): Promise<void> {
    const matchPoints = matchResult.won ? 3 : matchResult.draw ? 1 : 0;

    // Get player name
    const player = await prisma.user.findUnique({
      where: { id: playerId },
      select: { name: true }
    });

    await prisma.playerStanding.upsert({
      where: {
        tournamentId_playerId: {
          tournamentId,
          playerId
        }
      },
      create: {
        tournamentId,
        playerId,
        displayName: player?.name || 'Unknown Player',
        wins: matchResult.won ? 1 : 0,
        losses: matchResult.won || matchResult.draw ? 0 : 1,
        draws: matchResult.draw ? 1 : 0,
        matchPoints,
        gameWinPercentage: 0, // Will be calculated by statistics service
        opponentMatchWinPercentage: 0 // Will be calculated by statistics service
      },
      update: {
        wins: { increment: matchResult.won ? 1 : 0 },
        losses: { increment: matchResult.won || matchResult.draw ? 0 : 1 },
        draws: { increment: matchResult.draw ? 1 : 0 },
        matchPoints: { increment: matchPoints }
      }
    });
  }

  /**
   * Start periodic cleanup of expired data
   */
  private startCleanupInterval(): void {
    setInterval(() => {
      const now = Date.now();
      
      // Clean up expired rate limits
      for (const [socketId, limit] of this.rateLimits.entries()) {
        if (now > limit.resetTime) {
          this.rateLimits.delete(socketId);
        }
      }
    }, 60000); // Run every minute
  }

  /**
   * Map tournament to response format
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
      format: tournament.format as TournamentResponse['format'],
      status: tournament.status as TournamentResponse['status'],
      maxPlayers: tournament.maxPlayers,
      currentPlayers: tournament.registrations?.length || 0,
      creatorId: tournament.creatorId,
      settings: tournament.settings as Record<string, unknown>,
      createdAt: tournament.createdAt.toISOString(),
      startedAt: tournament.startedAt?.toISOString() || null,
      completedAt: tournament.completedAt?.toISOString() || null
    };
  }

  /**
   * Get tournament room statistics
   */
  getTournamentRoomStats(): Array<{ tournamentId: string; connectedCount: number }> {
    return Array.from(this.tournamentRooms.entries()).map(([tournamentId, sockets]) => ({
      tournamentId,
      connectedCount: sockets.size
    }));
  }

  /**
   * Force disconnect all sockets in a tournament room
   */
  disconnectTournamentRoom(tournamentId: string): void {
    if (!this.io) return;

    const sockets = this.io.sockets.adapter.rooms.get(`tournament:${tournamentId}`);
    if (sockets) {
      for (const socketId of sockets) {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.disconnect(true);
        }
      }
    }

    // Clean up our tracking
    this.tournamentRooms.delete(tournamentId);
  }
}

// Export singleton instance
export const tournamentSocketService = new TournamentSocketService();
