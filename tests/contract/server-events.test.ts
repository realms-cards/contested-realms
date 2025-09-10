/**
 * Contract Test: Server WebRTC Events
 * 
 * This test ensures that the server WebRTC event handling matches
 * the contract defined in specs/006-live-video-and/contracts/server-events.ts
 * 
 * CRITICAL: This test MUST FAIL until server implementation is enhanced
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { createMockServer, createMockClient } from '../setup-server';
import type { MockServer, MockClient } from '../setup-server';
import type {
  WebRTCParticipant,
  ClientWebRTCEvents,
  ServerWebRTCEvents,
  ServerWebRTCState,
  ServerWebRTCHandlers
} from '../../specs/006-live-video-and/contracts/server-events';

describe('Contract: Server WebRTC Event Interfaces', () => {
  let server: MockServer;
  let client1: MockClient;
  let client2: MockClient;
  
  beforeEach(async () => {
    server = await createMockServer({ enableWebRTC: true });
    client1 = await createMockClient(server.url, {
      playerId: 'player-1',
      displayName: 'Test Player 1',
      matchId: 'test-match'
    });
    client2 = await createMockClient(server.url, {
      playerId: 'player-2', 
      displayName: 'Test Player 2',
      matchId: 'test-match'
    });
  });
  
  afterEach(async () => {
    await client1.cleanup();
    await client2.cleanup();
    await server.cleanup();
  });
  
  test('WebRTCParticipant interface structure', () => {
    const mockParticipant: WebRTCParticipant = {
      id: 'player-123',
      displayName: 'Test Player',
      matchId: 'match-456',
      joinedAt: Date.now()
    };
    
    expect(typeof mockParticipant.id).toBe('string');
    expect(typeof mockParticipant.displayName).toBe('string');
    expect(typeof mockParticipant.matchId).toBe('string');
    expect(typeof mockParticipant.joinedAt).toBe('number');
    expect(mockParticipant.joinedAt).toBeGreaterThan(0);
  });
  
  test('ClientWebRTCEvents interface compliance', () => {
    // Test that client can emit expected events with correct payloads
    expect(() => {
      // rtc:join - no payload expected
      client1.socket.emit('rtc:join');
      
      // rtc:leave - no payload expected
      client1.socket.emit('rtc:leave');
      
      // rtc:signal - expects payload with data object
      const signalPayload = {
        data: {
          sdp: {
            type: 'offer' as const,
            sdp: 'mock-sdp-string'
          }
        }
      };
      client1.socket.emit('rtc:signal', signalPayload);
      
      // rtc:signal with candidate
      const candidatePayload = {
        data: {
          candidate: {
            candidate: 'mock-candidate-string',
            sdpMLineIndex: 0,
            sdpMid: 'audio'
          }
        }
      };
      client1.socket.emit('rtc:signal', candidatePayload);
      
    }).not.toThrow();
  });
  
  test('ServerWebRTCEvents interface compliance', async () => {
    // Test that server emits events with correct structure
    const receivedEvents: { event: string; payload: unknown }[] = [];
    
    // Set up event listeners to capture server emissions
    client2.socket.on('rtc:peer-joined', (payload) => {
      receivedEvents.push({ event: 'rtc:peer-joined', payload });
    });
    
    client2.socket.on('rtc:peer-left', (payload) => {
      receivedEvents.push({ event: 'rtc:peer-left', payload });
    });
    
    client2.socket.on('rtc:signal', (payload) => {
      receivedEvents.push({ event: 'rtc:signal', payload });
    });
    
    client2.socket.on('rtc:connection-failed', (payload) => {
      receivedEvents.push({ event: 'rtc:connection-failed', payload });
    });
    
    client2.socket.on('rtc:participants-list', (payload) => {
      receivedEvents.push({ event: 'rtc:participants-list', payload });
    });
    
    // Trigger events by having client1 join WebRTC
    client1.socket.emit('rtc:join');
    
    // Wait for events to propagate
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify rtc:peer-joined event structure
    const peerJoinedEvent = receivedEvents.find(e => e.event === 'rtc:peer-joined');
    
    if (peerJoinedEvent) {
      const payload = peerJoinedEvent.payload as {
        from: { id: string; displayName: string };
        participants: WebRTCParticipant[];
      };
      
      expect(typeof payload.from.id).toBe('string');
      expect(typeof payload.from.displayName).toBe('string');
      expect(Array.isArray(payload.participants)).toBe(true);
      
      // Each participant should match WebRTCParticipant interface
      payload.participants.forEach((participant) => {
        expect(typeof participant.id).toBe('string');
        expect(typeof participant.displayName).toBe('string');
        expect(typeof participant.matchId).toBe('string');
        expect(typeof participant.joinedAt).toBe('number');
      });
    } else {
      // Expected to fail until enhanced server implementation exists
      expect(peerJoinedEvent).toBeDefined(); // This will fail
    }
  });
  
  test('server maintains enhanced WebRTC participant tracking', async () => {
    // Test that server tracks participants properly
    expect(server.rtcParticipants).toBeInstanceOf(Map);
    expect(server.participantDetails).toBeInstanceOf(Map);
    
    // Initially no participants
    expect(server.rtcParticipants.size).toBe(0);
    expect(server.participantDetails.size).toBe(0);
    
    // Have client1 join WebRTC
    client1.socket.emit('rtc:join');
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Server should track the participant
    const matchParticipants = server.rtcParticipants.get('test-match');
    expect(matchParticipants).toBeDefined();
    expect(matchParticipants?.has('player-1')).toBe(true);
    
    const participantDetail = server.participantDetails.get('player-1');
    expect(participantDetail).toBeDefined();
    expect(participantDetail?.id).toBe('player-1');
    expect(participantDetail?.matchId).toBe('test-match');
    
    // Have client1 leave WebRTC
    client1.socket.emit('rtc:leave');
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Server should clean up participant tracking
    expect(matchParticipants?.has('player-1')).toBe(false);
    expect(server.participantDetails.has('player-1')).toBe(false);
  });
  
  test('server sends signals only to WebRTC participants', async () => {
    const client1Signals: unknown[] = [];
    const client2Signals: unknown[] = [];
    
    client1.socket.on('rtc:signal', (payload) => {
      client1Signals.push(payload);
    });
    
    client2.socket.on('rtc:signal', (payload) => {
      client2Signals.push(payload);
    });
    
    // Both clients join WebRTC
    client1.socket.emit('rtc:join');
    client2.socket.emit('rtc:join');
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Client1 sends a signal
    const testSignal = {
      data: {
        sdp: {
          type: 'offer' as const,
          sdp: 'test-sdp'
        }
      }
    };
    
    client1.socket.emit('rtc:signal', testSignal);
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Client2 should receive the signal (both are WebRTC participants)
    expect(client2Signals.length).toBeGreaterThan(0);
    
    const receivedSignal = client2Signals[0] as {
      from: string;
      data: { sdp: { type: string; sdp: string } };
    };
    
    expect(receivedSignal.from).toBe('player-1');
    expect(receivedSignal.data.sdp.type).toBe('offer');
    expect(receivedSignal.data.sdp.sdp).toBe('test-sdp');
    
    // Client1 should not receive its own signal
    expect(client1Signals.length).toBe(0);
  });
  
  test('server handles WebRTC participant cleanup on disconnect', async () => {
    // Client1 joins WebRTC
    client1.socket.emit('rtc:join');
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify participant is tracked
    expect(server.rtcParticipants.get('test-match')?.has('player-1')).toBe(true);
    expect(server.participantDetails.has('player-1')).toBe(true);
    
    // Client1 disconnects
    client1.socket.disconnect();
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Server should clean up WebRTC state
    expect(server.rtcParticipants.get('test-match')?.has('player-1')).toBe(false);
    expect(server.participantDetails.has('player-1')).toBe(false);
  });
});

describe('Contract: ServerWebRTCState Interface', () => {
  test('ServerWebRTCState structure validation', () => {
    const mockState: ServerWebRTCState = {
      rtcParticipants: new Map([
        ['match-1', new Set(['player-1', 'player-2'])],
        ['match-2', new Set(['player-3'])]
      ]),
      participantDetails: new Map([
        ['player-1', { id: 'player-1', displayName: 'Player 1', matchId: 'match-1', joinedAt: Date.now() }],
        ['player-2', { id: 'player-2', displayName: 'Player 2', matchId: 'match-1', joinedAt: Date.now() }],
        ['player-3', { id: 'player-3', displayName: 'Player 3', matchId: 'match-2', joinedAt: Date.now() }]
      ]),
      connectionAttempts: new Map([
        ['match-1', 2],
        ['match-2', 1]
      ])
    };
    
    // Test rtcParticipants structure
    expect(mockState.rtcParticipants).toBeInstanceOf(Map);
    expect(mockState.rtcParticipants.get('match-1')).toBeInstanceOf(Set);
    expect(mockState.rtcParticipants.get('match-1')?.has('player-1')).toBe(true);
    expect(mockState.rtcParticipants.get('match-1')?.size).toBe(2);
    
    // Test participantDetails structure
    expect(mockState.participantDetails).toBeInstanceOf(Map);
    const participant1 = mockState.participantDetails.get('player-1');
    expect(participant1?.id).toBe('player-1');
    expect(participant1?.displayName).toBe('Player 1');
    expect(participant1?.matchId).toBe('match-1');
    expect(typeof participant1?.joinedAt).toBe('number');
    
    // Test connectionAttempts structure
    expect(mockState.connectionAttempts).toBeInstanceOf(Map);
    expect(mockState.connectionAttempts.get('match-1')).toBe(2);
    expect(typeof mockState.connectionAttempts.get('match-1')).toBe('number');
  });
});

describe('Contract: ServerWebRTCHandlers Interface', () => {
  test('ServerWebRTCHandlers interface structure', () => {
    // Mock implementation of server handlers
    const mockHandlers: ServerWebRTCHandlers = {
      handleRtcJoin: vi.fn(),
      handleRtcLeave: vi.fn(),
      handleRtcSignal: vi.fn(),
      cleanupParticipant: vi.fn(),
      getParticipants: vi.fn()
    };
    
    // Verify all handler methods exist and are functions
    expect(typeof mockHandlers.handleRtcJoin).toBe('function');
    expect(typeof mockHandlers.handleRtcLeave).toBe('function');
    expect(typeof mockHandlers.handleRtcSignal).toBe('function');
    expect(typeof mockHandlers.cleanupParticipant).toBe('function');
    expect(typeof mockHandlers.getParticipants).toBe('function');
  });
  
  test('getParticipants returns correct format', () => {
    const mockParticipants: WebRTCParticipant[] = [
      {
        id: 'player-1',
        displayName: 'Player 1',
        matchId: 'match-123',
        joinedAt: Date.now() - 5000
      },
      {
        id: 'player-2',
        displayName: 'Player 2', 
        matchId: 'match-123',
        joinedAt: Date.now() - 2000
      }
    ];
    
    const mockGetParticipants = vi.fn().mockReturnValue(mockParticipants);
    
    const result = mockGetParticipants('match-123');
    
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(2);
    
    result.forEach((participant, index) => {
      expect(participant.id).toBe(`player-${index + 1}`);
      expect(participant.matchId).toBe('match-123');
      expect(typeof participant.joinedAt).toBe('number');
    });
  });
});

describe('Contract: Error Handling Events', () => {
  test('rtc:connection-failed event structure', () => {
    const mockFailurePayload = {
      peerId: 'player-123',
      reason: 'ICE connection timeout'
    };
    
    expect(typeof mockFailurePayload.peerId).toBe('string');
    expect(typeof mockFailurePayload.reason).toBe('string');
    expect(mockFailurePayload.peerId.length).toBeGreaterThan(0);
    expect(mockFailurePayload.reason.length).toBeGreaterThan(0);
  });
  
  test('server emits connection-failed events', async () => {
    const failureEvents: { peerId: string; reason: string }[] = [];
    
    client1.socket.on('rtc:connection-failed', (payload) => {
      failureEvents.push(payload);
    });
    
    // This test expects the enhanced server to emit failure events
    // The current server implementation doesn't emit these events yet
    // So this test should fail until server is enhanced
    
    // Simulate a scenario that should trigger connection failure
    client1.socket.emit('rtc:join');
    client1.socket.emit('rtc:signal', { data: { invalid: 'payload' } });
    
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Enhanced server should emit connection-failed events for invalid signals
    expect(failureEvents.length).toBeGreaterThan(0); // This will fail until server is enhanced
    
    if (failureEvents.length > 0) {
      expect(typeof failureEvents[0].peerId).toBe('string');
      expect(typeof failureEvents[0].reason).toBe('string');
    }
  });
  
  test('participants-list event structure', () => {
    const mockParticipantsListPayload = {
      matchId: 'match-123',
      participants: [
        {
          id: 'player-1',
          displayName: 'Player 1',
          matchId: 'match-123',
          joinedAt: Date.now()
        },
        {
          id: 'player-2',
          displayName: 'Player 2',
          matchId: 'match-123',
          joinedAt: Date.now()
        }
      ]
    };
    
    expect(typeof mockParticipantsListPayload.matchId).toBe('string');
    expect(Array.isArray(mockParticipantsListPayload.participants)).toBe(true);
    
    mockParticipantsListPayload.participants.forEach(participant => {
      expect(typeof participant.id).toBe('string');
      expect(typeof participant.displayName).toBe('string');
      expect(typeof participant.matchId).toBe('string');
      expect(typeof participant.joinedAt).toBe('number');
      expect(participant.matchId).toBe(mockParticipantsListPayload.matchId);
    });
  });
});