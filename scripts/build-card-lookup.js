#!/usr/bin/env node
/**
 * Build unified card lookup table for bot AI.
 * Merges: production winrates + LLM evaluations + card metadata.
 * Outputs: data/bots/card-lookup.json
 *
 * Usage:
 *   node scripts/build-card-lookup.js
 *   node scripts/build-card-lookup.js --url https://your-production-url.com
 */

const fs = require("fs");
const path = require("path");

const WINRATES_PATH = path.join(
  __dirname,
  "..",
  "data",
  "bots",
  "card-winrates.json"
);
const LLM_EVALS_PATH = path.join(
  __dirname,
  "..",
  "data",
  "cards",
  "card-evaluations.json"
);
const OUTPUT_PATH = path.join(
  __dirname,
  "..",
  "data",
  "bots",
  "card-lookup.json"
);

// Keyword detection patterns from rulesText
const KEYWORD_PATTERNS = [
  "airborne",
  "burrow",
  "deathrite",
  "defender",
  "disable",
  "dredge",
  "fateseal",
  "genesis",
  "guardian",
  "immobile",
  "initiative",
  "lethal",
  "lifesteal",
  "movement",
  "ranged",
  "reach",
  "stealth",
  "voidwalk",
  "ward",
];

/**
 * Extract keywords from rulesText
 */
function extractKeywords(rulesText) {
  if (!rulesText) return [];
  const text = rulesText.toLowerCase();
  return KEYWORD_PATTERNS.filter((kw) => text.includes(kw));
}

/**
 * Normalize card type to canonical form
 */
function normalizeType(type) {
  if (!type) return "unknown";
  const t = type.toLowerCase().trim();
  if (t.includes("site")) return "site";
  if (t.includes("avatar")) return "avatar";
  if (t.includes("minion") || t.includes("unit")) return "minion";
  if (t.includes("aura") || t.includes("enchantment")) return "aura";
  if (t.includes("artifact") || t.includes("relic") || t.includes("equipment"))
    return "artifact";
  if (t.includes("magic") || t.includes("sorcery") || t.includes("spell"))
    return "magic";
  return "unknown";
}

/**
 * Calculate power tier from winrate
 * Tier 1 (premium) to Tier 5 (weak)
 */
function calcPowerTier(winRate, plays) {
  // Require minimum sample size for meaningful tiers
  if (plays < 3) return 3; // Default to average

  if (winRate >= 0.6) return 1;
  if (winRate >= 0.53) return 2;
  if (winRate >= 0.47) return 3;
  if (winRate >= 0.4) return 4;
  return 5;
}

/**
 * Determine play priority based on card characteristics
 */
function determinePlayPriority(card) {
  const type = card.type || "unknown";
  const keywords = card.keywords || [];
  const cost = card.cost || 0;

  // Removal and board-affecting spells are reactive
  if (type === "magic") return "reactive";

  // Low-cost aggressive units are proactive
  if (type === "minion" && cost <= 2 && (card.attack || 0) >= 2)
    return "proactive";

  // High-cost bombs are finishers
  if (type === "minion" && cost >= 5 && (card.attack || 0) >= 4)
    return "finisher";

  // Auras are value plays
  if (type === "aura") return "value";

  // Artifacts are utility
  if (type === "artifact") return "utility";

  // Sites are development
  if (type === "site") return "development";

  // Evasive units are proactive
  if (keywords.includes("airborne") || keywords.includes("stealth"))
    return "proactive";

  // Defensive keywords
  if (keywords.includes("defender") || keywords.includes("reach"))
    return "defensive";

  return "proactive";
}

/**
 * Determine best game phase for playing this card
 */
function determineBestPhase(card) {
  const type = card.type || "unknown";
  const cost = card.cost || 0;

  if (type === "site") {
    if (cost === 0) return "establish_mana_base";
    return "expand_toward_opponent";
  }

  if (cost <= 1) return "establish_mana_base";
  if (cost <= 3) return "deploy_threats";
  if (cost <= 5) return "attack_phase";
  return "attack_phase";
}

function main() {
  console.log("[CardLookup] Building unified card lookup table...");

  // Load winrates (optional - may not exist yet)
  let winrates = {};
  if (fs.existsSync(WINRATES_PATH)) {
    const raw = JSON.parse(fs.readFileSync(WINRATES_PATH, "utf8"));
    winrates = raw.cards || {};
    console.log(
      `[CardLookup] Loaded ${Object.keys(winrates).length} winrate entries`
    );
  } else {
    console.warn(
      "[CardLookup] No winrate data found. Run export-card-winrates.js first."
    );
  }

  // Load LLM evaluations (optional)
  let llmEvals = {};
  if (fs.existsSync(LLM_EVALS_PATH)) {
    const raw = JSON.parse(fs.readFileSync(LLM_EVALS_PATH, "utf8"));
    llmEvals = raw.cards || {};
    console.log(
      `[CardLookup] Loaded ${Object.keys(llmEvals).length} LLM evaluations`
    );
  } else {
    console.warn("[CardLookup] No LLM evaluations found.");
  }

  // Merge all sources
  const allCardNames = new Set([
    ...Object.keys(winrates),
    ...Object.keys(llmEvals),
  ]);

  const lookup = {};
  const stats = { total: 0, withWinrate: 0, withLLM: 0, byType: {} };

  for (const name of allCardNames) {
    const wr = winrates[name] || {};
    const llm = llmEvals[name] || {};

    // Determine type from multiple sources
    const rawType = wr.type || llm.category || null;
    const type = normalizeType(rawType);

    // Extract keywords from LLM rulesText
    const keywords = extractKeywords(llm.rulesText);

    // Build card entry
    const card = {
      type,
      cardId: wr.cardId || null,
      cost: null, // Will be populated from card metadata if available
      attack: null,
      defence: null,
      thresholds: null,
      keywords,
      rulesText: llm.rulesText || null,

      // Winrate data
      winRate: wr.winRate || null,
      totalPlays: wr.totalPlays || 0,
      powerTier: calcPowerTier(wr.winRate || 0, wr.totalPlays || 0),

      // Strategic classification
      playPriority: null, // Set below after full card is built
      bestPhase: null, // Set below

      // LLM evaluation metadata
      synergies: llm.synergies || [],
      antiSynergies: llm.antiSynergies || [],
      situational: llm.situational || false,
      complexity: llm.complexity || "simple",
      hasEvalFunction: !!llm.evaluationFunction,

      // Source tracking
      sources: [],
    };

    if (wr.winRate !== undefined) card.sources.push("winrate");
    if (llm.evaluationFunction) card.sources.push("llm");

    // Set derived fields
    card.playPriority = determinePlayPriority(card);
    card.bestPhase = determineBestPhase(card);

    lookup[name] = card;

    // Stats
    stats.total++;
    if (wr.winRate !== undefined) stats.withWinrate++;
    if (llm.evaluationFunction) stats.withLLM++;
    stats.byType[type] = (stats.byType[type] || 0) + 1;
  }

  const output = {
    generated: new Date().toISOString(),
    version: "1.0.0",
    description:
      "Unified card lookup table for bot AI - merges winrates, LLM evals, and card metadata",
    stats,
    powerTierThresholds: {
      1: "winRate >= 0.60 (premium)",
      2: "winRate >= 0.53 (above average)",
      3: "winRate >= 0.47 (average) or insufficient data",
      4: "winRate >= 0.40 (below average)",
      5: "winRate < 0.40 (weak)",
    },
    cards: lookup,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`[CardLookup] Wrote ${stats.total} cards to ${OUTPUT_PATH}`);
  console.log(`[CardLookup] Stats:`, JSON.stringify(stats, null, 2));
}

main();
