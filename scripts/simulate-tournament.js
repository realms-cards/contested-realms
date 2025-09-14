#!/usr/bin/env node
// Simulate multiple concurrent matches with CPU bots (developer load tool)
// NOTE: This does not use the tournaments API yet; it drives the socket server to create lobbies and matches.
// Usage: node scripts/simulate-tournament.js --hosts 2 --rounds 3 [--server http://localhost:3010]
// Each "host" manages its own lobby and fights a CPU bot for the configured number of rounds.

const { io } = require('socket.io-client');

function parseArgs(argv) {
  const out = { server: 'http://localhost:3010', hosts: 2, rounds: 2 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--server' && argv[i + 1]) { out.server = String(argv[++i]); continue; }
    if (a === '--hosts' && argv[i + 1]) { out.hosts = Math.max(1, parseInt(argv[++i], 10) || 1); continue; }
    if (a === '--rounds' && argv[i + 1]) { out.rounds = Math.max(1, parseInt(argv[++i], 10) || 1); continue; }
  }
  return out;
}

function createHostSocket(server, idSuffix) {
  const socket = io(server, { transports: ['websocket'], autoConnect: true });
  const hostId = `host_${idSuffix}_${Math.random().toString(36).slice(2, 8)}`;
  const state = { lobbyId: null, currentRound: 0, matchesStarted: 0, matchesEnded: 0, wins: 0, losses: 0 };

  socket.on('connect', () => {
    socket.emit('hello', { displayName: `Orchestrator ${idSuffix}`, playerId: hostId });
  });

  function startRoundIfPossible(opts) {
    if (!state.lobbyId) return;
    if (state.currentRound >= opts.rounds) return;
    // Ready the host
    socket.emit('ready', { ready: true });
    // Start constructed match
    setTimeout(() => socket.emit('startMatch', { matchType: 'constructed' }), 400);
  }

  socket.on('welcome', () => {
    // Create private lobby for this host
    socket.emit('createLobby', { visibility: 'private', maxPlayers: 2, name: `Sim ${idSuffix}` });
  });

  socket.on('joinedLobby', (payload) => {
    const lobby = payload && payload.lobby;
    if (!lobby) return;
    state.lobbyId = lobby.id;
    // Add one CPU opponent
    socket.emit('addCpuBot', { displayName: `CPU Opp ${idSuffix}` });
  });

  socket.on('lobbyUpdated', () => {
    // Attempt to start when CPU is present and ready
    startRoundIfPossible(state.opts);
  });

  socket.on('matchStarted', (payload) => {
    const match = payload && payload.match;
    if (!match) return;
    if (match.status === 'in_progress') {
      state.matchesStarted++;
    }
    if (match.status === 'ended') {
      // One round finished: reopen a new lobby for next round
      state.matchesEnded++;
      if (match.winnerId) {
        if (match.winnerId === hostId) state.wins++; else state.losses++;
      }
      state.currentRound++;
      if (state.currentRound < state.opts.rounds) {
        // Create a new lobby for next round
        socket.emit('createLobby', { visibility: 'private', maxPlayers: 2, name: `Sim ${idSuffix} R${state.currentRound+1}` });
      }
    }
  });

  return { socket, state };
}

(async () => {
  const opts = parseArgs(process.argv);
  const hosts = [];
  for (let i = 0; i < opts.hosts; i++) {
    const h = createHostSocket(opts.server, i + 1);
    h.state.opts = opts;
    hosts.push(h);
  }

  // Let the simulation run for a while
  const runMs = Math.max(10000, opts.rounds * 15000);
  setTimeout(() => {
    for (const h of hosts) try { h.socket.disconnect(); } catch {}
    console.log(`[Sim] Completed simulation window of ${runMs}ms for ${opts.hosts} hosts x ${opts.rounds} rounds.`);
    // Summary report
    let totalStarted = 0, totalEnded = 0, totalWins = 0, totalLosses = 0;
    hosts.forEach((h, idx) => {
      const s = h.state;
      totalStarted += s.matchesStarted;
      totalEnded += s.matchesEnded;
      totalWins += s.wins;
      totalLosses += s.losses;
      console.log(`[Sim][Host ${idx+1}] rounds=${s.currentRound} started=${s.matchesStarted} ended=${s.matchesEnded} W-L=${s.wins}-${s.losses}`);
    });
    console.log(`[Sim][Summary] started=${totalStarted} ended=${totalEnded} W-L=${totalWins}-${totalLosses}`);
    process.exit(0);
  }, runMs);
})();
