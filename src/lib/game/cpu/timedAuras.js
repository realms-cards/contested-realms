/* eslint-disable @typescript-eslint/no-require-imports -- Shared CPU rule semantics. */
const { enterScope, leaveScope, realmUnits } = require('./evalScope');
const { scoreOperations } = require('./spells');

/** @param {import('./spellTypes').SpellState} state @returns {import('./spellTypes').SpellChoice[]} */
function auraEndChoices(state) {
  enterScope();
  try { return choicesFor(state); } finally { leaveScope(); }
}

/** @param {import('./spellTypes').SpellState} state @returns {import('./spellTypes').SpellChoice[]} */
function choicesFor(state) {
  const event = state.pendingMagic?.cpuEvent;
  if (event?.kind !== 'auraEnd' || event.source.kind !== 'permanent') return [];
  const source = event.source;
  const entry = Object.entries(state.permanents).flatMap(([at,items]) => items.map((item,index) => ({at,index,item})))
    .find(({item,at,index}) => source.instanceId ? (item.instanceId || item.card.instanceId) === source.instanceId : source.at === at && source.index === index);
  const seat = state.pendingMagic.spell.owner === 1 ? 'p1' : 'p2';
  const add = (key,label,operations) => ({key,label,operations:operations.map(op => op.kind === 'auraUpdate' ? {...op,endKey:`${state.turn}:${state.currentPlayer}`,counter:event.counter || state.pendingMagic.spell.card.name === 'Entangle Terrain'} : op),caster:{kind:'avatar',seat},target:null,score:scoreOperations(state,seat,operations)});
  if (!entry) return [add('gone','Aura has left the realm; finish',[])];
  const {at,index,item} = entry, name = item.card.name;
  if (state.permanents[at].some(token => token.card.name === 'Silenced' && token.attachedTo?.at === at && token.attachedTo.index === index)) return [add('silenced','Aura is silenced; finish',[])];
  const target = {kind:'permanent',at,index,instanceId:item.instanceId || item.card.instanceId};
  const [x,y] = at.split(',').map(Number);
  const region = name === 'Wildfire' && !state.board.sites[at]?.card ? 'void' : 'surface';
  const units = realmUnits(state).filter(unit => unit.region === region);
  if (name === 'Entangle Terrain' || event.counter) {
    const ticks = (item.cpuAuraTicks || 0)+1;
    return [add('tick',`${name}: turn counter ${ticks}/3`,[{kind:'auraUpdate',target,ticks,dispel:ticks>=3}])];
  }
  if (name === 'Wildfire') {
    const hits = units.filter(unit => unit.at === at).map(unit => ({target:unit.target,amount:3,element:'fire'}));
    const visited = [...new Set([...(item.cpuAuraVisited || []),at])];
    const destinations = [[x-1,y],[x+1,y],[x,y-1],[x,y+1]].filter(([x,y]) => x>=0 && y>=0 && x<state.board.size.w && y<state.board.size.h)
      .map(([x,y]) => `${x},${y}`).filter(at => !visited.includes(at));
    if (!destinations.length) return [add('dispel','Wildfire: deal 3 here, then dispel (no unvisited adjacent location)',[{kind:'damageEvent',hits},{kind:'auraUpdate',target,dispel:true}])];
    return destinations.map(to => add(`wildfire/${to}`,`Wildfire: deal 3 here, then move to ${to}`,[{kind:'damageEvent',hits},{kind:'auraUpdate',target,to,visited:[...visited,to]}]));
  }
  const affected = units.filter(unit => { const [ux,uy] = unit.at.split(',').map(Number); return ux>=x && ux<=x+1 && uy>=y && uy<=y+1; });
  const damage = affected.length ? [{kind:'damage',targets:affected.map(unit => unit.target),amount:3,random:true}] : [];
  const destinations = [at,...[[x-1,y],[x+1,y],[x,y-1],[x,y+1]].filter(([x,y]) => x>=0 && y>=0 && x<state.board.size.w-1 && y<state.board.size.h-1).map(([x,y]) => `${x},${y}`)];
  return destinations.map(to => add(`storm/${to}`,`Thunderstorm: strike a random unit, ${to === at ? 'stay' : `move to ${to}`}`,[
    ...damage,{kind:'auraUpdate',target,to:to === at ? undefined : to},
  ]));
}
module.exports = { auraEndChoices };
