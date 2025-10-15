#!/usr/bin/env node
/**
 * Database-Backed Card Evaluation Generator
 *
 * Generates card evaluations and stores them in the database for progress tracking.
 * Supports both LLM-assisted and direct generation modes.
 *
 * Usage:
 *   # Direct generation (no API key needed)
 *   node scripts/generate-evaluations-db.js --mode=direct --batch-size=50
 *
 *   # LLM generation (requires API key)
 *   ANTHROPIC_API_KEY=sk-... node scripts/generate-evaluations-db.js --mode=llm --batch-size=20
 *
 *   # Resume from where it left off
 *   node scripts/generate-evaluations-db.js --mode=llm --resume
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

// Check for API key if using LLM mode
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

/**
 * Validate evaluation function
 */
function validateEvaluation(cardName, evaluation) {
  try {
    const fn = new Function('context', evaluation.evaluationFunction);

    const testContext = {
      myLife: 15, oppLife: 15, myMaxLife: 20, oppMaxLife: 20,
      myUnits: [], oppUnits: [], myUnitCount: 0, oppUnitCount: 0,
      myAttackingUnits: [], myBlockingUnits: [],
      myTotalATK: 0, oppTotalATK: 0,
      myMana: 5, myManaMax: 5, oppMana: 5, manaLeftover: 2,
      myHandSize: 5, oppHandSize: 5, myDeckSize: 30, oppDeckSize: 30,
      turn: 5, isMyTurn: true, phase: 'main',
      lethalThreat: false, nearLethal: false, underPressure: false,
    };

    const result = fn(testContext);

    if (typeof result !== 'number' || !isFinite(result)) {
      return { valid: false, error: `Invalid result: ${result}` };
    }

    if (result < 0 || result > 10) {
      return { valid: false, error: `Out of range: ${result}` };
    }

    return { valid: true };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

/**
 * Generate evaluation using direct heuristics
 */
function generateDirectEvaluation(card, meta) {
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

  // Categorize
  if (type.includes('minion')) category = 'minion';
  else if (type.includes('magic')) category = 'spell';
  else if (type.includes('artifact')) category = 'artifact';
  else if (type.includes('aura')) category = 'aura';
  else if (type.includes('site')) category = 'site';

  // Generate based on category
  if (category === 'minion') {
    const statTotal = attack + defence;
    const statRating = statTotal / Math.max(1, cost);
    const hasDrawEffect = rules.includes('draw') && (rules.includes('spell') || rules.includes('card'));

    if (hasDrawEffect && rules.includes('genesis')) {
      evalFunction = `return context.manaLeftover >= 0 ? ${7.5 + statRating * 0.3} : 0.0;`;
      priority = 'high - card advantage on Genesis';
      synergies.push('card_advantage', 'late_game');
    } else if (rules.includes('charge')) {
      evalFunction = `return context.manaLeftover >= 0 ? ${6.2 + statRating * 0.4} : 0.0;`;
      priority = 'high - charge allows immediate attack';
      synergies.push('aggressive_board', 'combat_phase');
    } else if (rules.includes('lethal')) {
      evalFunction = `return context.oppUnitCount > 0 ? ${6.8 + statRating * 0.3} : ${5.5 + statRating * 0.3};`;
      priority = 'high - lethal trades up';
      synergies.push('combat_phase', 'defensive_position');
      situational = true;
    } else if (rules.includes('burrowing') || rules.includes('flying') || rules.includes('airborne')) {
      evalFunction = `return context.manaLeftover >= 0 ? ${6.0 + statRating * 0.4} : 0.0;`;
      priority = 'good - evasion ability';
      synergies.push('aggressive_board');
    } else {
      evalFunction = `return context.manaLeftover >= 0 ? ${5.5 + statRating * 0.4} : 0.0;`;
      priority = 'moderate - vanilla minion';
    }
  } else if (category === 'spell') {
    situational = true;
    if (rules.includes('draw')) {
      const drawCount = rules.includes('three') ? 3 : (rules.includes('two') ? 2 : 1);
      evalFunction = `return context.myHandSize < context.oppHandSize ? ${5.5 + drawCount * 0.8} : ${4.5 + drawCount * 0.8};`;
      priority = 'high - card advantage';
      synergies.push('card_advantage');
    } else if (rules.includes('gain') && rules.includes('life')) {
      evalFunction = `return context.myLife < 10 ? 8.5 : (context.myLife < 15 ? 4.0 : 1.0);`;
      priority = 'high when low life';
      synergies.push('low_life');
      antiSynergies.push('high_life');
    } else if ((rules.includes('give') || rules.includes('get')) && (rules.includes('power') || rules.includes('+'))) {
      evalFunction = `return context.myAttackingUnits.length > 0 ? 7.2 : 0.8;`;
      priority = 'high when attacking';
      synergies.push('attacking_units');
      antiSynergies.push('no_units');
    } else if (rules.includes('destroy') || rules.includes('banish')) {
      if (rules.includes('all')) {
        evalFunction = `return context.oppUnitCount > context.myUnitCount + 2 ? 9.0 : (context.oppUnitCount > context.myUnitCount ? 6.5 : 2.5);`;
        priority = 'high when opponent has many units';
        synergies.push('opponent_board_advantage');
      } else {
        evalFunction = `return context.oppUnitCount > 0 ? 7.0 : 2.0;`;
        priority = 'high when opponent has threats';
        synergies.push('removal');
      }
    } else {
      evalFunction = `return context.manaLeftover >= 0 ? 5.0 : 0.0;`;
      priority = 'moderate - situational spell';
    }
  } else if (category === 'artifact') {
    evalFunction = `return context.manaLeftover >= 0 ? 5.5 : 0.0;`;
    priority = 'moderate - artifact utility';
  } else if (category === 'aura') {
    situational = true;
    evalFunction = `return context.oppUnitCount > context.myUnitCount ? 6.2 : 4.5;`;
    priority = 'situational - persistent effect';
  } else {
    evalFunction = `return context.manaLeftover >= 0 ? 5.0 : 0.0;`;
    priority = 'moderate - play on curve';
  }

  if (rules.length > 100) complexity = 'complex';
  else if (rules.length > 40) complexity = 'moderate';

  return {
    category,
    evaluationFunction: evalFunction,
    priority,
    synergies,
    antiSynergies,
    situational,
    complexity
  };
}

/**
 * Generate evaluation using LLM
 */
async function generateLLMEvaluation(card, meta) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not set');
  }

  const cost = meta.cost || 0;
  const type = meta.type || 'Unknown';
  const rules = meta.rulesText || 'No rules text';
  const attack = meta.attack || 0;
  const defence = meta.defence || 0;
  const thresholds = meta.thresholds || {};

  const thresholdStr = Object.entries(thresholds)
    .filter(([_, v]) => v > 0)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ') || 'None';

  const prompt = `You are a Sorcery: Contested Realm card evaluator. Generate a JSON evaluation for this card.

**Card**: ${card.name}
**Type**: ${type}
**Cost**: ${cost} mana
**Stats**: ${type.toLowerCase().includes('minion') ? `${attack}/${defence}` : 'N/A'}
**Thresholds**: ${thresholdStr}
**Rules**: ${rules}

Return ONLY a JSON object (no markdown):
{
  "category": "minion|spell|artifact|aura",
  "evaluationFunction": "return <expression evaluating to 0-10>;",
  "priority": "description",
  "synergies": ["tag1", "tag2"],
  "antiSynergies": ["tag1"],
  "situational": true|false,
  "complexity": "simple|moderate|complex"
}

IMPORTANT: Always use "context." prefix for ALL variables!
Examples:
- context.myLife (NOT myLife)
- context.oppUnitCount (NOT oppUnitCount)
- context.myAttackingUnits.length (NOT myAttackingUnits.length)

Available context properties (always use context. prefix):
- context.myLife, context.oppLife, context.myMaxLife, context.oppMaxLife
- context.myUnits, context.oppUnits, context.myUnitCount, context.oppUnitCount
- context.myAttackingUnits, context.myBlockingUnits
- context.myTotalATK, context.oppTotalATK
- context.myMana, context.myManaMax, context.oppMana, context.manaLeftover
- context.myHandSize, context.oppHandSize, context.myDeckSize, context.oppDeckSize
- context.turn, context.isMyTurn, context.phase
- context.lethalThreat, context.nearLethal, context.underPressure

Guidelines:
- Score 0-10 based on situational value
- Card advantage (draw) is valuable
- Combat tricks need attacking units
- Healing needs low life
- Board clears need opponent advantage`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    let resultText = data.content[0].text.trim();

    // Extract JSON
    if (resultText.includes('```json')) {
      const match = resultText.match(/```json\s*(\{[\s\S]*?\})\s*```/);
      if (match) resultText = match[1];
    } else if (resultText.includes('```')) {
      const match = resultText.match(/```\s*(\{[\s\S]*?\})\s*```/);
      if (match) resultText = match[1];
    }

    const evaluation = JSON.parse(resultText);

    if (!evaluation.category || !evaluation.evaluationFunction) {
      throw new Error('Missing required fields');
    }

    return evaluation;
  } catch (e) {
    throw new Error(`LLM generation failed: ${e.message}`);
  }
}

/**
 * Main generation function
 */
async function generateEvaluations(options = {}) {
  const mode = options.mode || 'direct'; // 'direct' or 'llm'
  const batchSize = options.batchSize || 20;
  const resume = options.resume || false;

  console.log(`[DB Generator] Mode: ${mode}, Batch Size: ${batchSize}`);

  // Find cards that need evaluation
  const whereClause = resume
    ? { evaluation: null }
    : {};

  const cards = await prisma.card.findMany({
    where: whereClause,
    include: {
      meta: true,
      evaluation: true
    },
    orderBy: { id: 'asc' }
  });

  console.log(`[DB Generator] Found ${cards.length} cards to process`);

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < cards.length; i += batchSize) {
    const batch = cards.slice(i, i + batchSize);
    console.log(`\n[DB Generator] Batch ${Math.floor(i / batchSize) + 1} (${i + 1}-${Math.min(i + batchSize, cards.length)})`);

    for (const card of batch) {
      if (!card.meta || card.meta.length === 0) {
        console.log(`⊘ ${card.name} - no metadata`);
        skipped++;
        continue;
      }

      const meta = card.meta[0];
      const type = (meta.type || '').toLowerCase();

      if (type.includes('site') || type.includes('avatar')) {
        console.log(`⊘ ${card.name} - ${meta.type} (skipped)`);
        skipped++;
        continue;
      }

      try {
        console.log(`⋯ ${card.name}...`);

        let evaluation;
        if (mode === 'llm') {
          evaluation = await generateLLMEvaluation(card, meta);
          await new Promise(resolve => setTimeout(resolve, 500)); // Rate limit
        } else {
          evaluation = generateDirectEvaluation(card, meta);
        }

        // Validate
        const validation = validateEvaluation(card.name, evaluation);

        // Store in database
        await prisma.cardEvaluation.upsert({
          where: { cardId: card.id },
          create: {
            cardId: card.id,
            category: evaluation.category,
            evaluationFunction: evaluation.evaluationFunction,
            priority: evaluation.priority,
            synergies: evaluation.synergies || [],
            antiSynergies: evaluation.antiSynergies || [],
            situational: evaluation.situational || false,
            complexity: evaluation.complexity || 'moderate',
            generatedBy: mode,
            model: mode === 'llm' ? 'claude-3-5-sonnet-20241022' : null,
            validationStatus: validation.valid ? 'validated' : 'failed',
            validationError: validation.error || null
          },
          update: {
            category: evaluation.category,
            evaluationFunction: evaluation.evaluationFunction,
            priority: evaluation.priority,
            synergies: evaluation.synergies || [],
            antiSynergies: evaluation.antiSynergies || [],
            situational: evaluation.situational || false,
            complexity: evaluation.complexity || 'moderate',
            generatedBy: mode,
            model: mode === 'llm' ? 'claude-3-5-sonnet-20241022' : null,
            validationStatus: validation.valid ? 'validated' : 'failed',
            validationError: validation.error || null,
            updatedAt: new Date()
          }
        });

        if (validation.valid) {
          console.log(`✓ ${card.name} (${evaluation.category}, ${evaluation.complexity})`);
          generated++;
        } else {
          console.log(`✗ ${card.name} - validation failed: ${validation.error}`);
          failed++;
        }

      } catch (e) {
        console.error(`✗ ${card.name} - error: ${e.message}`);
        failed++;

        // Store failed attempt
        try {
          await prisma.cardEvaluation.upsert({
            where: { cardId: card.id },
            create: {
              cardId: card.id,
              category: 'unknown',
              evaluationFunction: 'return 5.0;',
              priority: 'error during generation',
              synergies: [],
              antiSynergies: [],
              situational: false,
              complexity: 'simple',
              generatedBy: mode,
              model: mode === 'llm' ? 'claude-3-5-sonnet-20241022' : null,
              validationStatus: 'failed',
              validationError: e.message
            },
            update: {
              validationStatus: 'failed',
              validationError: e.message,
              updatedAt: new Date()
            }
          });
        } catch (dbError) {
          console.error(`Failed to store error: ${dbError.message}`);
        }
      }
    }

    // Progress summary
    console.log(`\nProgress: ${generated} generated, ${skipped} skipped, ${failed} failed`);

    if (i + batchSize < cards.length && mode === 'llm') {
      console.log('Waiting 2 seconds between batches...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  return { generated, skipped, failed };
}

/**
 * Export evaluations to JSON file
 */
async function exportToJSON() {
  const evaluations = await prisma.cardEvaluation.findMany({
    where: { validationStatus: 'validated' },
    include: { card: true }
  });

  const output = {
    version: '2.3.0',
    generated: new Date().toISOString(),
    description: 'Database-backed card evaluations for bot AI',
    generator: 'scripts/generate-evaluations-db.js',
    cards: {}
  };

  for (const eval of evaluations) {
    output.cards[eval.card.name] = {
      category: eval.category,
      evaluationFunction: eval.evaluationFunction,
      priority: eval.priority,
      synergies: eval.synergies,
      antiSynergies: eval.antiSynergies,
      situational: eval.situational,
      complexity: eval.complexity,
      rulesText: eval.card.meta?.[0]?.rulesText || ''
    };
  }

  const outputPath = path.join(process.cwd(), 'data', 'cards', 'card-evaluations.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log(`\n[Export] Wrote ${evaluations.length} evaluations to ${outputPath}`);
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const modeArg = args.find(a => a.startsWith('--mode='));
  const batchSizeArg = args.find(a => a.startsWith('--batch-size='));
  const resumeArg = args.includes('--resume');
  const exportArg = args.includes('--export');

  const mode = modeArg ? modeArg.split('=')[1] : 'direct';
  const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1]) : 20;

  if (exportArg) {
    exportToJSON()
      .then(() => {
        console.log('[Export] Complete');
        process.exit(0);
      })
      .catch(err => {
        console.error('[Export] Error:', err);
        process.exit(1);
      })
      .finally(() => prisma.$disconnect());
  } else {
    generateEvaluations({ mode, batchSize, resume: resumeArg })
      .then(result => {
        console.log(`\n[DB Generator] Complete:`);
        console.log(`  Generated: ${result.generated}`);
        console.log(`  Skipped: ${result.skipped}`);
        console.log(`  Failed: ${result.failed}`);
        console.log(`\nRun with --export to generate JSON file`);
        process.exit(result.failed > 0 ? 1 : 0);
      })
      .catch(err => {
        console.error('[DB Generator] Error:', err);
        process.exit(1);
      })
      .finally(() => prisma.$disconnect());
  }
}

module.exports = { generateEvaluations, exportToJSON };
