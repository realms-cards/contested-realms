/**
 * Integration Test: Server Signaling with Participant Tracking
 * 
 * This test validates the enhanced server-side WebRTC signaling
 * with proper participant tracking and isolation.
 * 
 * CRITICAL: This test MUST FAIL until server enhancements are implemented
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { createTestEnvironment } from '../setup-server';
import type { MockServer, MockClient } from '../setup-server';

describe('Integration: Enhanced Server WebRTC Signaling', () => {
  let testEnv: { server: MockServer; clients: MockClient[]; cleanup: () => Promise<void> };
  
  beforeEach(async () => {
    testEnv = await createTestEnvironment({
      enableWebRTC: true,
      clientCount: 3,
      matchId: 'signaling-test-match'
    });
  });
  
  afterEach(async () => {
    await testEnv.cleanup();
  });
  
  test('server tracks WebRTC participants correctly', async () => {
    const [client1, client2, client3] = testEnv.clients;
    
    // Initially no participants
    expect(testEnv.server.rtcParticipants.size).toBe(0);
    expect(testEnv.server.participantDetails.size).toBe(0);
    
    // Client1 joins WebRTC
    client1.socket.emit('rtc:join');
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Server should track participant
    const matchParticipants = testEnv.server.rtcParticipants.get('signaling-test-match');
    expect(matchParticipants).toBeDefined();
    expect(matchParticipants?.has('player-1')).toBe(true);
    expect(matchParticipants?.size).toBe(1);
    
    const participant1 = testEnv.server.participantDetails.get('player-1');
    expect(participant1).toBeDefined();
    expect(participant1?.id).toBe('player-1');
    expect(participant1?.displayName).toBe('Test Player 1');
    expect(participant1?.matchId).toBe('signaling-test-match');
    expect(typeof participant1?.joinedAt).toBe('number');
    
    // Client2 joins WebRTC
    client2.socket.emit('rtc:join');
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Should now have 2 participants
    expect(matchParticipants?.size).toBe(2);
    expect(matchParticipants?.has('player-2')).toBe(true);
    expect(testEnv.server.participantDetails.size).toBe(2);
    
    // Client3 does NOT join WebRTC (stays as regular match participant)
    // Server should only track WebRTC participants
    expect(matchParticipants?.has('player-3')).toBe(false);
    expect(testEnv.server.participantDetails.has('player-3')).toBe(false);
    
    // Client1 leaves WebRTC
    client1.socket.emit('rtc:leave');
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Should remove from tracking
    expect(matchParticipants?.has('player-1')).toBe(false);
    expect(matchParticipants?.size).toBe(1);
    expect(testEnv.server.participantDetails.has('player-1')).toBe(false);
    expect(testEnv.server.participantDetails.size).toBe(1);
    
    // Client2 should still be tracked
    expect(matchParticipants?.has('player-2')).toBe(true);
  });
  
  test('server sends signals only to WebRTC participants', async () => {
    const [client1, client2, client3] = testEnv.clients;
    
    // Track signals received by each client
    const signalsReceived: Record<string, Array<{ from: string; data: unknown }>> = {
      'player-1': [],
      'player-2': [],
      'player-3': []
    };
    
    client1.socket.on('rtc:signal', (payload) => {
      signalsReceived['player-1'].push(payload);
    });
    
    client2.socket.on('rtc:signal', (payload) => {
      signalsReceived['player-2'].push(payload);
    });
    
    client3.socket.on('rtc:signal', (payload) => {
      signalsReceived['player-3'].push(payload);
    });
    
    // Only client1 and client2 join WebRTC
    client1.socket.emit('rtc:join');
    client2.socket.emit('rtc:join');
    // client3 stays as regular match participant
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Client1 sends a signal
    const testSignal = {
      data: {
        sdp: {
          type: 'offer' as const,
          sdp: 'test-sdp-content'
        }
      }
    };
    
    client1.socket.emit('rtc:signal', testSignal);
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Only client2 should receive the signal (both are WebRTC participants)
    expect(signalsReceived['player-2']).toHaveLength(1);
    expect(signalsReceived['player-2'][0].from).toBe('player-1');
    expect(signalsReceived['player-2'][0].data).toEqual(testSignal.data);
    
    // Client1 should not receive its own signal
    expect(signalsReceived['player-1']).toHaveLength(0);
    
    // Client3 should not receive signals (not a WebRTC participant)
    expect(signalsReceived['player-3']).toHaveLength(0);
    
    // Client2 responds with answer
    const answerSignal = {
      data: {
        sdp: {
          type: 'answer' as const,
          sdp: 'test-answer-content'
        }
      }
    };
    
    client2.socket.emit('rtc:signal', answerSignal);
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Client1 should receive the answer
    expect(signalsReceived['player-1']).toHaveLength(1);
    expect(signalsReceived['player-1'][0].from).toBe('player-2');
    expect(signalsReceived['player-1'][0].data).toEqual(answerSignal.data);
    
    // Client3 still should not receive anything
    expect(signalsReceived['player-3']).toHaveLength(0);
  });
  
  test('server sends enhanced peer-joined events with participant list', async () => {
    const [client1, client2] = testEnv.clients;
    
    const peerJoinedEvents: Array<{
      client: string;
      from: { id: string; displayName: string };
      participants: Array<{ id: string; displayName: string; matchId: string; joinedAt: number }>;
    }> = [];
    
    client1.socket.on('rtc:peer-joined', (payload) => {
      peerJoinedEvents.push({ client: 'client1', ...payload });
    });
    
    client2.socket.on('rtc:peer-joined', (payload) => {
      peerJoinedEvents.push({ client: 'client2', ...payload });
    });
    
    // Client1 joins first
    const client1JoinTime = Date.now();
    client1.socket.emit('rtc:join');
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Client2 joins - should notify client1
    const client2JoinTime = Date.now();
    client2.socket.emit('rtc:join');
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Should have received 1 peer-joined event (client1 notified about client2 joining)
    expect(peerJoinedEvents).toHaveLength(1);
    
    // Client1 should be notified about client2 joining
    const client1Notification = peerJoinedEvents.find(e => e.client === 'client1');
    expect(client1Notification).toBeDefined();
    expect(client1Notification?.from.id).toBe('player-2');
    expect(client1Notification?.from.displayName).toBe('Test Player 2');
    expect(client1Notification?.participants).toHaveLength(2);
    
    // Verify participant list structure
    const participants = client1Notification?.participants || [];
    const player1 = participants.find(p => p.id === 'player-1');
    const player2 = participants.find(p => p.id === 'player-2');
    
    expect(player1).toBeDefined();
    expect(player1?.displayName).toBe('Test Player 1');
    expect(player1?.matchId).toBe('signaling-test-match');
    expect(player1?.joinedAt).toBeGreaterThanOrEqual(client1JoinTime);
    
    expect(player2).toBeDefined();
    expect(player2?.displayName).toBe('Test Player 2');
    expect(player2?.matchId).toBe('signaling-test-match');
    expect(player2?.joinedAt).toBeGreaterThanOrEqual(client2JoinTime);
  });
  
  test('server handles rapid join/leave cycles without state corruption', async () => {
    const [client1] = testEnv.clients;
    
    // Perform rapid join/leave cycles
    for (let i = 0; i < 10; i++) {
      client1.socket.emit('rtc:join');
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify participant is tracked
      expect(testEnv.server.rtcParticipants.get('signaling-test-match')?.has('player-1')).toBe(true);
      expect(testEnv.server.participantDetails.has('player-1')).toBe(true);
      
      client1.socket.emit('rtc:leave');
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify participant is removed
      expect(testEnv.server.rtcParticipants.get('signaling-test-match')?.has('player-1')).toBe(false);
      expect(testEnv.server.participantDetails.has('player-1')).toBe(false);
    }
    
    // Final join should work correctly
    client1.socket.emit('rtc:join');
    await new Promise(resolve => setTimeout(resolve, 100));
    
    expect(testEnv.server.rtcParticipants.get('signaling-test-match')?.has('player-1')).toBe(true);
    expect(testEnv.server.participantDetails.has('player-1')).toBe(true);
    
    // State should be clean and consistent
    expect(testEnv.server.rtcParticipants.get('signaling-test-match')?.size).toBe(1);
    expect(testEnv.server.participantDetails.size).toBe(1);
  });
  
  test('server isolates participants between different matches', async () => {
    // Create clients in different matches
    const match1Client = await createTestEnvironment({
      enableWebRTC: true,
      clientCount: 1,
      matchId: 'match-1'
    });
    
    const match2Client = await createTestEnvironment({
      enableWebRTC: true, 
      clientCount: 1,
      matchId: 'match-2'
    });
    
    try {
      const signalsReceived: Array<{ matchId: string; from: string }> = [];
      
      // Set up cross-match signal monitoring
      match1Client.clients[0].socket.on('rtc:signal', (payload: { from: string }) => {
        signalsReceived.push({ matchId: 'match-1', from: payload.from });
      });
      
      match2Client.clients[0].socket.on('rtc:signal', (payload: { from: string }) => {
        signalsReceived.push({ matchId: 'match-2', from: payload.from });
      });
      
      // Both clients join WebRTC in their respective matches
      match1Client.clients[0].socket.emit('rtc:join');
      match2Client.clients[0].socket.emit('rtc:join');
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify isolation in server state
      expect(match1Client.server.rtcParticipants.get('match-1')?.has('player-1')).toBe(true);
      expect(match1Client.server.rtcParticipants.get('match-2')).toBeUndefined();
      
      expect(match2Client.server.rtcParticipants.get('match-2')?.has('player-1')).toBe(true);
      expect(match2Client.server.rtcParticipants.get('match-1')).toBeUndefined();
      
      // Match-1 client sends signal
      match1Client.clients[0].socket.emit('rtc:signal', {
        data: { sdp: { type: 'offer', sdp: 'match-1-signal' } }
      });
      
      // Match-2 client sends signal  
      match2Client.clients[0].socket.emit('rtc:signal', {
        data: { sdp: { type: 'offer', sdp: 'match-2-signal' } }
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // No cross-match signal leakage should occur
      expect(signalsReceived).toHaveLength(0);
      
    } finally {
      await match1Client.cleanup();
      await match2Client.cleanup();
    }
  }, 10000);
  
  test('server cleans up participants on client disconnect', async () => {
    const [client1, client2] = testEnv.clients;
    
    const peerLeftEvents: Array<{ from: string; participants: unknown[] }> = [];
    
    client2.socket.on('rtc:peer-left', (payload) => {
      peerLeftEvents.push(payload);
    });
    
    // Both clients join WebRTC
    client1.socket.emit('rtc:join');
    client2.socket.emit('rtc:join');
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify both are tracked
    expect(testEnv.server.rtcParticipants.get('signaling-test-match')?.size).toBe(2);
    expect(testEnv.server.participantDetails.size).toBe(2);
    
    // Client1 disconnects abruptly (without rtc:leave)
    client1.socket.disconnect();
    
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Server should clean up client1's WebRTC state
    expect(testEnv.server.rtcParticipants.get('signaling-test-match')?.has('player-1')).toBe(false);
    expect(testEnv.server.participantDetails.has('player-1')).toBe(false);
    
    // Client2 should still be tracked
    expect(testEnv.server.rtcParticipants.get('signaling-test-match')?.has('player-2')).toBe(true);
    expect(testEnv.server.participantDetails.has('player-2')).toBe(true);
    
    // Server state should be consistent
    expect(testEnv.server.rtcParticipants.get('signaling-test-match')?.size).toBe(1);
    expect(testEnv.server.participantDetails.size).toBe(1);
  });
});