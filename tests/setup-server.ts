/**
 * Test Environment Setup for Socket.IO Server
 * Provides mock server and transport utilities for WebRTC testing
 */

import { createServer, Server } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ClientIO, Socket as ClientSocket } from 'socket.io-client';
import type { SocketTransport } from '@/lib/net/socketTransport';

export interface MockServerConfig {
  port?: number;
  enableWebRTC?: boolean;
  autoConnect?: boolean;
}

export interface MockServer {
  httpServer: Server;
  io: SocketIOServer;
  port: number;
  url: string;
  cleanup: () => Promise<void>;
  
  // WebRTC participant tracking (mirrors server implementation)
  rtcParticipants: Map<string, Set<string>>; // matchId -> Set<playerId>
  participantDetails: Map<string, { id: string; displayName: string; matchId: string; joinedAt: number }>;
}

export interface MockClient {
  socket: ClientSocket;
  playerId: string;
  matchId: string;
  cleanup: () => Promise<void>;
  
  // Mock transport interface
  transport: MockSocketTransport;
}

/**
 * Mock Socket Transport for Testing
 * Implements the SocketTransport interface used by WebRTC hooks
 */
export class MockSocketTransport implements SocketTransport {
  constructor(private socket: ClientSocket) {}
  
  emit<T = unknown>(event: string, data?: T): void {
    this.socket.emit(event, data);
  }
  
  onGeneric<T = unknown>(event: string, handler: (data: T) => void): void {
    this.socket.on(event, handler);
  }
  
  offGeneric<T = unknown>(event: string, handler: (data: T) => void): void {
    this.socket.off(event, handler);
  }
  
  // Additional methods that may be needed
  disconnect(): void {
    this.socket.disconnect();
  }
  
  connected(): boolean {
    return this.socket.connected;
  }
}

/**
 * Creates a mock Socket.IO server for testing
 */
export async function createMockServer(config: MockServerConfig = {}): Promise<MockServer> {
  const port = config.port || 0; // Use 0 for random available port
  const httpServer = createServer();
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });
  
  // WebRTC state tracking
  const rtcParticipants = new Map<string, Set<string>>();
  const participantDetails = new Map<string, { id: string; displayName: string; matchId: string; joinedAt: number }>();
  const playersBySocket = new Map<string, string>(); // socketId -> playerId
  const players = new Map<string, { id: string; displayName: string; socketId: string; matchId?: string }>();
  
  return new Promise((resolve) => {
    httpServer.listen(port, () => {
      const actualPort = (httpServer.address() as { port: number })?.port || port;
      const url = `http://localhost:${actualPort}`;
      
      // Basic server handlers (simplified version of real server)
      io.on('connection', (socket) => {
        let authed = false;
        
        socket.on('hello', (payload) => {
          const displayName = payload?.displayName || 'Test Player';
          const playerId = payload?.playerId || `test-player-${Math.random().toString(36).slice(2, 8)}`;
          
          const player = {
            id: playerId,
            displayName,
            socketId: socket.id,
            matchId: payload?.matchId || null
          };
          
          players.set(playerId, player);
          playersBySocket.set(socket.id, playerId);
          authed = true;
          
          socket.emit('welcome', {
            you: { id: player.id, displayName: player.displayName }
          });
          
          // Auto-join match if provided
          if (player.matchId) {
            socket.join(`match:${player.matchId}`);
          }
        });
        
        // WebRTC signaling handlers
        if (config.enableWebRTC) {
          socket.on('rtc:join', () => {
            if (!authed) return;
            
            const playerId = playersBySocket.get(socket.id);
            const player = playerId ? players.get(playerId) : null;
            if (!player || !player.matchId) return;
            
            // Enhanced participant tracking
            if (!rtcParticipants.has(player.matchId)) {
              rtcParticipants.set(player.matchId, new Set());
            }
            rtcParticipants.get(player.matchId)!.add(player.id);
            
            participantDetails.set(player.id, {
              id: player.id,
              displayName: player.displayName,
              matchId: player.matchId,
              joinedAt: Date.now()
            });
            
            // Notify other WebRTC participants (not entire match room)
            const participants = rtcParticipants.get(player.matchId)!;
            for (const pid of participants) {
              if (pid !== player.id) {
                const p = players.get(pid);
                if (p?.socketId) {
                  io.to(p.socketId).emit('rtc:peer-joined', {
                    from: { id: player.id, displayName: player.displayName },
                    participants: Array.from(participants).map(id => participantDetails.get(id)).filter(Boolean)
                  });
                }
              }
            }
          });
          
          socket.on('rtc:signal', (payload) => {
            if (!authed) return;
            
            const playerId = playersBySocket.get(socket.id);
            const player = playerId ? players.get(playerId) : null;
            if (!player || !player.matchId) return;
            
            const participants = rtcParticipants.get(player.matchId);
            if (!participants) return;
            
            // Send only to WebRTC participants in this match
            for (const pid of participants) {
              if (pid !== player.id) {
                const p = players.get(pid);
                if (p?.socketId) {
                  io.to(p.socketId).emit('rtc:signal', {
                    from: player.id,
                    data: payload?.data
                  });
                }
              }
            }
          });
          
          socket.on('rtc:leave', () => {
            if (!authed) return;
            
            const playerId = playersBySocket.get(socket.id);
            const player = playerId ? players.get(playerId) : null;
            if (!player || !player.matchId) return;
            
            const participants = rtcParticipants.get(player.matchId);
            if (participants) {
              participants.delete(player.id);
              participantDetails.delete(player.id);
              
              // Notify remaining participants
              for (const pid of participants) {
                const p = players.get(pid);
                if (p?.socketId) {
                  io.to(p.socketId).emit('rtc:peer-left', {
                    from: player.id,
                    participants: Array.from(participants).map(id => participantDetails.get(id)).filter(Boolean)
                  });
                }
              }
            }
          });

          // WebRTC connection request/approval handlers
          socket.on('rtc:request', (payload) => {
            if (!authed) return;

            const playerId = playersBySocket.get(socket.id);
            const player = playerId ? players.get(playerId) : null;
            if (!player) return;

            const targetId = payload?.targetId;
            const matchId = payload?.matchId || payload?.lobbyId;
            if (!targetId || !matchId) return;

            const target = players.get(targetId);
            if (!target || target.matchId !== matchId) return;

            const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

            // Send request to target player
            if (target.socketId) {
              io.to(target.socketId).emit('rtc:request', {
                requestId,
                from: { id: player.id, displayName: player.displayName },
                lobbyId: matchId.startsWith('lobby_') ? matchId : null,
                matchId: matchId.startsWith('lobby_') ? null : matchId,
                timestamp: Date.now()
              });
            }

            // Acknowledge request to requester
            socket.emit('rtc:request:sent', {
              requestId,
                targetId,
                lobbyId: matchId.startsWith('lobby_') ? matchId : null,
                matchId: matchId.startsWith('lobby_') ? null : matchId,
                timestamp: Date.now()
              });
          });

          socket.on('rtc:request:respond', (payload) => {
            if (!authed) return;

            const playerId = playersBySocket.get(socket.id);
            const player = playerId ? players.get(playerId) : null;
            if (!player) return;

            const requestId = payload?.requestId;
            const requesterId = payload?.requesterId;
            const accepted = payload?.accepted === true;

            if (!requestId || !requesterId) return;

            const requester = players.get(requesterId);
            if (!requester) return;

            // Send response to requester
            if (requester.socketId) {
              const eventName = accepted ? 'rtc:request:accepted' : 'rtc:request:declined';
              io.to(requester.socketId).emit(eventName, {
                requestId,
                from: { id: player.id, displayName: player.displayName },
                lobbyId: player.matchId?.startsWith('lobby_') ? player.matchId : null,
                matchId: player.matchId && !player.matchId.startsWith('lobby_') ? player.matchId : null,
                timestamp: Date.now()
              });
            }

            // Send ack back to responder
            socket.emit('rtc:request:ack', {
              requestId,
              accepted,
              timestamp: Date.now()
            });
          });

          // WebRTC connection failure reporting
          socket.on('rtc:connection-failed', (payload) => {
            if (!authed) return;
            
            const playerId = playersBySocket.get(socket.id);
            const player = playerId ? players.get(playerId) : null;
            if (!player || !player.matchId) return;
            
            const reason = payload?.reason || 'unknown';
            const code = payload?.code || 'CONNECTION_ERROR';
            
            // Notify other WebRTC participants about the connection failure
            const participants = rtcParticipants.get(player.matchId);
            if (participants && participants.has(player.id)) {
              for (const pid of participants) {
                if (pid !== player.id) {
                  const p = players.get(pid);
                  if (p?.socketId) {
                    io.to(p.socketId).emit('rtc:peer-connection-failed', {
                      from: player.id,
                      reason: reason,
                      code: code,
                      timestamp: Date.now()
                    });
                  }
                }
              }
            }
            
            // Send acknowledgment back to the failing client
            socket.emit('rtc:connection-failed-ack', {
              playerId: player.id,
              matchId: player.matchId,
              timestamp: Date.now()
            });
          });
        }
        
        socket.on('disconnect', () => {
          const playerId = playersBySocket.get(socket.id);
          if (playerId) {
            playersBySocket.delete(socket.id);
            const player = players.get(playerId);
            if (player) {
              players.delete(playerId);
              
              // Clean up WebRTC state
              if (player.matchId && rtcParticipants.has(player.matchId)) {
                rtcParticipants.get(player.matchId)!.delete(playerId);
                participantDetails.delete(playerId);
              }
            }
          }
        });
      });
      
      const mockServer: MockServer = {
        httpServer,
        io,
        port: actualPort,
        url,
        rtcParticipants,
        participantDetails,
        cleanup: async () => {
          return new Promise((resolveCleanup) => {
            io.close(() => {
              httpServer.close(() => resolveCleanup());
            });
          });
        }
      };
      
      resolve(mockServer);
    });
  });
}

/**
 * Creates a mock client connected to the server
 */
export async function createMockClient(
  serverUrl: string,
  config: {
    playerId?: string;
    displayName?: string;
    matchId?: string;
    autoHello?: boolean;
  } = {}
): Promise<MockClient> {
  const socket = ClientIO(serverUrl, {
    forceNew: true,
    transports: ['websocket']
  });
  
  const playerId = config.playerId || `client-${Math.random().toString(36).slice(2, 8)}`;
  const displayName = config.displayName || `Test Player ${playerId}`;
  const matchId = config.matchId || `match-${Math.random().toString(36).slice(2, 8)}`;
  
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Mock client connection timeout'));
    }, 5000);
    
    socket.on('connect', () => {
      if (config.autoHello !== false) {
        socket.emit('hello', {
          playerId,
          displayName,
          matchId
        });
        
        socket.on('welcome', () => {
          clearTimeout(timeout);
          resolve({
            socket,
            playerId,
            matchId,
            transport: new MockSocketTransport(socket),
            cleanup: async () => {
              return new Promise((resolveCleanup) => {
                socket.disconnect();
                setTimeout(resolveCleanup, 100); // Small delay for cleanup
              });
            }
          });
        });
      } else {
        clearTimeout(timeout);
        resolve({
          socket,
          playerId,
          matchId,
          transport: new MockSocketTransport(socket),
          cleanup: async () => {
            return new Promise((resolveCleanup) => {
              socket.disconnect();
              setTimeout(resolveCleanup, 100);
            });
          }
        });
      }
    });
    
    socket.on('connect_error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

/**
 * Utility to create a complete test environment with server and multiple clients
 */
export async function createTestEnvironment(config: {
  enableWebRTC?: boolean;
  clientCount?: number;
  matchId?: string;
} = {}): Promise<{
  server: MockServer;
  clients: MockClient[];
  cleanup: () => Promise<void>;
}> {
  const server = await createMockServer({
    enableWebRTC: config.enableWebRTC ?? true
  });
  
  const clientCount = config.clientCount ?? 2;
  const matchId = config.matchId ?? `test-match-${Date.now()}`;
  
  const clients: MockClient[] = [];
  
  for (let i = 0; i < clientCount; i++) {
    const client = await createMockClient(server.url, {
      playerId: `player-${i + 1}`,
      displayName: `Test Player ${i + 1}`,
      matchId,
      autoHello: true
    });
    clients.push(client);
  }
  
  // Small delay to ensure all connections are established
  await new Promise(resolve => setTimeout(resolve, 100));
  
  return {
    server,
    clients,
    cleanup: async () => {
      await Promise.all(clients.map(client => client.cleanup()));
      await server.cleanup();
    }
  };
}

/**
 * Jest setup helper for WebRTC tests
 */
export function setupWebRTCTestEnvironment(): {
  beforeEach: () => Promise<void>;
  afterEach: () => Promise<void>;
  getEnvironment: () => { server: MockServer; clients: MockClient[] } | null;
} {
  let testEnv: { server: MockServer; clients: MockClient[] } | null = null;
  
  return {
    beforeEach: async () => {
      testEnv = await createTestEnvironment({ enableWebRTC: true });
    },
    
    afterEach: async () => {
      if (testEnv) {
        await testEnv.cleanup();
        testEnv = null;
      }
    },
    
    getEnvironment: () => testEnv
  };
}