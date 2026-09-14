/* eslint-disable @typescript-eslint/no-require-imports -- Shared pure choice generation. */
const { enterScope, leaveScope, realmUnits } = require('./evalScope');
const { movementAllowance, movementRoutes, movementSteps } = require('./movement');
const { optToken } = require('./pickTokens');

/** @param {import('./spellTypes').SpellState} state @param {string} [key] @returns {import('./spellTypes').SpellChoice[]} */
function blazeTrailChoices(state,key) {
  enterScope();
  try { return trailChoices(state,key); } finally { leaveScope(); }
}

/**
 * Number of cheapest routes from `from` to `to` within `budget`, layered over movementSteps by
 * the route costs (Infinity when a zero-cost loop makes them unbounded).
 * @param {import('./spellTypes').SpellState} state @param {string} from @param {string} to
 * @param {import('../store/types').PermanentItem} unit @param {number} budget @returns {number}
 */
function shortestRouteCount(state,from,to,unit,budget) {
  const routes = movementRoutes(state,from,unit,budget), goal = routes.get(to)?.cost;
  if (goal === undefined) return 0;
  /** @type {Map<string,number>} */
  const counts = new Map();
  /** @param {string} at @returns {number} */
  const count = at => {
    if (at === to) return 1;
    const known = counts.get(at), here = routes.get(at)?.cost ?? Infinity;
    if (known !== undefined) return known;
    counts.set(at,Infinity); // Re-entered through a zero-cost loop.
    let total = 0;
    for (const step of movementSteps(state,at,unit,from)) {
      const cost = here+step.cost;
      if (cost<=goal && routes.get(step.at)?.cost === cost) total += count(step.at);
    }
    counts.set(at,total);
    return total;
  };
  return count(from);
}

/** @param {import('./spellTypes').SpellState} state @param {string} [key] @returns {import('./spellTypes').SpellChoice[]} */
function trailChoices(state,key) {
  const { sameTarget,scoreOperations,projectileKey } = require('./spells');
  const pending = state.pendingMagic, event = pending?.cpuEvent;
  if (event?.kind !== 'blazeTrail') return [];
  const mover = realmUnits(state).find(u => sameTarget(u.target,event.source));
  const seat = pending.spell.owner === 1 ? 'p1' : 'p2';
  const entity = mover?.target.kind === 'permanent' ? state.permanents[mover.at][mover.target.index] : state.avatars[seat];
  const unit = {...entity,card:pending.spell.card,owner:pending.spell.owner};
  const baseKey = 'blaze-trail', decisions = [], selections = [], path = [event.from];
  /** @type {Record<string,string>} */
  const pickLabels = {};
  // The controller bounds a drag by the steps left when it was queued; trails resolved since then shrink that budget.
  const effect = mover && entity?.cpuTurnEffect?.turn === `${state.turn}:${state.currentPlayer}` ? entity.cpuTurnEffect : null;
  const left = movementAllowance(state,unit)-(effect?.steps || 0);
  const allowance = typeof event.budget === 'number' ? Math.min(event.budget,left) : left;
  let requested = [], budget = allowance, spent = 0;
  if (key?.startsWith(baseKey+'|')) {
    try {const parsed = JSON.parse(decodeURIComponent(key.slice(baseKey.length+1))); if (Array.isArray(parsed) && parsed.length<=100 && parsed.every(v => typeof v === 'string')) requested = parsed;} catch {return [];}
  }
  // A layer change in place departs only its old region.
  const shift = event.from === event.to;
  const route = event.forced || !mover || shift || allowance<=0 ? undefined : movementRoutes(state,event.from,unit,budget).get(event.to);
  if (!event.forced && mover && (allowance<=0 || !shift && !route)) {
    // Nothing left to walk: the trail fizzles without a prompt, as the controller does for an out-of-range drag.
    const operations = [{kind:'damageEvent',hits:[]},{kind:'moveSpent',target:event.source,steps:0}];
    return [{key:requested.length ? projectileKey(baseKey,requested) : baseKey,label:`No fire trail: ${allowance<=0 ? 'no movement left this turn' : `no legal route within ${allowance} remaining step${allowance === 1 ? '' : 's'}`}`,
      caster:{kind:'avatar',seat},target:null,operations,score:scoreOperations(state,seat,operations),autoResolve:true,projectile:{baseKey,selections,decisions}}];
  }
  // A teleport or forced move outside basic range leaves only the departed location.
  if (event.forced || !mover || shift) { path.push(event.to); spent = event.forced ? 0 : 1; }
  else for (let step=0;step<100;step++) {
    const at = path[path.length-1];
    const options = movementSteps(state,at,unit,event.from).filter(option => option.cost<=budget &&
      !!movementRoutes(state,option.at,unit,budget-option.cost).get(event.to));
    const shortest = movementRoutes(state,at,unit,budget).get(event.to)?.path[1];
    const preferred = requested[step];
    const next = at === event.to && (!preferred || preferred === 'stop') ? null : options.find(o => o.at === preferred) || options.find(o => o.at === shortest);
    if (!options.length && at !== event.to) return [];
    const stop = optToken(at,'stop');
    if (at === event.to) pickLabels[stop] = 'Stop here';
    decisions.push({label:`Trail step ${step+1} from ${at}`,options:[...(at === event.to ? [{key:'stop',label:'Stop here',at:stop}] : []),...options.map(o => ({key:o.at,label:o.at,at:o.at}))]});
    selections.push(next?.at || 'stop');
    if (!next) break;
    path.push(next.at); budget-=next.cost; spent+=next.cost;
  }
  if (path[path.length-1] !== event.to) return [];
  const departed = new Set(path.slice(0,-1));
  const hits = realmUnits(state).filter(u => departed.has(u.at) && u.region === event.region).map(u => ({target:u.target,amount:2,element:'fire'}));
  // Each stop costs at least a step, so free Updraft Ridge hops cannot fire trails without end.
  const operations = [{kind:'damageEvent',hits},{kind:'moveSpent',target:event.source,steps:event.forced ? 0 : Math.max(1,spent)}];
  // With a single cheapest route the default plan needs no prompt.
  const unique = !requested.length && !event.forced && !!route && !!mover && shortestRouteCount(state,event.from,event.to,unit,allowance) === 1;
  return [{key:requested.length ? projectileKey(baseKey,selections) : baseKey,label:`Fire trail: ${[...departed].join(' → ')}; 2 damage to each unit there`,
    caster:{kind:'avatar',seat},target:null,operations,score:scoreOperations(state,seat,operations),...(unique ? {autoResolve:true} : {}),projectile:{baseKey,selections,decisions},
    ...(Object.keys(pickLabels).length ? {pickLabels} : {})}];
}
module.exports = { blazeTrailChoices };
