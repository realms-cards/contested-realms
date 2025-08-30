  Deployment Options

  Vercel + Separate Server (Recommended)
  - Frontend: Deploy Next.js app to Vercel (automatic)
  - Backend: Deploy Socket.io server to Railway, Render, or DigitalOcean App Platform
  - Why: Vercel's serverless functions can't handle persistent Socket.io connections

  Alternative: Single Platform
  - Use Railway, Render, or DigitalOcean to deploy both frontend and backend together
  - More complex setup but unified infrastructure

  Performance Analysis

  Current Capacity (Conservative Estimates)
  - Concurrent Players: 50-100 players
  - Simultaneous Matches: 25-50 matches
  - Memory Usage: ~2MB per active match (in-memory state)

  Bottlenecks:
  1. In-memory storage - all data lost on restart
  2. Single server - no horizontal scaling
  3. No persistence - matches can't survive server crashes

  Scaling Requirements

  For Production, you need:

  1. Database Persistence
    // Replace in-memory Maps with PostgreSQL/Redis
    const players = new Map(); // → Database table
    const matches = new Map(); // → Database table + Redis cache
  2. Session Management
    // Add Redis adapter for Socket.io
    const { createAdapter } = require("@socket.io/redis-adapter");
    io.adapter(createAdapter(redisClient));
  3. Horizontal Scaling Architecture
    Load Balancer
    ├── Server Instance 1
    ├── Server Instance 2
    └── Server Instance N
        ↓
    Shared Redis (sessions + game state)
        ↓
    PostgreSQL (persistent data)

  Immediate Next Steps:
  1. Add PostgreSQL with Prisma for match persistence
  2. Implement Redis for real-time state caching
  3. Add health checks and graceful shutdown
  4. Implement match recovery on server restart