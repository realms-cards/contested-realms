/**
 * Socket.IO API Route for Next.js
 * Initializes WebSocket server for real-time tournament updates
 */

import type { NextApiRequest } from 'next';
import type { NextApiResponseWithSocket } from '@/lib/socket-server';
import { ensureSocket } from '@/lib/socket-server';

export default function handler(req: NextApiRequest, res: NextApiResponseWithSocket) {
  if (req.method === 'GET') {
    // Initialize Socket.IO server if not already done
    const io = ensureSocket(res);
    
    // Return connection info
    res.status(200).json({
      success: true,
      message: 'Socket.IO server is running',
      path: '/api/socket',
      transports: ['websocket', 'polling'],
      connected: io.sockets.sockets.size
    });
  } else if (req.method === 'POST') {
    // Handle Socket.IO server management
    const { action } = req.body;
    
    switch (action) {
      case 'stats':
        const io = ensureSocket(res);
        res.status(200).json({
          totalConnections: io.sockets.sockets.size,
          rooms: Array.from(io.sockets.adapter.rooms.keys()),
          namespaces: Array.from(io._nsps.keys())
        });
        break;
        
      default:
        res.status(400).json({ error: 'Invalid action' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}

// Configure Next.js to handle the Socket.IO upgrade
export const config = {
  api: {
    // Disable body parser to allow raw upgrade handling for Socket.IO
    bodyParser: false,
  },
}
