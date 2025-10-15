#!/usr/bin/env node
/**
 * LLM-Assisted Card Evaluation Generator
 *
 * Uses Claude API to generate context-aware evaluation functions
 * by actually reading and understanding card rules text.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... node scripts/generate-card-evaluations-llm.js [--limit N] [--batch-size N]
 *
 * Environment:
 *   ANTHROPIC_API_KEY - Required for Claude API access
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

// Check for API key
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error('[LLM Generator] Error: ANTHROPIC_API_KEY environment variable not set');
  console.error('Usage: ANTHROPIC_API_KEY=sk-... node scripts/generate-card-evaluations-llm.js');
  process.exit(1);
}

/**
 * Build LLM prompt for card evaluation generation
 */
function buildPrompt(card, meta) {
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

  return `You are a Sorcery: Contested Realm card evaluator. Generate a JavaScript evaluation function for the following card.

**Card Name**: ${card.name}
**Type**: ${type}
**Cost**: ${cost} mana
**Stats**: ${type.toLowerCase().includes('minion') ? `${attack}/${defence}` : 'N/A'}
**Thresholds**: ${thresholdStr}
**Rules Text**: ${rules}

The evaluation function receives a game context object with these properties:

\`\`\`typescript
interface EvaluationContext {
  // Life totals
  myLife: number;           // Bot's current life
  oppLife: number;          // Opponent's current life
  myMaxLife: number;        // Bot's maximum life (usually 20)
  oppMaxLife: number;       // Opponent's maximum life

  // Board state
  myUnits: Unit[];          // Bot's units on board
  oppUnits: Unit[];         // Opponent's units on board
  myUnitCount: number;      // Count of bot's units
  oppUnitCount: number;     // Count of opponent's units

  // Unit details
  myAttackingUnits: Unit[]; // Bot's units that can attack
  myBlockingUnits: Unit[];  // Bot's units that can block
  myTotalATK: number;       // Sum of bot's unit ATK
  oppTotalATK: number;      // Sum of opponent's unit ATK

  // Resources
  myMana: number;           // Bot's available mana
  myManaMax: number;        // Bot's total mana (sites)
  oppMana: number;          // Opponent's available mana
  manaLeftover: number;     // Mana remaining after playing this card

  // Hand and deck
  myHandSize: number;       // Cards in bot's hand
  oppHandSize: number;      // Cards in opponent's hand
  myDeckSize: number;       // Cards in bot's deck
  oppDeckSize: number;      // Cards in opponent's deck

  // Turn info
  turn: number;             // Current turn number
  isMyTurn: boolean;        // Is it bot's turn?
  phase: string;            // Current phase (main, combat, etc.)

  // Threats and pressure
  lethalThreat: boolean;    // Opponent can win next turn
  nearLethal: boolean;      // Bot can win next turn
  underPressure: boolean;   // Opponent has board advantage
}

interface Unit {
  name: string;
  atk: number;
  hp: number;
  keywords: string[];       // ['Flying', 'Haste', etc.]
  tapped: boolean;
  canAttack: boolean;
  canBlock: boolean;
}
\`\`\`

Return a JSON object with the following structure:

\`\`\`json
{
  "category": "minion|spell|artifact|aura|site|unknown",
  "evaluationFunction": "return <javascript expression that evaluates to 0.0-10.0>;",
  "priority": "brief description of when to prioritize this card",
  "synergies": ["tag1", "tag2"],
  "antiSynergies": ["tag1", "tag2"],
  "situational": true|false,
  "complexity": "simple|moderate|complex"
}
\`\`\`

**Score Interpretation**:
- 0.0-2.0: Very low value (almost never play)
- 2.0-4.0: Low value (play if nothing better)
- 4.0-6.0: Moderate value (reasonable play)
- 6.0-8.0: High value (strong play)
- 8.0-10.0: Very high value (priority play)

**Examples**:

Card: "You gain 7 life." (Healing spell)
{
  "category": "spell",
  "evaluationFunction": "return context.myLife < 10 ? 8.0 : (context.myLife < 15 ? 4.0 : 1.0);",
  "priority": "high when low life, low when healthy",
  "synergies": ["low_life", "defensive_position"],
  "antiSynergies": ["high_life"],
  "situational": true,
  "complexity": "simple"
}

Card: "Target attacking minion gets +2 power until end of turn." (Combat trick)
{
  "category": "spell",
  "evaluationFunction": "return context.myAttackingUnits.length > 0 ? 7.0 : 0.5;",
  "priority": "high when attacking, very low otherwise",
  "synergies": ["attacking_units", "combat_phase"],
  "antiSynergies": ["no_units", "defensive_position"],
  "situational": true,
  "complexity": "moderate"
}

Card: "Destroy all minions." (Board clear)
{
  "category": "spell",
  "evaluationFunction": "return context.oppUnitCount > context.myUnitCount + 2 ? 9.0 : (context.oppUnitCount > context.myUnitCount ? 6.0 : 2.0);",
  "priority": "high when opponent has many units, low otherwise",
  "synergies": ["opponent_board_advantage", "defensive_position"],
  "antiSynergies": ["own_board_advantage", "few_opponent_units"],
  "situational": true,
  "complexity": "moderate"
}

Card: "3/3 Minion with no abilities" (Vanilla minion)
{
  "category": "minion",
  "evaluationFunction": "return context.manaLeftover >= 0 ? 6.0 : 0.0;",
  "priority": "moderate - vanilla minion, play on curve",
  "synergies": [],
  "antiSynergies": [],
  "situational": false,
  "complexity": "simple"
}

Card: "Draw three spells." (Card advantage)
{
  "category": "spell",
  "evaluationFunction": "return context.myHandSize < context.oppHandSize ? 7.5 : 6.0;",
  "priority": "high - significant card advantage",
  "synergies": ["card_advantage", "late_game"],
  "antiSynergies": [],
  "situational": false,
  "complexity": "simple"
}

**Important Guidelines**:
1. Understand the card effect from rules text, don't just pattern match
2. Consider card type (Minion, Spell, Artifact, Aura, Site)
3. For minions: evaluate stats relative to cost, look for keywords (Charge, Lethal, Burrowing, Flying, etc.)
4. For spells: determine if situational (combat tricks, healing) or generally good (card draw, removal)
5. For artifacts/auras: consider ongoing effects and board presence requirements
6. Always return a valid number 0.0-10.0
7. Use the context object to make smart situational decisions
8. Card advantage (drawing cards) is very valuable
9. Removal (destroying/banishing units) is valuable when opponent has threats
10. Combat tricks need attacking units to be valuable
11. Healing needs low life to be valuable
12. Board clears need opponent to have more units

**Now generate the evaluation for**: ${card.name}

Return ONLY the JSON object, no additional text.`;
}

/**
 * Call Claude API to generate evaluation
 */
async function generateEvaluationWithLLM(card, meta) {
  const prompt = buildPrompt(card, meta);

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
        messages: [
          { role: 'user', content: prompt }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();

    if (!data.content || !data.content[0] || !data.content[0].text) {
      throw new Error('Invalid API response structure');
    }

    const resultText = data.content[0].text.trim();

    // Extract JSON from response (Claude might wrap it in markdown)
    let jsonText = resultText;
    if (resultText.includes('```json')) {
      const match = resultText.match(/```json\s*(\{[\s\S]*?\})\s*```/);
      if (match) {
        jsonText = match[1];
      }
    } else if (resultText.includes('```')) {
      const match = resultText.match(/```\s*(\{[\s\S]*?\})\s*```/);
      if (match) {
        jsonText = match[1];
      }
    }

    const evaluation = JSON.parse(jsonText);

    // Validate evaluation structure
    if (!evaluation.category || !evaluation.evaluationFunction) {
      throw new Error('Missing required fields in evaluation');
    }

    // Add rules text for reference
    evaluation.rulesText = meta.rulesText || '';

    return evaluation;

  } catch (e) {
    console.error(`[LLM Generator] Failed to generate evaluation for ${card.name}:`, e.message);
    return null;
  }
}

/**
 * Validate generated evaluation function
 */
function validateEvaluation(cardName, evaluation) {
  try {
    // Try to compile the function
    const fn = new Function('context', evaluation.evaluationFunction);

    // Test with sample context
    const testContext = {
      myLife: 15,
      oppLife: 15,
      myMaxLife: 20,
      oppMaxLife: 20,
      myUnits: [],
      oppUnits: [],
      myUnitCount: 0,
      oppUnitCount: 0,
      myAttackingUnits: [],
      myBlockingUnits: [],
      myTotalATK: 0,
      oppTotalATK: 0,
      myMana: 5,
      myManaMax: 5,
      oppMana: 5,
      manaLeftover: 2,
      myHandSize: 5,
      oppHandSize: 5,
      myDeckSize: 30,
      oppDeckSize: 30,
      turn: 5,
      isMyTurn: true,
      phase: 'main',
      lethalThreat: false,
      nearLethal: false,
      underPressure: false,
    };

    const result = fn(testContext);

    // Validate result
    if (typeof result !== 'number' || !isFinite(result)) {
      console.warn(`[LLM Generator] Invalid result for ${cardName}: ${result}`);
      return false;
    }

    if (result < 0 || result > 10) {
      console.warn(`[LLM Generator] Out of range result for ${cardName}: ${result}`);
      return false;
    }

    return true;

  } catch (e) {
    console.warn(`[LLM Generator] Validation failed for ${cardName}:`, e.message);
    return false;
  }
}

/**
 * Main generation function
 */
async function generateEvaluations(options = {}) {
  const limit = options.limit || 50;
  const batchSize = options.batchSize || 10;

  console.log(`[LLM Generator] Fetching ${limit} cards from database...`);

  // Query cards with metadata
  const cards = await prisma.card.findMany({
    include: {
      meta: true
    },
    take: limit
  });

  console.log(`[LLM Generator] Found ${cards.length} cards`);

  const evaluations = {};
  let generated = 0;
  let skipped = 0;
  let failed = 0;

  // Process in batches to avoid rate limits
  for (let i = 0; i < cards.length; i += batchSize) {
    const batch = cards.slice(i, i + batchSize);
    console.log(`[LLM Generator] Processing batch ${Math.floor(i / batchSize) + 1} (${i + 1}-${Math.min(i + batchSize, cards.length)} of ${cards.length})...`);

    for (const card of batch) {
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

      console.log(`[LLM Generator] Generating evaluation for ${card.name}...`);

      try {
        const evaluation = await generateEvaluationWithLLM(card, meta);

        if (!evaluation) {
          failed++;
          continue;
        }

        // Validate evaluation
        if (!validateEvaluation(card.name, evaluation)) {
          failed++;
          continue;
        }

        evaluations[card.name] = evaluation;
        generated++;

        console.log(`[LLM Generator] ✓ ${card.name} (${evaluation.category}, ${evaluation.complexity})`);

      } catch (e) {
        console.error(`[LLM Generator] Error generating ${card.name}:`, e.message);
        failed++;
      }

      // Small delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Longer delay between batches
    if (i + batchSize < cards.length) {
      console.log('[LLM Generator] Waiting 2 seconds between batches...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log(`[LLM Generator] Generated ${generated} evaluations, skipped ${skipped}, failed ${failed}`);

  // Build output JSON
  const output = {
    version: '2.1.0',
    generated: new Date().toISOString(),
    description: 'LLM-assisted card evaluation functions for bot AI',
    generator: 'scripts/generate-card-evaluations-llm.js',
    model: 'claude-3-5-sonnet-20241022',
    cards: evaluations
  };

  // Write to file
  const outputPath = path.join(process.cwd(), 'data', 'cards', 'card-evaluations.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log(`[LLM Generator] Wrote ${generated} evaluations to ${outputPath}`);

  return { generated, skipped, failed };
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const limitArg = args.find(a => a.startsWith('--limit='));
  const batchSizeArg = args.find(a => a.startsWith('--batch-size='));

  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 50;
  const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1]) : 10;

  generateEvaluations({ limit, batchSize })
    .then(result => {
      console.log(`[LLM Generator] Complete: ${result.generated} generated, ${result.skipped} skipped, ${result.failed} failed`);
      process.exit(result.failed > 0 ? 1 : 0);
    })
    .catch(err => {
      console.error('[LLM Generator] Error:', err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}

module.exports = { generateEvaluations };
