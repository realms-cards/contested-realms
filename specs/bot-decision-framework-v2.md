# Bot Decision Framework v2 - Self-Correcting Strategy

## Problem Statement

The current bot uses weighted scoring for ALL decisions, but many game situations have objectively correct plays that don't need scoring. Additionally, the bot lacks:
- Threshold analysis for hand cards
- Intelligent draw selection (site vs spell)
- Proper site-targeting attack strategy
- Learning from production replays

## Core Design Principles

### 1. Deterministic Rules Before Scoring

Some plays are so obviously correct they don't need evaluation:

```
TURN 1:
  IF no_sites THEN play_site_under_avatar (100% - no alternatives)

TURN 2-3:
  IF sites < 3 AND has_site_in_hand THEN play_site (95%+ correct)
  EXCEPTION: Can cast 1-cost minion with existing threshold

TURN 4:
  IF sites < 4 AND missing_threshold_for_hand_cards THEN draw_site
  IF sites >= 4 AND has_playable_cards THEN play_card
  IF sites < 4 AND all_hand_cards_playable THEN consider_draw_spell
```

### 2. Threshold Analysis System

Before scoring, analyze what the hand needs:

```javascript
function analyzeThresholdNeeds(hand, currentThresholds) {
  const needs = { air: 0, water: 0, earth: 0, fire: 0 };

  for (const card of hand) {
    if (!canMeetThreshold(card, currentThresholds)) {
      // Track what we're missing
      for (const [element, required] of Object.entries(card.threshold)) {
        const missing = required - (currentThresholds[element] || 0);
        if (missing > 0) needs[element] = Math.max(needs[element], missing);
      }
    }
  }

  return {
    hasMissingThresholds: Object.values(needs).some(v => v > 0),
    missingElements: needs,
    shouldDrawSite: Object.values(needs).some(v => v > 0),
  };
}
```

### 3. Draw Selection Logic

The key insight: **drawing a site when missing threshold is almost always correct**.

```javascript
function selectDrawSource(state, seat, thresholdAnalysis) {
  const sites = countOwnedSites(state, seat);
  const turn = getTurnNumber(state);

  // Turn 4 site draw rule: reach 4 mana for playability
  if (turn === 4 && sites < 4) {
    return "atlas"; // Draw site
  }

  // Missing threshold for cards in hand
  if (thresholdAnalysis.hasMissingThresholds && sites < 6) {
    return "atlas"; // Draw site to fix threshold
  }

  // Have enough mana, looking for action
  if (sites >= 4 && !thresholdAnalysis.hasMissingThresholds) {
    return "spellbook"; // Draw spell for options
  }

  // Default: prefer site until 5 mana
  return sites < 5 ? "atlas" : "spellbook";
}
```

### 4. Attack Priority System

The offensive strategy should follow this priority:

```
ATTACK PRIORITY (descending):
1. Undefended sites (mana denial - very high value)
2. Sites with low-HP defenders (favorable trades)
3. Units blocking path to avatar
4. Avatar (when death blow possible or path is clear)

KEY INSIGHT: Hitting sites early denies opponent mana,
             which compounds over the game.
```

```javascript
function scoreAttackTarget(attacker, target, state) {
  let score = 0;

  if (target.type === "site") {
    score += 5.0; // Base site value

    if (!hasDefender(target.position, state)) {
      score += 3.0; // Undefended = free mana denial
    }

    // Early game site destruction is worth more
    const turn = getTurnNumber(state);
    if (turn <= 6) {
      score += 2.0; // Mana denial compounds
    }
  }

  if (target.type === "unit") {
    score += 2.0;
    if (isBlockingAvatarPath(target, state)) {
      score += 1.5;
    }
  }

  if (target.type === "avatar") {
    if (canDealLethal(attacker, target, state)) {
      score += 100.0; // ALWAYS take lethal
    } else {
      score += 1.0; // Chip damage, lower priority than sites
    }
  }

  return score;
}
```

### 5. Positioning Evaluation

Units should be placed with purpose:

```javascript
function evaluateUnitPlacement(position, state, seat) {
  let score = 0;
  const oppAvatar = getOpponentAvatarPos(state, seat);
  const oppSites = getOpponentSites(state, seat);

  // Can this position attack a site next turn?
  for (const site of oppSites) {
    if (isAdjacentOrCanReach(position, site)) {
      score += 3.0; // Can threaten site
    }
  }

  // Distance to opponent avatar
  const dist = manhattan(position, oppAvatar);
  if (dist <= 2) {
    score += 2.0; // Threatening avatar
  } else if (dist <= 3) {
    score += 1.0; // Close enough to matter
  }

  // Don't clump units (vulnerable to AoE)
  const friendlyNearby = countFriendlyUnitsNear(position, state, seat);
  if (friendlyNearby >= 2) {
    score -= 0.5; // AoE risk
  }

  return score;
}
```

## Self-Correcting Mechanism

### Phase 1: Replay Pattern Extraction

Extract common patterns from production replays:

```javascript
async function extractPatternsFromReplays(prisma) {
  const replays = await loadProductionReplays(prisma, { limit: 500 });

  const patterns = {
    turn1Actions: new Map(),  // What do winners play turn 1?
    turn2Actions: new Map(),
    turn3Actions: new Map(),
    turn4Actions: new Map(),
    siteCountByTurn: [],      // Average sites at each turn for winners
    attackTargets: new Map(), // What do winners attack?
    winningActionSequences: [],
  };

  for (const replay of replays) {
    const winner = replay.winner;
    const winnerActions = replay.actions.filter(a => a.playerId === winner);

    // Track turn-by-turn patterns
    for (const action of winnerActions) {
      const turn = action.turnNumber;
      const actionType = categorizeAction(action);

      if (turn <= 4) {
        const key = `turn${turn}Actions`;
        patterns[key].set(actionType, (patterns[key].get(actionType) || 0) + 1);
      }
    }

    // Track site counts at each turn for winners
    trackSiteProgression(replay, winner, patterns);

    // Track attack target preferences
    trackAttackPatterns(replay, winner, patterns);
  }

  return patterns;
}
```

### Phase 2: Pattern-Based Adjustment

Use extracted patterns to adjust weights:

```javascript
function adjustWeightsFromPatterns(theta, patterns) {
  // If winners play sites 95%+ on turn 1-3, increase site priority even more
  const turn1SitePercent = patterns.turn1Actions.get("play_site") / patterns.totalTurn1Actions;
  if (turn1SitePercent > 0.95) {
    theta.strategic_modifiers.establish_mana_base.modifiers.play_site = 10.0;
  }

  // If winners attack sites more than avatars early, boost site targeting
  const earlyAttackSitePercent = patterns.attackTargets.get("site_early") / patterns.totalEarlyAttacks;
  if (earlyAttackSitePercent > 0.6) {
    theta.weights.w_attack_site_priority = 3.0; // New weight
  }

  // Track optimal site count by turn
  const avgSitesTurn4 = patterns.siteCountByTurn[4];
  if (avgSitesTurn4 >= 3.8) {
    // Winners have ~4 sites by turn 4, reinforce site-first strategy
    theta.weights.w_sites = Math.max(theta.weights.w_sites, 6.0);
  }

  return theta;
}
```

### Phase 3: Continuous Validation

Run bot matches and compare to production patterns:

```javascript
function validateBotBehavior(botLogs, productionPatterns) {
  const deviations = [];

  // Check turn 1 compliance
  const botTurn1Site = botLogs.filter(l => l.turn === 1 && l.action === "play_site").length;
  const botTurn1Total = botLogs.filter(l => l.turn === 1).length;
  const botTurn1Rate = botTurn1Site / botTurn1Total;

  if (botTurn1Rate < productionPatterns.turn1SiteRate - 0.1) {
    deviations.push({
      type: "turn1_site_underplay",
      expected: productionPatterns.turn1SiteRate,
      actual: botTurn1Rate,
      severity: "high",
    });
  }

  // Check site count progression
  for (let turn = 1; turn <= 6; turn++) {
    const botAvgSites = avgSitesAtTurn(botLogs, turn);
    const prodAvgSites = productionPatterns.siteCountByTurn[turn];

    if (botAvgSites < prodAvgSites - 0.5) {
      deviations.push({
        type: "site_development_lag",
        turn,
        expected: prodAvgSites,
        actual: botAvgSites,
        severity: turn <= 3 ? "high" : "medium",
      });
    }
  }

  return deviations;
}
```

## Implementation Plan

### Immediate Changes (High Impact)

1. **Deterministic Turn 1-3 Rules**
   - Add hard rules before scoring
   - Turn 1: Always play site (bypass scoring entirely)
   - Turn 2-3: Strong site preference unless 1-cost creature playable

2. **Threshold Analysis**
   - Analyze hand for threshold requirements
   - Feed into draw selection
   - Adjust card play priority

3. **Draw Selection Logic**
   - Implement `selectDrawSource()` function
   - Consider sites vs spells based on needs

4. **Attack Target Priority**
   - Sites > Blockers > Avatar (unless lethal)
   - Weight site attacks higher in early-mid game

### Medium-Term (Learning)

5. **Replay Pattern Extraction**
   - Script to analyze production replays
   - Extract winning patterns by turn
   - Identify common action sequences

6. **Self-Correcting Weights**
   - Compare bot behavior to production patterns
   - Automatically flag deviations
   - Adjust weights toward winning patterns

### Quality Metrics

The bot should achieve:
- **Turn 1 site rate**: 100% (deterministic)
- **Turn 4 site count**: Average 3.5+ sites
- **Site attack ratio**: 60%+ of early attacks target sites
- **Threshold efficiency**: 80%+ of drawn sites fix a threshold need
- **Game length**: 15-25 turns (not stalled, not too fast)

## Code Changes Required

### 1. Add `deterministic-rules.js` module

```javascript
// Bypass scoring for obvious plays
function getDeterministicAction(state, seat) {
  const turn = getTurnNumber(state);
  const sites = countOwnedSites(state, seat);
  const hand = getHand(state, seat);

  // Turn 1: ALWAYS play site
  if (turn === 1 && sites === 0 && hasSiteInHand(hand)) {
    return { type: "play_site", position: getAvatarPos(state, seat) };
  }

  // Turn 2-3: Play site unless can cast 1-cost
  if (turn <= 3 && sites < 3) {
    const oneCost = findPlayableOneCost(hand, state, seat);
    if (!oneCost && hasSiteInHand(hand)) {
      return { type: "play_site", position: findBestSitePosition(state, seat) };
    }
  }

  return null; // Fall through to normal scoring
}
```

### 2. Modify `search()` to check deterministic rules first

```javascript
function search(state, seat, theta, rng, options) {
  // NEW: Check for deterministic plays first
  const deterministicAction = getDeterministicAction(state, seat);
  if (deterministicAction) {
    return createPatchFromAction(deterministicAction, state, seat);
  }

  // Existing scoring logic...
}
```

### 3. Add `threshold-analysis.js` module

New module for analyzing hand threshold requirements.

### 4. Modify candidate generation for attacks

Prioritize site attacks in `generateCandidates()`.

### 5. Create `scripts/training/analyze-replays.js`

Script to extract patterns from production replays.
