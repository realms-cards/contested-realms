#!/usr/bin/env node
// Spawn multiple CPU bots into a new private lobby and start a match
// Usage: node scripts/spawn-bots.js --bots 3 [--server http://localhost:3010] [--name "Bot Scrimmage"] [--match constructed|sealed|draft]
// For sealed/draft, default configs are used; adjust in the payload below if needed.

const { io } = require('socket.io-client');

function parseArgs(argv) {
  const out = { server: 'http://localhost:3010', bots: 1, name: 'CPU Scrimmage', match: 'constructed' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--server' && argv[i + 1]) { out.server = String(argv[++i]); continue; }
    if (a === '--bots' && argv[i + 1]) { out.bots = Math.max(1, parseInt(argv[++i], 10) || 1); continue; }
    if (a === '--name' && argv[i + 1]) { out.name = String(argv[++i]); continue; }
    if (a === '--match' && argv[i + 1]) { out.match = String(argv[++i]); continue; }
  }
  return out;
}

(async () => {
  const opts = parseArgs(process.argv);
  const socket = io(opts.server, { transports: ['websocket'], autoConnect: true });
  const hostId = `host_${Math.random().toString(36).slice(2, 10)}`;

  let createdLobbyId = null;

  socket.on('connect', () => {
    console.log('[Host] Connected. Authenticating...');
    socket.emit('hello', { displayName: 'Bot Orchestrator', playerId: hostId });
  });

  socket.on('welcome', () => {
    console.log('[Host] Authenticated. Creating private lobby...');
    socket.emit('createLobby', { visibility: 'private', maxPlayers: Math.min(8, opts.bots + 1), name: opts.name });
  });

  socket.on('joinedLobby', (payload) => {
    const lobby = payload && payload.lobby;
    if (!lobby) return;
    createdLobbyId = lobby.id;
    console.log(`[Host] Lobby ${lobby.id} created. Spawning ${opts.bots} CPU bots...`);
    for (let i = 0; i < opts.bots; i++) {
      socket.emit('addCpuBot', { displayName: `CPU ${i + 1}` });
    }
    // Ready up host after a short delay to allow bots to join and ready themselves
    setTimeout(() => socket.emit('ready', { ready: true }), 500);

    // Start the match shortly after readiness
    setTimeout(() => {
      const matchType = ['constructed','sealed','draft'].includes(opts.match) ? opts.match : 'constructed';
      if (matchType === 'constructed') {
        console.log('[Host] Starting constructed match...');
        socket.emit('startMatch', { matchType: 'constructed' });
      } else if (matchType === 'sealed') {
        console.log('[Host] Starting sealed match...');
        socket.emit('startMatch', { matchType: 'sealed', sealedConfig: { packCounts: { Beta: 6, 'Arthurian Legends': 0 }, timeLimit: 40, replaceAvatars: false } });
      } else {
        console.log('[Host] Starting draft match...');
        socket.emit('startMatch', { matchType: 'draft', draftConfig: { setMix: ['Beta'], packCount: 3, packSize: 15, packCounts: { Beta: 3, 'Arthurian Legends': 0 } } });
      }
    }, 1500);
  });

  socket.on('error', (e) => {
    console.error('[Host] Server error:', e);
  });

  // Exit after some time
  setTimeout(() => {
    try { socket.disconnect(); } catch {}
    console.log('[Host] Done.');
    process.exit(0);
  }, 5000);
})();
