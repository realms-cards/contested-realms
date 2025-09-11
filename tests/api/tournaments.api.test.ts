/**
 * Tournament API Contract Tests
 * These tests validate the API contracts defined in `/specs/007-tournament-mvp-i/contracts/tournaments-api.ts`
 * 
 * IMPORTANT: Following TDD principles, these tests are written to FAIL FIRST
 * The actual API endpoints do not exist yet - these tests define the expected behavior
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { 
  CreateTournamentRequest, 
  UpdateTournamentRequest,
  JoinTournamentRequest,
  SubmitPreparationRequest,
  TournamentResponse,
  TournamentRegistrationResponse 
} from '@/lib/tournament/validation';

// Mock authentication
vi.mock('next-auth/next', () => ({
  getServerSession: vi.fn()
}));

// Mock Prisma client
vi.mock('@/lib/prisma', () => ({
  prisma: {
    tournament: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    },
    tournamentRegistration: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn()
    },
    user: {
      findUnique: vi.fn()
    }
  }
}));

describe('Tournament API Contract Tests', () => {
  const mockUserId = 'user-123';
  const mockTournamentId = 'tournament-456';
  
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock authenticated user
    const { getServerSession } = require('next-auth/next');
    getServerSession.mockResolvedValue({
      user: { id: mockUserId, name: 'Test User' }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/tournaments - Create Tournament', () => {
    it('should create a new tournament with valid data', async () => {
      const validRequest: CreateTournamentRequest = {
        name: 'Test Tournament',
        format: 'sealed',
        maxPlayers: 8,
        settings: {
          sealed: {
            packConfiguration: [
              { setId: 'alpha', packCount: 6 }
            ],
            deckBuildingTimeLimit: 30
          }
        }
      };

      // This will fail because the endpoint doesn't exist yet
      const { POST } = await import('@/app/api/tournaments/route');
      
      const request = new NextRequest('http://localhost:3000/api/tournaments', {
        method: 'POST',
        body: JSON.stringify(validRequest),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await POST(request);
      
      expect(response.status).toBe(201);
      const data: TournamentResponse = await response.json();
      
      expect(data).toMatchObject({
        name: validRequest.name,
        format: validRequest.format,
        maxPlayers: validRequest.maxPlayers,
        status: 'registering',
        creatorId: mockUserId,
        currentPlayers: 0
      });
      expect(data.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(data.createdAt).toBeTruthy();
    });

    it('should reject invalid tournament name', async () => {
      const invalidRequest: CreateTournamentRequest = {
        name: 'X', // Too short
        format: 'sealed',
        maxPlayers: 8,
        settings: {}
      };

      const { POST } = await import('@/app/api/tournaments/route');
      
      const request = new NextRequest('http://localhost:3000/api/tournaments', {
        method: 'POST',
        body: JSON.stringify(invalidRequest),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await POST(request);
      
      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.message).toContain('Tournament name must be at least');
    });

    it('should reject invalid player count', async () => {
      const invalidRequest: CreateTournamentRequest = {
        name: 'Valid Tournament Name',
        format: 'sealed',
        maxPlayers: 1, // Below minimum
        settings: {}
      };

      const { POST } = await import('@/app/api/tournaments/route');
      
      const request = new NextRequest('http://localhost:3000/api/tournaments', {
        method: 'POST',
        body: JSON.stringify(invalidRequest),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await POST(request);
      
      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.message).toContain('Minimum 2 players required');
    });

    it('should require authentication', async () => {
      const { getServerSession } = require('next-auth/next');
      getServerSession.mockResolvedValue(null);

      const { POST } = await import('@/app/api/tournaments/route');
      
      const request = new NextRequest('http://localhost:3000/api/tournaments', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await POST(request);
      
      expect(response.status).toBe(401);
      const error = await response.json();
      expect(error.message).toBe('Authentication required');
    });
  });

  describe('GET /api/tournaments/[id] - Get Tournament', () => {
    it('should return tournament details', async () => {
      const { GET } = await import('@/app/api/tournaments/[id]/route');
      
      const response = await GET(
        new NextRequest(`http://localhost:3000/api/tournaments/${mockTournamentId}`),
        { params: { id: mockTournamentId } }
      );

      expect(response.status).toBe(200);
      const data: TournamentResponse = await response.json();
      
      expect(data.id).toBe(mockTournamentId);
      expect(data.name).toBeTruthy();
      expect(data.format).toMatch(/^(sealed|draft|constructed)$/);
      expect(data.status).toMatch(/^(registering|preparing|active|completed|cancelled)$/);
    });

    it('should return 404 for non-existent tournament', async () => {
      const nonExistentId = 'non-existent-123';
      const { GET } = await import('@/app/api/tournaments/[id]/route');
      
      const response = await GET(
        new NextRequest(`http://localhost:3000/api/tournaments/${nonExistentId}`),
        { params: { id: nonExistentId } }
      );

      expect(response.status).toBe(404);
      const error = await response.json();
      expect(error.message).toBe('Tournament not found');
    });
  });

  describe('PATCH /api/tournaments/[id] - Update Tournament', () => {
    it('should update tournament settings', async () => {
      const updateRequest: UpdateTournamentRequest = {
        name: 'Updated Tournament Name',
        settings: {
          sealed: {
            packConfiguration: [
              { setId: 'beta', packCount: 4 }
            ],
            deckBuildingTimeLimit: 45
          }
        }
      };

      const { PATCH } = await import('@/app/api/tournaments/[id]/route');
      
      const request = new NextRequest(`http://localhost:3000/api/tournaments/${mockTournamentId}`, {
        method: 'PATCH',
        body: JSON.stringify(updateRequest),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await PATCH(request, { params: { id: mockTournamentId } });
      
      expect(response.status).toBe(200);
      const data: TournamentResponse = await response.json();
      expect(data.name).toBe(updateRequest.name);
    });

    it('should reject updates to non-registering tournaments', async () => {
      const { PATCH } = await import('@/app/api/tournaments/[id]/route');
      
      const request = new NextRequest(`http://localhost:3000/api/tournaments/${mockTournamentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: 'New Name' }),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await PATCH(request, { params: { id: mockTournamentId } });
      
      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.message).toBe('Can only update tournaments in registering phase');
    });

    it('should only allow creator to update tournament', async () => {
      const { getServerSession } = require('next-auth/next');
      getServerSession.mockResolvedValue({
        user: { id: 'different-user-789', name: 'Other User' }
      });

      const { PATCH } = await import('@/app/api/tournaments/[id]/route');
      
      const request = new NextRequest(`http://localhost:3000/api/tournaments/${mockTournamentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Unauthorized Update' }),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await PATCH(request, { params: { id: mockTournamentId } });
      
      expect(response.status).toBe(403);
      const error = await response.json();
      expect(error.message).toBe('Only tournament creator can update settings');
    });
  });

  describe('POST /api/tournaments/[id]/join - Join Tournament', () => {
    it('should allow player to join tournament', async () => {
      const joinRequest: JoinTournamentRequest = {};

      const { POST } = await import('@/app/api/tournaments/[id]/join/route');
      
      const request = new NextRequest(`http://localhost:3000/api/tournaments/${mockTournamentId}/join`, {
        method: 'POST',
        body: JSON.stringify(joinRequest),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await POST(request, { params: { id: mockTournamentId } });
      
      expect(response.status).toBe(200);
      const data: TournamentRegistrationResponse = await response.json();
      
      expect(data.tournamentId).toBe(mockTournamentId);
      expect(data.playerId).toBe(mockUserId);
      expect(data.preparationStatus).toBe('notStarted');
      expect(data.deckSubmitted).toBe(false);
    });

    it('should reject join when tournament is full', async () => {
      const { POST } = await import('@/app/api/tournaments/[id]/join/route');
      
      const request = new NextRequest(`http://localhost:3000/api/tournaments/${mockTournamentId}/join`, {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await POST(request, { params: { id: mockTournamentId } });
      
      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.message).toBe('Tournament is full');
    });

    it('should reject join when tournament is not in registering phase', async () => {
      const { POST } = await import('@/app/api/tournaments/[id]/join/route');
      
      const request = new NextRequest(`http://localhost:3000/api/tournaments/${mockTournamentId}/join`, {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await POST(request, { params: { id: mockTournamentId } });
      
      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.message).toBe('Tournament is not accepting registrations');
    });

    it('should prevent duplicate registration', async () => {
      const { POST } = await import('@/app/api/tournaments/[id]/join/route');
      
      const request = new NextRequest(`http://localhost:3000/api/tournaments/${mockTournamentId}/join`, {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await POST(request, { params: { id: mockTournamentId } });
      
      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.message).toBe('Already registered for this tournament');
    });
  });

  describe('POST /api/tournaments/[id]/preparation - Submit Preparation', () => {
    it('should accept sealed preparation data', async () => {
      const preparationRequest: SubmitPreparationRequest = {
        preparationData: {
          sealed: {
            packsOpened: true,
            deckBuilt: true,
            deckList: [
              { cardId: 'card-1', quantity: 2 },
              { cardId: 'card-2', quantity: 1 }
            ]
          }
        }
      };

      const { POST } = await import('@/app/api/tournaments/[id]/preparation/route');
      
      const request = new NextRequest(`http://localhost:3000/api/tournaments/${mockTournamentId}/preparation`, {
        method: 'POST',
        body: JSON.stringify(preparationRequest),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await POST(request, { params: { id: mockTournamentId } });
      
      expect(response.status).toBe(200);
      const data: TournamentRegistrationResponse = await response.json();
      
      expect(data.preparationStatus).toBe('completed');
      expect(data.deckSubmitted).toBe(true);
    });

    it('should reject preparation data when not registered', async () => {
      const { getServerSession } = require('next-auth/next');
      getServerSession.mockResolvedValue({
        user: { id: 'unregistered-user', name: 'Unregistered User' }
      });

      const { POST } = await import('@/app/api/tournaments/[id]/preparation/route');
      
      const request = new NextRequest(`http://localhost:3000/api/tournaments/${mockTournamentId}/preparation`, {
        method: 'POST',
        body: JSON.stringify({ preparationData: {} }),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await POST(request, { params: { id: mockTournamentId } });
      
      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.message).toBe('Not registered for this tournament');
    });

    it('should reject preparation when tournament is not in preparing phase', async () => {
      const { POST } = await import('@/app/api/tournaments/[id]/preparation/route');
      
      const request = new NextRequest(`http://localhost:3000/api/tournaments/${mockTournamentId}/preparation`, {
        method: 'POST',
        body: JSON.stringify({ preparationData: {} }),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await POST(request, { params: { id: mockTournamentId } });
      
      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.message).toBe('Tournament is not in preparation phase');
    });
  });

  describe('GET /api/tournaments/[id]/statistics - Get Tournament Statistics', () => {
    it('should return tournament statistics', async () => {
      const { GET } = await import('@/app/api/tournaments/[id]/statistics/route');
      
      const response = await GET(
        new NextRequest(`http://localhost:3000/api/tournaments/${mockTournamentId}/statistics`),
        { params: { id: mockTournamentId } }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.tournamentId).toBe(mockTournamentId);
      expect(data.standings).toBeInstanceOf(Array);
      expect(data.rounds).toBeInstanceOf(Array);
      expect(data.overallStats).toMatchObject({
        totalMatches: expect.any(Number),
        completedMatches: expect.any(Number),
        totalPlayers: expect.any(Number),
        roundsCompleted: expect.any(Number)
      });
    });

    it('should return empty statistics for new tournament', async () => {
      const { GET } = await import('@/app/api/tournaments/[id]/statistics/route');
      
      const response = await GET(
        new NextRequest(`http://localhost:3000/api/tournaments/${mockTournamentId}/statistics`),
        { params: { id: mockTournamentId } }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.standings).toHaveLength(0);
      expect(data.rounds).toHaveLength(0);
      expect(data.overallStats.totalMatches).toBe(0);
      expect(data.overallStats.completedMatches).toBe(0);
    });
  });

  describe('GET /api/tournaments - List Tournaments', () => {
    it('should return list of tournaments', async () => {
      const { GET } = await import('@/app/api/tournaments/route');
      
      const response = await GET(new NextRequest('http://localhost:3000/api/tournaments'));

      expect(response.status).toBe(200);
      const data: TournamentResponse[] = await response.json();
      
      expect(Array.isArray(data)).toBe(true);
      if (data.length > 0) {
        expect(data[0]).toMatchObject({
          id: expect.any(String),
          name: expect.any(String),
          format: expect.stringMatching(/^(sealed|draft|constructed)$/),
          status: expect.stringMatching(/^(registering|preparing|active|completed|cancelled)$/)
        });
      }
    });

    it('should filter tournaments by status', async () => {
      const { GET } = await import('@/app/api/tournaments/route');
      
      const response = await GET(
        new NextRequest('http://localhost:3000/api/tournaments?status=registering')
      );

      expect(response.status).toBe(200);
      const data: TournamentResponse[] = await response.json();
      
      data.forEach(tournament => {
        expect(tournament.status).toBe('registering');
      });
    });

    it('should filter tournaments by format', async () => {
      const { GET } = await import('@/app/api/tournaments/route');
      
      const response = await GET(
        new NextRequest('http://localhost:3000/api/tournaments?format=sealed')
      );

      expect(response.status).toBe(200);
      const data: TournamentResponse[] = await response.json();
      
      data.forEach(tournament => {
        expect(tournament.format).toBe('sealed');
      });
    });
  });
});