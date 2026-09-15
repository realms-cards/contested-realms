/* eslint-disable @typescript-eslint/no-require-imports -- Shared card semantics (human client and Node bot). */
const { cellOf, enterScope, leaveScope, realmUnits } = require('./evalScope');
const { optToken, unitToken } = require('./pickTokens');

// Triggered abilities queued by controller.ts as `cardTrigger` events and resolved here. "Adjacent" includes the
// card's own square and "nearby" all nine squares, both only within the source's region (rulebook).
const END_TRIGGERS = new Set(['Infernal Legion','Quarrelsome Kobolds']);
const START_TRIGGERS = new Set(['Guile Sirens','Headless Haunt']);
const START_SITE_TRIGGERS = new Set(['Maelström']);
/** @param {string} name */
function hasEndTrigger(name) { return END_TRIGGERS.has(name); }
/** @param {string} name */
function hasStartTrigger(name) { return START_TRIGGERS.has(name); }
/** @param {string} name */
function hasStartSiteTrigger(name) { return START_SITE_TRIGGERS.has(name); }

/** The location when it is a corner of the realm, else null. @param {string} at @param {{w: number, h: number}} size */
function cornerOf(at, size) {
  const [x,y] = cellOf(at);
  return (x === 0 || x === size.w-1) && (y === 0 || y === size.h-1) ? at : null;
}

/** @param {import('./spellTypes').SpellState} state @returns {import('./spellTypes').SpellChoice[]} */
function cardTriggerChoices(state) {
  enterScope();
  try { return choicesFor(state); } finally { leaveScope(); }
}

/** @param {import('./spellTypes').SpellState} state @returns {import('./spellTypes').SpellChoice[]} */
function choicesFor(state) {
  const { bodyOfWater, getRangedTargets, hasStealth, isDisabled, isWater, near, occupies, sameTarget, scoreOperations } = require('./spells');
  const { movementSteps } = require('./movement');
  const pending = state.pendingMagic, event = pending?.cpuEvent;
  if (event?.kind !== 'cardTrigger') return [];
  const seat = pending.spell.owner === 1 ? 'p1' : 'p2', name = pending.spell.card.name, turnKey = `${state.turn}:${state.currentPlayer}`;
  const units = realmUnits(state);
  /** @type {import('./spellTypes').SpellChoice[]} */
  const choices = [];
  const add = (key,label,operations,picks,pickLabels) => choices.push({key:`trigger/${key}`,label,operations,target:null,caster:{kind:'avatar',seat},
    score:scoreOperations(state,seat,operations),...(picks ? {picks} : {}),...(pickLabels ? {pickLabels} : {})});
  const idOf = unit => unit.target.kind === 'avatar' ? unit.owner : unit.target.instanceId || `${unit.at}:${unit.target.index}`;
  const src = event.source;
  // Start/end triggers stamp their source first, so a reload during the turn never resolves them twice.
  const stamp = event.trigger === 'start' || event.trigger === 'end' ? [{kind:'stampTrigger',source:src,timing:event.trigger,turnKey}] : [];
  const skip = label => { add('skip',label,stamp); return choices; };

  if (src.kind === 'site') {
    const tile = state.board.sites[src.at];
    if (tile?.card?.name !== name || (src.instanceId && tile.card.instanceId !== src.instanceId)) return skip(`${name} has left the realm`);
    if (state.permanents[src.at]?.some(item => item.card.name === 'Silenced' && !item.attachedTo)) return skip(`${name} is silenced`);
    // Maelström: each minion in this body of water takes one step toward it, along the water.
    const body = bodyOfWater(state,src.at), distance = new Map([[src.at,0]]), frontier = [src.at];
    while (frontier.length) {
      const at = frontier.shift(), [x,y] = cellOf(at);
      for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const next = `${x+dx},${y+dy}`;
        if (body.includes(next) && !distance.has(next)) { distance.set(next,distance.get(at)+1); frontier.push(next); }
      }
    }
    const moves = [];
    for (const unit of units) {
      // An oversized unit is not pulled: a step would have to move all four of its locations through the water.
      if (unit.target.kind !== 'permanent' || unit.cells || unit.at === src.at || !distance.has(unit.at) || unit.region === 'underground') continue;
      const [x,y] = cellOf(unit.at), closer = distance.get(unit.at)-1;
      const to = [[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy]) => `${x+dx},${y+dy}`).find(next => distance.get(next) === closer);
      if (to) moves.push({kind:'move',target:unit.target,to,preserveRegion:true});
    }
    const pull = optToken(src.at,'accept'), decline = optToken(src.at,'decline');
    add('pull',`Maelström: pull ${moves.length} minion${moves.length === 1 ? '' : 's'} in its body of water one step closer`,[...stamp,...moves],[pull],{[pull]:'Pull'});
    add('decline','Maelström: do not pull',stamp,[decline],{[decline]:'Skip'});
    return choices;
  }

  if (event.trigger === 'curse') {
    const curse = Object.entries(state.permanents).some(([at,items]) => items.some((item,index) =>
      src.kind === 'permanent' && (src.instanceId ? (item.instanceId || item.card.instanceId) === src.instanceId : at === src.at && index === src.index)));
    const victim = event.victim && units.find(unit => sameTarget(unit.target,event.victim));
    if (!curse || !victim) { add('gone',"Mariner's Curse: nothing left to submerge",[]); return choices; }
    add('curse',`Mariner's Curse: submerge ${victim.card.name}, then return to its owner's hand`,
      [{kind:'subsurface',targets:[victim.target],state:'submerged'},{kind:'returnToHand',target:src}]);
    return choices;
  }

  const source = units.find(unit => sameTarget(unit.target,src));
  if (!source) return skip(`${name} has left the realm`);
  if (isDisabled(state,source)) return skip(`${name} is disabled`);
  const around = range => units.filter(unit => unit.region === source.region && !sameTarget(unit.target,source.target) && near(source,unit,range));
  const targetable = unit => unit.owner === seat || !hasStealth(state,unit);

  if (event.trigger === 'corner') {
    const mark = [{kind:'markCorner',target:source.target,corner:event.corner}];
    const spell = optToken(source.at,'spell'), site = optToken(source.at,'site'), decline = optToken(source.at,'decline');
    add('spell','Wayfaring Pilgrim: draw a spell',[...mark,{kind:'draw',seat,count:1,pile:'spellbook'}],[spell],{[spell]:'Draw spell'});
    add('site','Wayfaring Pilgrim: draw a site',[...mark,{kind:'draw',seat,count:1,pile:'atlas'}],[site],{[site]:'Draw site'});
    add('decline','Wayfaring Pilgrim: do not draw',mark,[decline],{[decline]:'Skip'});
    return choices;
  }
  if (event.trigger === 'kiteStep') {
    const item = source.target.kind === 'permanent' ? state.permanents[source.at]?.[source.target.index] : null;
    const stay = optToken(source.at,'decline');
    add('stay','Kite Archer stays',[],[stay],{[stay]:'Stay'});
    if (item) for (const {at} of movementSteps(state,source.at,item)) add(`step/${at}`,`Kite Archer steps to ${at}`,[{kind:'move',target:source.target,to:at,preserveRegion:true}],[at]);
    return choices;
  }
  if (event.trigger === 'skirmish') {
    const hold = optToken(source.at,'decline'), offered = new Set();
    add('hold','Skirmishers of Mu hold fire',[],[hold],{[hold]:'Hold fire'});
    for (const cell of event.path || [source.at]) for (const {target} of getRangedTargets(state,{...source,at:cell})) {
      const victim = units.find(unit => target.kind === 'avatar' ? unit.target.kind === 'avatar' && unit.owner !== seat
        : unit.target.kind === 'permanent' && unit.at === target.at && unit.target.index === target.index);
      if (!victim || offered.has(idOf(victim))) continue;
      offered.add(idOf(victim));
      add(`shoot/${idOf(victim)}`,`Skirmishers of Mu shoot ${victim.card.name} at ${victim.at} from ${cell}`,
        [{kind:'strikeTarget',source:source.target,target:victim.target,ranged:true}],[unitToken(victim.target)]);
    }
    return choices;
  }

  if (name === 'Infernal Legion') {
    add('legion','Infernal Legion: deal 3 damage to each other adjacent unit',[...stamp,{kind:'damageEvent',hits:around('adjacent').map(unit => ({target:unit.target,amount:3,sourceName:name}))}]);
    return choices;
  }
  if (name === 'Quarrelsome Kobolds') {
    add('self','Quarrelsome Kobolds strike themselves',[...stamp,{kind:'strikeTarget',source:source.target,target:source.target}],[unitToken(source.target)]);
    for (const unit of around('adjacent').filter(targetable)) {
      add(`strike/${idOf(unit)}`,`Quarrelsome Kobolds strike ${unit.card.name} at ${unit.at}`,[...stamp,{kind:'strikeTarget',source:source.target,target:unit.target}],[unitToken(unit.target)]);
    }
    return choices;
  }
  if (name === 'Guile Sirens') {
    const [sx,sy] = cellOf(source.at);
    for (const unit of around('nearby').filter(unit => unit.owner !== seat && unit.target.kind === 'permanent' && !unit.cells && !occupies(unit,source.at) && targetable(unit))) {
      const [ux,uy] = cellOf(unit.at);
      const steps = [[Math.sign(sx-ux),0],[0,Math.sign(sy-uy)]].filter(([dx,dy]) => dx || dy).map(([dx,dy]) => `${ux+dx},${uy+dy}`)
        .filter(to => unit.region === 'void' ? !state.board.sites[to]?.card
          : !!state.board.sites[to]?.card && (unit.region !== 'underwater' || isWater(state,to)) && (unit.region !== 'underground' || !isWater(state,to)));
      for (const to of steps) {
        add(`lure/${idOf(unit)}/${to}`,`Guile Sirens force ${unit.card.name} to step to ${to}`,[...stamp,{kind:'move',target:unit.target,to,preserveRegion:true}],
          [unitToken(unit.target),...(steps.length > 1 ? [to] : [])]);
      }
    }
    if (!choices.length) add('none','Guile Sirens: no nearby enemy minion to lure',stamp);
    return choices;
  }
  if (name === 'Headless Haunt') {
    add('teleport','Headless Haunt teleports to a random site or void',[...stamp,{kind:'teleportRandom',target:source.target}]);
    return choices;
  }
  return skip(`${name}: nothing to resolve`);
}

module.exports = { cardTriggerChoices, cornerOf, hasEndTrigger, hasStartTrigger, hasStartSiteTrigger };
