// Explicit card semantics shared by human guides and CPU candidate evaluation.
// Source: cards_raw guardian text and reference/SorceryRulebook.txt.
/* eslint-disable @typescript-eslint/no-require-imports -- Shared directly with the Node CommonJS CPU engine. */
const { advancedSpellChoices } = require('./advancedSpells');
const { affectedByAura } = require('./auras');
const cards = require('./cards.json');
const { evaluateDamage } = require('./damageRules');

/** @typedef {import('./spellTypes').SpellState} SpellState */
/** @typedef {import('./spellTypes').SpellChoice} SpellChoice */
/** @typedef {import('./spellTypes').LocatedUnit} LocatedUnit */
/** @typedef {import('../store/types').PlayerKey} PlayerKey */
/** @typedef {import('../store/types').CardRef} CardRef */

const SUPPORTED_SPELLS = new Set([
  'Blink', 'Teleport', 'Divine Healing', 'Bury', 'Drown', 'Cave-In',
  'Stormy Seas', 'Minor Explosion', 'Lightning Bolt', 'Incinerate', 'Riptide',
  'Fireball', 'Firebolts', 'Heat Ray', 'Ice Lance',
  'Overpower', 'Mad Dash', 'Font of Life',
  'Cone of Flame', 'Major Explosion', 'Craterize', 'Border Militia', 'Raise Dead', 'Wrath of the Sea',
  'Chain Lightning', 'Blaze',
]);
const PROJECTILES = new Set(['Fireball', 'Firebolts', 'Heat Ray', 'Ice Lance']);

/** @param {string} name */
function supportsSpell(name) { return SUPPORTED_SPELLS.has(name); }

/** @param {CardRef} card */
function cardText(card) { return cards[card.name]?.rulesText || card.text || ''; }

/** @param {string} a @param {string} b @param {'nearby' | 'adjacent' | 'two' | 'any'} range */
function inRange(a, b, range) {
  const [ax, ay] = a.split(',').map(Number);
  const [bx, by] = b.split(',').map(Number);
  if (![ax, ay, bx, by].every(Number.isFinite)) return false;
  if (range === 'any') return true;
  const dx = Math.abs(ax - bx), dy = Math.abs(ay - by);
  return range === 'nearby' ? Math.max(dx, dy) <= 1 : dx + dy <= (range === 'two' ? 2 : 1);
}

/** @param {SpellState} state @param {string} at */
function isWater(state, at) {
  if (!state.board.sites[at]?.card) return false;
  if (state.board.sites[at]?.card?.name === 'Bedrock') return false;
  if (affectedByAura(state.permanents,at,'Flood')) return true;
  if (unitsInRealm(state).some(unit => unit.at === at && unit.card.name === 'Tide Naiads' && !isDisabled(state,unit))) return true;
  if (state.permanents?.[at]?.some(item => item.card?.name === 'Flooded' && !item.attachedTo)) return true;
  const card = state.board.sites[at]?.card;
  return Number(card?.thresholds?.water ?? cards[card?.name]?.thresholds?.water ?? 0) > 0;
}

/** @param {SpellState} state @param {string} from @returns {string[]} */
function bodyOfWater(state, from) {
  if (!isWater(state, from)) return [];
  const visited = new Set([from]);
  for (const at of visited) {
    const [x,y] = at.split(',').map(Number);
    for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const next = `${x+dx},${y+dy}`;
      if (state.board.sites[next]?.card && isWater(state,next)) visited.add(next);
    }
  }
  return [...visited];
}

/** @param {SpellState} state @returns {LocatedUnit[]} */
function unitsInRealm(state) {
  const result = [];
  for (const [at, items] of Object.entries(state.permanents || {})) {
    items.forEach((item, index) => {
      const type = item.card?.type || cards[item.card?.name]?.type;
      if (type !== 'Minion' && !(type === 'Token' && ['Foot Soldier','Skeleton','Frog','Bruin','Tawny'].includes(item.card.name)) && !/Automaton/i.test(cards[item.card?.name]?.subTypes || '')) return;
      const position = state.permanentPositions?.[item.instanceId || item.card?.instanceId];
      const region = position?.state === 'burrowed' ? 'underground'
        : position?.state === 'submerged' ? 'underwater'
        : state.board.sites[at]?.card ? 'surface' : 'void';
      result.push({
        target: { kind: 'permanent', at, index, instanceId: item.instanceId || item.card?.instanceId },
        at, region, owner: item.owner === 1 ? 'p1' : 'p2', card: item.card, damage: item.damage || 0,
      });
    });
  }
  for (const seat of ['p1', 'p2']) {
    const avatar = state.avatars?.[seat];
    if (!avatar?.pos || !avatar.card) continue;
    result.push({ target: { kind: 'avatar', seat }, at: avatar.pos.join(','),
      region: 'surface', owner: seat, card: avatar.card, damage: 0 });
  }
  return result;
}

/** @param {SpellState} state @param {LocatedUnit} unit */
function isDisabled(state,unit) {
  if (unit.target.kind === 'avatar') return false;
  const item = state.permanents[unit.at]?.[unit.target.index];
  if (!item) return false;
  if (item.cpuAsleep || item.cpuSwallowedBy && item.attachedTo && state.permanents[item.attachedTo.at]?.[item.attachedTo.index]?.instanceId === item.cpuSwallowedBy) return true;
  if (state.permanents[unit.at]?.some(p => p.card.name === 'Disabled' && p.attachedTo?.index === unit.target.index && p.attachedTo.at === unit.at)) return true;
  const text = cardText(unit.card);
  if (/\bWaterbound\b/.test(text) && !isWater(state,unit.at) || /\bLandbound\b/.test(text) && isWater(state,unit.at)) return true;
  const combat = state.pendingCombat;
  const movingInCombat = combat && (combat.attacker.instanceId === unit.target.instanceId || combat.defenders.some(d => d.instanceId === unit.target.instanceId));
  if (movingInCombat) return false;
  return unitsInRealm(state).some(other => {
    if (other.card.name !== 'Hillock Basilisk' || sameTarget(other.target,unit.target) || other.region !== unit.region) return false;
    const [x,y] = other.at.split(',').map(Number);
    return other.at === unit.at || unit.at === `${x},${y+(other.owner === 'p1' ? -1 : 1)}`;
  });
}

/** @param {SpellState} state @param {LocatedUnit} unit */
function hasStealth(state,unit) {
  if (unit.target.kind !== 'permanent' || isDisabled(state,unit)) return false;
  const item = state.permanents[unit.at]?.[unit.target.index];
  if (item?.cpuStealthLost) return false;
  return /\bStealth\b/.test(cardText(unit.card)) || !!state.permanents[unit.at]?.some(p => p.card.name === 'Stealth' && p.attachedTo?.index === unit.target.index && p.attachedTo.at === unit.at);
}

/** @param {SpellState} state @param {PlayerKey} seat @param {string} name @param {string} [selectionKey] @returns {SpellChoice[]} */
function getSpellChoices(state, seat, name, selectionKey) {
  if (state.pendingMagic?.cpuEvent?.kind === 'geomancerFill') {
    const owner = state.pendingMagic.cpuEvent.seat, pos = state.avatars[owner]?.pos;
    const choices = [];
    if (pos && state.avatars[owner].card?.name === 'Geomancer') for (const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]) {
      const x=pos[0]+dx,y=pos[1]+dy,at=`${x},${y}`;
      if (x<0 || y<0 || x>=state.board.size.w || y>=state.board.size.h || state.board.sites[at]?.card || state.permanents[at]?.some(item => item.card.name === 'Rubble')) continue;
      const enemy = state.avatars[owner === 'p1' ? 'p2' : 'p1']?.pos;
      choices.push({key:`geomancer/fill/${at}`,label:`Fill adjacent void at ${at} with neutral Rubble`,caster:{kind:'avatar',seat:owner},target:null,operations:[{kind:'fillRubble',seat:owner,at}],score:enemy ? 10-Math.abs(x-enemy[0])-Math.abs(y-enemy[1]) : 0});
    }
    return choices.length ? choices : [{key:'geomancer/no-void',label:'No adjacent void remains',caster:{kind:'avatar',seat:owner},target:null,operations:[],score:0}];
  }
  if (['treasurePlace','treasureRecover','drawChoice'].includes(state.pendingMagic?.cpuEvent?.kind)) return require('./treasure').treasureChoices(state);
  if (state.pendingMagic?.cpuEvent?.kind === 'randomChoice') {
    const units = unitsInRealm(state);
    return state.pendingMagic.cpuEvent.outcomes.map((outcome,index) => ({key:`random/${index}`,label:`Outcome ${index+1}: ${outcome.kind === 'damage' ? `${outcome.amount} damage to ${outcome.targets.map(target => units.find(unit => sameTarget(unit.target,target))?.card.name || 'departed unit').join(', ')}` : 'resolve effect'}`,caster:{kind:'avatar',seat},target:null,operations:[outcome],score:scoreOperations(state,seat,[outcome])}));
  }
  if (state.pendingMagic?.cpuEvent?.kind === 'fightChoice') {
    const event = state.pendingMagic.cpuEvent;
    const units = unitsInRealm(state), source = units.find(unit => sameTarget(unit.target,event.source)), target = units.find(unit => sameTarget(unit.target,event.target));
    const choices = [{key:'fight/decline',label:event.strikeOnly ? 'Do not strike' : 'Do not fight',caster:event.source,target:null,operations:[],score:0}];
    if (source && target && source.at === target.at && source.region === target.region && !isDisabled(state,source)) {
      const operations = [{kind:event.strikeOnly ? 'strike' : 'fight',source:event.source,target:event.target}];
      choices.push({key:'fight/accept',label:`${event.strikeOnly ? 'Strike' : 'Fight'} ${target.card.name}`,caster:event.source,target:null,operations,score:scoreOperations(state,seat,operations)});
    }
    return choices;
  }
  if (state.pendingMagic?.cpuEvent?.kind === 'auraEnd') return require('./timedAuras').auraEndChoices(state);
  if (state.pendingMagic?.cpuEvent?.kind === 'blazeTrail') return require('./blaze').blazeTrailChoices(state,selectionKey);
  if (state.pendingMagic?.cpuEvent?.kind === 'genesis') return require('./genesis').genesisChoices(state);
  if (!supportsSpell(name)) return [];
  const units = unitsInRealm(state);
  const casters = units.filter(u => u.owner === seat && !isDisabled(state,u) &&
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
    const targetable = visible.filter(u => u.owner === seat || !hasStealth(state,u));
    const add = (suffix, description, target, operations) => {
      const choice = { key: `${casterKey}/${suffix}`, label: `${origin.card.name}: ${description}`,
        caster, target, operations, score: scoreOperations(state, seat, operations) };
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
          label: `${origin.card.name}: shoot ${direction} — ${plan.decisions.map(d => d.label).join('; ') || 'no impact'}`,
          operations: plan.operations, score: scoreOperations(state, seat, plan.operations),
          projectile: { baseKey, selections: plan.selections, decisions: plan.decisions } });
      }
    } else if (name === 'Overpower' || name === 'Mad Dash' || name === 'Blaze') {
      for (const ally of targetable.filter(u => u.owner === seat)) {
        const operations = [{ kind: 'buff', target: ally.target, power: name === 'Overpower' ? 2 : 0, movement: name === 'Mad Dash' ? 1 : name === 'Blaze' ? 2 : 0,blaze:name === 'Blaze' }];
        if (name === 'Mad Dash') operations.unshift({ kind: 'draw', seat, count: 1 });
          add(targetKey(ally.target), `${ally.card.name}: ${name === 'Overpower' ? '+2 power' : name === 'Blaze' ? 'Movement +2; cannot be intercepted; fire trail' : 'draw a card; Movement +1'} this turn`, ally.target, operations);
      }
    } else if (name === 'Font of Life') {
      const operations = units.filter(u => u.owner === seat).map(u => ({ kind: 'mend', target: u.target, amount: bodyOfWater(state, u.at).length }));
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
            ally.target, operations);
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
      for (const at of sites.filter(at => isWater(state, at) === water)) {
        const affected = objects.filter(u => u.at === at && u.region === 'surface');
        if (!affected.length || origin.region !== 'surface') continue;
        const groups = area ? [affected] : affected.map(u => [u]);
        for (const group of groups) add(`${at}/${area ? 'all' : group[0].target.index}`,
          `${water ? 'Submerge' : 'Burrow'} ${area ? `minions and artifacts at ${at}` : group[0].card.name}`,
          area ? { kind: 'location', at } : group[0].target,
          [{ kind: 'subsurface', targets: group.map(u => u.target), state: water ? 'submerged' : 'burrowed' }]);
      }
    } else if (name === 'Riptide') {
      for (const at of sites.filter(at => isWater(state, at))) {
        for (const unit of visible.filter(u => u.region === 'surface' && inRange(u.at, at, 'adjacent') && u.at !== at)) {
          add(`${at}/${unit.at}:${unit.target.index ?? unit.owner}`, `Pull ${unit.card.name} to ${at}; draw a card`,
            { kind: 'location', at }, [{ kind: 'move', target: unit.target, to: at }, { kind: 'draw', seat, count: 1 }]);
        }
      }
    } else {
      const range = name === 'Minor Explosion' ? 'two' : name === 'Incinerate' ? 'nearby' : 'any';
      const locations = [...new Set(visible.map(u => u.at))];
      for (const at of locations) {
        const dragonOrigins = units.filter(u => u.owner === seat && u.region === origin.region && /Dragon/i.test(cards[u.card.name]?.subTypes || ''));
        if (!inRange(origin.at, at, range) && !(name === 'Incinerate' && dragonOrigins.some(u => inRange(u.at, at, 'nearby')))) continue;
        const affected = visible.filter(u => u.at === at && (name !== 'Incinerate' || u !== origin));
        if (!affected.length) continue;
        const amount = name === 'Incinerate' ? 4 : 3;
        add(at, `${name === 'Lightning Bolt' ? 'Random unit' : 'Each unit'} at ${at}: ${amount} damage`,
          { kind: 'location', at }, [{ kind: 'damage', targets: affected.map(u => u.target), amount, random: name === 'Lightning Bolt',
            ...(name !== 'Lightning Bolt' ? { element: 'fire' } : {}) }]);
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

/** @param {SpellState} state @param {LocatedUnit} unit */
function unitDefence(state, unit) {
  return unitStats(state, unit).def;
}

/** @param {SpellState} state @param {LocatedUnit} unit */
function unitStats(state, unit) {
  const item = unit.target.kind === 'permanent' ? state.permanents[unit.at]?.[unit.target.index] : null;
  const entity = item || (unit.target.kind === 'avatar' ? state.avatars[unit.target.seat] : null);
  const data = cards[unit.card.name] || unit.card;
  let bonus = Number(entity?.counters || 0);
  if (entity?.cpuTurnEffect?.turn === `${state.turn}:${state.currentPlayer}`) bonus += entity.cpuTurnEffect.power;
  for (const other of unitsInRealm(state)) {
    if (sameTarget(unit.target, other.target)) continue;
    if (isDisabled(state,other)) continue;
    if (other.card.name === 'House Arn Bannerman' && other.owner === unit.owner && other.region === unit.region && inRange(unit.at, other.at, 'nearby')) bonus++;
    if (other.card.name === 'King of the Realm' && /Mortal/.test(data.subTypes || '')) bonus++;
  }
  if (unit.card.name === 'Spire Lich' && /Tower/i.test(state.board.sites[unit.at]?.card?.name || '')) bonus += 2;
  if (unit.card.name === 'Anui Undine') bonus += bodyOfWater(state,unit.at).length;
  return { atk: Number(data.attack || 0)+bonus, def: Number(data.defence ?? data.attack ?? 0)+bonus };
}

/** @param {SpellState} state @param {LocatedUnit} unit */
function hasAirborne(state,unit) {
  return unit.region === 'surface' && !isDisabled(state,unit) && /\bAirborne\b/.test(cardText(unit.card)) &&
    !affectedByAura(state.permanents,unit.at,'Entangle Terrain');
}

/** @param {SpellState} state @param {LocatedUnit} attacker @param {string} [at] */
function getAttackTargets(state, attacker, at = attacker.at) {
  if (isDisabled(state,attacker)) return [];
  const stats = unitStats(state,attacker);
  const airborne = hasAirborne(state,attacker);
  const targets = unitsInRealm(state).filter(unit => unit.owner !== attacker.owner && unit.at === at && unit.region === attacker.region &&
    !hasStealth(state,unit) &&
    !(hasAirborne(state,unit) && !airborne)).map(unit => {
      const target = unit.target.kind === 'avatar' ? { kind: 'avatar', at, index: null }
        : { kind: 'permanent', at, index: unit.target.index };
      const defending = unitStats(state,unit);
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
}

/**
 * Plan each impact in order. Firebolts retrace the ray after each casualty;
 * piercing projectiles choose ONE unit per location, not every occupant.
 * The Codex includes the origin in Ice Lance's first three locations.
 * @param {SpellState} state @param {PlayerKey} seat @param {string} name
 * @param {LocatedUnit} origin @param {'N'|'E'|'S'|'W'} direction @param {string[]} requested
 */
function projectilePlan(state, seat, name, origin, direction, requested) {
  const units = unitsInRealm(state).map(unit => ({ ...unit }));
  const [dx,dy] = { N: [0,-1], E: [1,0], S: [0,1], W: [-1,0] }[direction];
  const [ox,oy] = origin.at.split(',').map(Number);
  const path = [];
  for (let step = 0; step < Math.max(state.board.size.w, state.board.size.h); step++) {
    const x = ox+dx*step, y = oy+dy*step, at = `${x},${y}`;
    if (x < 0 || y < 0 || x >= state.board.size.w || y >= state.board.size.h) break;
    const site = state.board.sites[at]?.card;
    if (origin.region === 'void' ? !!site : !site) break;
    if (origin.region === 'underwater' && !isWater(state, at)) break;
    if (origin.region === 'underground' && isWater(state, at)) break;
    path.push(at);
  }
  /** @type {import('./spellTypes').SpellOperation[]} */
  const operations = [];
  /** @type {{label: string, options: {key: string, label: string}[]}[]} */
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
        !dead.has(targetKey(u.target)) && !(step === 0 && u.owner === seat) && !hasStealth(state,u));
      if (!eligible.length) continue;
      const amount = name === 'Firebolts' ? 1 : name === 'Fireball' ? 4 : name === 'Heat Ray' ? 2 : 3-step;
      const options = eligible.map(u => ({ key: targetKey(u.target), label: `${u.card.name} (${u.owner === seat ? 'ally' : 'enemy'}) at ${at}` }));
      const preferred = requested[decisions.length];
      const target = eligible.find(u => targetKey(u.target) === preferred) || [...eligible].sort((a,b) =>
        scoreOperations(state, seat, [{ kind: 'damage', amount, targets: [b.target] }]) -
        scoreOperations(state, seat, [{ kind: 'damage', amount, targets: [a.target] }]))[0];
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
          defence: unitDefence(state,hit.unit)+(powerGains.get(key) || 0), avatar: hit.unit.target.kind === 'avatar',
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
  return { operations, decisions, selections };
}

/** @param {SpellState} state @param {PlayerKey} seat @param {import('./spellTypes').SpellOperation[]} operations */
function scoreOperations(state, seat, operations) {
  const units = unitsInRealm(state);
  let score = 0;
  for (const op of operations) {
    if (op.kind === 'fillRubble') { score += 2; continue; }
    if (op.kind === 'drawCards') { score += (op.spells+op.sites)*2; continue; }
    if (op.kind === 'placeTreasure' || op.kind === 'sacrificeTreasure') continue;
    if (op.kind === 'offerDraw') { score += 2; continue; }
    if (op.kind === 'chooseRandom') { score += Math.max(0,...op.outcomes.map(outcome => scoreOperations(state,seat,[outcome]))); continue; }
    if (op.kind === 'waveshaperFlood') continue;
    if (op.kind === 'stunAt') {
      score += units.filter(unit => unit.at === op.at && unit.target.kind === 'permanent' && (isDisabled(state,unit) || !/\bSubmerge\b/.test(cardText(unit.card)))).reduce((sum,unit) => sum+(unit.owner === seat ? -1 : 1)*(2+unitStats(state,unit).atk),0);
      continue;
    }
    if (op.kind === 'dragUnit') { if (op.path.length) score += scoreOperations(state,seat,[{kind:'move',target:op.target,to:op.path[op.path.length-1]}]); continue; }
    if (op.kind === 'fight' || op.kind === 'offerFight' || op.kind === 'strike') {
      const source = units.find(unit => sameTarget(unit.target,op.source)), target = units.find(unit => sameTarget(unit.target,op.target));
      if (source && target) {
        const value = scoreOperations(state,seat,[{kind:'damageEvent',hits:[{target:target.target,amount:isDisabled(state,source) ? 0 : unitStats(state,source).atk},{target:source.target,amount:op.kind === 'strike' || op.strikeOnly || isDisabled(state,target) ? 0 : unitStats(state,target).atk}]}]);
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
        if (op.region === 'underwater' && !isWater(state,at) || op.region === 'underground' && isWater(state,at)) break;
        steps = step;
        hits.push(...units.filter(unit => unit.at === at && unit.region === op.region).map(unit => ({target:unit.target,amount:4})));
      }
      if (steps) score += scoreOperations(state,seat,[{kind:'damageEvent',hits}]);
      continue;
    }
    if (op.kind === 'banishDeadFire') { score -= state.zones[op.seat].graveyard.filter(card => card.type === 'Minion' && Number(card.thresholds?.fire || 0)>0).length; continue; }
    if (op.kind === 'replaceRubble') { score += 5; continue; }
    if (op.kind === 'strikeNearby') {
      const source = units.find(unit => sameTarget(unit.target,op.source));
      if (source) score += scoreOperations(state,seat,[{kind:'damageEvent',hits:units.filter(unit => unit.region === source.region && inRange(source.at,unit.at,'nearby') && !sameTarget(unit.target,source.target)).map(unit => ({target:unit.target,amount:unitStats(state,source).atk}))}]);
      continue;
    }
    if (op.kind === 'auraUpdate') continue;
    if (op.kind === 'tapUnits') { score -= op.targets.length; continue; }
    if (op.kind === 'surface') continue;
    if (op.kind === 'gainMana') { score += op.amount; continue; }
    if (op.kind === 'sleep' || op.kind === 'immobilizeSites') continue;
    if (op.kind === 'swallow') { const target = units.find(u => sameTarget(u.target,op.target)); score += target?.owner === seat ? -5 : 5; continue; }
    if (op.kind === 'retriggerGenesis') { score += op.ats.length; continue; }
    if (op.kind === 'reorder') {
      const top = state.zones[seat].spellbook;
      const useful = card => card ? 10-Math.abs(Number(card.cost || 0)-Object.values(state.board.sites).filter(s => s.owner === (seat === 'p1' ? 1 : 2) && !s.cpuNeutral).length) : 0;
      score += op.bottom ? useful(top[1])-useful(top[0]) : op.order.reduce((sum,index,position) => sum+useful(top[index])/(position+1),0);
      continue;
    }
    if (op.kind === 'damageEvent') { score += op.hits.reduce((sum,hit) => sum + scoreOperations(state,seat,[{ kind: 'damage',targets: [hit.target],amount: hit.amount,element: hit.element }]),0); continue; }
    if (op.kind === 'summonTokens') { score += op.ats.length*4; continue; }
    if (op.kind === 'destroySite') { score += state.board.sites[op.at]?.owner === (seat === 'p1' ? 1 : 2) ? -6 : 6; continue; }
    if (op.kind === 'discard') { score -= 2; continue; }
    if (op.kind === 'spend') { score -= op.amount; continue; }
    if (op.kind === 'flood') continue;
    if (op.kind === 'raise') {
      const text = op.card ? cardText(op.card) : '';
      const unsafe = op.region === 'void' && !/\bVoidwalk\b/.test(text) || op.region === 'underwater' && !/\bSubmerge\b/.test(text) || op.region === 'underground' && !/\bBurrowing\b/.test(text);
      score += unsafe ? -50 : op.card ? Number(op.card.cost || 0)+4 : 6;
      if (op.to) score -= units.filter(u => u.at === op.to && u.owner !== seat).reduce((sum,u) => sum+unitStats(state,u).atk,0);
      continue;
    }
    if (op.kind === 'draw') { score += op.count * 2; continue; }
    if (op.kind === 'heal') {
      if (state.players[op.seat]?.lifeState === 'alive') score += Math.min(op.amount, 20 - state.players[op.seat].life) * 0.7;
      continue;
    }
    if (op.kind === 'buff' || op.kind === 'mend') {
      const unit = units.find(u => sameTarget(u.target, op.target));
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
      const unit = units.find(u => sameTarget(u.target, op.target));
      if (!unit) continue;
      const opponent = state.avatars[seat === 'p1' ? 'p2' : 'p1']?.pos?.join(',');
      if (opponent) {
        const distance = (at) => { const [x,y] = at.split(',').map(Number), [ox,oy] = opponent.split(',').map(Number); return Math.abs(x-ox)+Math.abs(y-oy); };
        score += (distance(unit.at) - distance(op.to)) * (unit.owner === seat ? 1 : -1);
      }
      // Preserve the avatar and avoid teleporting weak allies into stronger threats.
      const threat = units.filter(u => u.owner !== unit.owner && u.at === op.to)
        .reduce((sum,u) => sum + Number(cards[u.card.name]?.attack || 0),0);
      if (unit.owner === seat) score -= threat * (unit.target.kind === 'avatar' ? 3 : 0.5);
      continue;
    }
    let value = 0;
    for (const [targetIndex, target] of op.targets.entries()) {
      const unit = units.find(u => sameTarget(u.target, target));
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

module.exports = { supportsSpell, getSpellChoices, getSpellChoice, projectileKey, unitsInRealm, inRange, isWater, bodyOfWater, cardText, sameTarget, unitDefence, unitStats, getAttackTargets, scoreOperations,isDisabled,hasStealth,hasAirborne };
