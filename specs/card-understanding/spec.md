# Card-Specific Understanding System Specification

**Version**: 2.0.0
**Status**: Phase 2 Design
**Created**: 2025-10-15

---

## Problem Statement

### Current Limitation

The Phase 1 bot uses **generic evaluation** that treats all cards equally:
- Divine Healing (gain 7 life) = evaluated same as Overpower (combat trick) = Flood (board clear)
- Bot cannot distinguish between:
  - Situational cards (Divine Healing is valuable when low life, useless when healthy)
  - Combat tricks (Overpower is valuable when attacking, useless otherwise)
  - Board clears (Flood is valuable against many units, wasteful against one)
- Result: Bot plays cards suboptimally, missing strategic opportunities

### Impact on Play Quality

Without card-specific understanding:
- ❌ Bot plays Divine Healing at 20 life (wastes card)
- ❌ Bot plays Overpower when no units attacking (wastes mana)
- ❌ Bot plays Flood against 1 unit (inefficient)
- ❌ Bot undervalues ETB effects (e.g., "When this enters, draw a card")
- ❌ Bot cannot recognize synergies (e.g., Overpower + attacking units)

**Goal**: Enable bot to understand and evaluate cards based on their specific effects and game context.

---

## Solution Overview

### Approach: LLM-Generated Evaluation Functions

Use LLM to parse card `rulesText` and generate JavaScript evaluation functions that:
1. Take game state context as input
2. Return numeric score (0-10) based on card's situational value
3. Consider card effects, synergies, and game state

### Architecture

```
┌─────────────────────┐
│  Card Database      │
│  (Prisma)           │
│  - name             │
│  - rulesText        │
│  - cost             │
│  - thresholds       │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  LLM Prompt         │
│  (Claude/GPT-4)     │
│  "Generate eval fn" │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Evaluation         │
│  Function (JS)      │
│  context => score   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Evaluation Cache   │
│  (JSON file)        │
│  card-evaluations   │
│  .json              │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Bot Engine         │
│  Uses cached evals  │
│  during search      │
└─────────────────────┘
```

---

## Evaluation Function Schema

### Context API

Evaluation functions receive a game context object:

```typescript
interface EvaluationContext {
  // Life totals
  myLife: number;           // Bot's current life
  oppLife: number;          // Opponent's current life
  myMaxLife: number;        // Bot's maximum life
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
  oppMana: number;          // Opponent's available mana (estimate)
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
```

### Output Schema

Evaluation functions return a numeric score:

```typescript
type EvaluationScore = number; // 0.0 to 10.0

// Interpretation:
// 0.0-2.0: Very low value (almost never play)
// 2.0-4.0: Low value (play if nothing better)
// 4.0-6.0: Moderate value (reasonable play)
// 6.0-8.0: High value (strong play)
// 8.0-10.0: Very high value (priority play)
```

---

## Cached Evaluation Format

### File Structure

```json
{
  "version": "2.0.0",
  "generated": "2025-10-15T00:00:00Z",
  "cards": {
    "Divine Healing": {
      "category": "healing",
      "rulesText": "You gain 7 life.",
      "evaluationFunction": "return myLife < 10 ? 8.0 : (myLife < 15 ? 4.0 : 1.0);",
      "priority": "high when low life, low when healthy",
      "synergies": [],
      "antiSynergies": ["no_life_deficit"],
      "situational": true,
      "complexity": "simple"
    },
    "Overpower": {
      "category": "combat_trick",
      "rulesText": "Target attacking minion gets +3/+0 until end of turn.",
      "evaluationFunction": "if (myAttackingUnits.length === 0) return 0.5; const avgATK = myTotalATK / Math.max(1, myUnitCount); return myAttackingUnits.length > 0 ? 7.0 + (avgATK * 0.2) : 1.0;",
      "priority": "high when attacking, very low otherwise",
      "synergies": ["attacking_units", "combat_phase"],
      "antiSynergies": ["no_units", "defensive_position"],
      "situational": true,
      "complexity": "moderate"
    },
    "Flood": {
      "category": "board_clear",
      "rulesText": "Destroy all minions.",
      "evaluationFunction": "const netLoss = myUnitCount - oppUnitCount; if (oppUnitCount === 0) return 0.0; if (oppUnitCount === 1 && myUnitCount === 0) return 2.0; if (netLoss >= 2) return 9.0; if (netLoss >= 0) return 6.0; if (netLoss >= -1) return 3.0; return 1.0;",
      "priority": "high when opponent has many units, low otherwise",
      "synergies": ["opponent_board_advantage", "defensive_position"],
      "antiSynergies": ["own_board_advantage", "few_opponent_units"],
      "situational": true,
      "complexity": "moderate"
    },
    "Highland Clansmen": {
      "category": "minion",
      "rulesText": "",
      "evaluationFunction": "return manaLeftover >= 0 ? 6.0 : 0.0;",
      "priority": "moderate - vanilla minion, play on curve",
      "synergies": [],
      "antiSynergies": [],
      "situational": false,
      "complexity": "simple"
    }
  }
}
```

---

## LLM Prompt Templates

### Base Prompt

```markdown
You are a Sorcery: Contested Realm card evaluator. Generate a JavaScript evaluation function for the following card.

**Card Name**: {cardName}
**Rules Text**: {rulesText}
**Cost**: {cost} mana
**Thresholds**: {thresholds}

The evaluation function receives a game context object with these properties:
- myLife, oppLife (number): Life totals
- myUnits, oppUnits (Unit[]): Units on board
- myUnitCount, oppUnitCount (number): Count of units
- myAttackingUnits (Unit[]): Units that can attack
- myTotalATK, oppTotalATK (number): Sum of ATK values
- myMana, manaLeftover (number): Available mana
- myHandSize, oppHandSize (number): Cards in hand
- turn (number): Current turn number
- lethalThreat, nearLethal, underPressure (boolean): Threat indicators

Return a single JavaScript expression (no function wrapper, no curly braces) that evaluates to a number 0.0-10.0 representing the card's situational value.

**Examples**:

Card: "You gain 7 life."
Output: return myLife < 10 ? 8.0 : (myLife < 15 ? 4.0 : 1.0);

Card: "Target attacking minion gets +3/+0 until end of turn."
Output: return myAttackingUnits.length > 0 ? 7.0 : 1.0;

Card: "Destroy all minions."
Output: return oppUnitCount > myUnitCount + 2 ? 9.0 : (oppUnitCount > myUnitCount ? 6.0 : 2.0);

Card: "3/3 Minion (no abilities)"
Output: return manaLeftover >= 0 ? 6.0 : 0.0;

Now generate the evaluation function for: {cardName}
```

### Category-Specific Prompts

#### Healing Cards

```markdown
This is a healing card. Consider:
- How much life is gained relative to starting life (20)?
- Is the player in danger of dying (life < 10)?
- Is the player at high life where healing is wasteful?

Score guidelines:
- 8-10: Player at critical life (< 10), prevents death
- 4-6: Player at moderate life (10-15), provides cushion
- 0-2: Player at high life (> 15), wasteful
```

#### Combat Tricks

```markdown
This is a combat trick (instant-speed buff/effect during combat). Consider:
- Are there attacking units? (If no, score very low 0-2)
- How many attacking units benefit?
- Does this create favorable trades or enable lethal?

Score guidelines:
- 7-9: Multiple attackers, creates favorable trades or lethal
- 4-6: Single attacker, improves outcome
- 0-2: No attackers, card is useless
```

#### Board Clears

```markdown
This is a board clear (destroys multiple permanents). Consider:
- Opponent unit count vs. own unit count
- Net advantage: (oppUnits - myUnits)
- Is this a defensive stabilizer or value trade?

Score guidelines:
- 8-10: Net advantage >= 3 (opponent has many more units)
- 6-8: Net advantage = 1-2 (favorable trade)
- 2-4: Net advantage = 0 (symmetric clear)
- 0-2: Net advantage < 0 (bot loses more units)
```

#### Draw Cards

```markdown
This is a card draw effect. Consider:
- Hand size relative to opponent
- Mana available to use drawn cards
- Turn number (card advantage matters more in long games)

Score guidelines:
- 6-8: Hand size < opponent's, mana available
- 4-6: Moderate card advantage gain
- 2-4: Hand already full, diminishing returns
```

---

## Implementation Phases

### Phase 2A: Foundation (T034-T035)
- Implement evaluation cache loader
- Generate evaluations for 50 common cards
- Validate generated functions compile

### Phase 2B: Integration (T036-T037)
- Integrate card evals into bot search
- Expand coverage to all 509 cards
- Handle edge cases and fallbacks

### Phase 2C: Enhancement (T038-T039)
- Add synergy detection
- Unit test evaluation functions
- Refine prompt templates

### Phase 2D: Validation (T040-T042)
- Self-play validation: card-aware vs. generic
- Documentation and production integration
- Monitoring and telemetry

---

## Synergy System

### Synergy Categories

```typescript
type SynergyTag =
  | 'attacking_units'      // Benefits from having attackers
  | 'defensive_position'   // Benefits when defending
  | 'low_life'            // Benefits when life is low
  | 'high_life'           // Benefits when life is high
  | 'opponent_units'      // Benefits from opponent having units
  | 'own_units'           // Benefits from having units
  | 'mana_available'      // Benefits from leftover mana
  | 'card_advantage'      // Benefits from card draw
  | 'combat_phase'        // Best during combat
  | 'main_phase'          // Best during main phase
  | 'threshold_X'         // Requires X element threshold
  ;
```

### Synergy Detection in Prompts

```markdown
Additionally, identify synergies:

**Synergies** (list tags): Cards/conditions this works well with
**Anti-Synergies** (list tags): Cards/conditions this works poorly with

Example:
Synergies: ["attacking_units", "combat_phase"]
Anti-Synergies: ["no_units", "defensive_position"]
```

---

## Validation Criteria

### Function Quality

Generated functions must:
1. **Compile**: Valid JavaScript, no syntax errors
2. **Safe**: No external calls, no infinite loops
3. **Bounded**: Always return 0.0-10.0
4. **Fast**: Execute in < 1ms
5. **Deterministic**: Same context → same score

### Test Cases

Each card evaluation should pass:
- **Sanity test**: Returns valid number in range
- **Situational test**: Returns different scores for different contexts
- **Edge case test**: Handles extreme values (life=0, units=0, etc.)

Example test:
```javascript
// Divine Healing
const lowLifeContext = { myLife: 5, oppLife: 15, ...defaults };
const highLifeContext = { myLife: 19, oppLife: 15, ...defaults };

const lowLifeScore = evaluateDivineHealing(lowLifeContext);   // Expect 7-9
const highLifeScore = evaluateDivineHealing(highLifeContext); // Expect 0-2

assert(lowLifeScore > highLifeScore); // Situational awareness
```

---

## Fallback Strategies

### When Card Evaluation Missing

If card not in cache:
1. **Category Heuristic**: Classify by card type
   - Minion: Base score = 6.0
   - Spell: Base score = 5.0
   - Relic: Base score = 5.0
2. **Cost Analysis**: Penalize if unaffordable
3. **Threshold Analysis**: Penalize if thresholds not met
4. **Generic Evaluation**: Use Phase 1 weights only

### When Evaluation Function Errors

If function throws exception:
1. **Log Warning**: Record error for telemetry
2. **Use Fallback**: Default to category heuristic
3. **Mark for Regeneration**: Flag card for re-evaluation

---

## Performance Considerations

### Caching Strategy

- **Memory**: Load all evaluations at bot startup (~500 cards × 1KB = 500KB)
- **Lookup**: O(1) Map lookup by card name
- **Hot Path**: Evaluation function calls during search (thousands per turn)

### Optimization

- **Pre-compile Functions**: Use `new Function()` at startup, not during search
- **Context Reuse**: Build context once per turn, pass to all evaluations
- **Lazy Loading**: Only evaluate cards in hand + playable candidates

### Expected Performance

- **Startup**: +500ms to load and compile evaluations
- **Per-Turn Overhead**: +5-10ms to evaluate 5-10 cards
- **Total Impact**: < 5% slowdown vs. Phase 1 generic evaluation

---

## Success Metrics (Phase 2)

### Quality Metrics

- **Coverage**: ≥ 80% of cards have specific evaluations
- **Accuracy**: ≥ 90% of evaluations make intuitive sense (manual review)
- **Safety**: 100% of functions compile and execute safely

### Play Quality Metrics

- **Win Rate**: Enhanced bot ≥ 65% vs. Phase 1 generic bot
- **Card Usage**: Cards played in appropriate situations ≥ 80% of time
- **Mana Efficiency**: Same or better than Phase 1 (≤ 4.0 waste)

### Example Improvements

| Scenario | Phase 1 (Generic) | Phase 2 (Card-Aware) |
|----------|-------------------|----------------------|
| Divine Healing at 20 life | Plays (wastes card) | Doesn't play ✅ |
| Divine Healing at 5 life | May not play | Plays (prevents death) ✅ |
| Overpower with no attackers | Plays (wastes mana) | Doesn't play ✅ |
| Overpower with 3 attackers | May not prioritize | Prioritizes (combat trick) ✅ |
| Flood vs. 1 unit | Plays (inefficient) | Doesn't play ✅ |
| Flood vs. 5 units | May not prioritize | Prioritizes (board clear) ✅ |

---

## References

- **Phase 1 Evaluation**: `bots/engine/index.js` lines 695-921 (evalFeatures, extractFeatures)
- **Champion Theta**: `data/bots/params/champion.json`
- **Card Database**: Prisma `Card`, `CardSetMetadata` tables
- **Rulebook**: `reference/SorceryRulebook.pdf`

---

**Status**: Design Complete, Ready for Implementation (T034)
**Next Step**: Implement card evaluation cache loader and context builder
