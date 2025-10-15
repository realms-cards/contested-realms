# Bot Engine - Sorcery AI

Beam search-based AI engine for playing Sorcery: Contested Realm. Implements rule enforcement, strategic evaluation, and phase-based decision making.

## Overview

The bot engine uses beam search with heuristic evaluation to select moves. It operates in three modes:
- **Train Mode**: Full search with telemetry logging for training
- **Evaluate Mode**: Deterministic play (no exploration) for competitive matches
- **Tutorial Mode**: Can be configured with reduced strength for teaching

**Current Version**: `refined/v3` - "Hand-tuned weights with mana/threshold enforcement + phase-based strategy"

**Status**: Phase 1 Complete - Core rules and strategic primitives implemented

---

## Architecture

### Core Components

1. **State Management** (`buildGameStateModel`)
   - Extracts structured game state from server patches
   - Resources: mana available/spent, sites untapped/tapped
   - Thresholds: elemental requirements (air/water/earth/fire)
   - Turn state: current player, phase, turn number
   - Avatar status: life totals, death's door

2. **Rule Enforcement** (`canAffordCard`, `generateCandidates`)
   - **Cost Validation**: Mana cost <= available mana
   - **Threshold Validation**: Card thresholds met by owned sites
   - **Placement Rules**: First site at Avatar, subsequent sites adjacent
   - **Unit Requirement**: Cannot play units with 0 sites on board
   - **Phase Gating**: Permanents only during Main phase

3. **Candidate Generation** (`generateCandidates`)
   - **Units**: Up to 8 playable units (filtered by `canAffordCard`)
   - **Sites**: Up to 3 sites (deprioritized when >= 6 owned)
   - **Movement/Combat**: Up to 4 moves/attacks (orthogonal only)
   - **Draw/Pass**: Always included
   - **Branching Factor**: Capped at 16 total candidates

4. **Feature Extraction** (`extractFeatures`)
   - Board state: life, threats, board development
   - Resources: mana efficiency, waste, on-curve
   - Combat: threat deployment, life pressure, lethal detection
   - Anti-patterns: site spam, wasted resources

5. **Strategic Evaluation** (`evalFeatures`, `getStrategicModifiers`)
   - Weighted linear combination of features
   - Phase-based modifiers adjust priorities:
     - **Early game (turns 1-3)**: Prioritize sites (2.0x)
     - **Mid game (sites >= 3)**: Prioritize units (1.5x)
     - **Late game (opp life < 15)**: Prioritize attacks (1.2x)
     - **Defensive**: Prioritize blockers when threatened

6. **Search Algorithm** (`search`)
   - Beam search with configurable width/depth
   - Forward lookahead with state simulation
   - Evaluation at leaf nodes
   - Best-first candidate selection

---

## Evaluation Features

### Life & Lethal
- `w_life` (0.8): Own life total
- `w_lethal_now` (10.0): Immediate win available
- `w_opp_lethal_next` (-4.5): Opponent can win next turn

### Board Development _(T004)_
- `w_board_development` (0.8): Count of owned permanents
- Encourages playing units/relics/structures

### Mana Efficiency _(T005)_
- `w_mana_efficiency` (0.7): Reward spending available mana
- `w_mana_efficiency_waste` (-0.5): Penalize wasted mana
- `w_mana_waste` (-0.7): Direct penalty for unspent mana
- `w_sites` (2.0): Reward building mana base
- `w_providers` (0.5): Reward mana-providing units

### Threat Deployment _(T006)_
- `w_threat_deployment` (0.6): Sum of ATK from untapped units
- Encourages board presence with attacking potential

### Life Pressure _(T007)_
- `w_life_pressure` (1.2): ATK of units adjacent to opponent Avatar
- Prioritizes positioning for damage

### Anti-Patterns _(T008)_
- `w_site_spam_penalty` (-2.0): Penalize playing 7th+ site
- `w_wasted_resources` (-1.5): Penalize passing with playable cards and >= 3 mana

### Other Features
- **Combat Stats**: ATK, HP, threats
- **Card Advantage**: Hand size, draw potential
- **Synergy**: Engine/combo detection, tribal count
- **Risk**: Sweeper vulnerability, win-more detection
- **Position**: Board advance toward opponent

---

## Strategic Primitives

### Phase-Based Modifiers _(T010, T011)_

The bot adapts strategy based on game state using action type multipliers:

```javascript
getStrategicModifiers(state, seat, theta) {
  // Establish mana base (turns 1-3, sites < 3)
  if (turnNumber <= 3 && ownedSites < 3) {
    return { play_site: 2.0, play_unit: 0.5 };
  }

  // Deploy threats (sites >= 3, no board)
  if (ownedSites >= 3 && boardDevelopment === 0) {
    return { play_minion: 1.5, play_unit: 1.5, play_site: 0.5 };
  }

  // Apply pressure (board developed, opp life low)
  if (boardDevelopment > 0 && oppLife < 15) {
    return { attack: 1.2, play_site: 0.3 };
  }

  // Defend against lethal
  if (oppThreatDeploy >= myLife) {
    return { play_unit: 2.0, attack: 0.5 };
  }
}
```

---

## Configuration

### Theta Structure

Theta files are JSON objects with:
- **meta**: ID, description, version
- **search**: beamWidth, maxDepth, budgetMs, gamma
- **exploration**: epsilon_root (0 = deterministic, >0 = stochastic)
- **weights**: Feature weights (w_life, w_mana_efficiency, etc.)
- **constraints**: Eval clamping, fallback behavior

**Example**: See `data/bots/params/champion.json`

### Loading Theta

```javascript
// Default (embedded in engine)
const theta = loadTheta();

// From file
const thetaObj = JSON.parse(fs.readFileSync('data/bots/params/champion.json', 'utf8'));
const engine = new BotClient({ theta: thetaObj });
```

### Adjusting Difficulty

**Easier Bot (Tutorial Mode)**:
```javascript
{
  search: { beamWidth: 4, maxDepth: 2, budgetMs: 30 },
  exploration: { epsilon_root: 0.2 }, // 20% random moves
  weights: { /* reduce threat_deployment, life_pressure */ }
}
```

**Harder Bot (Competitive)**:
```javascript
{
  search: { beamWidth: 16, maxDepth: 4, budgetMs: 120 },
  exploration: { epsilon_root: 0 }, // Fully deterministic
  weights: { /* full refined weights */ }
}
```

---

## Usage

### Starting a Bot Match

```bash
# Self-play with default theta
node scripts/training/selfplay.js \
  --server http://localhost:3010 \
  --rounds 1 \
  --duration 90

# With custom theta
node scripts/training/selfplay.js \
  --thetaA data/bots/params/champion.json \
  --thetaB data/bots/params/experimental.json

# With smoke test validation
node scripts/training/selfplay.js \
  --smoke-test \
  --rounds 10
```

### Enabling Bots in Development

```bash
# .env.local
NEXT_PUBLIC_CPU_BOTS_ENABLED=true
CPU_AI_ENGINE_MODE=evaluate  # or 'train'
```

### Analyzing Bot Performance

```bash
# Regression detection
node scripts/training/analyze-logs.js \
  --detect-regressions \
  logs/training/20251015/*.jsonl

# Smoke test (functional play validation)
node scripts/training/smoke-test.js \
  logs/training/20251015/*.jsonl

# Champion gating (quality threshold)
node scripts/training/champion-gating.js \
  logs/training/candidate/*.jsonl
```

---

## Telemetry

Bots log JSONL telemetry per turn when in `train` mode:

```json
{
  "matchId": "match_abc123",
  "turnIndex": 5,
  "thetaId": "refined/v3",
  "rootEval": 8.5,
  "rootFeatures": {
    "life_my": 18,
    "mana_avail": 4,
    "board_development": 2,
    "threat_deployment": 6,
    "life_pressure": 3
  },
  "evaluationBreakdown": {
    "board_development": 1.6,
    "mana_efficiency": 2.1,
    "threat_deployment": 3.6,
    "life_pressure": 3.6,
    "total": 8.5
  },
  "candidateDetails": [
    { "action": "play_unit:Knight", "score": 7.2, "isLegal": true },
    { "action": "attack:Knight->Avatar", "score": 8.5, "isLegal": true },
    { "action": "pass", "score": 3.1, "isLegal": true }
  ],
  "filteredCandidates": {
    "totalUnitsInHand": 3,
    "filteredUnaffordable": 2,
    "playableUnits": 1
  },
  "chosen": { "score": 8.5 },
  "nodes": 120,
  "depth": 3,
  "timeMs": 15
}
```

### Log Analysis

- **rootEval**: Final evaluation score for chosen action
- **evaluationBreakdown**: Per-feature contributions
- **candidateDetails**: All considered actions with scores
- **filteredCandidates**: Illegal moves pruned by rules

---

## Troubleshooting

### Bot Makes No Moves (All Pass)

**Symptoms**: Bot repeatedly passes, even with mana and playable cards

**Causes**:
1. **Zero-variance theta**: All weights = 0, all moves scored equally
2. **Missing cost data**: Bot thinks all cards cost 0, server rejects plays
3. **Broken `canAffordCard`**: All moves filtered as unaffordable

**Diagnosis**:
```bash
node scripts/training/analyze-logs.js --detect-regressions logs/training/*.jsonl
```

Look for:
- `rootEval` variance < 0.1 (zero-variance regression)
- High `cost_unpaid` error rate (missing cost data or broken validation)
- `filteredUnaffordable` count == `totalUnitsInHand` (all moves filtered)

**Fixes**:
- Verify theta weights are non-zero: `cat data/bots/params/champion.json`
- Check server enriches cards with cost: `server/index.js` lines 27-138
- Validate `canAffordCard` logic: `bots/engine/index.js` lines 638-665

---

### Bot Only Plays Sites (Site Spam)

**Symptoms**: Bot plays 8-10 sites, never plays units

**Causes**:
1. **Site weight too high**: `w_sites` >> other weights
2. **Missing site-spam penalty**: `w_site_spam_penalty` not applied
3. **Unit candidates not generated**: `generateCandidates` not filtering units

**Diagnosis**:
```bash
node scripts/training/analyze-logs.js --detect-regressions logs/training/*.jsonl
```

Look for:
- `sitePlaysPercent` > 80% in turns 5-15
- `site_spam` regression detected

**Fixes**:
- Reduce `w_sites` to 2.0 or lower
- Ensure `w_site_spam_penalty` = -2.0 applied when sites >= 6
- Verify unit candidates generated: check `candidateDetails` includes "play_unit" actions

---

### Bot Cannot Win Games (Stalemate)

**Symptoms**: Games go 50+ turns, bot never reduces opponent to 0 life

**Causes**:
1. **No attack candidates generated**: Movement/combat logic broken
2. **Life pressure not weighted**: `w_life_pressure` too low
3. **Defensive strategy**: Bot prioritizes survival over aggression

**Diagnosis**:
```bash
node scripts/training/smoke-test.js logs/training/*.jsonl
```

Look for:
- Average game length > 30 turns
- `meaningfulActionsPercent` < 60%

**Fixes**:
- Increase `w_life_pressure` to 1.2+
- Increase `w_threat_deployment` to 0.6+
- Verify attack candidates generated: check `candidateDetails` includes "attack" actions
- Adjust strategic modifiers: increase attack multiplier in late game

---

## Known Limitations (Phase 1)

The following features are **NOT implemented** in v1:

- ❌ **Regions**: Bot ignores regional effects
- ❌ **Instants**: Bot only plays during Main phase
- ❌ **Triggered Abilities**: Bot doesn't model ETB/trigger effects
- ❌ **Activated Abilities**: Bot cannot use tap abilities or mana sinks
- ❌ **Keywords** (partial): Some keywords recognized, not all evaluated
- ❌ **Stack Mechanics**: Bot assumes immediate resolution
- ❌ **Graveyard Interactions**: Bot doesn't track graveyard state
- ❌ **Deck Construction**: Bot plays random precons, no optimization

These will be addressed in **Phase 2: Advanced Mechanics & Card Understanding**.

---

## Testing

### Unit Tests

```bash
# Rule enforcement
node tests/bot/bot-rules-validation.js

# Regression detection
node scripts/training/test-regression-detection.js
```

### Integration Tests

```bash
# Run 10-match smoke test
node scripts/training/selfplay.js --smoke-test --rounds 10 --duration 60

# Validate champion candidate (100+ matches)
node scripts/training/champion-gating.js logs/training/candidate/*.jsonl
```

---

## References

- **Implementation**: `bots/engine/index.js`
- **Rulebook Mapping**: `reference/bot-rulebook-mapping.md`
- **Testing**: `tests/bot/bot-rules-validation.js`
- **Training Scripts**: `scripts/training/`
- **Champion Theta**: `data/bots/params/champion.json`

---

**Last Updated**: 2025-10-15
**Version**: refined/v3 (Phase 1 Complete)
