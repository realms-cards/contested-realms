#!/usr/bin/env node
// Self-play training runner: spins up two external BotClients that join a public lobby
// and play constructed matches, logging JSONL per-turn telemetry (from headless-bot-client).
// Usage:
//   node scripts/training/selfplay.js \
//     --server http://localhost:3010 \
//     --rounds 1 \
//     --thetaA data/bots/params/champion.json \
//     --thetaB data/bots/params/champion.json \
//     --name "Self-Play"

const fs = require('fs');
const path = require('path');
const { io } = require('socket.io-client');
const { PrismaClient } = require('@prisma/client');
const { BotClient } = require('../../bots/headless-bot-client');

function parseArgs(argv) {
  const out = {
    server: 'http://localhost:3010',
    rounds: 1,
    name: 'Self-Play',
    match: 'constructed',
    durationSec: 90,
    thetaA: null,
    thetaB: null,
    beam: null,
    depth: null,
    budget: null,
    epsilon: null,
    gamma: null,
    deckA: null,
    deckB: null,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--server' && argv[i + 1]) { out.server = String(argv[++i]); continue; }
    if (a === '--rounds' && argv[i + 1]) { out.rounds = Math.max(1, parseInt(argv[++i], 10) || 1); continue; }
    if (a === '--name' && argv[i + 1]) { out.name = String(argv[++i]); continue; }
    if (a === '--match' && argv[i + 1]) { out.match = String(argv[++i]); continue; }
    if (a === '--duration' && argv[i + 1]) { out.durationSec = Math.max(15, parseInt(argv[++i], 10) || 90); continue; }
    if ((a === '--minutes' || a === '--durationMin') && argv[i + 1]) { out.durationSec = Math.max(15, Math.floor(parseFloat(argv[++i]) * 60) || 90); continue; }
    if (a === '--thetaA' && argv[i + 1]) { out.thetaA = String(argv[++i]); continue; }
    if (a === '--thetaB' && argv[i + 1]) { out.thetaB = String(argv[++i]); continue; }
    if (a === '--beam' && argv[i + 1]) { out.beam = Number(argv[++i]); continue; }
    if (a === '--depth' && argv[i + 1]) { out.depth = Number(argv[++i]); continue; }
    if (a === '--budget' && argv[i + 1]) { out.budget = Number(argv[++i]); continue; }
    if (a === '--epsilon' && argv[i + 1]) { out.epsilon = Number(argv[++i]); continue; }
    if (a === '--gamma' && argv[i + 1]) { out.gamma = Number(argv[++i]); continue; }
    if (a === '--deckA' && argv[i + 1]) { out.deckA = String(argv[++i]); continue; }
    if (a === '--deckB' && argv[i + 1]) { out.deckB = String(argv[++i]); continue; }
  }
  return out;
}

function applyOverridesToTheta(base, opts) {
  const t = base && typeof base === 'object' ? JSON.parse(JSON.stringify(base)) : {};
  if (!t.search || typeof t.search !== 'object') t.search = {};
  if (!t.exploration || typeof t.exploration !== 'object') t.exploration = {};
  if (Number.isFinite(opts.beam)) t.search.beamWidth = Number(opts.beam);
  if (Number.isFinite(opts.depth)) t.search.maxDepth = Number(opts.depth);
  if (Number.isFinite(opts.budget)) t.search.budgetMs = Number(opts.budget);
  if (Number.isFinite(opts.gamma)) t.search.gamma = Number(opts.gamma);
  if (Number.isFinite(opts.epsilon)) t.exploration.epsilon_root = Number(opts.epsilon);
  return t;
}

function loadThetaMaybe(p) {
  try {
    if (p && fs.existsSync(p)) {
      const raw = fs.readFileSync(p, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {
    try { console.warn('[SelfPlay] Failed to load theta:', p, e?.message || e); } catch {}
  }
  return null;
}

(async () => {
  const opts = parseArgs(process.argv);
  const hostId = `host_${Math.random().toString(36).slice(2, 10)}`;
  const socket = io(opts.server, { transports: ['websocket'], autoConnect: true });

  console.log(`[SelfPlay] Config -> server=${opts.server}, rounds=${opts.rounds}, match=${opts.match}, durationSec=${opts.durationSec}`);

  let lobbyId = null;
  let round = 0;
  let botA = null;
  let botB = null;
  let observedMatchId = null;
  let globalTimer = null;
  let matchTimer = null;
  let joinPollTimer = null;
  let thetaMetaA = null;
  let thetaMetaB = null;
  let prisma = null;

  function cleanupAndExit(code = 0) {
    try { if (joinPollTimer) clearInterval(joinPollTimer); } catch {}
    try { if (globalTimer) clearTimeout(globalTimer); } catch {}
    try { if (matchTimer) clearTimeout(matchTimer); } catch {}
    try { botA && botA.stop && botA.stop(); } catch {}
    try { botB && botB.stop && botB.stop(); } catch {}
    try { prisma && prisma.$disconnect && prisma.$disconnect().catch(()=>{}); } catch {}
    try { socket && socket.disconnect && socket.disconnect(); } catch {}
    console.log('[SelfPlay] Exit.');
    process.exit(code);
  }

  function startGlobalWatchdog(ms) {
    if (globalTimer) clearTimeout(globalTimer);
    globalTimer = setTimeout(() => {
      console.warn('[SelfPlay] Global watchdog elapsed; exiting.');
      cleanupAndExit(0);
    }, ms);
  }

  process.on('SIGINT', () => { console.log('[SelfPlay] SIGINT'); cleanupAndExit(0); });
  process.on('SIGTERM', () => { console.log('[SelfPlay] SIGTERM'); cleanupAndExit(0); });

  socket.on('connect', () => {
    console.log('[SelfPlay] Connected. Authenticating...');
    socket.emit('hello', { displayName: 'Self-Play Host', playerId: hostId });
  });

  socket.on('connect_error', (err) => {
    console.error('[SelfPlay] connect_error:', err?.message || err);
  });

  socket.on('disconnect', (reason) => {
    console.log('[SelfPlay] disconnected:', reason);
  });

  socket.on('welcome', async () => {
    console.log('[SelfPlay] Authenticated. Creating public lobby...');
    socket.emit('createLobby', { visibility: 'public', maxPlayers: 3, name: opts.name });
    // Start a global watchdog that will force-exit even if match never starts
    startGlobalWatchdog(Math.max(60_000, opts.durationSec * 1000 + 60_000));
  });

  socket.on('joinedLobby', (payload) => {
    const lobby = payload && payload.lobby;
    if (!lobby) return;
    lobbyId = lobby.id;
    console.log(`[SelfPlay] Lobby ${lobby.id} created.`);

    // Spawn two external bots pointing at this lobby
    // If no explicit deck files passed, try to load public precons from DB and pick at random
    async function pickRandomPrecons() {
      try {
        if (!prisma) prisma = new PrismaClient();
        const decks = await prisma.deck.findMany({
          where: { isPublic: true, format: 'Constructed', name: { startsWith: 'Beta Precon' } },
          include: { cards: { include: { card: true } } },
        });
        const confs = decks.map(normalizeDeckForBotConfig).filter(Boolean);
        return confs;
      } catch (e) {
        console.warn('[SelfPlay] Failed to load public precons from DB:', e?.message || e);
        return [];
      }
    }
    function normalizeDeckForBotConfig(deck) {
      try {
        const spellAgg = new Map();
        const atlasAgg = new Map();
        for (const dc of deck.cards || []) {
          const name = dc.card?.name || '';
          const count = Number(dc.count || 1);
          if (!name || count <= 0) continue;
          const map = dc.zone === 'Atlas' ? atlasAgg : dc.zone === 'Sideboard' ? null : spellAgg;
          if (!map) continue;
          map.set(name, (map.get(name) || 0) + count);
        }
        const toArr = (m) => Array.from(m.entries()).map(([name, count]) => ({ name, count }));
        const cfg = { spellbook: toArr(spellAgg), atlas: toArr(atlasAgg) };
        return (cfg.spellbook.length && cfg.atlas.length) ? cfg : null;
      } catch { return null; }
    }
    const thetaRawA = loadThetaMaybe(opts.thetaA);
    const thetaRawB = loadThetaMaybe(opts.thetaB);
    const thetaA = applyOverridesToTheta(thetaRawA, opts);
    const thetaB = applyOverridesToTheta(thetaRawB, opts);
    thetaMetaA = (thetaA && thetaA.meta && thetaA.meta.id) || null;
    thetaMetaB = (thetaB && thetaB.meta && thetaB.meta.id) || null;

    // Randomly choose decks from public precons if not explicitly provided
    let deckConfA = null;
    let deckConfB = null;
    (async () => {
      if (!opts.deckA || !opts.deckB) {
        const confs = await pickRandomPrecons();
        if (!confs.length) {
          console.error('[SelfPlay] No public precon decks found in DB and no explicit --deckA/--deckB provided. Aborting to enforce precon-only bots.');
          cleanupAndExit(1);
          return;
        }
        const pick = () => confs[Math.floor(Math.random() * confs.length)];
        deckConfA = opts.deckA ? null : pick();
        deckConfB = opts.deckB ? null : pick();
        // Try to avoid identical picks if possible
        if (deckConfA && deckConfB && confs.length > 1) {
          let guard = 4;
          while (guard-- > 0 && JSON.stringify(deckConfA) === JSON.stringify(deckConfB)) deckConfB = pick();
        }
      }

      botA = new BotClient({
      serverUrl: opts.server,
      displayName: 'CPU A',
      playerId: `cpu_A_${Math.random().toString(36).slice(2, 8)}`,
      lobbyId,
      engineMode: 'train',
      aiEnabled: true,
      theta: thetaA || undefined,
      constructedDeckFile: opts.deckA || undefined,
      constructedDeck: deckConfA || undefined,
    });
    botB = new BotClient({
      serverUrl: opts.server,
      displayName: 'CPU B',
      playerId: `cpu_B_${Math.random().toString(36).slice(2, 8)}`,
      lobbyId,
      engineMode: 'train',
      aiEnabled: true,
      theta: thetaB || undefined,
      constructedDeckFile: opts.deckB || undefined,
      constructedDeck: deckConfB || undefined,
    });

    botA.start().catch((e) => console.error('[SelfPlay] Bot A failed:', e));
    setTimeout(() => botB.start().catch((e) => console.error('[SelfPlay] Bot B failed:', e)), 200);

    // Ready up host and start the match after bots join
    setTimeout(() => {
      try { socket.emit('ready', { ready: true }); } catch {}
    }, 400);
    setTimeout(() => {
      const matchType = ['constructed','sealed','draft'].includes(opts.match) ? opts.match : 'constructed';
      const explicitMatchId = `match_${Math.random().toString(36).slice(2, 12)}`;
      const pids = [botA?.playerId, botB?.playerId].filter(Boolean);
      console.log('[SelfPlay] Starting tournament match...', { matchType, matchId: explicitMatchId, players: pids });
      socket.emit('startTournamentMatch', { matchId: explicitMatchId, playerIds: pids, matchType });
      observedMatchId = explicitMatchId;
      // Ensure both bots join the match room immediately (they might not have been connected when startTournamentMatch ran)
      setTimeout(() => {
        try { botA?.joinMatchById?.(explicitMatchId); } catch {}
        try { botB?.joinMatchById?.(explicitMatchId); } catch {}
      }, 150);
      // Do not join as host; joining adds us to the roster and blocks mulligan completion
      round++;

      // End process after duration to let bots finish and logs flush (also see matchEnded handler)
      const ms = Math.max(15_000, opts.durationSec * 1000);
      console.log(`[SelfPlay] Time budget -> ~${Math.round(ms / 1000)}s`);
      matchTimer = setTimeout(() => {
        console.warn('[SelfPlay] Time budget elapsed; exiting.');
        cleanupAndExit(0);
      }, ms);
    }, 1200);
    })();
  });

  socket.on('error', (e) => {
    console.error('[SelfPlay] Server error:', e);
  });

  // Early exit when we observe the match ending
  socket.on('matchEnded', (data) => {
    const mid = data && data.matchId;
    if (observedMatchId && mid === observedMatchId) {
      console.log('[SelfPlay] matchEnded:', JSON.stringify(data));
      try {
        // Persist head-to-head result for Elo/Glicko aggregation
        const dir = path.join(process.cwd(), 'logs', 'training', 'headtohead');
        fs.mkdirSync(dir, { recursive: true });
        const out = {
          t: Date.now(),
          matchId: mid,
          winnerId: data?.winnerId ?? null,
          isDraw: !!data?.isDraw,
          players: [botA?.playerId, botB?.playerId],
          thetaA: thetaMetaA,
          thetaB: thetaMetaB,
          winnerThetaId: (() => {
            try {
              const w = data?.winnerId;
              if (!w) return null;
              if (w === botA?.playerId) return thetaMetaA || null;
              if (w === botB?.playerId) return thetaMetaB || null;
              return null;
            } catch { return null; }
          })(),
        };
        fs.appendFileSync(path.join(dir, 'results.jsonl'), JSON.stringify(out) + '\n');
      } catch {}
      setTimeout(() => cleanupAndExit(0), 1000);
    }
  });
})();
