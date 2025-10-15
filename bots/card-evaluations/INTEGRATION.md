# Card Evaluation System - Integration Guide

## Overview

The card evaluation system provides card-specific evaluation functions that enhance bot decision-making. Evaluations are stored in the database and loaded asynchronously at startup.

## Architecture

- **Database**: `CardEvaluation` table stores evaluation functions and metadata
- **Loader**: `bots/card-evaluations/loader.js` compiles and caches functions
- **Bot Engine**: `bots/engine/index.js` integrates evaluations into search
- **Generation**: `scripts/generate-evaluations-db.js` creates evaluations using LLM

## Server Integration

### Option 1: Async Initialization (Recommended)

Initialize the cache when the server starts:

```javascript
const { initCardEvaluations } = require('./bots/engine/index');

// During server startup (before handling bot requests)
async function startServer() {
  // Initialize card evaluation cache from database
  const stats = await initCardEvaluations();
  console.log(`Card evaluations loaded: ${stats.loaded} cards from ${stats.source}`);

  // Start accepting bot requests
  server.listen(3000);
}

startServer().catch(console.error);
```

### Option 2: Lazy Loading (Fallback)

If you don't call `initCardEvaluations()`, the cache will lazy-load from JSON file on first bot decision. This is less efficient but works as a fallback.

## Database Schema

```prisma
model CardEvaluation {
  id                  Int      @id @default(autoincrement())
  cardId              Int      @unique
  card                Card     @relation(...)

  category            String   // minion, spell, artifact, aura, site
  evaluationFunction  String   // JavaScript function body
  priority            String   // High, Medium, Low
  synergies           Json     // Array of synergy tags
  antiSynergies       Json     // Array of anti-synergy tags
  situational         Boolean  // Context-dependent evaluation
  complexity          String   // simple, moderate, complex

  generatedBy         String   // "llm" or "direct"
  model               String?  // e.g., "claude-3-5-sonnet-20241022"
  validationStatus    String   // "pending", "validated", "failed"
  validationError     String?

  createdAt           DateTime
  updatedAt           DateTime
}
```

## Evaluation Context API

Evaluation functions receive a context object with 30+ properties:

```javascript
{
  // Life totals
  myLife, oppLife, myMaxLife, oppMaxLife,

  // Board state
  myUnits, oppUnits, myUnitCount, oppUnitCount,
  myAttackingUnits, myBlockingUnits,
  myTotalATK, oppTotalATK,

  // Resources
  myMana, myManaMax, oppMana, manaLeftover,
  myHandSize, oppHandSize, myDeckSize, oppDeckSize,

  // Turn state
  turn, isMyTurn, phase,

  // Threat assessment
  lethalThreat, nearLethal, underPressure
}
```

## Example Evaluation Function

```javascript
// Lightning Bolt: Direct damage spell
// Function body stored in database:
return context.oppLife <= 3 ? 9.5 :     // Lethal - highest priority
       context.nearLethal ? 8.0 :       // Close to lethal - very high
       context.oppLife < 10 ? 7.0 :     // Burn strategy - high
       context.manaLeftover >= 2 ? 6.0 : // Mana available - good
       5.0;                             // Default value
```

## Generating New Evaluations

### LLM-Assisted Generation (Recommended)

```bash
# Generate for all cards
node scripts/generate-evaluations-db.js --mode=llm --batch-size=20

# Resume interrupted generation
node scripts/generate-evaluations-db.js --mode=llm --resume
```

### Direct Generation (Simple Heuristics)

```bash
# Generate with pattern matching
node scripts/generate-evaluations-db.js --mode=direct
```

## Validation

All evaluation functions are validated during compilation:

1. **Syntax Check**: Function must be valid JavaScript
2. **Return Type**: Must return a number between 0-10
3. **Context Access**: Must use `context.` prefix for all variables
4. **Execution Test**: Validated against test context

Failed validations are logged in `validationError` field.

## Performance

- **Load Time**: ~100ms for 649 cards from database
- **Execution Time**: <1ms per evaluation (compiled functions)
- **Memory**: ~2MB for full cache (649 cards)
- **Fallback**: JSON file if database unavailable

## Monitoring

Check cache statistics:

```javascript
const { getCache } = require('./bots/card-evaluations/loader');
const cache = getCache();
const stats = cache.getStats();

console.log(`Loaded: ${stats.loaded}`);
console.log(`Errors: ${stats.errors}`);
console.log(`Categories:`, stats.categories);
```

## Migration from JSON

The system supports both database and JSON loading:

1. **Database** (primary): `initCardEvaluations()` loads from database
2. **JSON** (fallback): Automatically used if database fails
3. **Export**: Use `scripts/export-evaluations-json.js` to create JSON from database (not implemented yet)

## Troubleshooting

**Cache not loading?**
- Check database connection in `.env`
- Verify Prisma migrations are applied
- Check console for `[CardEval]` logs

**Validation errors?**
- Query `CardEvaluation` table for `validationStatus: 'failed'`
- Check `validationError` field for details
- Re-generate with corrected prompt

**Performance issues?**
- Cache is compiled once at startup (fast)
- If using lazy loading, first decision may be slower
- Consider async initialization during server startup
