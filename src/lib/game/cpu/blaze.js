/* eslint-disable @typescript-eslint/no-require-imports -- Shared pure choice generation. */
const { movementAllowance, movementRoutes, movementSteps } = require('./movement');

/** @param {import('./spellTypes').SpellState} state @param {string} [key] @returns {import('./spellTypes').SpellChoice[]} */
function blazeTrailChoices(state,key) {
  const { unitsInRealm,sameTarget,scoreOperations,projectileKey } = require('./spells');
  const pending = state.pendingMagic, event = pending?.cpuEvent;
  if (event?.kind !== 'blazeTrail') return [];
  const mover = unitsInRealm(state).find(u => sameTarget(u.target,event.source));
  const seat = pending.spell.owner === 1 ? 'p1' : 'p2';
  const entity = mover?.target.kind === 'permanent' ? state.permanents[mover.at][mover.target.index] : state.avatars[seat];
  const unit = {...entity,card:pending.spell.card,owner:pending.spell.owner};
  const baseKey = 'blaze-trail', decisions = [], selections = [], path = [event.from];
  let requested = [], budget = movementAllowance(state,unit);
  if (key?.startsWith(baseKey+'|')) {
    try {const parsed = JSON.parse(decodeURIComponent(key.slice(baseKey.length+1))); if (Array.isArray(parsed) && parsed.length<=100 && parsed.every(v => typeof v === 'string')) requested = parsed;} catch {return [];}
  }
  const route = movementRoutes(state,event.from,unit).get(event.to);
  // A teleport or forced move outside basic range leaves only the departed location.
  if (event.forced || !route || !mover) path.push(event.to);
  else for (let step=0;step<100;step++) {
    const at = path[path.length-1];
    const options = movementSteps(state,at,unit,event.from).filter(option => option.cost<=budget &&
      !!movementRoutes(state,option.at,unit,budget-option.cost).get(event.to));
    const shortest = movementRoutes(state,at,unit,budget).get(event.to)?.path[1];
    const preferred = requested[step];
    const next = at === event.to && (!preferred || preferred === 'stop') ? null : options.find(o => o.at === preferred) || options.find(o => o.at === shortest);
    if (!options.length && at !== event.to) return [];
    decisions.push({label:`Trail step ${step+1} from ${at}`,options:[...(at === event.to ? [{key:'stop',label:'Stop here'}] : []),...options.map(o => ({key:o.at,label:o.at}))]});
    selections.push(next?.at || 'stop');
    if (!next) break;
    path.push(next.at); budget-=next.cost;
  }
  if (path[path.length-1] !== event.to) return [];
  const departed = new Set(path.slice(0,-1));
  const hits = unitsInRealm(state).filter(u => departed.has(u.at) && u.region === event.region).map(u => ({target:u.target,amount:2,element:'fire'}));
  const operations = [{kind:'damageEvent',hits}];
  return [{key:requested.length ? projectileKey(baseKey,selections) : baseKey,label:`Fire trail: ${[...departed].join(' → ')}; 2 damage to each unit there`,
    caster:{kind:'avatar',seat},target:null,operations,score:scoreOperations(state,seat,operations),projectile:{baseKey,selections,decisions}}];
}
module.exports = { blazeTrailChoices };
