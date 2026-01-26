#!/usr/bin/env node
/**
 * Replay Analysis Script (T102)
 *
 * Extracts patterns from production match replays to inform bot training.
 * This enables the "self-correcting" mechanism by learning from human play.
 *
 * Usage:
 *   node scripts/training/analyze-replays.js [options]
 *
 * Options:
 *   --limit N          Number of replays to analyze (default: 100)
 *   --output FILE      Output file for patterns (default: data/bots/learned-patterns.json)
 *   --min-actions N    Minimum actions for a valid replay (default: 20)
 *   --verbose          Show detailed analysis logs
 *   --fetch-from-prod  Fetch replays from production database (uses PROD_DATABASE_URL env var)
 *   --cache FILE       Cache file for replays (default: data/bots/replay-cache.json)
 *   --use-cache        Use cached replays instead of fetching from database
 *   --export-only      Only fetch and cache replays, don't analyze
 *
 * Environment Variables:
 *   PROD_DATABASE_URL  Production database connection string (for --fetch-from-prod)
 *   DATABASE_URL       Local database connection string (default)
 *
 * Examples:
 *   # Fetch replays from production and cache them locally
 *   PROD_DATABASE_URL="postgresql://..." node scripts/training/analyze-replays.js --fetch-from-prod --export-only
 *
 *   # Analyze cached replays locally (no database needed)
 *   node scripts/training/analyze-replays.js --use-cache
 *
 *   # Full workflow: fetch from prod, cache, and analyze
 *   PROD_DATABASE_URL="postgresql://..." node scripts/training/analyze-replays.js --fetch-from-prod --limit 500
 */

const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

// Parse command line arguments
const args = process.argv.slice(2);
const getArg = (name, defaultVal) => {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return defaultVal;
  return args[idx + 1] || defaultVal;
};

const LIMIT = parseInt(getArg("limit", "100"), 10);
const OUTPUT_FILE = getArg(
  "output",
  path.join(__dirname, "../../data/bots/learned-patterns.json")
);
const CACHE_FILE = getArg(
  "cache",
  path.join(__dirname, "../../data/bots/replay-cache.json")
);
const MIN_ACTIONS = parseInt(getArg("min-actions", "20"), 10);
const VERBOSE = args.includes("--verbose");
const FETCH_FROM_PROD = args.includes("--fetch-from-prod");
const USE_CACHE = args.includes("--use-cache");
const EXPORT_ONLY = args.includes("--export-only");

// Create Prisma client with appropriate database URL
function createPrismaClient() {
  if (FETCH_FROM_PROD) {
    const prodUrl = process.env.PROD_DATABASE_URL;
    if (!prodUrl) {
      console.error("[Error] PROD_DATABASE_URL environment variable required for --fetch-from-prod");
      console.error("  Example: PROD_DATABASE_URL='postgresql://user:pass@host:5432/db' node scripts/training/analyze-replays.js --fetch-from-prod");
      process.exit(1);
    }
    console.log("[Replay Analysis] Connecting to PRODUCTION database...");
    return new PrismaClient({
      datasources: {
        db: { url: prodUrl }
      }
    });
  }

  console.log("[Replay Analysis] Connecting to local database...");
  return new PrismaClient();
}

// Only create prisma client if we're not using cache
let prisma = null;
if (!USE_CACHE) {
  prisma = createPrismaClient();
}

/**
 * Save replays to cache file
 */
function saveToCache(replays, cacheFile) {
  const cacheDir = path.dirname(cacheFile);
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  const cacheData = {
    meta: {
      cachedAt: new Date().toISOString(),
      replayCount: replays.length,
      source: FETCH_FROM_PROD ? "production" : "local",
    },
    replays,
  };

  fs.writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2));
  console.log(`[Replay Analysis] Cached ${replays.length} replays to: ${cacheFile}`);

  // Also save a summary of what's in the cache
  const summaryFile = cacheFile.replace(".json", "-summary.txt");
  const summary = replays.map(r =>
    `${r.matchId}: ${r.actions.length} actions, winner=${r.winnerId}, format=${r.format}`
  ).join("\n");
  fs.writeFileSync(summaryFile, `Cached ${replays.length} replays at ${new Date().toISOString()}\n\n${summary}`);
  console.log(`[Replay Analysis] Summary written to: ${summaryFile}`);
}

/**
 * Load replays from cache file
 */
function loadFromCache(cacheFile) {
  if (!fs.existsSync(cacheFile)) {
    console.error(`[Error] Cache file not found: ${cacheFile}`);
    console.error("  Run with --fetch-from-prod first to populate the cache");
    process.exit(1);
  }

  console.log(`[Replay Analysis] Loading replays from cache: ${cacheFile}`);
  const cacheData = JSON.parse(fs.readFileSync(cacheFile, "utf-8"));

  console.log(`[Replay Analysis] Cache info:`);
  console.log(`  - Cached at: ${cacheData.meta?.cachedAt || "unknown"}`);
  console.log(`  - Source: ${cacheData.meta?.source || "unknown"}`);
  console.log(`  - Replay count: ${cacheData.replays?.length || 0}`);

  return cacheData.replays || [];
}

/**
 * Simplify action patch to reduce memory usage
 * Only keep the essential information needed for pattern analysis
 */
function simplifyPatch(patch) {
  if (!patch || typeof patch !== "object") return null;

  const simplified = {};

  // Keep site plays
  if (patch.board?.sites) {
    simplified.board = { sites: {} };
    for (const [key, tile] of Object.entries(patch.board.sites)) {
      if (tile?.card) {
        simplified.board.sites[key] = {
          card: { name: tile.card.name, type: tile.card.type },
          owner: tile.owner,
        };
      }
    }
  }

  // Keep permanent plays (simplified)
  if (patch.permanents) {
    simplified.permanents = {};
    for (const [cell, arr] of Object.entries(patch.permanents)) {
      if (Array.isArray(arr)) {
        simplified.permanents[cell] = arr.map((p) => ({
          card: p.card ? { name: p.card.name, type: p.card.type, cost: p.card.cost } : null,
          tapped: p.tapped,
          owner: p.owner,
        }));
      }
    }
  }

  // Keep zone changes (hand size changes indicate draws)
  if (patch.zones) {
    simplified.zones = {};
    for (const [seat, z] of Object.entries(patch.zones)) {
      simplified.zones[seat] = {
        handSize: z.hand?.length,
        hasSpellbook: z.spellbook !== undefined,
        hasAtlas: z.atlas !== undefined,
      };
    }
  }

  // Keep turn changes
  if (patch.turn) {
    simplified.turn = { turnIndex: patch.turn.turnIndex };
  }

  return simplified;
}

/**
 * Load replays from database (production or local)
 * Processes in batches to avoid memory issues
 */
async function loadReplaysFromDatabase(limit) {
  console.log(`[Replay Analysis] Loading up to ${limit} replays from database...`);

  const BATCH_SIZE = 50; // Process 50 matches at a time

  // Get completed matches with actions
  const results = await prisma.matchResult.findMany({
    where: {
      winnerId: { not: null }, // Only completed games with a winner
    },
    orderBy: { completedAt: "desc" },
    take: limit,
    select: {
      matchId: true,
      winnerId: true,
      players: true,
      format: true,
      duration: true,
      completedAt: true,
    },
  });

  console.log(`[Replay Analysis] Found ${results.length} completed matches`);
  console.log(`[Replay Analysis] Processing in batches of ${BATCH_SIZE}...`);

  const replays = [];
  let skipped = 0;
  let processed = 0;

  // Process in batches
  for (let batchStart = 0; batchStart < results.length; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, results.length);
    const batch = results.slice(batchStart, batchEnd);

    console.log(`\n[Batch ${Math.floor(batchStart / BATCH_SIZE) + 1}] Processing matches ${batchStart + 1}-${batchEnd}...`);

    for (let i = 0; i < batch.length; i++) {
      const result = batch[i];
      processed++;

      if (i % 10 === 0) {
        process.stdout.write(`\r  Processing ${i + 1}/${batch.length} in batch...`);
      }

      // Load actions for this match
      const actions = await prisma.onlineMatchAction.findMany({
        where: { matchId: result.matchId },
        orderBy: { timestamp: "asc" },
      });

      if (actions.length < MIN_ACTIONS) {
        skipped++;
        continue;
      }

      // Get session for player IDs
      const session = await prisma.onlineMatchSession.findUnique({
        where: { id: result.matchId },
        select: { playerIds: true, seed: true },
      });

      if (!session?.playerIds?.length) {
        skipped++;
        continue;
      }

      // Simplify action patches to reduce memory
      const simplifiedActions = actions.map((a) => ({
        playerId: a.playerId,
        patch: simplifyPatch(a.patch),
        timestamp: Number(a.timestamp) || 0,
      }));

      replays.push({
        matchId: result.matchId,
        winnerId: result.winnerId,
        playerIds: session.playerIds,
        format: result.format,
        duration: result.duration,
        completedAt: result.completedAt,
        actionCount: actions.length,
        actions: simplifiedActions,
      });
    }

    console.log(`\r  Batch complete. Total replays so far: ${replays.length}`);

    // Force garbage collection hint between batches
    if (global.gc) {
      global.gc();
    }
  }

  console.log(`\n[Replay Analysis] Loaded ${replays.length} replays (skipped ${skipped} with insufficient data)`);
  return replays;
}

/**
 * Load replays - either from cache or database
 */
async function loadReplays(limit) {
  if (USE_CACHE) {
    return loadFromCache(CACHE_FILE);
  }
  return loadReplaysFromDatabase(limit);
}

/**
 * Categorize an action patch into a type
 * Works with both full patches and simplified patches
 */
function categorizeAction(patch) {
  if (!patch || typeof patch !== "object") return "unknown";

  // Site play
  if (patch.board?.sites) {
    const siteKeys = Object.keys(patch.board.sites);
    if (siteKeys.length > 0) {
      const tile = patch.board.sites[siteKeys[0]];
      if (tile?.card) return "play_site";
    }
  }

  // Unit/minion play
  if (patch.permanents) {
    const cells = Object.keys(patch.permanents);
    for (const cell of cells) {
      const arr = Array.isArray(patch.permanents[cell])
        ? patch.permanents[cell]
        : [];
      for (const p of arr) {
        if (p?.card && p.tapped === false) {
          return "play_unit";
        }
        if (p?.tapped === true && p?.card) {
          return "attack_or_move";
        }
      }
    }
  }

  // Draw - works with both full patches (z.hand) and simplified (z.handSize or z.hasSpellbook/hasAtlas)
  if (patch.zones) {
    const seats = Object.keys(patch.zones);
    for (const seat of seats) {
      const z = patch.zones[seat];
      // Full patch format
      if (z?.hand) return "draw";
      // Simplified format - check if draw indicators present
      if (z?.hasSpellbook || z?.hasAtlas) return "draw";
      if (z?.handSize !== undefined) return "draw";
    }
  }

  // Turn/phase changes
  if (patch.turn || patch.phase || patch.currentPlayer) {
    return "turn_change";
  }

  return "other";
}

/**
 * Determine which pile a draw came from (spellbook vs atlas)
 * Works with both full patches and simplified patches
 */
function getDrawSource(patch) {
  if (!patch?.zones) return "unknown";

  // Check if spellbook or atlas changed
  for (const seat of Object.keys(patch.zones)) {
    const z = patch.zones[seat];
    // Full patch format
    if (z?.spellbook !== undefined) return "spellbook";
    if (z?.atlas !== undefined) return "atlas";
    // Simplified format
    if (z?.hasSpellbook) return "spellbook";
    if (z?.hasAtlas) return "atlas";
  }

  return "unknown";
}

/**
 * Infer turn number from game state
 * Uses site count as a proxy for turn number in early game
 * (players typically play 1 site per turn in turns 1-4)
 *
 * Returns 0 for pre-game actions (before any meaningful plays)
 */
function inferTurnFromState(playerSiteCounts, playerId, actionType, totalBoardSites) {
  const mySites = playerSiteCounts[playerId] || 0;

  // Pre-game: if no sites on board yet, and this isn't a site play, it's turn 0 (setup)
  if (totalBoardSites === 0 && actionType !== "play_site") {
    return 0; // Pre-game setup (mulligan, initial draws)
  }

  // In early game, turn number roughly equals site count
  // Turn 1 = play first site, Turn 2 = play second site, etc.
  if (actionType === "play_site") {
    return mySites + 1; // This site play IS the turn
  }

  // For other actions after game started, turn = current site count
  return Math.max(1, mySites);
}

/**
 * Extract turn-by-turn patterns from a replay
 * Uses site count per player to infer turn numbers
 */
function extractTurnPatterns(replay) {
  const patterns = {
    turnActions: {}, // { turn1: { play_site: N, play_unit: N, ... }, ... }
    sitesByTurn: [], // [turn1Sites, turn2Sites, ...]
    drawSources: { spellbook: 0, atlas: 0 },
    attackTargets: { site: 0, unit: 0, avatar: 0 },
    totalActions: 0,
    gameLength: 0,
    firstSiteTurn: null, // When did they play their first site?
    sitesAtTurn4: 0,
  };

  // Track sites per player to infer turns
  const playerSiteCounts = {};
  const playerActions = {}; // Track action sequence per player

  // Track total sites on board
  let totalSites = 0;
  let maxTurnSeen = 0;

  for (const action of replay.actions) {
    const patch = action.patch;
    const playerId = action.playerId;
    const actionType = categorizeAction(patch);

    // Skip turn markers and unknown actions
    if (actionType === "turn_change" || actionType === "unknown" || actionType === "other") {
      continue;
    }

    patterns.totalActions++;

    // Initialize player tracking
    if (!playerSiteCounts[playerId]) playerSiteCounts[playerId] = 0;
    if (!playerActions[playerId]) playerActions[playerId] = [];

    // Infer turn number BEFORE incrementing site count
    // This ensures first site play = turn 1, second site play = turn 2, etc.
    const inferredTurn = inferTurnFromState(playerSiteCounts, playerId, actionType, totalSites);

    // Track site plays and count new sites AFTER turn inference
    if (actionType === "play_site") {
      // Count how many NEW sites are in this patch
      if (patch.board?.sites) {
        const patchSiteCount = Object.keys(patch.board.sites).length;
        if (patchSiteCount > totalSites) {
          const newSites = patchSiteCount - totalSites;
          playerSiteCounts[playerId] += newSites;
          totalSites = patchSiteCount;
        }
      }
    }

    // Skip pre-game actions (turn 0)
    if (inferredTurn === 0) {
      continue;
    }

    maxTurnSeen = Math.max(maxTurnSeen, inferredTurn);

    // Track actions by turn (only for early game turns 1-6)
    if (inferredTurn >= 1 && inferredTurn <= 6) {
      const turnKey = `turn${inferredTurn}`;
      if (!patterns.turnActions[turnKey]) {
        patterns.turnActions[turnKey] = {};
      }
      patterns.turnActions[turnKey][actionType] =
        (patterns.turnActions[turnKey][actionType] || 0) + 1;
    }

    // Track site progression
    if (actionType === "play_site" && inferredTurn <= 8) {
      patterns.sitesByTurn[inferredTurn] = playerSiteCounts[playerId];

      // Track first site turn
      if (patterns.firstSiteTurn === null) {
        patterns.firstSiteTurn = inferredTurn;
      }
    }

    // Track draw sources
    if (actionType === "draw") {
      const source = getDrawSource(patch);
      if (source !== "unknown") {
        patterns.drawSources[source]++;
      }
    }

    // Track attack/move
    if (actionType === "attack_or_move") {
      patterns.attackTargets.unit++;
    }

    // Track player action sequence
    playerActions[playerId].push({ turn: inferredTurn, type: actionType });
  }

  // Calculate sites at turn 4 (average across players)
  const sitesAtTurn4 = Object.values(playerSiteCounts).reduce((sum, count) => {
    return sum + Math.min(count, 4); // Cap at 4 for turn 4
  }, 0) / Math.max(1, Object.keys(playerSiteCounts).length);

  patterns.sitesAtTurn4 = Math.round(sitesAtTurn4 * 10) / 10;
  patterns.gameLength = maxTurnSeen;

  return patterns;
}

/**
 * Analyze replays and extract aggregate patterns
 */
function analyzeReplays(replays) {
  console.log(`[Replay Analysis] Analyzing ${replays.length} replays...`);

  const aggregate = {
    totalGames: replays.length,
    winnerPatterns: {
      turn1Actions: {},
      turn2Actions: {},
      turn3Actions: {},
      turn4Actions: {},
      avgSitesByTurn: [],
      drawSourceRatio: { spellbook: 0, atlas: 0 },
      avgGameLength: 0,
    },
    loserPatterns: {
      turn1Actions: {},
      turn2Actions: {},
      turn3Actions: {},
      turn4Actions: {},
      avgSitesByTurn: [],
      drawSourceRatio: { spellbook: 0, atlas: 0 },
      avgGameLength: 0,
    },
  };

  let winnerGames = 0;
  let loserGames = 0;

  for (const replay of replays) {
    // Separate actions by player
    const winnerActions = replay.actions.filter(
      (a) => a.playerId === replay.winnerId
    );
    const loserActions = replay.actions.filter(
      (a) => a.playerId !== replay.winnerId && a.playerId !== "system"
    );

    // Create mini-replays for each player
    const winnerReplay = { ...replay, actions: winnerActions };
    const loserReplay = { ...replay, actions: loserActions };

    // Extract patterns for winner
    if (winnerActions.length > 5) {
      const winnerPatterns = extractTurnPatterns(winnerReplay);
      mergePatterns(aggregate.winnerPatterns, winnerPatterns);
      winnerGames++;
    }

    // Extract patterns for loser
    if (loserActions.length > 5) {
      const loserPatterns = extractTurnPatterns(loserReplay);
      mergePatterns(aggregate.loserPatterns, loserPatterns);
      loserGames++;
    }
  }

  // Average out the aggregates
  if (winnerGames > 0) {
    normalizePatterns(aggregate.winnerPatterns, winnerGames);
  }
  if (loserGames > 0) {
    normalizePatterns(aggregate.loserPatterns, loserGames);
  }

  aggregate.winnerCount = winnerGames;
  aggregate.loserCount = loserGames;

  return aggregate;
}

/**
 * Merge individual patterns into aggregate
 */
function mergePatterns(aggregate, patterns) {
  // Merge turn actions - now stored as turnActions.turn1, turnActions.turn2, etc.
  for (const turnKey of ["turn1", "turn2", "turn3", "turn4", "turn5", "turn6"]) {
    const aggKey = `${turnKey}Actions`;
    // Initialize aggregate key if needed
    if (!aggregate[aggKey]) aggregate[aggKey] = {};
    // Also store in turnActions for consistency
    if (!aggregate.turnActions) aggregate.turnActions = {};
    if (!aggregate.turnActions[turnKey]) aggregate.turnActions[turnKey] = {};

    if (patterns.turnActions && patterns.turnActions[turnKey]) {
      for (const [action, count] of Object.entries(
        patterns.turnActions[turnKey]
      )) {
        aggregate[aggKey][action] = (aggregate[aggKey][action] || 0) + count;
        aggregate.turnActions[turnKey][action] = (aggregate.turnActions[turnKey][action] || 0) + count;
      }
    }
  }

  // Merge sites by turn
  for (let i = 0; i < patterns.sitesByTurn.length; i++) {
    if (patterns.sitesByTurn[i] !== undefined) {
      if (aggregate.avgSitesByTurn[i] === undefined) {
        aggregate.avgSitesByTurn[i] = { sum: 0, count: 0 };
      }
      aggregate.avgSitesByTurn[i].sum += patterns.sitesByTurn[i];
      aggregate.avgSitesByTurn[i].count++;
    }
  }

  // Merge draw sources
  aggregate.drawSourceRatio.spellbook += patterns.drawSources.spellbook;
  aggregate.drawSourceRatio.atlas += patterns.drawSources.atlas;

  // Merge game length
  aggregate.avgGameLength += patterns.gameLength;

  // Merge sitesAtTurn4
  if (patterns.sitesAtTurn4 !== undefined) {
    if (!aggregate._sitesAtTurn4Sum) aggregate._sitesAtTurn4Sum = 0;
    if (!aggregate._sitesAtTurn4Count) aggregate._sitesAtTurn4Count = 0;
    aggregate._sitesAtTurn4Sum += patterns.sitesAtTurn4;
    aggregate._sitesAtTurn4Count++;
  }
}

/**
 * Normalize aggregated patterns by count
 */
function normalizePatterns(patterns, count) {
  // Normalize turn actions to percentages
  for (const key of [
    "turn1Actions",
    "turn2Actions",
    "turn3Actions",
    "turn4Actions",
  ]) {
    const total = Object.values(patterns[key]).reduce((a, b) => a + b, 0);
    if (total > 0) {
      for (const action of Object.keys(patterns[key])) {
        patterns[key][action] = Math.round(
          (patterns[key][action] / total) * 100
        );
      }
    }
  }

  // Average sites by turn
  patterns.avgSitesByTurn = patterns.avgSitesByTurn.map((item) => {
    if (item && item.count > 0) {
      return Math.round((item.sum / item.count) * 10) / 10;
    }
    return null;
  });

  // Normalize draw ratio
  const totalDraws =
    patterns.drawSourceRatio.spellbook + patterns.drawSourceRatio.atlas;
  if (totalDraws > 0) {
    patterns.drawSourceRatio.spellbookPercent = Math.round(
      (patterns.drawSourceRatio.spellbook / totalDraws) * 100
    );
    patterns.drawSourceRatio.atlasPercent = Math.round(
      (patterns.drawSourceRatio.atlas / totalDraws) * 100
    );
  }

  // Average game length
  patterns.avgGameLength = Math.round((patterns.avgGameLength / count) * 10) / 10;

  // Average sitesAtTurn4
  if (patterns._sitesAtTurn4Count && patterns._sitesAtTurn4Count > 0) {
    patterns.sitesAtTurn4 = Math.round((patterns._sitesAtTurn4Sum / patterns._sitesAtTurn4Count) * 10) / 10;
    delete patterns._sitesAtTurn4Sum;
    delete patterns._sitesAtTurn4Count;
  }
}

/**
 * Generate recommendations from patterns
 */
function generateRecommendations(aggregate) {
  const recommendations = [];

  const winner = aggregate.winnerPatterns;
  const loser = aggregate.loserPatterns;

  // Calculate turn 1 action ratios
  const turn1Total = Object.values(winner.turn1Actions || {}).reduce((a, b) => a + b, 0);
  const turn1Sites = winner.turn1Actions?.play_site || 0;
  const turn1SitePercent = turn1Total > 0 ? Math.round((turn1Sites / turn1Total) * 100) : 0;

  // Turn 1 site play analysis
  if (turn1SitePercent >= 80) {
    recommendations.push({
      rule: "turn_1_site_mandatory",
      confidence: "high",
      reason: `Winners play site on turn 1 ${turn1SitePercent}% of the time (${turn1Sites}/${turn1Total} actions)`,
      action: "Make turn 1 site play deterministic",
    });
  } else if (turn1Sites > 0) {
    recommendations.push({
      rule: "turn_1_site_priority",
      confidence: "medium",
      reason: `Winners play site on turn 1 ${turn1SitePercent}% of the time`,
      action: "Strongly prioritize site play on turn 1",
    });
  }

  // Turn 2-3 action analysis
  for (const turnNum of [2, 3]) {
    const turnKey = `turn${turnNum}`;
    const turnActions = winner.turnActions?.[turnKey] || {};
    const total = Object.values(turnActions).reduce((a, b) => a + b, 0);
    const sites = turnActions.play_site || 0;
    const sitePercent = total > 0 ? Math.round((sites / total) * 100) : 0;

    if (sitePercent >= 60) {
      recommendations.push({
        rule: `turn_${turnNum}_site_priority`,
        confidence: sitePercent >= 80 ? "high" : "medium",
        reason: `Winners play site on turn ${turnNum} ${sitePercent}% of the time`,
        action: `Prioritize site play on turn ${turnNum}`,
      });
    }
  }

  // Compare winner vs loser site development
  const winnerSitesAtT4 = winner.sitesAtTurn4 || 0;
  const loserSitesAtT4 = loser.sitesAtTurn4 || 0;
  if (winnerSitesAtT4 > loserSitesAtT4 + 0.3) {
    recommendations.push({
      rule: "early_site_development",
      confidence: "high",
      reason: `Winners have ${winnerSitesAtT4} sites by turn 4 vs losers ${loserSitesAtT4}`,
      action: "Aggressive early site development correlates with winning",
    });
  }

  // Winner vs Loser turn 1 comparison (raw action counts)
  const winnerT1Units = winner.turnActions?.turn1?.play_unit || 0;
  const loserT1Units = loser.turnActions?.turn1?.play_unit || 0;
  const winnerT1Sites = winner.turnActions?.turn1?.play_site || 0;
  const loserT1Sites = loser.turnActions?.turn1?.play_site || 0;
  const winnerT1Draws = winner.turnActions?.turn1?.draw || 0;
  const loserT1Draws = loser.turnActions?.turn1?.draw || 0;

  // Key insight: Losers play more units on turn 1 (overextending)
  if (loserT1Units > winnerT1Units * 1.5) {
    recommendations.push({
      rule: "turn_1_avoid_overextend",
      confidence: "high",
      reason: `Losers play ${loserT1Units} units on turn 1 vs winners ${winnerT1Units} (${Math.round((loserT1Units / winnerT1Units) * 100)}% more). Overextending early correlates with losing.`,
      action: "Avoid playing too many cheap units on turn 1 - prioritize site + draw",
    });
  }

  // Both players play sites on turn 1 equally
  if (Math.abs(winnerT1Sites - loserT1Sites) < 5) {
    recommendations.push({
      rule: "turn_1_site_universal",
      confidence: "high",
      reason: `Both winners (${winnerT1Sites}) and losers (${loserT1Sites}) play exactly 1 site on turn 1. This is mandatory.`,
      action: "Turn 1 site under avatar is non-negotiable",
    });
  }

  // Action diversity analysis (percentage-based)
  const turn1Units = winner.turn1Actions?.play_unit || 0;
  if (turn1Units > turn1Sites * 0.3) {
    recommendations.push({
      rule: "turn_1_unit_viable",
      confidence: "low",
      reason: `Winners sometimes play units on turn 1 (${turn1Units}% of actions)`,
      action: "Consider 1-cost units as turn 1 alternative, but prefer drawing",
    });
  }

  // Turn 3+ comparison: Winners deploy more units by mid-game
  const winnerT3Units = winner.turnActions?.turn3?.play_unit || 0;
  const loserT3Units = loser.turnActions?.turn3?.play_unit || 0;
  if (loserT3Units > winnerT3Units * 1.2) {
    recommendations.push({
      rule: "turn_3_loser_rush",
      confidence: "medium",
      reason: `Losers deploy ${loserT3Units} units on turn 3 vs winners ${winnerT3Units}. Rushing units without board development may indicate overaggression.`,
      action: "Balance unit deployment with site development through turn 3",
    });
  }

  // Draw source preference
  const atlasPercent = winner.drawSourceRatio?.atlasPercent || 0;
  const spellbookPercent = winner.drawSourceRatio?.spellbookPercent || 0;
  if (atlasPercent > 60) {
    recommendations.push({
      rule: "prefer_atlas_draws",
      confidence: "medium",
      reason: `Winners draw from atlas ${atlasPercent}% vs spellbook ${spellbookPercent}%`,
      action: "Prioritize site draws over spell draws",
    });
  } else if (spellbookPercent > 70) {
    recommendations.push({
      rule: "prefer_spellbook_draws",
      confidence: "medium",
      reason: `Winners draw from spellbook ${spellbookPercent}% vs atlas ${atlasPercent}%`,
      action: "Winners prefer spell draws - may indicate established mana bases",
    });
  }

  // Game length analysis
  const winnerGameLen = winner.avgGameLength || 0;
  const loserGameLen = loser.avgGameLength || 0;
  if (winnerGameLen > 0) {
    recommendations.push({
      rule: "game_length_insight",
      confidence: "info",
      reason: `Average game reaches turn ${winnerGameLen} (based on site development)`,
      action: "Plan for mid-game around turn 5-6",
    });
  }

  return recommendations;
}

/**
 * Main analysis function
 */
async function main() {
  console.log("=".repeat(60));
  console.log("REPLAY ANALYSIS - Self-Correcting Bot Learning (T102)");
  console.log("=".repeat(60));

  // Show mode
  if (FETCH_FROM_PROD) {
    console.log("Mode: FETCH FROM PRODUCTION");
  } else if (USE_CACHE) {
    console.log("Mode: USE CACHED REPLAYS");
  } else {
    console.log("Mode: LOCAL DATABASE");
  }
  console.log("=".repeat(60));

  try {
    // Load replays
    const replays = await loadReplays(LIMIT);

    if (replays.length === 0) {
      console.log("[Replay Analysis] No replays found to analyze");
      return;
    }

    // Save to cache if fetching from database (not using cache)
    if (!USE_CACHE) {
      saveToCache(replays, CACHE_FILE);
    }

    // If export-only mode, stop here
    if (EXPORT_ONLY) {
      console.log("\n[Replay Analysis] Export complete. Run with --use-cache to analyze locally.");
      return;
    }

    // Analyze patterns
    const aggregate = analyzeReplays(replays);

    // Generate recommendations
    const recommendations = generateRecommendations(aggregate);

    // Build output
    const output = {
      meta: {
        analyzedAt: new Date().toISOString(),
        replayCount: replays.length,
        winnerGames: aggregate.winnerCount,
        loserGames: aggregate.loserCount,
        source: USE_CACHE ? "cache" : (FETCH_FROM_PROD ? "production" : "local"),
      },
      winnerPatterns: aggregate.winnerPatterns,
      loserPatterns: aggregate.loserPatterns,
      recommendations,
    };

    // Print summary
    console.log("\n" + "=".repeat(60));
    console.log("WINNER PATTERNS (what winners do):");
    console.log("=".repeat(60));
    console.log("Turn 1 actions:", aggregate.winnerPatterns.turn1Actions);
    console.log("Turn 2 actions:", aggregate.winnerPatterns.turn2Actions);
    console.log("Turn 3 actions:", aggregate.winnerPatterns.turn3Actions);
    console.log("Turn 4 actions:", aggregate.winnerPatterns.turn4Actions);
    console.log(
      "Avg sites by turn:",
      aggregate.winnerPatterns.avgSitesByTurn.slice(0, 8)
    );
    console.log("Draw source ratio:", aggregate.winnerPatterns.drawSourceRatio);
    console.log("Avg game length:", aggregate.winnerPatterns.avgGameLength);

    console.log("\n" + "=".repeat(60));
    console.log("RECOMMENDATIONS:");
    console.log("=".repeat(60));
    for (const rec of recommendations) {
      console.log(`- [${rec.confidence}] ${rec.rule}`);
      console.log(`  Reason: ${rec.reason}`);
      console.log(`  Action: ${rec.action}`);
    }

    // Ensure output directory exists
    const outputDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Write output
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    console.log(`\n[Replay Analysis] Patterns saved to: ${OUTPUT_FILE}`);
  } catch (error) {
    console.error("[Replay Analysis] Error:", error);
    process.exit(1);
  } finally {
    if (prisma) {
      await prisma.$disconnect();
    }
  }
}

main();
