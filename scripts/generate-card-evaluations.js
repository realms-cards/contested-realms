#!/usr/bin/env node
/**
 * Generate Card Evaluation Functions from Database
 *
 * This script reads actual card data from the Prisma database
 * and generates context-aware evaluation functions for the bot AI.
 *
 * Usage: node scripts/generate-card-evaluations.js [--limit N]
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

/**
 * Analyze card and generate evaluation function
 * This is a placeholder - in production, this would call an LLM
 * or use more sophisticated heuristics
 */
function generateEvaluationFunction(card, meta) {
  const cost = meta.cost || 0;
  const type = (meta.type || '').toLowerCase();
  const rules = (meta.rulesText || '').toLowerCase();
  const attack = meta.attack || 0;
  const defence = meta.defence || 0;

  // Categorize card
  let category = 'unknown';
  if (type.includes('minion')) {
    category = 'minion';
  } else if (type.includes('magic')) {
    category = 'spell';
  } else if (type.includes('artifact')) {
    category = 'artifact';
  } else if (type.includes('aura')) {
    category = 'aura';
  } else if (type.includes('avatar')) {
    category = 'avatar';
  } else if (type.includes('site')) {
    category = 'site';
  }

  // Generate evaluation function based on category and rules
  let evalFunction = '';
  let priority = '';
  let synergies = [];
  let antiSynergies = [];
  let situational = false;

  if (category === 'minion') {
    // Vanilla minion: play on curve
    const statTotal = attack + defence;
    const statRating = statTotal / Math.max(1, cost);

    if (rules.includes('charge')) {
      evalFunction = `return context.manaLeftover >= 0 ? ${6 + statRating * 0.5} : 0.0;`;
      priority = 'high - charge allows immediate attack';
      synergies.push('aggressive_board');
    } else if (rules.includes('lethal')) {
      evalFunction = `return context.manaLeftover >= 0 ? ${6.5 + statRating * 0.5} : 0.0;`;
      priority = 'high - lethal trades up';
      synergies.push('combat_phase', 'defensive_position');
    } else if (rules.includes('burrowing')) {
      evalFunction = `return context.manaLeftover >= 0 ? ${6 + statRating * 0.5} : 0.0;`;
      priority = 'good - burrowing evades blockers';
      synergies.push('aggressive_board');
    } else {
      evalFunction = `return context.manaLeftover >= 0 ? ${5 + statRating * 0.5} : 0.0;`;
      priority = 'moderate - vanilla minion, play on curve';
    }

  } else if (category === 'spell') {
    situational = true;

    if (rules.includes('gain') && rules.includes('life')) {
      // Life gain spell
      const match = rules.match(/gain (\d+) life/);
      const lifeGain = match ? parseInt(match[1]) : 5;
      evalFunction = `return context.myLife < 10 ? 8.0 : (context.myLife < 15 ? ${4.0 + lifeGain * 0.2} : 1.0);`;
      priority = 'high when low life, low when healthy';
      synergies.push('low_life', 'defensive_position');
      antiSynergies.push('high_life');

    } else if (rules.includes('give') && rules.includes('power')) {
      // Combat trick
      evalFunction = `return context.myAttackingUnits.length > 0 ? 7.0 : 1.0;`;
      priority = 'high when attacking, low otherwise';
      synergies.push('attacking_units', 'combat_phase');
      antiSynergies.push('no_units', 'defensive_position');

    } else if (rules.includes('draw')) {
      // Card draw
      const match = rules.match(/draw (\\w+)/);
      const drawCount = match && match[1] === 'three' ? 3 : 1;
      evalFunction = `return context.myHandSize < context.oppHandSize ? ${6 + drawCount * 0.5} : ${4 + drawCount * 0.5};`;
      priority = 'good - card advantage';
      synergies.push('card_advantage', 'late_game');

    } else {
      // Generic spell
      evalFunction = `return context.manaLeftover >= 0 ? 5.0 : 0.0;`;
      priority = 'moderate - spell with situational effect';
    }

  } else if (category === 'aura') {
    situational = true;

    if (rules.includes('affected sites') || rules.includes('occupying affected sites')) {
      // Site-affecting aura
      evalFunction = `return context.oppUnitCount > context.myUnitCount ? 6.0 : 4.0;`;
      priority = 'situational - affects board state over time';
      synergies.push('board_control', 'defensive_position');
    } else {
      evalFunction = `return context.manaLeftover >= 0 ? 5.0 : 0.0;`;
      priority = 'moderate - aura with persistent effect';
    }

  } else if (category === 'artifact') {
    evalFunction = `return context.manaLeftover >= 0 ? 5.5 : 0.0;`;
    priority = 'moderate - artifact with utility effect';

  } else {
    // Unknown/other types
    evalFunction = `return context.manaLeftover >= 0 ? 5.0 : 0.0;`;
    priority = 'moderate - play on curve if affordable';
  }

  return {
    category,
    rulesText: meta.rulesText || '',
    evaluationFunction: evalFunction,
    priority,
    synergies,
    antiSynergies,
    situational,
    complexity: rules.length > 50 ? 'complex' : rules.length > 20 ? 'moderate' : 'simple'
  };
}

/**
 * Main generation function
 */
async function generateEvaluations(options = {}) {
  const limit = options.limit || 50;

  console.log(`[Generator] Fetching ${limit} cards from database...`);

  // Query cards with metadata
  const cards = await prisma.card.findMany({
    include: {
      meta: true
    },
    take: limit
  });

  console.log(`[Generator] Found ${cards.length} cards`);

  const evaluations = {};
  let generated = 0;
  let skipped = 0;

  for (const card of cards) {
    // Skip cards without metadata
    if (!card.meta || card.meta.length === 0) {
      skipped++;
      continue;
    }

    // Use first metadata (usually from first set)
    const meta = card.meta[0];

    // Skip sites and avatars (not played from hand)
    const type = (meta.type || '').toLowerCase();
    if (type.includes('site') || type.includes('avatar')) {
      skipped++;
      continue;
    }

    try {
      const evaluation = generateEvaluationFunction(card, meta);
      evaluations[card.name] = evaluation;
      generated++;
    } catch (e) {
      console.warn(`[Generator] Failed to generate evaluation for ${card.name}:`, e.message);
      skipped++;
    }
  }

  console.log(`[Generator] Generated ${generated} evaluations, skipped ${skipped}`);

  // Build output JSON
  const output = {
    version: '2.1.0',
    generated: new Date().toISOString(),
    description: 'Database-driven card evaluation functions for bot AI',
    generator: 'scripts/generate-card-evaluations.js',
    cards: evaluations
  };

  // Write to file
  const outputPath = path.join(process.cwd(), 'data', 'cards', 'card-evaluations.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log(`[Generator] Wrote ${generated} evaluations to ${outputPath}`);

  return { generated, skipped };
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const limitArg = args.find(a => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 50;

  generateEvaluations({ limit })
    .then(result => {
      console.log(`[Generator] Complete: ${result.generated} generated, ${result.skipped} skipped`);
      process.exit(0);
    })
    .catch(err => {
      console.error('[Generator] Error:', err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}

module.exports = { generateEvaluations };
