# Design: Refine Bot Game Understanding

## Problem Analysis

### Root Causes Identified
1. **Zero-Variance Evaluation**: All moves score exactly 0.0 because features extract minimal meaningful signals (life_my=0, life_opp=0, threats_my=0, atk_my=0, etc.). The evaluation function `evalFeatures()` returns 0 for all candidates.

2. **No Cost/Threshold Enforcement**: The bot generates candidates without validating:
   - Mana costs required to play cards
   - Threshold requirements (e.g., 2 Earth for a 2E card)
   - Whether sites/mana providers are tapped or untapped

3. **Candidate Generation Bias**: `generateCandidates()` prioritizes site-playing sequences heavily. Since all moves score 0, the bot randomly selects among candidates, and ~70% of candidates involve playing sites.

4. **Missing Game Flow Logic**: No representation of:
   - Turn phases (Start → Main → Combat → End)
   - Mana pool accumulation and spending
   - Active player priority and timing windows
   - Win condition detection (Avatar at 0 life → death's door → death blow)

### Evidence from Training Logs
- `rootEval: 0` on every turn
- `candidates: [{"score":0,"refined":0}, ...]` — all zeros
- `chosenCards: {"playedSite": {...}}` — only sites played, never minions/spells
- `mana_wasted: 14` on later turns — bot accumulates 14+ sites but never spends mana

## Architectural Decisions

### 1. Explicit Game State Model
Create structured state representation beyond raw server patches:
```js
{
  // Resource tracking
  resources: {
    p1: { manaAvailable: 5, manaSpent: 2, sitesUntapped: 3, sitesTapped: 2 },
    p2: { ... }
  },
  // Threshold accumulation
  thresholds: {
    p1: { air: 1, water: 0, earth: 3, fire: 1 },
    p2: { ... }
  },
  // Turn structure
  turnState: { currentPlayer: 1, phase: 'Main', turnNumber: 5 },
  // Win conditions
  avatarStatus: {
    p1: { life: 20, atDeathsDoor: false },
    p2: { life: 0, atDeathsDoor: true }
  }
}
```

**Rationale**: Server state is optimized for network transmission, not bot reasoning. The bot needs derived views (available mana, playable cards, legal targets).

### 2. Cost & Threshold Validation Layer
Before generating candidates, filter cards by:
- **Mana Cost**: Count untapped sites + untapped mana providers (e.g., Blacksmith Family); compare to card's generic cost.
- **Threshold Requirements**: Match accumulated thresholds (from sites/permanents) against card's threshold icons.
- **Timing Restrictions**: Only generate "play minion" candidates during Main phase when active player.

**Implementation**: New functions in `bots/engine/index.js`:
```js
function canAffordCard(state, seat, card) {
  const available = countUntappedMana(state, seat);
  const cost = getCardManaCost(card);
  const thresholds = countThresholdsForSeat(state, seat);
  const required = getCardThresholds(card);
  return available >= cost && meetsThresholds(thresholds, required);
}

function generateLegalPlayCandidates(state, seat) {
  const hand = getZones(state, seat).hand;
  return hand.filter(c => canAffordCard(state, seat, c))
             .map(c => buildPlayCardPatch(state, seat, c));
}
```

**Rationale**: Eliminates illegal moves at source; prevents "play 5-cost card with 0 mana" from ever being considered.

### 3. Enhanced Evaluation Function
Replace zero-signal features with:

**Strategic Signals**:
- **Board Development**: Count permanents deployed (minions, relics, structures). Weight: +0.8 per permanent.
- **Mana Efficiency**: Ratio of mana spent to mana available. Penalty for wasted mana: -0.5 per untapped site after turn 3.
- **Tempo**: Turns where meaningful actions taken vs. passed. Weight: +1.0 for "did something impactful".
- **Threat Deployment**: Units with ATK > 0 on board. Weight: +0.6 per ATK point.
- **Life Pressure**: Damage potential (sum of ATK of untapped units in range of opponent). Weight: +1.2.
- **Card Advantage**: Hand size delta over time. Weight: +0.4 per card differential.

**Tactical Signals**:
- **Lethal Detection**: If opponent at death's door and we can deal 1+ damage, score +10.0.
- **Defend Lethal**: If opponent threatens lethal next turn, prioritize blockers/removal. Score: +5.0 for blocking moves.

**Anti-Patterns**:
- **Site Spam Penalty**: If sites > 6 and no units played this turn, score -2.0.
- **Passing With Resources**: If mana available and playable cards in hand, passing scores -1.5.

**Rationale**: Zero-variance is eliminated because board states with units deployed, mana spent, and threats active will score higher than "play another site and pass."

### 4. Strategic Primitives Library
Encode Sorcery fundamentals as composable weights in theta:

- **Establish Mana Base** (turns 1-3): Prioritize playing sites to reach 3-4 mana. Weight: high early, decays after turn 4.
- **Deploy Threats** (turns 3-6): Prioritize playing minions with ATK. Weight: increases after mana base established.
- **Apply Pressure** (mid-game): Move units toward opponent Avatar, attack when advantageous. Weight: scales with board state.
- **Defend Against Lethal** (reactive): Detect opponent's lethal threats and prioritize blockers/removal. Weight: spikes when threatened.

**Implementation**: Conditional feature extraction based on turn number and game state:
```js
function extractStrategicFeatures(state, seat) {
  const turn = state.turnState.turnNumber;
  const ownedSites = countOwnedManaSites(state, seat);

  if (turn <= 3 && ownedSites < 3) {
    return { phase: 'establish_mana', priority: 'play_site', weight_modifier: 2.0 };
  } else if (ownedSites >= 3 && countThreats(state, seat) === 0) {
    return { phase: 'deploy_threats', priority: 'play_minion', weight_modifier: 1.5 };
  }
  // ... other phases
}
```

**Rationale**: Tutorial-quality play requires stage-appropriate actions. Early-game site spam is correct; turn-10 site spam is pathological. Conditional weights encode this.

### 5. Candidate Pruning & Prioritization
Rewrite `generateCandidates()` to:
1. **Filter by legality first**: Only generate candidates for cards that pass `canAffordCard()`.
2. **Prioritize impactful sequences**:
   - If mana available and units in hand → prioritize "play unit" candidates.
   - If no units playable and sites < 4 → allow "play site" candidates.
   - If sites >= 6 and no units → deprioritize "play site", boost "draw spell" or "pass and evaluate board."
3. **Limit branching**: Cap site-playing candidates to 2-3 per turn; expand unit-playing candidates to 5-8.

**Before** (current code):
```js
// 70% of candidates are site-playing sequences
if (allowSiteOnly) {
  if (drawAtlas && siteAfterDrawA) moves.push(...);
  if (drawSpell && siteAfterDrawS) moves.push(...);
  if (siteBase) moves.push(...);
}
```

**After** (refined):
```js
// Prioritize units when mana available
const playableUnits = filterPlayableUnits(state, seat);
if (playableUnits.length > 0) {
  // Generate 5-8 unit-playing sequences
  for (const unit of playableUnits.slice(0, 5)) {
    moves.push(buildPlayUnitPatch(state, seat, unit));
  }
}
// Sites only if mana base incomplete
if (ownedSites < 4 && sitesInHand.length > 0) {
  moves.push(playSitePatch(state, seat));
}
```

**Rationale**: If evaluation is fixed but candidates still biased, bot will still spam sites. Candidate distribution must reflect strategic priorities.

### 6. Diagnostic Telemetry
Extend JSONL logs to include:
```json
{
  "turnIndex": 10,
  "evaluationBreakdown": {
    "board_development": 3.2,
    "mana_efficiency": -1.5,
    "threat_deployment": 4.8,
    "site_spam_penalty": -2.0,
    "total": 4.5
  },
  "candidateDetails": [
    { "action": "play_unit_Blacksmith_Family", "score": 4.5, "legalityCheck": "PASS" },
    { "action": "play_site_Valley", "score": -0.3, "legalityCheck": "PASS" },
    { "action": "pass", "score": -1.5, "legalityCheck": "PASS" }
  ],
  "chosenAction": "play_unit_Blacksmith_Family",
  "reason": "highest_score"
}
```

**Rationale**: If bot regresses to site-spam in future, we can inspect logs to see "all candidates scored 0 again" vs. "evaluation worked but candidate generation biased."

### 7. Rulebook Integration
Map `reference/SorceryRulesExtracted.csv` categories to bot logic:

- **PLACEMENT rules** → `playSitePatch()` validates "first site at Avatar pos" and "adjacent to owned site."
- **COST rules** → `canAffordCard()` enforces mana and threshold checks.
- **TIMING rules** → `generateCandidates()` only generates Main-phase actions during Main phase.
- **COMBAT rules** → Movement/attack candidates check orthogonal adjacency and enemy presence.
- **WINNING THE GAME** → Win condition detection: Avatar at 0 life → death's door → any damage = death blow.

**Phase-In Strategy**:
1. **v1 (this change)**: Core mana, thresholds, Main-phase plays, basic win conditions.
2. **v2 (future)**: Combat math (damage assignment, blocking), regions (void, subsurface, water).
3. **v3 (future)**: Complex timing (instants, triggered abilities, stack resolution).

**Rationale**: Full rules coverage is a multi-month effort. Prioritize fixing site-spam pathology first (requires mana/threshold enforcement), then expand.

## Trade-offs

### Complexity vs. Correctness
- **Trade-off**: Explicit state model adds ~200 lines of code; increases maintenance surface.
- **Decision**: Accept complexity. Zero-signal evaluation is unfixable without structured state.

### Performance vs. Legality
- **Trade-off**: Filtering candidates by legality (mana checks, threshold checks) adds ~5-10ms per turn.
- **Decision**: Accept cost. Soft budget is 60ms; spending 10ms to eliminate illegal moves is worthwhile.

### Hand-Tuned Weights vs. Learned Weights
- **Trade-off**: Initial theta will be hand-tuned (e.g., `w_board_development: 0.8`). Self-play training may find better values, but requires functional baseline first.
- **Decision**: Hand-tune for v1 to achieve "competent play," then use self-play to optimize. Training on a broken evaluation function (current state) is futile.

## Success Criteria
1. **Training logs show non-zero evaluation**: `rootEval` varies between -5.0 and +8.0 across turns, not 0.0 every turn.
2. **Bot plays units when mana available**: ≥60% of turns with 3+ mana result in a minion/spell played, not a site.
3. **Mana efficiency improves**: Average `mana_wasted` in turn 5+ drops from 14 to <3.
4. **Self-play matches reach win conditions**: Games end with "Avatar defeated" within 20 turns, not infinite site-spam stalemates.
5. **Tutorial-quality play**: Human observer watching bot vs. bot can identify "establishing mana base → deploying threats → attacking" sequence.

## Open Questions
1. **Mulligan logic**: Current bot doesn't mulligan. Should v1 include mulligan heuristics (e.g., keep if 2+ sites and 1+ spell)?
2. **Combat math**: Should v1 include "attack with favorable trades" logic, or defer to v2?
3. **Rule ambiguity resolution**: When server state contradicts rulebook (e.g., server allows illegal move), which is authoritative for bot?

**Proposed Answers**:
1. Defer mulligan to v2; focus on in-game play first.
2. Include basic combat (attack if lethal; attack if unopposed) in v1; defer complex blocking to v2.
3. Server is authoritative for "what happened"; rulebook is authoritative for "what bot should attempt." Bot validates before generating candidates, but accepts server's final state.
