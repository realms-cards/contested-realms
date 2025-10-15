#!/usr/bin/env node
/**
 * Direct Card Evaluation Generator
 *
 * Generates card evaluations by reading from database and applying
 * intelligent heuristics. This version doesn't require API keys.
 *
 * For LLM-assisted generation, use generate-card-evaluations-llm.js
 *
 * Usage: node scripts/generate-evaluations-direct.js [--limit N]
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

/**
 * Analyze card and generate smart evaluation function
 */
function analyzeCard(card, meta) {
  const cost = meta.cost || 0;
  const type = (meta.type || '').toLowerCase();
  const rules = (meta.rulesText || '').toLowerCase();
  const attack = meta.attack || 0;
  const defence = meta.defence || 0;

  let category = 'unknown';
  let evalFunction = '';
  let priority = '';
  let synergies = [];
  let antiSynergies = [];
  let situational = false;
  let complexity = 'simple';

  // Categorize card
  if (type.includes('minion')) {
    category = 'minion';
  } else if (type.includes('magic') || type.includes('spell')) {
    category = 'spell';
  } else if (type.includes('artifact')) {
    category = 'artifact';
  } else if (type.includes('aura')) {
    category = 'aura';
  } else if (type.includes('site')) {
    category = 'site';
  }

  // MINION EVALUATION
  if (category === 'minion') {
    const statTotal = attack + defence;
    const statRating = statTotal / Math.max(1, cost);

    // Check for keywords in rules
    const hasCharge = rules.includes('charge');
    const hasLethal = rules.includes('lethal');
    const hasBurrowing = rules.includes('burrowing');
    const hasFlying = rules.includes('flying') || rules.includes('airborne');
    const hasDefender = rules.includes('defender') || rules.includes('immobile');

    // Check for card advantage (draw effects)
    const hasDrawEffect = rules.includes('draw') && (rules.includes('spell') || rules.includes('card'));
    const drawsOnGenesis = hasDrawEffect && rules.includes('genesis');
    const drawsOnDeath = hasDrawEffect && (rules.includes('killed') || rules.includes('banished'));

    // Genesis effects (ETB triggers)
    const hasGenesis = rules.includes('genesis →');

    if (hasDrawEffect) {
      // Card draw is very valuable
      complexity = 'complex';
      situational = false;

      if (drawsOnGenesis) {
        // Draw immediately when played - excellent value
        evalFunction = `return context.manaLeftover >= 0 ? ${7.5 + statRating * 0.3} : 0.0;`;
        priority = 'high - card advantage on Genesis';
        synergies.push('card_advantage', 'late_game');
      } else if (drawsOnDeath) {
        // Draw when dies - good value but need to trade
        evalFunction = `return context.manaLeftover >= 0 ? ${6.5 + statRating * 0.3} : 0.0;`;
        priority = 'good - card advantage on death';
        synergies.push('card_advantage', 'trading');
      } else {
        // Other draw trigger
        evalFunction = `return context.manaLeftover >= 0 ? ${6.8 + statRating * 0.3} : 0.0;`;
        priority = 'good - conditional card advantage';
        synergies.push('card_advantage');
      }
    } else if (hasCharge) {
      evalFunction = `return context.manaLeftover >= 0 ? ${6.2 + statRating * 0.4} : 0.0;`;
      priority = 'high - charge allows immediate attack';
      synergies.push('aggressive_board', 'combat_phase');
    } else if (hasLethal) {
      evalFunction = `return context.oppUnitCount > 0 ? ${6.8 + statRating * 0.3} : ${5.5 + statRating * 0.3};`;
      priority = 'high - lethal trades up against any unit';
      synergies.push('combat_phase', 'defensive_position', 'opponent_board_advantage');
      situational = true;
    } else if (hasBurrowing) {
      evalFunction = `return context.manaLeftover >= 0 ? ${6.0 + statRating * 0.4} : 0.0;`;
      priority = 'good - burrowing evades blockers';
      synergies.push('aggressive_board', 'combat_phase');
    } else if (hasFlying) {
      evalFunction = `return context.manaLeftover >= 0 ? ${6.1 + statRating * 0.4} : 0.0;`;
      priority = 'good - flying evades ground blockers';
      synergies.push('aggressive_board', 'combat_phase');
    } else if (hasDefender || statRating < 1.5) {
      // Defensive or weak stats
      evalFunction = `return context.underPressure ? ${5.5 + statRating * 0.3} : ${4.5 + statRating * 0.3};`;
      priority = 'moderate - defensive unit';
      synergies.push('defensive_position');
      situational = true;
    } else if (hasGenesis && !hasDrawEffect) {
      // Has Genesis but not draw - likely some other effect
      complexity = 'moderate';
      evalFunction = `return context.manaLeftover >= 0 ? ${6.3 + statRating * 0.3} : 0.0;`;
      priority = 'good - Genesis effect provides value';
      synergies.push('value_generation');
    } else {
      // Vanilla or simple minion
      evalFunction = `return context.manaLeftover >= 0 ? ${5.5 + statRating * 0.4} : 0.0;`;
      priority = 'moderate - vanilla minion, play on curve';
    }
  }

  // SPELL EVALUATION
  else if (category === 'spell') {
    situational = true;

    // Card draw spells
    if (rules.includes('draw')) {
      const drawThree = rules.includes('three');
      const drawTwo = rules.includes('two');
      const drawCount = drawThree ? 3 : (drawTwo ? 2 : 1);

      evalFunction = `return context.myHandSize < context.oppHandSize ? ${5.5 + drawCount * 0.8} : ${4.5 + drawCount * 0.8};`;
      priority = 'high - card advantage';
      synergies.push('card_advantage', 'late_game');
      situational = false;
    }

    // Life gain
    else if (rules.includes('gain') && rules.includes('life')) {
      const match = rules.match(/gain (\\d+) life/);
      const lifeGain = match ? parseInt(match[1]) : 5;
      evalFunction = `return context.myLife < 10 ? 8.5 : (context.myLife < 15 ? ${3.5 + lifeGain * 0.2} : 1.0);`;
      priority = 'high when low life, low when healthy';
      synergies.push('low_life', 'defensive_position');
      antiSynergies.push('high_life');
    }

    // Combat tricks (give power/bonuses)
    else if ((rules.includes('give') || rules.includes('get')) && (rules.includes('power') || rules.includes('+') || rules.includes('attack'))) {
      evalFunction = `return context.myAttackingUnits.length > 0 ? 7.2 : 0.8;`;
      priority = 'high when attacking, very low otherwise';
      synergies.push('attacking_units', 'combat_phase');
      antiSynergies.push('no_units', 'defensive_position');
    }

    // Removal (destroy, banish)
    else if (rules.includes('destroy') || rules.includes('banish') || rules.includes('exile')) {
      if (rules.includes('all') || rules.includes('each')) {
        // Board clear
        complexity = 'moderate';
        evalFunction = `return context.oppUnitCount > context.myUnitCount + 2 ? 9.0 : (context.oppUnitCount > context.myUnitCount ? 6.5 : 2.5);`;
        priority = 'high when opponent has many units, low otherwise';
        synergies.push('opponent_board_advantage', 'defensive_position');
        antiSynergies.push('own_board_advantage');
      } else {
        // Single target removal
        evalFunction = `return context.oppUnitCount > 0 ? 7.0 : 2.0;`;
        priority = 'high when opponent has threats';
        synergies.push('removal', 'defensive_position');
        situational = true;
      }
    }

    // Teleport/movement (blink, teleport)
    else if (rules.includes('teleport') || rules.includes('blink')) {
      complexity = 'moderate';
      evalFunction = `return context.myUnitCount > 0 ? 5.5 : 2.0;`;
      priority = 'situational - requires units for value';
      synergies.push('tactical_positioning', 'own_units');
      antiSynergies.push('no_units');
    }

    // Generic spell
    else {
      evalFunction = `return context.manaLeftover >= 0 ? 5.0 : 0.0;`;
      priority = 'moderate - spell with situational effect';
    }
  }

  // ARTIFACT EVALUATION
  else if (category === 'artifact') {
    situational = false;

    if (rules.includes('draw') || rules.includes('extra') || rules.includes('additional')) {
      evalFunction = `return context.manaLeftover >= 0 ? 6.5 : 0.0;`;
      priority = 'good - provides ongoing advantage';
      synergies.push('value_generation', 'late_game');
    } else {
      evalFunction = `return context.manaLeftover >= 0 ? 5.5 : 0.0;`;
      priority = 'moderate - artifact with utility effect';
    }
  }

  // AURA EVALUATION
  else if (category === 'aura') {
    situational = true;
    complexity = 'moderate';

    if (rules.includes('sites') && (rules.includes('affected') || rules.includes('occupying'))) {
      // Site-affecting aura
      evalFunction = `return context.oppUnitCount > context.myUnitCount ? 6.2 : 4.5;`;
      priority = 'situational - affects board state over time';
      synergies.push('board_control', 'defensive_position');
    } else if (rules.includes('minion')) {
      // Minion-affecting aura
      evalFunction = `return context.myUnitCount > context.oppUnitCount ? 6.5 : 4.0;`;
      priority = 'good when you have board presence';
      synergies.push('own_board_advantage');
      antiSynergies.push('no_units');
    } else {
      evalFunction = `return context.manaLeftover >= 0 ? 5.0 : 0.0;`;
      priority = 'moderate - aura with persistent effect';
    }
  }

  // FALLBACK
  else {
    evalFunction = `return context.manaLeftover >= 0 ? 5.0 : 0.0;`;
    priority = 'moderate - play on curve if affordable';
  }

  // Determine complexity based on rules text length
  if (rules.length > 100) {
    complexity = 'complex';
  } else if (rules.length > 40) {
    complexity = 'moderate';
  }

  return {
    category,
    rulesText: meta.rulesText || '',
    evaluationFunction: evalFunction,
    priority,
    synergies,
    antiSynergies,
    situational,
    complexity
  };
}

/**
 * Main generation function
 */
async function generateEvaluations(options = {}) {
  const limit = options.limit || 50;

  console.log(`[Direct Generator] Fetching ${limit} cards from database...`);

  const cards = await prisma.card.findMany({
    include: {
      meta: true
    },
    take: limit
  });

  console.log(`[Direct Generator] Found ${cards.length} cards`);

  const evaluations = {};
  let generated = 0;
  let skipped = 0;

  for (const card of cards) {
    if (!card.meta || card.meta.length === 0) {
      skipped++;
      continue;
    }

    const meta = card.meta[0];

    // Skip sites and avatars
    const type = (meta.type || '').toLowerCase();
    if (type.includes('site') || type.includes('avatar')) {
      skipped++;
      continue;
    }

    try {
      const evaluation = analyzeCard(card, meta);
      evaluations[card.name] = evaluation;
      generated++;

      console.log(`[Direct Generator] ✓ ${card.name} (${evaluation.category}, ${evaluation.complexity})`);
    } catch (e) {
      console.warn(`[Direct Generator] Failed to generate evaluation for ${card.name}:`, e.message);
      skipped++;
    }
  }

  console.log(`[Direct Generator] Generated ${generated} evaluations, skipped ${skipped}`);

  const output = {
    version: '2.2.0',
    generated: new Date().toISOString(),
    description: 'Database-driven card evaluation functions with enhanced heuristics',
    generator: 'scripts/generate-evaluations-direct.js',
    cards: evaluations
  };

  const outputPath = path.join(process.cwd(), 'data', 'cards', 'card-evaluations.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log(`[Direct Generator] Wrote ${generated} evaluations to ${outputPath}`);

  return { generated, skipped };
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const limitArg = args.find(a => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 50;

  generateEvaluations({ limit })
    .then(result => {
      console.log(`[Direct Generator] Complete: ${result.generated} generated, ${result.skipped} skipped`);
      process.exit(0);
    })
    .catch(err => {
      console.error('[Direct Generator] Error:', err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}

module.exports = { generateEvaluations };
