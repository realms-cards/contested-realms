#!/usr/bin/env node
// Add a CPU bot to a new private lobby as the host (helper script for Phase 1)
// Usage: node scripts/add-cpu-bot.js [--name "CPU Easy"] [--server http://localhost:3010]

const { io } = require('socket.io-client');

function parseArgs(argv) {
  const out = { name: 'CPU Easy', server: 'http://localhost:3010' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--name' && argv[i + 1]) { out.name = String(argv[++i]); continue; }
    if (a === '--server' && argv[i + 1]) { out.server = String(argv[++i]); continue; }
  }
  return out;
}

(async () => {
  const opts = parseArgs(process.argv);
  const socket = io(opts.server, { transports: ['websocket'], autoConnect: true });
  const hostId = `host_${Math.random().toString(36).slice(2, 10)}`;

  socket.on('connect', () => {
    console.log('[Host] Connected. Authenticating...');
    socket.emit('hello', { displayName: 'Bot Host', playerId: hostId });
  });

  socket.on('welcome', () => {
    console.log('[Host] Authenticated. Creating private lobby...');
    socket.emit('createLobby', { visibility: 'private', maxPlayers: 2, name: 'CPU Test' });
  });

  socket.on('joinedLobby', (payload) => {
    const lobby = payload && payload.lobby;
    if (!lobby) return;
    console.log(`[Host] Joined lobby ${lobby.id} as host. Spawning CPU bot...`);
    socket.emit('addCpuBot', { displayName: opts.name });
    // Optionally ready up host so match can start when desired
    setTimeout(() => socket.emit('ready', { ready: true }), 200);

    console.log('[Host] CPU bot requested. You can now start a match from the UI as host.');
    // Keep process alive for a short while to see logs
    setTimeout(() => {
      console.log('[Host] Done. Exiting.');
      socket.disconnect();
      process.exit(0);
    }, 2000);
  });

  socket.on('error', (e) => {
    console.error('[Host] Server error:', e);
  });
})();
