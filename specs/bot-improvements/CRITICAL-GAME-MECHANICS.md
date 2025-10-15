# Critical Bot Game Mechanics Gaps

**Status**: CRITICAL - Bot Missing Fundamental Gameplay
**Priority**: P0 - Blocks all AI improvements
**Created**: 2025-10-15

---

## Problem Statement

The bot AI is missing core Sorcery: Contested Realm gameplay mechanics:

### 1. **No Spell Casting** (Only Permanents)
**Current Behavior**: Bot only plays permanents (minions, artifacts, relics)
**Missing**: Cannot cast instant spells, sorceries, or auras
**Impact**: 30-40% of cards are unplayable by bot

**Evidence** (`bots/engine/index.js:280-304`):
```javascript
const isPermanent = (c) => {
  const t = String(c?.type || '').toLowerCase();
  if (t.includes('site')) return false;
  if (t.includes('avatar')) return false;
  if (t.includes('minion')) return true;
  if (t.includes('unit')) return true;
  if (t.includes('relic')) return true;
  if (t.includes('structure')) return true;
  if (t.includes('artifact')) return true;
  // Fallback: treat unknown non-site, non-avatar as permanent
  return true;
};
```

**Missing Card Types**:
- `Magic` (instant spells) - e.g., Lightning Bolt, Blink, Chain Lightning
- `Sorcery` (slow spells) - e.g., Earthquake, Craterize
- `Aura` / `Enchantment` - e.g., Crusade, Entangle Terrain, Rest in Peace

### 2. **No Site Attacks** (Only Avatar Damage)
**Current Behavior**: Bot only moves toward and attacks opponent avatar
**Missing**: Cannot attack opponent sites to reduce their mana base
**Impact**: Major strategic deficit - cannot disrupt opponent's economy

**Game Rules**:
- Attacking opponent sites reduces their life by 1 per site destroyed
- **Final blow must be to avatar** when opponent is at 0 life
- Strategic site destruction is a core part of the game

**Evidence** (`bots/engine/index.js:213-240`):
```javascript
function generateMoveCandidates(state, seat) {
  const units = myUnits(state, seat).filter(u => !u.item?.tapped);
  if (!units.length) return [];
  // Choose the unit closest to opponent avatar
  const oppPos = getOpponentAvatarPos(state, seat);
  units.sort((a,b) => {
    const ap = parseCellKey(a.at); const bp = parseCellKey(b.at);
    const ad = ap ? manhattan([ap.x, ap.y], oppPos) : 999;
    const bd = bp ? manhattan([bp.x, bp.y], oppPos) : 999;
    return ad - bd;
  });
  // ...only targets avatar, never sites
}
```

**Missing Strategy**:
- Identify opponent sites
- Prioritize destroying opponent sites when:
  - Opponent has mana advantage (sites > my sites)
  - Can deny key threshold colors (destroy their only Fire site, etc.)
  - Early game site destruction to slow opponent down

### 3. **No Strategic Site Placement**
**Current Behavior**: Bot places sites adjacent to existing sites or near avatar
**Missing**: Strategic positioning for defense, mana efficiency, board control
**Impact**: Suboptimal board presence, vulnerable to site attacks

**Evidence** (`bots/engine/index.js:61-85`):
```javascript
function playSitePatch(state, seat) {
  // ...
  // Prefer Earth-like sites first (helps satisfy common early thresholds)
  let pick = null;
  const earthIdx = hand.findIndex((c) => c && typeof c.type === 'string' && c.type.toLowerCase().includes('site') && String(c.name || '').toLowerCase().includes('valley'));
  if (earthIdx !== -1) pick = { idx: earthIdx, card: hand[earthIdx] };
  if (!pick) pick = chooseSiteFromHand({ hand });
  if (!pick) return null;
  hand.splice(pick.idx, 1);
  const a = getAvatarPos(state, seat);
  let cell = null;
  if (ownedSiteKeys(state, seat).length === 0) {
    const ax = a[0];
    const ay = a[1];
    cell = isEmpty(state, ax, ay) ? `${ax},${ay}` : findAnyEmptyCell(state);
  } else {
    cell = findAdjacentEmptyToOwned(state, seat) || findAnyEmptyCell(state);
  }
  // Just places adjacent - no strategy!
}
```

**Missing Strategy**:
- Place sites near avatar for defense
- Spread sites to control more board area
- Create defensive lines to block opponent units
- Position sites to support unit movement patterns

---

## Required Fixes

### Fix 1: Spell Casting System

**New Candidate Generation**:
```javascript
// Add spell casting candidates
const playableSpells = hand.filter(c => {
  const cardType = (c.type || '').toLowerCase();
  if (cardType.includes('site')) return false;
  if (cardType.includes('avatar')) return false;
  if (cardType.includes('minion') || cardType.includes('unit')) return false; // Permanents handled separately
  if (cardType.includes('magic') || cardType.includes('sorcery') || cardType.includes('aura')) {
    return canAffordCard(state, seat, c);
  }
  return false;
});

for (const spell of playableSpells) {
  const spellPatch = playSpellPatch(state, seat, spell);
  if (spellPatch) moves.push(seq([spellPatch]));
}
```

**New Function**:
```javascript
function playSpellPatch(state, seat, spell) {
  const z = getZones(state, seat);
  const hand = Array.isArray(z.hand) ? [...z.hand] : [];
  const idx = hand.findIndex(c => c === spell || (c && c.slug === spell.slug));
  if (idx === -1) return null;

  hand.splice(idx, 1);

  // Auras go to permanents, instant spells resolve immediately
  const cardType = (spell.type || '').toLowerCase();
  if (cardType.includes('aura') || cardType.includes('enchantment')) {
    // Place aura on battlefield (similar to unit)
    let cell = findAnyOwnedSiteCell(state, seat);
    if (!cell) cell = findAnyEmptyCell(state);
    const myNum = seatNum(seat);
    const existing = (state && state.permanents && state.permanents[cell]) || [];
    const patch = { zones: {}, permanents: {} };
    patch.zones[seat] = { ...z, hand };
    patch.permanents[cell] = [...existing, { owner: myNum, card: spell, tapped: false }];
    return patch;
  } else {
    // Instant/sorcery - just remove from hand, server handles effect
    const patch = { zones: {} };
    patch.zones[seat] = { ...z, hand };
    return patch;
  }
}
```

### Fix 2: Site Attack System

**New Movement Logic**:
```javascript
function generateMoveCandidates(state, seat) {
  const units = myUnits(state, seat).filter(u => !u.item?.tapped);
  if (!units.length) return [];

  const oppPos = getOpponentAvatarPos(state, seat);
  const oppSites = getOpponentSiteKeys(state, seat);

  // Strategy: Attack sites when opponent has mana advantage, otherwise attack avatar
  const ownedSites = countOwnedManaSites(state, seat);
  const oppSiteCount = oppSites.length;
  const shouldTargetSites = oppSiteCount > ownedSites && oppSiteCount > 0;

  const targets = shouldTargetSites ? oppSites.map(sk => parseCellKey(sk)) : [oppPos];

  // Choose unit closest to target
  const chosen = units[0]; // Simplified
  const neigh = neighborsInBounds(state, chosen.at).filter(k => !hasFriendlyAt(state, seat, k));

  // Prefer moving into target cell or toward target
  const candidates = [];
  for (const k of neigh.slice(0, 2)) {
    const p = buildMovePatch(state, seat, chosen.at, chosen.index, k);
    if (p) candidates.push(p);
  }
  return candidates;
}
```

**New Helper**:
```javascript
function getOpponentSiteKeys(state, seat) {
  const oppNum = seatNum(otherSeat(seat));
  const sites = (state && state.board && state.board.sites) || {};
  const keys = [];
  for (const k of Object.keys(sites)) {
    const t = sites[k];
    if (t && t.card && Number(t.owner) === oppNum) keys.push(k);
  }
  return keys;
}
```

### Fix 3: Strategic Site Placement

**New Placement Logic**:
```javascript
function chooseSitePlacementStrategic(state, seat) {
  const myNum = seatNum(seat);
  const oppNum = seatNum(otherSeat(seat));
  const avatarPos = getAvatarPos(state, seat);
  const oppAvatarPos = getOpponentAvatarPos(state, seat);
  const ownedSites = ownedSiteKeys(state, seat);

  // Strategy 1: First site goes on avatar
  if (ownedSites.length === 0) {
    const [ax, ay] = avatarPos;
    if (isEmpty(state, ax, ay)) return `${ax},${ay}`;
    return findAnyEmptyCell(state); // Fallback
  }

  // Strategy 2: Create defensive line (2-3 sites) near avatar
  if (ownedSites.length < 3) {
    const defensivePositions = getDefensivePositions(state, seat, avatarPos);
    for (const pos of defensivePositions) {
      if (isEmpty(state, pos.x, pos.y)) return `${pos.x},${pos.y}`;
    }
  }

  // Strategy 3: Expand toward opponent (4+ sites)
  const expansionPositions = getExpansionPositions(state, seat, oppAvatarPos, ownedSites);
  for (const pos of expansionPositions) {
    if (isEmpty(state, pos.x, pos.y)) return `${pos.x},${pos.y}`;
  }

  // Fallback: adjacent
  return findAdjacentEmptyToOwned(state, seat) || findAnyEmptyCell(state);
}
```

---

## Impact Assessment

**Without These Fixes**:
- Bot cannot cast 30-40% of cards (all spells/auras)
- Bot cannot execute site destruction strategy
- Bot makes poor site placement decisions
- Bot will always lose to competent human players

**With These Fixes**:
- Bot can use full card pool
- Bot can disrupt opponent economy
- Bot makes strategic board development choices
- Bot competitive with intermediate players

---

## Implementation Priority

1. **P0 - Spell Casting** (T043): Enables 30-40% more cards
2. **P0 - Site Attacks** (T044): Core strategic mechanic
3. **P1 - Strategic Site Placement** (T045): Quality-of-life improvement

---

## Testing Plan

1. **Spell Casting Tests**:
   - Bot casts Lightning Bolt when opponent at low life
   - Bot casts Earthquake when opponent has board advantage
   - Bot plays Auras on permanents

2. **Site Attack Tests**:
   - Bot attacks opponent sites when they have mana advantage
   - Bot switches to avatar when opponent at 0 life
   - Bot doesn't waste attacks on sites when behind

3. **Site Placement Tests**:
   - Bot places first site on/near avatar
   - Bot creates defensive line (2-3 sites) near avatar
   - Bot expands toward opponent after establishing base

---

**Next Steps**: Implement T043 (Spell Casting) as highest priority fix
