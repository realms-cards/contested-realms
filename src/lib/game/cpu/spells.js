// Explicit card semantics shared by human guides and CPU candidate evaluation.
// Source: cards_raw guardian text and reference/SorceryRulebook.txt.
/* eslint-disable @typescript-eslint/no-require-imports -- Shared directly with the Node CommonJS CPU engine. */
const { advancedSpellChoices } = require('./advancedSpells');
const { affectedByAura } = require('./auras');
const cards = require('./cards.json');
const { evaluateDamage } = require('./damageRules');
const { bestByScore, cellOf, enterScope, facts, findUnit, freshUnits, leaveScope, realmUnits, scopedTileLabel, snapshotOf, unitPosition } = require('./evalScope');
const { dirToken, optToken, unitToken } = require('./pickTokens');

/** @typedef {import('./spellTypes').SpellState} SpellState */
/** @typedef {import('./spellTypes').SpellChoice} SpellChoice */
/** @typedef {import('./spellTypes').LocatedUnit} LocatedUnit */
/** @typedef {import('../store/types').PlayerKey} PlayerKey */
/** @typedef {import('../store/types').CardRef} CardRef */

// Exported state helpers open an evaluation scope (evalScope.js) so that nested checks share
// one scan of the realm and one evaluation of each unit fact. Internal *Of / *At helpers
// memoize within that scope and must only receive units they will not mutate.

const SUPPORTED_SPELLS = new Set([
  'Blink', 'Teleport', 'Divine Healing', 'Bury', 'Drown', 'Cave-In',
  'Stormy Seas', 'Minor Explosion', 'Lightning Bolt', 'Incinerate', 'Riptide',
  'Fireball', 'Firebolts', 'Heat Ray', 'Ice Lance',
  'Overpower', 'Mad Dash', 'Font of Life',
  'Cone of Flame', 'Major Explosion', 'Craterize', 'Border Militia', 'Raise Dead', 'Wrath of the Sea',
  'Chain Lightning', 'Blaze',
]);
const PROJECTILES = new Set(['Fireball', 'Firebolts', 'Heat Ray', 'Ice Lance']);
const DIRECTIONS = { N: [0,-1], E: [1,0], S: [0,1], W: [-1,0] };
// Ranged cards cards.json lacks (verified against data/cards_raw.json); every other unit reads its keyword line.
/** @type {Record<string, number>} */
const RANGED_UNITS = { 'Hunting Party': 1, 'Sherwood Huntress': 1, 'Sir Bors the Younger': 2, 'Stygian Archers': 1, 'Yourke Crossbowmen': 1 };
/** @type {Record<string, number>} */
const RANGED_ARTIFACTS = { 'Fail-not Bow': 3, 'Peacemaker Arbalest': 1, 'Truesight Crossbow': 1 };

/** @param {string} name */
function supportsSpell(name) { return SUPPORTED_SPELLS.has(name); }

/** @param {CardRef} card */
function cardText(card) { return cards[card.name]?.rulesText || card.text || ''; }

/** @param {string} a @param {string} b @param {'nearby' | 'adjacent' | 'two' | 'any'} range */
function inRange(a, b, range) {
  const [ax, ay] = cellOf(a);
  const [bx, by] = cellOf(b);
  if (!(Number.isFinite(ax) && Number.isFinite(ay) && Number.isFinite(bx) && Number.isFinite(by))) return false;
  if (range === 'any') return true;
  const dx = Math.abs(ax - bx), dy = Math.abs(ay - by);
  return range === 'nearby' ? Math.max(dx, dy) <= 1 : dx + dy <= (range === 'two' ? 2 : 1);
}

/** @param {SpellState} state @param {string} at @returns {boolean} */
function isWater(state, at) {
  enterScope();
  try { return waterAt(state, at); } finally { leaveScope(); }
}

/** @param {SpellState} state @param {string} at @returns {boolean} */
function waterAt(state, at) {
  const known = facts(snapshotOf(state), 'water');
  let water = known.get(at);
  if (water === undefined) known.set(at, water = computeWater(state, at));
  return /** @type {boolean} */ (water);
}

/** @param {SpellState} state @param {string} at @returns {boolean} */
function computeWater(state, at) {
  if (!state.board.sites[at]?.card) return false;
  if (state.board.sites[at]?.card?.name === 'Bedrock') return false;
  if (affectedByAura(state.permanents,at,'Flood')) return true;
  if (realmUnits(state).some(unit => unit.at === at && unit.card.name === 'Tide Naiads' && !disabledOf(state,unit))) return true;
  if (state.permanents?.[at]?.some(item => item.card?.name === 'Flooded' && !item.attachedTo)) return true;
  const card = state.board.sites[at]?.card;
  return Number(card?.thresholds?.water ?? cards[card?.name]?.thresholds?.water ?? 0) > 0;
}

/** @param {SpellState} state @param {string} from @returns {string[]} */
function bodyOfWater(state, from) {
  enterScope();
  try { return [...bodyAt(state, from)]; } finally { leaveScope(); }
}

/** @param {SpellState} state @param {string} from @returns {string[]} shared, never mutate */
function bodyAt(state, from) {
  const known = facts(snapshotOf(state), 'body');
  let body = known.get(from);
  if (!body) known.set(from, body = computeBody(state, from));
  return /** @type {string[]} */ (body);
}

/** @param {SpellState} state @param {string} from @returns {string[]} */
function computeBody(state, from) {
  if (!waterAt(state, from)) return [];
  const visited = new Set([from]);
  for (const at of visited) {
    const [x,y] = at.split(',').map(Number);
    for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const next = `${x+dx},${y+dy}`;
      if (state.board.sites[next]?.card && waterAt(state,next)) visited.add(next);
    }
  }
  return [...visited];
}

/** @param {SpellState} state @returns {LocatedUnit[]} */
function unitsInRealm(state) {
  return freshUnits(state);
}

/** @param {SpellState} state @param {LocatedUnit} unit @returns {boolean} */
function isDisabled(state,unit) {
  enterScope();
  try { return disabledOf(state,unit); } finally { leaveScope(); }
}

/** @param {SpellState} state @param {LocatedUnit} unit @returns {boolean} */
function disabledOf(state,unit) {
  if (unit.target.kind === 'avatar') return false;
  const snap = snapshotOf(state), position = unitPosition(snap,unit);
  if (position === undefined) return computeDisabled(state,unit);
  const known = facts(snap,'disabled');
  let disabled = known.get(position);
  if (disabled === undefined) known.set(position, disabled = computeDisabled(state,unit));
  return /** @type {boolean} */ (disabled);
}

/** @param {SpellState} state @param {LocatedUnit} unit @returns {boolean} */
function computeDisabled(state,unit) {
  const item = state.permanents[unit.at]?.[unit.target.index];
  if (!item) return false;
  if (item.cpuAsleep || item.cpuSwallowedBy && item.attachedTo && state.permanents[item.attachedTo.at]?.[item.attachedTo.index]?.instanceId === item.cpuSwallowedBy) return true;
  if (state.permanents[unit.at]?.some(p => p.card.name === 'Disabled' && p.attachedTo?.index === unit.target.index && p.attachedTo.at === unit.at)) return true;
  const text = cardText(unit.card);
  if (/\bWaterbound\b/.test(text) && !waterAt(state,unit.at) || /\bLandbound\b/.test(text) && waterAt(state,unit.at)) return true;
  const combat = state.pendingCombat;
  const movingInCombat = combat && (combat.attacker.instanceId === unit.target.instanceId || combat.defenders.some(d => d.instanceId === unit.target.instanceId));
  if (movingInCombat) return false;
  return basilisksOf(state).some(other => {
    if (sameTarget(other.target,unit.target) || other.region !== unit.region) return false;
    const [x,y] = other.at.split(',').map(Number);
    return other.at === unit.at || unit.at === `${x},${y+(other.owner === 'p1' ? -1 : 1)}`;
  });
}

/** Hillock Basilisks in realm order; the only units that can disable others by position.
 * @param {SpellState} state @returns {LocatedUnit[]} */
function basilisksOf(state) {
  // A plain snapshot slot rather than a fact map: single isDisabled calls stay allocation-light.
  const snap = snapshotOf(state);
  return snap.basilisks || (snap.basilisks = realmUnits(state,snap).filter(other => other.card.name === 'Hillock Basilisk'));
}

/** @param {SpellState} state @param {LocatedUnit} unit @returns {boolean} */
function hasStealth(state,unit) {
  enterScope();
  try { return stealthOf(state,unit); } finally { leaveScope(); }
}

/** @param {SpellState} state @param {LocatedUnit} unit @returns {boolean} */
function stealthOf(state,unit) {
  if (unit.target.kind !== 'permanent') return false;
  const snap = snapshotOf(state), position = unitPosition(snap,unit);
  if (position === undefined) return computeStealth(state,unit);
  const known = facts(snap,'stealth');
  let stealth = known.get(position);
  if (stealth === undefined) known.set(position, stealth = computeStealth(state,unit));
  return /** @type {boolean} */ (stealth);
}

/** @param {SpellState} state @param {LocatedUnit} unit @returns {boolean} */
function computeStealth(state,unit) {
  if (disabledOf(state,unit)) return false;
  const item = state.permanents[unit.at]?.[unit.target.index];
  if (item?.cpuStealthLost) return false;
  return /\bStealth\b/.test(cardText(unit.card)) || !!state.permanents[unit.at]?.some(p => p.card.name === 'Stealth' && p.attachedTo?.index === unit.target.index && p.attachedTo.at === unit.at);
}

/** @param {SpellState} state @param {PlayerKey} seat @param {string} name @param {string} [selectionKey] @returns {SpellChoice[]} */
function getSpellChoices(state, seat, name, selectionKey) {
  enterScope();
  try {
    return rawSpellChoices(state,seat,name,selectionKey).map(choice => ({...choice,label:scopedTileLabel(choice.label,state.board.size),
      ...(choice.projectile ? {projectile:{...choice.projectile,decisions:choice.projectile.decisions.map(decision => ({...decision,label:scopedTileLabel(decision.label,state.board.size),options:decision.options.map(option => ({...option,label:scopedTileLabel(option.label,state.board.size)}))}))}} : {})}));
  } finally { leaveScope(); }
}

/** @param {SpellState} state @param {PlayerKey} seat @param {string} name @param {string} [selectionKey] @returns {SpellChoice[]} */
function rawSpellChoices(state, seat, name, selectionKey) {
  if (state.pendingMagic?.cpuEvent?.kind === 'unitEnd') {
    const event = state.pendingMagic.cpuEvent;
    const source = findUnit(state,event.source);
    const stamp = {kind:'auraUpdate',target:event.source,endKey:event.endKey};
    if (!source || disabledOf(state,source)) return [{key:'unit-end/gone',label:'Source unavailable; finish end effect',caster:{kind:'avatar',seat},target:null,operations:[stamp],score:0}];
    return ['N','E','S','W'].map(direction => {
      const projectile = {kind:'projectileStep',name:'Colicky Dragonettes',seat,origin:source.at,region:source.region,direction,step:0,shot:0};
      const impacts = impactChoices(state,projectile);
      return {key:`unit-end/${direction}`,label:`Shoot ${direction} from ${source.at}`,caster:source.target,target:{kind:'projectile',direction},operations:[stamp,projectile],score:Math.max(...impacts.map(choice => choice.score)),
        ...directionPick(source.at,direction)};
    });
  }
  if (state.pendingMagic?.cpuEvent?.kind === 'projectileImpact') return impactChoices(state,state.pendingMagic.cpuEvent.projectile);
  if (state.pendingMagic?.cpuEvent?.kind === 'geomancerFill') {
    const owner = state.pendingMagic.cpuEvent.seat, pos = state.avatars[owner]?.pos;
    const choices = [];
    if (pos && state.avatars[owner].card?.name === 'Geomancer') for (const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]) {
      const x=pos[0]+dx,y=pos[1]+dy,at=`${x},${y}`;
      if (x<0 || y<0 || x>=state.board.size.w || y>=state.board.size.h || state.board.sites[at]?.card || state.permanents[at]?.some(item => item.card.name === 'Rubble')) continue;
      const enemy = state.avatars[owner === 'p1' ? 'p2' : 'p1']?.pos;
      choices.push({key:`geomancer/fill/${at}`,label:`Fill adjacent void at ${at} with neutral Rubble`,caster:{kind:'avatar',seat:owner},target:null,operations:[{kind:'fillRubble',seat:owner,at}],score:enemy ? 10-Math.abs(x-enemy[0])-Math.abs(y-enemy[1]) : 0,picks:[at]});
    }
    return choices.length ? choices : [{key:'geomancer/no-void',label:'No adjacent void remains',caster:{kind:'avatar',seat:owner},target:null,operations:[],score:0}];
  }
  if (['treasurePlace','treasureRecover','drawChoice'].includes(state.pendingMagic?.cpuEvent?.kind)) return require('./treasure').treasureChoices(state);
  if (state.pendingMagic?.cpuEvent?.kind === 'randomChoice') {
    realmUnits(state); // Resolve the realm before any outcome label, as every branch does.
    return state.pendingMagic.cpuEvent.outcomes.map((outcome,index) => {
      // A Lucky Charm re-roll hits one unit: the player picks the card row entry showing it.
      const hit = outcome.kind === 'damage' && outcome.targets.length === 1 ? findUnit(state,outcome.targets[0]) : undefined;
      return {key:`random/${index}`,label:`Outcome ${index+1}: ${outcome.kind === 'damage' ? `${outcome.amount} damage to ${outcome.targets.map(target => findUnit(state,target)?.card.name || 'departed unit').join(', ')}` : 'resolve effect'}`,caster:{kind:'avatar',seat},target:null,operations:[outcome],score:scoreOps(state,seat,[outcome]),
        ...(hit && outcome.kind === 'damage' ? {card:choiceCard(hit.card),badge:`${outcome.amount} damage`} : {})};
    });
  }
  if (state.pendingMagic?.cpuEvent?.kind === 'fightChoice') {
    const event = state.pendingMagic.cpuEvent;
    const source = findUnit(state,event.source), target = findUnit(state,event.target);
    const at = source?.at || target?.at || state.pendingMagic.spell.at, decline = optToken(at,'decline'), accept = optToken(at,'accept');
    const choices = [{key:'fight/decline',label:event.strikeOnly ? 'Do not strike' : 'Do not fight',caster:event.source,target:null,operations:[],score:0,picks:[decline],pickLabels:{[decline]:'Decline'}}];
    if (source && target && source.at === target.at && source.region === target.region && !disabledOf(state,source)) {
      const operations = [{kind:event.strikeOnly ? 'strike' : 'fight',source:event.source,target:event.target}];
      choices.push({key:'fight/accept',label:`${event.strikeOnly ? 'Strike' : 'Fight'} ${target.card.name}`,caster:event.source,target:null,operations,score:scoreOps(state,seat,operations),
        picks:[accept],pickLabels:{[accept]:event.strikeOnly ? 'Strike' : 'Fight'}});
    }
    return choices;
  }
  if (state.pendingMagic?.cpuEvent?.kind === 'auraEnd') return require('./timedAuras').auraEndChoices(state);
  if (state.pendingMagic?.cpuEvent?.kind === 'blazeTrail') return require('./blaze').blazeTrailChoices(state,selectionKey);
  if (state.pendingMagic?.cpuEvent?.kind === 'genesis') return require('./genesis').genesisChoices(state);
  if (!supportsSpell(name)) return [];
  const units = realmUnits(state);
  const casters = units.filter(u => u.owner === seat && !disabledOf(state,u) &&
    (u.target.kind === 'avatar' || /\bSpellcaster\b/.test(cardText(u.card))) &&
    (!/Fire Spellcaster/.test(cardText(u.card)) || Number(cards[name]?.thresholds?.fire || 0) > 0) &&
    (u.card.name !== 'Spire Lich' || /Tower/i.test(state.board.sites[u.at]?.card?.name || '')));
  const sites = Object.keys(state.board.sites || {}).filter(at => state.board.sites[at]?.card);
  /** @type {SpellChoice[]} */
  const choices = [];
  for (const origin of casters) {
    const caster = origin.target.kind === 'avatar' ? origin.target : {
      kind: 'permanent', at: origin.at, index: origin.target.index, owner: seat === 'p1' ? 1 : 2,
    };
    const casterKey = origin.target.kind === 'avatar' ? seat : origin.target.instanceId || `${origin.at}:${origin.target.index}`;
    const visible = units.filter(u => u.region === origin.region);
    const targetable = visible.filter(u => u.owner === seat || !stealthOf(state,u));
    const add = (suffix, description, target, operations, picks) => {
      const choice = { key: `${casterKey}/${suffix}`, label: `${origin.card.name}: ${description}`,
        caster, target, operations, score: scoreOps(state, seat, operations), ...(picks ? { picks } : {}) };
      choices.push(choice);
      return choice;
    };
    if (advancedSpellChoices(state, seat, name, origin, add, casterKey, selectionKey)) continue;
    if (PROJECTILES.has(name)) {
      for (const direction of ['N', 'E', 'S', 'W']) {
        const baseKey = `${casterKey}/${direction}`;
        let selections = [];
        if (selectionKey?.startsWith(`${baseKey}|`)) {
          try {
            const value = JSON.parse(decodeURIComponent(selectionKey.slice(baseKey.length + 1)));
            if (Array.isArray(value) && value.length <= 20 && value.every(v => typeof v === 'string')) selections = value;
          } catch { continue; }
        }
        const plan = projectilePlan(state, seat, name, origin, direction, selections);
        const key = selections.length ? projectileKey(baseKey, plan.selections) : baseKey;
        choices.push({ key, caster, target: { kind: 'projectile', direction },
          label: `${origin.card.name}: shoot ${direction} — projected: ${plan.decisions.map(d => d.label).join('; ') || 'no impact'}`,
          operations: plan.operations, score: scoreOps(state, seat, plan.operations),
          resolutionOperations: [{kind:'projectileStep',name,seat,origin:origin.at,region:origin.region,direction,step:0,shot:0,preferred:selections}],
          projectile: { baseKey, selections: plan.selections, decisions: plan.decisions }, ...directionPick(origin.at, direction) });
      }
    } else if (name === 'Overpower' || name === 'Mad Dash' || name === 'Blaze') {
      for (const ally of targetable.filter(u => u.owner === seat)) {
        const operations = [{ kind: 'buff', target: ally.target, power: name === 'Overpower' ? 2 : 0, movement: name === 'Mad Dash' ? 1 : name === 'Blaze' ? 2 : 0,blaze:name === 'Blaze' }];
        if (name === 'Mad Dash') operations.unshift({ kind: 'draw', seat, count: 1 });
          add(targetKey(ally.target), `${ally.card.name}: ${name === 'Overpower' ? '+2 power' : name === 'Blaze' ? 'Movement +2; cannot be intercepted; fire trail' : 'draw a card; Movement +1'} this turn`, ally.target, operations, [unitToken(ally.target)]);
      }
    } else if (name === 'Font of Life') {
      const operations = units.filter(u => u.owner === seat).map(u => ({ kind: 'mend', target: u.target, amount: bodyAt(state, u.at).length }));
      add('heal-allies', 'Each ally heals for the size of its body of water', null, operations);
    } else if (name === 'Divine Healing') {
      add('heal', 'Gain 7 life', null, [{ kind: 'heal', seat, amount: 7 }]);
    } else if (name === 'Teleport' || name === 'Blink') {
      for (const ally of targetable.filter(u => u.owner === seat)) {
        for (const to of sites) {
          if (to === ally.at || (name === 'Blink' && !inRange(ally.at, to, 'nearby'))) continue;
          if (name === 'Blink' && ally.region !== 'surface') continue;
          const operations = [{ kind: 'move', target: ally.target, to }];
          if (name === 'Blink') operations.push({ kind: 'draw', seat, count: 1 });
          add(`${ally.at}:${ally.target.index ?? seat}/${to}`, `Move ${ally.card.name} to ${to}${name === 'Blink' ? '; draw a card' : ''}`,
            ally.target, operations, [unitToken(ally.target), to]);
        }
      }
    } else if (name === 'Bury' || name === 'Drown' || name === 'Cave-In' || name === 'Stormy Seas') {
      const water = name === 'Drown' || name === 'Stormy Seas';
      const area = name === 'Cave-In' || name === 'Stormy Seas';
      // These spells affect minions AND artifacts. Avatars cannot enter the subsurface.
      const objects = [...(area ? visible : targetable).filter(u => u.target.kind === 'permanent')];
      for (const [at, items] of Object.entries(state.permanents || {})) {
        items.forEach((item, index) => {
          if ((item.card?.type || cards[item.card?.name]?.type) !== 'Artifact') return;
          if (state.permanentPositions?.[item.instanceId]?.state && state.permanentPositions[item.instanceId].state !== 'surface') return;
          objects.push({ at, region: 'surface', target: { kind: 'permanent', at, index, instanceId: item.instanceId },
            owner: item.owner === 1 ? 'p1' : 'p2', card: item.card, damage: 0 });
        });
      }
      for (const at of sites.filter(at => waterAt(state, at) === water)) {
        const affected = objects.filter(u => u.at === at && u.region === 'surface');
        if (!affected.length || origin.region !== 'surface') continue;
        const groups = area ? [affected] : affected.map(u => [u]);
        for (const group of groups) add(`${at}/${area ? 'all' : group[0].target.index}`,
          `${water ? 'Submerge' : 'Burrow'} ${area ? `minions and artifacts at ${at}` : group[0].card.name}`,
          area ? { kind: 'location', at } : group[0].target,
          [{ kind: 'subsurface', targets: group.map(u => u.target), state: water ? 'submerged' : 'burrowed' }], [area ? at : unitToken(group[0].target)]);
      }
    } else if (name === 'Riptide') {
      for (const at of sites.filter(at => waterAt(state, at))) {
        for (const unit of visible.filter(u => u.region === 'surface' && inRange(u.at, at, 'adjacent') && u.at !== at)) {
          add(`${at}/${unit.at}:${unit.target.index ?? unit.owner}`, `Pull ${unit.card.name} to ${at}; draw a card`,
            { kind: 'location', at }, [{ kind: 'move', target: unit.target, to: at }, { kind: 'draw', seat, count: 1 }], [unitToken(unit.target), at]);
        }
      }
    } else {
      const range = name === 'Minor Explosion' ? 'two' : name === 'Incinerate' ? 'nearby' : 'any';
      const locations = [...new Set(visible.map(u => u.at))];
      // Only Incinerate reads the dragon origins; the scan is pure, so other spells skip it.
      const dragonOrigins = name === 'Incinerate' ? units.filter(u => u.owner === seat && u.region === origin.region && /Dragon/i.test(cards[u.card.name]?.subTypes || '')) : [];
      for (const at of locations) {
        if (!inRange(origin.at, at, range) && !(name === 'Incinerate' && dragonOrigins.some(u => inRange(u.at, at, 'nearby')))) continue;
        const affected = visible.filter(u => u.at === at && (name !== 'Incinerate' || u !== origin));
        if (!affected.length) continue;
        const amount = name === 'Incinerate' ? 4 : 3;
        add(at, `${name === 'Lightning Bolt' ? 'Random unit' : 'Each unit'} at ${at}: ${amount} damage`,
          { kind: 'location', at }, [{ kind: 'damage', targets: affected.map(u => u.target), amount, random: name === 'Lightning Bolt',
            ...(name !== 'Lightning Bolt' ? { element: 'fire' } : {}) }], [at]);
      }
    }
  }
  return choices;
}

/** @param {string} baseKey @param {string[]} selections */
function projectileKey(baseKey, selections) {
  return `${baseKey}|${encodeURIComponent(JSON.stringify(selections))}`;
}

/** @param {SpellState} state @param {PlayerKey} seat @param {string} name @param {string | undefined} key */
function getSpellChoice(state, seat, name, key) {
  if (!key) return undefined;
  return getSpellChoices(state, seat, name, key).find(choice => choice.key === key);
}

/** @param {import('./spellTypes').UnitTarget} target */
function targetKey(target) {
  return target.kind === 'avatar' ? target.seat : target.instanceId || `${target.at}:${target.index}`;
}

/** @param {SpellState} state @param {LocatedUnit} unit @returns {number} */
function unitDefence(state, unit) {
  enterScope();
  try { return statsOf(state, unit).def; } finally { leaveScope(); }
}

/** @param {SpellState} state @param {LocatedUnit} unit @returns {{atk: number, def: number}} */
function unitStats(state, unit) {
  enterScope();
  try {
    const stats = statsOf(state, unit);
    return { atk: stats.atk, def: stats.def };
  } finally { leaveScope(); }
}

/** @param {SpellState} state @param {LocatedUnit} unit @returns {{atk: number, def: number}} shared, never mutate */
function statsOf(state, unit) {
  const snap = snapshotOf(state), position = unitPosition(snap,unit);
  if (position === undefined) return computeStats(state,unit);
  const known = facts(snap,'stats');
  let stats = known.get(position);
  if (!stats) known.set(position, stats = computeStats(state,unit));
  return /** @type {{atk: number, def: number}} */ (stats);
}

/** @param {SpellState} state @param {LocatedUnit} unit @returns {{atk: number, def: number}} */
function computeStats(state, unit) {
  const item = unit.target.kind === 'permanent' ? state.permanents[unit.at]?.[unit.target.index] : null;
  const entity = item || (unit.target.kind === 'avatar' ? state.avatars[unit.target.seat] : null);
  const data = cards[unit.card.name] || unit.card;
  let bonus = Number(entity?.counters || 0);
  if (entity?.cpuTurnEffect?.turn === `${state.turn}:${state.currentPlayer}`) bonus += entity.cpuTurnEffect.power;
  for (const other of realmUnits(state)) {
    if (sameTarget(unit.target, other.target)) continue;
    if (disabledOf(state,other)) continue;
    if (other.card.name === 'House Arn Bannerman' && other.owner === unit.owner && other.region === unit.region && inRange(unit.at, other.at, 'nearby')) bonus++;
    if (other.card.name === 'King of the Realm' && /Mortal/.test(data.subTypes || '')) bonus++;
  }
  if (unit.card.name === 'Spire Lich' && /Tower/i.test(state.board.sites[unit.at]?.card?.name || '')) bonus += 2;
  if (unit.card.name === 'Anui Undine') bonus += bodyAt(state,unit.at).length;
  return { atk: Number(data.attack || 0)+bonus, def: Number(data.defence ?? data.attack ?? 0)+bonus };
}

/** @param {SpellState} state @param {LocatedUnit} unit @returns {boolean} */
function hasAirborne(state,unit) {
  enterScope();
  try { return airborneOf(state,unit); } finally { leaveScope(); }
}

/** @param {SpellState} state @param {LocatedUnit} unit @returns {boolean} */
function airborneOf(state,unit) {
  return unit.region === 'surface' && !disabledOf(state,unit) && /\bAirborne\b/.test(cardText(unit.card)) &&
    !affectedByAura(state.permanents,unit.at,'Entangle Terrain');
}

/** @param {SpellState} state @param {LocatedUnit} attacker @param {string} [at] */
function getAttackTargets(state, attacker, at = attacker.at) {
  enterScope();
  try {
    if (disabledOf(state,attacker)) return [];
    const stats = statsOf(state,attacker);
    const airborne = airborneOf(state,attacker);
    const targets = realmUnits(state).filter(unit => unit.owner !== attacker.owner && unit.at === at && unit.region === attacker.region &&
      !stealthOf(state,unit) &&
      !(airborneOf(state,unit) && !airborne)).map(unit => {
        const target = unit.target.kind === 'avatar' ? { kind: 'avatar', at, index: null }
          : { kind: 'permanent', at, index: unit.target.index };
        const defending = statsOf(state,unit);
        const player = state.players[unit.owner];
        let score = unit.target.kind === 'avatar'
          ? player.lifeState === 'dd' ? player.deathsDoorTurn === `${state.turn}:${state.currentPlayer}` ? 0 : 1000 : stats.atk*2
          : stats.atk+((stats.atk+unit.damage >= defending.def || /\bLethal\b/.test(cardText(attacker.card))) ? Number(cards[unit.card.name]?.cost || 1)+4 : 0);
        if (attacker.target.kind !== 'avatar' && defending.atk+attacker.damage >= stats.def) score -= Number(cards[attacker.card.name]?.cost || 1)+2;
        return { target, score };
      });
    const site = state.board.sites[at];
    const opponent = attacker.owner === 'p1' ? 'p2' : 'p1';
    if (attacker.region === 'surface' && site?.card && !site.cpuNeutral && site.owner !== (attacker.owner === 'p1' ? 1 : 2) && state.players[opponent]?.lifeState !== 'dd') {
      targets.push({ target: { kind: 'site', at, index: null }, score: stats.atk*1.5 });
    }
    return targets.sort((a,b) => b.score-a.score);
  } finally { leaveScope(); }
}

/** X of a keyword on the keyword line ("Airborne, Ranged", "Ranged 2"), else 0. A sentence that merely names the
 * keyword (Ribble Boggart's random mutations) is not a keyword line. @param {string} text @param {string} keyword */
function keywordValue(text, keyword) {
  const tokens = text.split(/\r?\n/)[0].split(',').map(token => token.trim());
  if (!tokens.every(token => /^[A-Z][\w+-]*(?: [\w+-]+)*$/.test(token))) return 0;
  const match = tokens.map(token => new RegExp(`^${keyword}(?: (\\d+))?$`).exec(token)).find(Boolean);
  return match ? Number(match[1] || 1) : 0;
}

/** Steps a Ranged projectile flies: the unit's own Ranged X, a carried "Bearer has Ranged X" artifact or Spire Lich atop
 * a Tower, +1 atop Vantage Hills. 0 without Ranged. @param {SpellState} state @param {LocatedUnit} unit @returns {number} */
function reachOf(state, unit) {
  if (disabledOf(state,unit)) return 0;
  const atop = unit.region === 'surface' ? state.board.sites[unit.at]?.card?.name || '' : '';
  let reach = unit.card.name === 'Spire Lich' ? (/Tower/i.test(atop) ? 1 : 0) : RANGED_UNITS[unit.card.name] || keywordValue(cardText(unit.card),'Ranged');
  // Both avatars' attachments use index -1, so those also need the bearer's owner.
  const index = unit.target.kind === 'avatar' ? -1 : unit.target.index, owner = unit.owner === 'p1' ? 1 : 2;
  for (const item of state.permanents[unit.at] || []) {
    if (item.attachedTo?.at !== unit.at || item.attachedTo.index !== index || (index === -1 && item.owner !== owner)) continue;
    const granted = /Bearer has Ranged(?: (\d+))?/.exec(cardText(item.card));
    reach = Math.max(reach, RANGED_ARTIFACTS[item.card.name] || (granted ? Number(granted[1] || 1) : 0));
  }
  return reach && atop === 'Vantage Hills' ? reach+1 : reach;
}

/**
 * Ranged X: "Tap → Shoot a projectile that stops after X steps. Strike the impacted unit." Each direction impacts the
 * first location within reach holding a unit the projectile can hit (allies at the origin are ignored, Stealth is never
 * hit). Enemies there are offered; an ally there stops that direction. Sites are never struck.
 * @param {SpellState} state @param {LocatedUnit} attacker
 * @returns {{target: {kind: 'permanent' | 'avatar', at: string, index: number | null}, direction: 'N' | 'E' | 'S' | 'W', steps: number}[]}
 */
function getRangedTargets(state, attacker) {
  enterScope();
  try {
    const reach = reachOf(state,attacker);
    if (!reach) return [];
    const units = realmUnits(state), offered = new Set(), targets = [];
    for (const direction of /** @type {('N' | 'E' | 'S' | 'W')[]} */ (['N','E','S','W'])) {
      const path = flightPath(state,attacker.at,attacker.region,direction).slice(0,reach+1);
      for (let steps = 0; steps < path.length; steps++) {
        const at = path[steps];
        const impacted = units.filter(unit => unit.at === at && unit.region === attacker.region &&
          !(steps === 0 && unit.owner === attacker.owner) && !stealthOf(state,unit));
        if (!impacted.length) continue;
        for (const unit of impacted) {
          // Enemies at the origin are reached from every direction; offer them once.
          if (unit.owner === attacker.owner || offered.has(targetKey(unit.target))) continue;
          offered.add(targetKey(unit.target));
          targets.push({ target: unit.target.kind === 'avatar' ? { kind: 'avatar', at, index: null } : { kind: 'permanent', at, index: unit.target.index }, direction, steps });
        }
        break;
      }
    }
    return targets;
  } finally { leaveScope(); }
}

/**
 * Plan each impact in order. Firebolts retrace the ray after each casualty;
 * piercing projectiles choose ONE unit per location, not every occupant.
 * The Codex includes the origin in Ice Lance's first three locations.
 * @param {SpellState} state @param {PlayerKey} seat @param {string} name
 * @param {LocatedUnit} origin @param {'N'|'E'|'S'|'W'} direction @param {string[]} requested
 */
function projectilePlan(state, seat, name, origin, direction, requested) {
  // Plans track damage on private copies; unit facts are read from the shared originals.
  const shared = realmUnits(state);
  const units = shared.map(unit => ({ ...unit }));
  const originalOf = new Map(units.map((unit,index) => [unit,shared[index]]));
  const path = flightPath(state, origin.at, origin.region, direction);
  /** @type {import('./spellTypes').SpellOperation[]} */
  const operations = [];
  /** @type {{label: string, options: {key: string, label: string, at?: string}[]}[]} */
  const decisions = [];
  const selections = [];
  const dead = new Set();
  const powerGains = new Map();
  const preventedAt = new Map();
  const turn = `${state.turn}:${state.currentPlayer}`;
  for (let shot = 0; shot < (name === 'Firebolts' ? 3 : 1); shot++) {
    for (let step = 0; step < path.length; step++) {
      if (name === 'Ice Lance' && step >= 3) break;
      const at = path[step];
      const eligible = units.filter(u => u.region === origin.region && u.at === at &&
        !dead.has(targetKey(u.target)) && !(step === 0 && u.owner === seat) && !stealthOf(state,originalOf.get(u)));
      if (!eligible.length) continue;
      const amount = name === 'Firebolts' ? 1 : name === 'Fireball' ? 4 : name === 'Heat Ray' ? 2 : 3-step;
      // Every option stands at this one location, so each is clicked as its own card there.
      const options = eligible.map(u => ({ key: targetKey(u.target), label: `${u.card.name} (${u.owner === seat ? 'ally' : 'enemy'}) at ${at}`, at: unitToken(u.target) }));
      const preferred = requested[decisions.length];
      const target = eligible.find(u => targetKey(u.target) === preferred) || bestByScore(eligible,u => damageScore(state, seat, u.target, amount, undefined));
      decisions.push({ label: `${name === 'Firebolts' ? `Bolt ${shot+1}` : `Impact ${step+1}`}: ${target.card.name} takes ${amount}`, options });
      selections.push(targetKey(target.target));
      const element = name === 'Ice Lance' ? {} : { element: 'fire' };
      const damaged = [{ unit: target, amount }];
      const targets = [target.target];
      if (name === 'Fireball') {
        const others = units.filter(u => u.region === origin.region && u.at === at && u !== target);
        targets.push(...others.map(u => u.target));
        damaged.push(...others.map(unit => ({ unit, amount: 2 })));
      }
      operations.push({ kind: 'damage', targets, amount, ...element, ...(name === 'Fireball' ? { splash: 2 } : {}) });
      for (const hit of damaged) {
        const key = targetKey(hit.unit.target);
        const item = hit.unit.target.kind === 'permanent' ? state.permanents[hit.unit.at][hit.unit.target.index] : null;
        const outcome = evaluateDamage({ name: hit.unit.card.name, damage: hit.unit.damage,
          defence: statsOf(state,originalOf.get(hit.unit)).def+(powerGains.get(key) || 0), avatar: hit.unit.target.kind === 'avatar',
          damagePreventedTurn: preventedAt.get(key) || item?.cpuDamagePreventedTurn },
          [{ target: hit.unit.target, amount: hit.amount, ...element }], turn);
        hit.unit.damage = outcome.remainingDamage;
        if (outcome.killed) dead.add(key);
        if (outcome.prevented) preventedAt.set(key,turn);
        powerGains.set(key,(powerGains.get(key) || 0)+outcome.power);
      }
      if (name === 'Fireball' || name === 'Firebolts') break;
    }
  }
  return { operations, decisions, selections, path };
}

/**
 * Locations a straight flight from `origin` passes, from step `first` (0 = the origin itself), until the
 * board edge or a location outside `region` (void flies over voids, subsurface regions follow water).
 * @param {SpellState} state @param {string} origin @param {string} region @param {'N'|'E'|'S'|'W'} direction @param {number} [first] @returns {string[]}
 */
function flightPath(state, origin, region, direction, first = 0) {
  const [dx,dy] = DIRECTIONS[direction], [ox,oy] = cellOf(origin), path = [];
  for (let step = first; step < Math.max(state.board.size.w, state.board.size.h); step++) {
    const x = ox+dx*step, y = oy+dy*step, at = `${x},${y}`;
    if (x < 0 || y < 0 || x >= state.board.size.w || y >= state.board.size.h) break;
    if (region === 'void' ? !!state.board.sites[at]?.card : !state.board.sites[at]?.card) break;
    if (region === 'underwater' && !waterAt(state, at) || region === 'underground' && waterAt(state, at)) break;
    path.push(at);
  }
  return path;
}

/** flightPath for callers outside an evaluation scope. @param {SpellState} state @param {string} origin @param {string} region @param {'N'|'E'|'S'|'W'} direction @param {number} [first] @returns {string[]} */
function projectilePath(state, origin, region, direction, first) {
  enterScope();
  try { return flightPath(state, origin, region, direction, first); } finally { leaveScope(); }
}

/** @type {Record<'N'|'E'|'S'|'W', string>} */
const DIRECTION_NAMES = { N: 'North', E: 'East', S: 'South', W: 'West' };

/** Board pick of a direction choice: the arrow drawn at `at`, even when that way holds no location to fly over.
 * @param {string} at @param {'N'|'E'|'S'|'W'} direction @returns {{picks: string[], pickLabels: Record<string,string>}} */
function directionPick(at, direction) {
  const token = dirToken(at, direction);
  return { picks: [token], pickLabels: { [token]: DIRECTION_NAMES[direction] } };
}

/** The card-row identity of a choice about one card. @param {CardRef} card @returns {NonNullable<SpellChoice['card']>} */
function choiceCard(card) {
  return { name: card.name, slug: card.slug ?? null, cardId: card.cardId, instanceId: card.instanceId ?? null, type: card.type ?? null };
}

/**
 * Resolve area membership at the moment this step of the storyline executes.
 * @param {SpellState} state
 * @param {import('./spellTypes').SpellOperation} op
 * @returns {import('./spellTypes').SpellOperation | null}
 */
function expandAreaOperation(state, op) {
  enterScope();
  try { return expandArea(state, op); } finally { leaveScope(); }
}

/** @param {SpellState} state @param {import('./spellTypes').SpellOperation} op @returns {import('./spellTypes').SpellOperation | null} */
function expandArea(state, op) {
  if (op.kind === 'damageGrid') {
    const [cx,cy] = op.at.split(',').map(Number);
    const ry = Math.floor(op.grid.length/2), rx = Math.floor((op.grid[0]?.length || 0)/2);
    return {kind:'damageEvent',hits:realmUnits(state).flatMap(unit => {
      if (!state.board.sites[unit.at]?.card) return [];
      const [x,y] = cellOf(unit.at);
      const amount = op.grid[y-cy+ry]?.[x-cx+rx];
      return amount ? [{target:unit.target,amount}] : [];
    })};
  }
  if (op.kind === 'submergeWater') {
    const targets = [];
    for (const [at,items] of Object.entries(state.permanents)) {
      if (!state.board.sites[at]?.card || !waterAt(state,at)) continue;
      items.forEach((item,index) => {
        if (item.card.type !== 'Minion' && item.card.type !== 'Artifact' && item.card.name !== 'Foot Soldier') return;
        const instanceId = item.instanceId || item.card.instanceId;
        if ((state.permanentPositions[instanceId]?.state || 'surface') !== 'surface') return;
        targets.push({kind:'permanent',at,index,instanceId});
      });
    }
    return {kind:'subsurface',targets,state:'submerged'};
  }
  return null;
}

/**
 * Find only the next impact using the current board. The following flight stays
 * symbolic until this impact and all its triggered events have resolved.
 * @param {SpellState} state
 * @param {import('./spellTypes').ProjectileOperation} op
 * @returns {SpellChoice[]}
 */
function projectileImpactChoices(state, op) {
  enterScope();
  try { return impactChoices(state, op); } finally { leaveScope(); }
}

/** @param {SpellState} state @param {import('./spellTypes').ProjectileOperation} op @returns {SpellChoice[]} */
function impactChoices(state, op) {
  const [ox,oy] = op.origin.split(',').map(Number);
  const [dx,dy] = {N:[0,-1],E:[1,0],S:[0,1],W:[-1,0]}[op.direction];
  const units = realmUnits(state);
  const nextBolt = op.name === 'Firebolts' && op.shot < 2 ? [{...op,shot:op.shot+1,step:0,preferred:op.preferred?.slice(1)}] : [];
  for (let step=op.step;step<Math.max(state.board.size.w,state.board.size.h);step++) {
    if (op.name === 'Ice Lance' && step>=3) break;
    const x=ox+dx*step,y=oy+dy*step,at=`${x},${y}`;
    if (x<0 || y<0 || x>=state.board.size.w || y>=state.board.size.h) break;
    const site = state.board.sites[at]?.card;
    if (op.region === 'void' ? !!site : !site) break;
    if (op.region === 'underwater' && !waterAt(state,at) || op.region === 'underground' && waterAt(state,at)) break;
    const eligible = units.filter(unit => unit.at === at && unit.region === op.region && !(step === 0 && unit.owner === op.seat) && !stealthOf(state,unit));
    if (!eligible.length) continue;
    const amount = op.name === 'Fireball' ? 4 : op.name === 'Firebolts' || op.name === 'Colicky Dragonettes' ? 1 : op.name === 'Heat Ray' ? 2 : 3-step;
    return eligible.map(unit => {
      const targets = [unit.target];
      if (op.name === 'Fireball') targets.push(...units.filter(other => other !== unit && other.at === at && other.region === op.region).map(other => other.target));
      /** @type {import('./spellTypes').SpellOperation[]} */
      const operations = [{kind:'damage',targets,amount,...(op.name === 'Ice Lance' || op.name === 'Colicky Dragonettes' ? {} : {element:'fire'}),...(op.name === 'Fireball' ? {splash:2} : {})}];
      if (op.name === 'Heat Ray' || op.name === 'Ice Lance') operations.push({...op,step:step+1,preferred:op.preferred?.slice(1)});
      else operations.push(...nextBolt);
      return {key:targetKey(unit.target),label:`${op.name === 'Firebolts' ? `Bolt ${op.shot+1}` : 'Impact'}: ${unit.card.name} at ${at} takes ${amount}`,
        caster:{kind:'avatar',seat:op.seat},target:unit.target,operations,score:scoreOps(state,op.seat,[operations[0]]),picks:[unitToken(unit.target)]};
    });
  }
  return [{key:'projectile/no-impact',label:'No further impact in this region',caster:{kind:'avatar',seat:op.seat},target:null,operations:nextBolt,score:0}];
}

/** @param {SpellState} state @param {PlayerKey} seat @param {import('./spellTypes').SpellOperation[]} operations @returns {number} */
function scoreOperations(state, seat, operations) {
  enterScope();
  try { return scoreOps(state, seat, operations); } finally { leaveScope(); }
}

/**
 * Bit-identical to `scoreOps(state,seat,[{kind:'damage',targets:[target],amount,element}])`.
 * @param {SpellState} state @param {PlayerKey} seat @param {import('./spellTypes').UnitTarget} target
 * @param {number} amount @param {string | undefined} element @returns {number}
 */
function damageScore(state, seat, target, amount, element) {
  let score = 0, value = 0;
  const unit = findUnit(state,target);
  if (unit) {
    const card = cards[unit.card.name] || unit.card;
    const sign = unit.owner === seat ? -1 : 1;
    if (element === 'fire' && unit.card.name === 'Askelon Phoenix') value -= sign*2;
    else if (target.kind === 'avatar') {
      const player = state.players[target.seat];
      const turn = `${state.turn || 1}:${state.currentPlayer || 1}`;
      value += sign * (player?.lifeState === 'dd' ? (player.deathsDoorTurn === turn ? 0 : 1000) : Math.min(amount, player?.life ?? 20));
    } else {
      const defence = Number(card.defence ?? card.attack ?? 0);
      value += sign * (amount + (amount + unit.damage >= Math.max(1, defence) ? Number(card.cost || 1) + 2 : 0));
    }
  }
  score += value;
  return score;
}

/** Summed attack of the units not owned by `owner` at `to`, in realm order.
 * @param {SpellState} state @param {PlayerKey} owner @param {string} to @param {import('./evalScope').Snapshot} snap @returns {number} */
function threatAt(state, owner, to, snap) {
  const known = facts(snap, owner === 'p1' ? 'threat:p1' : 'threat:p2');
  let threat = known.get(to);
  if (threat === undefined) known.set(to, threat = realmUnits(state, snap).filter(u => u.owner !== owner && u.at === to)
    .reduce((sum,u) => sum + Number(cards[u.card.name]?.attack || 0),0));
  return /** @type {number} */ (threat);
}

/** Same string as `state.avatars[opponent of seat]?.pos?.join(',')`, joined once per snapshot.
 * @param {SpellState} state @param {PlayerKey} seat @param {import('./evalScope').Snapshot} snap @returns {string | undefined} */
function opponentAt(state, seat, snap) {
  const known = facts(snap,'opponentAt'), opponent = seat === 'p1' ? 'p2' : 'p1';
  if (known.has(opponent)) return /** @type {string | undefined} */ (known.get(opponent));
  const at = state.avatars[opponent]?.pos?.join(',');
  known.set(opponent, at);
  return at;
}

/** @param {SpellState} state @param {PlayerKey} seat @param {import('./spellTypes').SpellOperation[]} operations @returns {number} */
function scoreOps(state, seat, operations) {
  const snap = snapshotOf(state), units = realmUnits(state, snap);
  let score = 0;
  for (const op of operations) {
    if (op.kind === 'projectileStep' || op.kind === 'offerProjectile') continue; // Flight is scored by the cast preview.
    const expanded = expandArea(state,op);
    if (expanded) { score += scoreOps(state,seat,[expanded]); continue; }
    if (op.kind === 'fillRubble') { score += 2; continue; }
    if (op.kind === 'drawCards') { score += (op.spells+op.sites)*2; continue; }
    if (op.kind === 'placeTreasure' || op.kind === 'sacrificeTreasure') continue;
    if (op.kind === 'offerDraw') { score += 2; continue; }
    if (op.kind === 'chooseRandom') { score += Math.max(0,...op.outcomes.map(outcome => scoreOps(state,seat,[outcome]))); continue; }
    if (op.kind === 'waveshaperFlood') continue;
    if (op.kind === 'stunAt') {
      score += units.filter(unit => unit.at === op.at && unit.target.kind === 'permanent' && (disabledOf(state,unit) || !/\bSubmerge\b/.test(cardText(unit.card)))).reduce((sum,unit) => sum+(unit.owner === seat ? -1 : 1)*(2+statsOf(state,unit).atk),0);
      continue;
    }
    if (op.kind === 'dragUnit') { if (op.path.length) score += scoreOps(state,seat,[{kind:'move',target:op.target,to:op.path[op.path.length-1]}]); continue; }
    if (op.kind === 'fight' || op.kind === 'offerFight' || op.kind === 'strike') {
      const source = findUnit(state,op.source), target = findUnit(state,op.target);
      if (source && target) {
        const value = scoreOps(state,seat,[{kind:'damageEvent',hits:[{target:target.target,amount:disabledOf(state,source) ? 0 : statsOf(state,source).atk},{target:source.target,amount:op.kind === 'strike' || op.strikeOnly || disabledOf(state,target) ? 0 : statsOf(state,target).atk}]}]);
        score += op.kind === 'offerFight' ? Math.max(0,value) : value;
      }
      continue;
    }
    if (op.kind === 'dropArtifact') continue;
    if (op.kind === 'damageAtSource') continue;
    if (op.kind === 'rollBoulder') {
      if (op.target.kind !== 'permanent') continue;
      const [ox,oy] = op.target.at.split(',').map(Number);
      const [dx,dy] = {N:[0,-1],E:[1,0],S:[0,1],W:[-1,0]}[op.direction];
      const hits = [];
      let steps = 0;
      for (let step=0;step<Math.max(state.board.size.w,state.board.size.h);step++) {
        const x=ox+dx*step,y=oy+dy*step,at=`${x},${y}`;
        if (x<0 || y<0 || x>=state.board.size.w || y>=state.board.size.h) break;
        if (op.region === 'void' ? !!state.board.sites[at]?.card : !state.board.sites[at]?.card) break;
        if (op.region === 'underwater' && !waterAt(state,at) || op.region === 'underground' && waterAt(state,at)) break;
        steps = step;
        hits.push(...units.filter(unit => unit.at === at && unit.region === op.region).map(unit => ({target:unit.target,amount:4})));
      }
      if (steps) score += scoreOps(state,seat,[{kind:'damageEvent',hits}]);
      continue;
    }
    if (op.kind === 'banishDeadFire') { score -= state.zones[op.seat].graveyard.filter(card => card.type === 'Minion' && Number(card.thresholds?.fire || 0)>0).length; continue; }
    if (op.kind === 'replaceRubble') { score += 5; continue; }
    if (op.kind === 'strikeNearby') {
      const source = findUnit(state,op.source);
      if (source) score += scoreOps(state,seat,[{kind:'damageEvent',hits:units.filter(unit => unit.region === source.region && inRange(source.at,unit.at,'nearby') && !sameTarget(unit.target,source.target)).map(unit => ({target:unit.target,amount:statsOf(state,source).atk}))}]);
      continue;
    }
    if (op.kind === 'auraUpdate' || op.kind === 'moveSpent') continue;
    if (op.kind === 'tapUnits') { score -= op.targets.length; continue; }
    if (op.kind === 'surface') continue;
    if (op.kind === 'gainMana') { score += op.amount; continue; }
    if (op.kind === 'sleep' || op.kind === 'immobilizeSites') continue;
    if (op.kind === 'swallow') { const target = findUnit(state,op.target); score += target?.owner === seat ? -5 : 5; continue; }
    if (op.kind === 'retriggerGenesis') { score += op.ats.length; continue; }
    if (op.kind === 'reorder') {
      const top = state.zones[seat].spellbook;
      const useful = card => card ? 10-Math.abs(Number(card.cost || 0)-Object.values(state.board.sites).filter(s => s.owner === (seat === 'p1' ? 1 : 2) && !s.cpuNeutral).length) : 0;
      score += op.bottom ? useful(top[1])-useful(top[0]) : op.order.reduce((sum,index,position) => sum+useful(top[index])/(position+1),0);
      continue;
    }
    if (op.kind === 'damageEvent') { score += op.hits.reduce((sum,hit) => sum + damageScore(state,seat,hit.target,hit.amount,hit.element),0); continue; }
    if (op.kind === 'summonTokens') { score += op.ats.length*4; continue; }
    if (op.kind === 'destroySite') { score += state.board.sites[op.at]?.owner === (seat === 'p1' ? 1 : 2) ? -6 : 6; continue; }
    if (op.kind === 'discard') { score -= 2; continue; }
    if (op.kind === 'spend') { score -= op.amount; continue; }
    if (op.kind === 'flood') continue;
    if (op.kind === 'raise') {
      const text = op.card ? cardText(op.card) : '';
      const unsafe = op.region === 'void' && !/\bVoidwalk\b/.test(text) || op.region === 'underwater' && !/\bSubmerge\b/.test(text) || op.region === 'underground' && !/\bBurrowing\b/.test(text);
      score += unsafe ? -50 : op.card ? Number(op.card.cost || 0)+4 : 6;
      if (op.to) score -= units.filter(u => u.at === op.to && u.owner !== seat).reduce((sum,u) => sum+statsOf(state,u).atk,0);
      continue;
    }
    if (op.kind === 'draw') { score += op.count * 2; continue; }
    if (op.kind === 'heal') {
      if (state.players[op.seat]?.lifeState === 'alive') score += Math.min(op.amount, 20 - state.players[op.seat].life) * 0.7;
      continue;
    }
    if (op.kind === 'buff' || op.kind === 'mend') {
      const unit = findUnit(state, op.target);
      if (!unit) continue;
      const item = unit.target.kind === 'permanent' ? state.permanents[unit.at][unit.target.index] : state.avatars[unit.owner];
      if (op.kind === 'buff') score += item.tapped || item.summonedThisTurn ? 0 : op.power*2+op.movement;
      else if (unit.target.kind === 'avatar') {
        const player = state.players[unit.owner];
        if (player.lifeState === 'alive') score += Math.min(op.amount,20-player.life)*0.7;
      } else score += Math.min(op.amount,unit.damage);
      continue;
    }
    if (op.kind === 'move') {
      const unit = findUnit(state, op.target, snap);
      if (!unit) continue;
      const opponent = opponentAt(state, seat, snap);
      if (opponent) {
        const [ox,oy] = cellOf(opponent), [ux,uy] = cellOf(unit.at), [tx,ty] = cellOf(op.to);
        score += ((Math.abs(ux-ox)+Math.abs(uy-oy)) - (Math.abs(tx-ox)+Math.abs(ty-oy))) * (unit.owner === seat ? 1 : -1);
      }
      // Preserve the avatar and avoid teleporting weak allies into stronger threats.
      const threat = threatAt(state, unit.owner, op.to, snap);
      if (unit.owner === seat) score -= threat * (unit.target.kind === 'avatar' ? 3 : 0.5);
      continue;
    }
    let value = 0;
    for (const [targetIndex, target] of op.targets.entries()) {
      const unit = findUnit(state, target);
      if (!unit) continue;
      const card = cards[unit.card.name] || unit.card;
      const sign = unit.owner === seat ? -1 : 1;
      const amount = op.kind === 'damage' && targetIndex > 0 && op.splash !== undefined ? op.splash : op.amount;
      if (op.kind === 'damage' && op.element === 'fire' && unit.card.name === 'Askelon Phoenix') { value -= sign*2; continue; }
      if (op.kind === 'subsurface') {
        const survives = new RegExp(op.state === 'burrowed' ? '\\bBurrowing\\b' : '\\bSubmerge\\b').test(cardText(unit.card));
        value += sign * (survives ? 0.5 : Number(card.cost || 1) + 3);
      } else if (target.kind === 'avatar') {
        const player = state.players[target.seat];
        const turn = `${state.turn || 1}:${state.currentPlayer || 1}`;
        value += sign * (player?.lifeState === 'dd' ? (player.deathsDoorTurn === turn ? 0 : 1000) : Math.min(amount, player?.life ?? 20));
      } else {
        const defence = Number(card.defence ?? card.attack ?? 0);
        value += sign * (amount + (amount + unit.damage >= Math.max(1, defence) ? Number(card.cost || 1) + 2 : 0));
      }
    }
    score += op.kind === 'damage' && op.random ? value / Math.max(1, op.targets.length) : value;
  }
  return score;
}

/** @param {import('./spellTypes').UnitTarget} a @param {import('./spellTypes').UnitTarget} b */
function sameTarget(a, b) {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'avatar' && b.kind === 'avatar') return a.seat === b.seat;
  return a.kind === 'permanent' && b.kind === 'permanent' &&
    (a.instanceId && b.instanceId ? a.instanceId === b.instanceId : a.at === b.at && a.index === b.index);
}

module.exports = { supportsSpell, getSpellChoices, getSpellChoice, projectileKey, directionPick, choiceCard, unitsInRealm, inRange, isWater, bodyOfWater, cardText, sameTarget, unitDefence, unitStats, getAttackTargets, getRangedTargets, scoreOperations,isDisabled,hasStealth,hasAirborne,expandAreaOperation,projectileImpactChoices,projectilePath };
