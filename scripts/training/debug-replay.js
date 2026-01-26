#!/usr/bin/env node
/**
 * Debug script to analyze replay data structure
 */

const fs = require("fs");
const path = require("path");

const cacheFile = process.argv[2] || "data/bots/replay-cache.json";

console.log("Loading:", cacheFile);
const cache = JSON.parse(fs.readFileSync(cacheFile, "utf-8"));
const replays = cache.replays || [];

console.log("Total replays:", replays.length);
console.log("");

if (replays.length === 0) {
  console.log("No replays found");
  process.exit(0);
}

// Analyze first 5 replays
for (let r = 0; r < Math.min(5, replays.length); r++) {
  const replay = replays[r];
  console.log(`\n=== REPLAY ${r + 1}: ${replay.matchId} ===`);
  console.log("Winner:", replay.winnerId);
  console.log("Players:", replay.playerIds);
  console.log("Actions:", replay.actions?.length || 0);

  // Track actions by player
  const playerActions = {};
  const actionTypes = { site: 0, permanent: 0, zones: 0, turn: 0, empty: 0 };

  // Track turn progression
  let currentTurn = 0;
  const turnActions = {}; // { turn0: [actions], turn1: [actions], ... }

  for (const a of replay.actions || []) {
    const playerId = a.playerId;
    if (!playerActions[playerId]) playerActions[playerId] = [];

    const p = a.patch || {};
    let actionType = "empty";

    // Detect turn changes
    if (p.turn && p.turn.turnIndex !== undefined) {
      currentTurn = p.turn.turnIndex;
    }

    // Categorize action
    if (p.board && p.board.sites) {
      const siteKeys = Object.keys(p.board.sites);
      if (siteKeys.length > 0) {
        actionType = "site";
        actionTypes.site++;
      }
    } else if (p.permanents && Object.keys(p.permanents).length > 0) {
      actionType = "permanent";
      actionTypes.permanent++;
    } else if (p.zones && Object.keys(p.zones).length > 0) {
      actionType = "zones";
      actionTypes.zones++;
    } else if (p.turn) {
      actionType = "turn";
      actionTypes.turn++;
    } else {
      actionTypes.empty++;
    }

    // Track by turn
    const turnKey = `turn${currentTurn}`;
    if (!turnActions[turnKey]) turnActions[turnKey] = [];
    if (actionType !== "turn" && actionType !== "empty") {
      turnActions[turnKey].push({ player: playerId, type: actionType, patch: p });
    }

    playerActions[playerId].push(actionType);
  }

  console.log("Action breakdown:", actionTypes);

  // Show turn-by-turn summary
  console.log("\nTurn-by-turn summary:");
  const sortedTurns = Object.keys(turnActions).sort((a, b) => {
    const numA = parseInt(a.replace("turn", "")) || 0;
    const numB = parseInt(b.replace("turn", "")) || 0;
    return numA - numB;
  });

  for (const turn of sortedTurns.slice(0, 8)) {
    const actions = turnActions[turn];
    const summary = {};
    for (const a of actions) {
      const key = `${a.type}`;
      summary[key] = (summary[key] || 0) + 1;
    }
    console.log(`  ${turn}: ${JSON.stringify(summary)}`);
  }
}

// Aggregate stats across all replays
console.log("\n" + "=".repeat(60));
console.log("AGGREGATE ANALYSIS ACROSS ALL REPLAYS");
console.log("=".repeat(60));

const allTurnActions = {};
let totalGames = 0;
let gamesWithTurnTracking = 0;

for (const replay of replays) {
  totalGames++;
  let currentTurn = 0;
  let foundTurn = false;

  for (const a of replay.actions || []) {
    const p = a.patch || {};

    // Track turns
    if (p.turn && p.turn.turnIndex !== undefined) {
      currentTurn = p.turn.turnIndex;
      foundTurn = true;
    }

    // Categorize action
    let actionType = null;
    if (p.board && p.board.sites && Object.keys(p.board.sites).length > 0) {
      actionType = "site";
    } else if (p.permanents && Object.keys(p.permanents).length > 0) {
      actionType = "permanent";
    } else if (p.zones && Object.keys(p.zones).length > 0) {
      // Check if it's a draw
      for (const seat of Object.keys(p.zones)) {
        const z = p.zones[seat];
        if (z.hasSpellbook || z.hasAtlas || z.handSize !== undefined) {
          actionType = "draw";
          break;
        }
      }
    }

    if (actionType && currentTurn <= 5) {
      const turnKey = `turn${currentTurn}`;
      if (!allTurnActions[turnKey]) allTurnActions[turnKey] = {};
      allTurnActions[turnKey][actionType] = (allTurnActions[turnKey][actionType] || 0) + 1;
    }
  }

  if (foundTurn) gamesWithTurnTracking++;
}

console.log(`Total games: ${totalGames}`);
console.log(`Games with turn tracking: ${gamesWithTurnTracking}`);
console.log("");
console.log("Turn-by-turn action counts:");
for (let t = 0; t <= 5; t++) {
  const turnKey = `turn${t}`;
  const actions = allTurnActions[turnKey] || {};
  console.log(`  Turn ${t}: ${JSON.stringify(actions)}`);
}
