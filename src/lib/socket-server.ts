/**
 * Socket.IO Server Integration for Next.js
 * Handles WebSocket connections for real-time tournament updates
 */

import type { Server as HTTPServer } from 'http';
import type { NextApiResponse } from 'next';
import { Server as SocketIOServer } from 'socket.io';
import { tournamentSocketService } from '@/lib/services/tournament-socket-service';

export interface NextApiResponseWithSocket extends NextApiResponse {
  socket: NextApiResponse['socket'] & {
    server: HTTPServer & {
      io?: SocketIOServer;
    };
  };
}

let io: SocketIOServer | null = null;

/**
 * Initialize Socket.IO server
 */
export function initializeSocket(server: HTTPServer): SocketIOServer {
  if (io) {
    return io;
  }

  console.log('Initializing Socket.IO server...');

  io = new SocketIOServer(server, {
    path: '/api/socket',
    addTrailingSlash: false,
    cors: {
      origin: process.env.NODE_ENV === 'production' 
        ? process.env.NEXT_PUBLIC_APP_URL 
        : ['http://localhost:3000', 'http://localhost:3001'],
      methods: ['GET', 'POST'],
      credentials: true
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000
  });

  // Initialize tournament socket service
  tournamentSocketService.initialize(io);

  // Global connection handling
  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // Authenticate socket (optional middleware)
    socket.on('authenticate', async (data: { userId: string; token?: string }) => {
      try {
        // In a real app, you'd validate the token here
        // For now, just store the userId
        socket.data.userId = data.userId;
        socket.emit('authenticated', { success: true });
        console.log(`Socket ${socket.id} authenticated for user ${data.userId}`);
      } catch (error) {
        console.error('Socket authentication failed:', error);
        socket.emit('authenticated', { success: false, error: 'Authentication failed' });
        socket.disconnect();
      }
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      console.log(`Socket ${socket.id} disconnected: ${reason}`);
    });

    // Handle connection errors
    socket.on('error', (error) => {
      console.error(`Socket ${socket.id} error:`, error);
    });
  });

  // Global error handling
  io.engine.on('connection_error', (err) => {
    console.error('Socket.IO connection error:', err);
  });

  console.log('Socket.IO server initialized successfully');
  return io;
}

/**
 * Get existing Socket.IO server instance
 */
export function getSocket(): SocketIOServer | null {
  return io;
}

/**
 * Ensure Socket.IO server is initialized for API routes
 */
export function ensureSocket(res: NextApiResponseWithSocket): SocketIOServer {
  if (!res.socket.server.io) {
    console.log('Socket.IO not initialized, creating new instance...');
    const io = initializeSocket(res.socket.server);
    res.socket.server.io = io;
    return io;
  }
  return res.socket.server.io;
}

/**
 * Broadcast to all connected clients
 */
export function broadcastGlobal(event: string, data: Record<string, unknown>): void {
  if (io) {
    io.emit(event, data);
  }
}

/**
 * Broadcast to specific room
 */
export function broadcastToRoom(room: string, event: string, data: Record<string, unknown>): void {
  if (io) {
    io.to(room).emit(event, data);
  }
}

/**
 * Get connection statistics
 */
export function getConnectionStats(): {
  totalConnections: number;
  connectedUsers: number;
  tournamentRooms: Array<{ tournamentId: string; connectedCount: number }>;
} {
  if (!io) {
    return {
      totalConnections: 0,
      connectedUsers: 0,
      tournamentRooms: []
    };
  }

  const totalConnections = io.sockets.sockets.size;
  const connectedUsers = Array.from(io.sockets.sockets.values())
    .filter(socket => socket.data.userId)
    .length;
  
  const tournamentRooms = tournamentSocketService.getTournamentRoomStats();

  return {
    totalConnections,
    connectedUsers,
    tournamentRooms
  };
}

/**
 * Gracefully shutdown Socket.IO server
 */
export function shutdownSocket(): void {
  if (io) {
    console.log('Shutting down Socket.IO server...');
    io.close(() => {
      console.log('Socket.IO server shutdown complete');
    });
    io = null;
  }
}