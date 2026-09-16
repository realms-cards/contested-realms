/* eslint-disable @typescript-eslint/no-require-imports -- Shared card semantics. */
const { enterScope, leaveScope, realmUnits } = require('./evalScope');
const { optToken, unitToken } = require('./pickTokens');

const DEFINITIONS = new Set(['Apprentice Wizard','Grandmaster Wizard','Land Surveyor','Deep-Sea Mermaids','Slumbering Giantess','Wraetannis Titan',
  'Clamor of Harpies','Brobdingnag Bullfrog','Arid Desert','Red Desert','Remote Desert','Shifting Sands','Holy Ground',
  'Humble Village','Rustic Village','Simple Village','Quagmire','Dark Tower','Gothic Tower','Lone Tower','Observatory','Autumn River','Spring River','Summer River','Undertow',
  'Ultimate Horror','Lacuna Entity']);
/** @param {string} name */
function hasCpuGenesis(name) { return DEFINITIONS.has(name); }

/** @param {import('./spellTypes').SpellState} state @returns {import('./spellTypes').SpellChoice[]} */
function genesisChoices(state) {
  enterScope();
  try { return choicesFor(state); } finally { leaveScope(); }
}

/** @param {import('./spellTypes').SpellState} state @returns {import('./spellTypes').SpellChoice[]} */
function choicesFor(state) {
  const { cardText,inRange,isWater,bodyOfWater,unitStats,hasStealth,occupies,sameTarget,scoreOperations } = require('./spells');
  const pending = state.pendingMagic;
  if (pending?.cpuEvent?.kind !== 'genesis') return [];
  const {card,owner} = pending.spell, seat = owner === 1 ? 'p1' : 'p2', event = pending.cpuEvent;
  const units = realmUnits(state), source = event.source && units.find(u => sameTarget(u.target,event.source));
  const siteSource = event.sourceSite && Object.entries(state.board.sites).find(([at,tile]) => tile.card && (event.sourceSite.instanceId ? tile.card.instanceId === event.sourceSite.instanceId : at === event.sourceSite.at && tile.card.name === event.sourceSite.name));
  const at = source?.at || siteSource?.[0] || pending.spell.at, region = source?.region || event.region;
  const visible = units.filter(u => u.region === region && (u.owner === seat || !hasStealth(state,u)));
  const sites = Object.keys(state.board.sites).filter(at => state.board.sites[at]?.card);
  /** @type {import('./spellTypes').SpellChoice[]} */
  const choices = [];
  const add = (key,label,operations,picks,pickLabels) => choices.push({key:`genesis/${key}`,label,operations,target:null, caster:{kind:'avatar',seat},score:scoreOperations(state,seat,operations),...(picks ? {picks} : {}),...(pickLabels ? {pickLabels} : {})});
  const name = card.name;
  if ((card.type === 'Minion' && event.source && !source) || (event.sourceSite && !siteSource)) {
    add('gone','The source left the realm; skip its Genesis',[]);
    return choices;
  }
  if (['Apprentice Wizard','Grandmaster Wizard','Land Surveyor','Deep-Sea Mermaids'].includes(name)) {
    add('draw',name === 'Deep-Sea Mermaids' ? 'Draw your bottommost spell' : name === 'Land Surveyor' ? 'Draw a site' : 'Draw spells',
      [{kind:'draw',seat,count:name === 'Grandmaster Wizard' ? 3 : 1,pile:name === 'Land Surveyor' ? 'atlas' : 'spellbook',bottom:name === 'Deep-Sea Mermaids'}]);
  } else if (name === 'Slumbering Giantess' && source) add('sleep','Fall asleep until hurt',[{kind:'sleep',target:source.target}]);
  else if (name === 'Wraetannis Titan' && source) add('strike','Strike each enemy here',[{kind:'damageEvent',hits:units.filter(u => u.owner !== seat && occupies(u,at) && u.region === region).map(u => ({target:u.target,amount:unitStats(state,source).atk,sourcePower:unitStats(state,source).atk}))}]);
  else if (name === 'Clamor of Harpies' && source) {
    for (const target of visible.filter(u => u.target.kind === 'permanent' && !sameTarget(u.target,source.target) && unitStats(state,u).atk<unitStats(state,source).atk)) {
      const id = target.target.instanceId || `${target.at}:${target.target.index}`;
      add(`${id}/move`,`Teleport ${target.card.name} here, then choose whether to strike`,[{kind:'move',target:target.target,to:at,preserveRegion:true},{kind:'offerFight',source:source.target,target:target.target,strikeOnly:true}],[unitToken(target.target)]);
    }
  } else if (name === 'Brobdingnag Bullfrog' && source) {
    for (const target of visible.filter(u => occupies(u,at) && u.target.kind === 'permanent' && !sameTarget(u.target,source.target))) add(target.target.instanceId || String(target.target.index),`Swallow ${target.card.name}`,[{kind:'swallow',target:target.target,carrier:source.target}],[unitToken(target.target)]);
  } else if (['Arid Desert','Red Desert','Remote Desert'].includes(name)) {
    for (const to of sites.filter(to => inRange(at,to,'nearby'))) add(to,`Deal 1 to every minion atop ${to}`,[{kind:'damageEvent',hits:units.filter(u => occupies(u,to) && u.region === 'surface' && u.target.kind === 'permanent').map(u => ({target:u.target,amount:1,sourceName:name}))}],[to]);
  } else if (name === 'Shifting Sands') add('deserts','Reactivate nearby Desert Genesis abilities',[{kind:'retriggerGenesis',ats:sites.filter(to => inRange(at,to,'nearby') && ['Arid Desert','Red Desert','Remote Desert'].includes(state.board.sites[to].card.name))}]);
  else if (name === 'Holy Ground') add('heal','Each nearby Avatar heals 3 life',units.filter(u => u.target.kind === 'avatar' && inRange(at,u.at,'nearby')).map(u => ({kind:'mend',target:u.target,amount:3})));
  else if (['Humble Village','Rustic Village','Simple Village'].includes(name)) {
    const mana = sites.filter(at => !state.board.sites[at].cpuNeutral && state.board.sites[at].owner === owner).length+(state.players[seat]?.mana || 0);
    const soldier = optToken(at,'soldier'), decline = optToken(at,'decline');
    if (mana>=1) add('soldier','Pay 1 mana to summon a Foot Soldier here',[{kind:'spend',seat,amount:1},{kind:'summonTokens',seat,ats:[at]}],[soldier],{[soldier]:'Summon Foot Soldier (1)'});
    add('decline','Do not summon a Foot Soldier',[],[decline],{[decline]:'Skip'});
  } else if (name === 'Quagmire') add('immobile','Units occupying nearby sites are Immobile until your next turn',[{kind:'immobilizeSites',ats:sites.filter(to => inRange(at,to,'nearby')),untilTurn:state.turn+2}]);
  else if (['Dark Tower','Gothic Tower','Lone Tower'].includes(name)) {
    const unique = sites.filter(at => !state.board.sites[at].cpuNeutral && state.board.sites[at].owner === owner && state.board.sites[at].card.name === name).length === 1;
    add('mana',unique ? 'Gain 1 mana this turn' : 'No bonus: another copy is controlled',unique ? [{kind:'gainMana',seat,amount:1}] : []);
  } else if (['Observatory','Autumn River','Spring River','Summer River'].includes(name)) {
    const top = state.zones[seat].spellbook.slice(0,name === 'Observatory' ? 3 : 1);
    const permutations = values => values.length ? values.flatMap(v => permutations(values.filter(other => other !== v)).map(rest => [v,...rest])) : [[]];
    for (const order of permutations(top.map((_,index) => index))) add(order.join('-'),`Top first: ${order.map(i => top[i].name).join(', ') || 'empty spellbook'}`,[{kind:'reorder',seat,order}]);
    if (top.length && name !== 'Observatory') add('bottom',`Put ${top[0].name} on the bottom`,[{kind:'reorder',seat,order:[0],bottom:true}]);
  } else if (name === 'Undertow') {
    const body = bodyOfWater(state,at);
    for (const target of units.filter(u => body.includes(u.at) && (u.owner === seat || !hasStealth(state,u)))) for (const to of body.filter(to => to !== target.at && inRange(target.at,to,'adjacent') && isWater(state,to))) {
      add(`${target.target.kind === 'avatar' ? target.owner : target.target.instanceId}/${to}`,`Move ${target.card.name} to ${to}`,[{kind:'move',target:target.target,to,preserveRegion:true}],[unitToken(target.target),to]);
    }
  }
  else if (name === 'Lacuna Entity' && source) {
    // "Ignoring regions": a burrowed, submerged or void minion is dragged up to the Entity's location.
    for (const target of units.filter(u => u.target.kind === 'permanent' && !sameTarget(u.target,source.target) && u.at !== at &&
        inRange(at,u.at,'adjacent') && state.board.sites[u.at]?.card && unitStats(state,u).atk<unitStats(state,source).atk &&
        (u.owner === seat || !hasStealth(state,u)))) {
      add(target.target.instanceId || `${target.at}:${target.target.index}`,`Drag ${target.card.name} from ${target.at} to ${at}`,
        [{kind:'move',target:target.target,to:at}],[unitToken(target.target)]);
    }
  } else if (name === 'Ultimate Horror' && source) {
    // "Each other dead Voidwalk minion": they are summoned together, so each nearby location is one choice.
    const graveyard = state.zones[seat].graveyard;
    const dead = graveyard.map((card,graveyardIndex) => ({card,graveyardIndex}))
      .filter(entry => entry.card.type === 'Minion' && entry.card.name !== name && /\bVoidwalk\b/.test(cardText(entry.card)));
    const [cx,cy] = at.split(',').map(Number), w = state.board.size?.w || 5, h = state.board.size?.h || 4;
    if (dead.length) for (let dy=-1;dy<=1;dy++) for (let dx=-1;dx<=1;dx++) {
      const x=cx+dx,y=cy+dy,to=`${x},${y}`;
      if (x<0 || y<0 || x>=w || y>=h) continue;
      const region = state.board.sites[to]?.card ? 'surface' : 'void';
      add(to,`Summon ${dead.map(entry => entry.card.name).join(', ')} to the ${region === 'void' ? 'void' : 'site'} at ${to}`,
        dead.map(entry => ({kind:'raise',seat,to,region,card:entry.card,fromSeat:seat,graveyardIndex:entry.graveyardIndex})),[to]);
    }
  }
  if (!choices.length) add('none','No legal targets; finish Genesis',[]);
  return choices;
}
// Deathrite: "when this dies, do what is stated", resolved where it died (spell.at, cpuEvent.region) after it left the realm.
const DEATHRITES = new Set(['Sacred Scarabs','The Ninth Legion']);
/** @param {string} name */
function hasCpuDeathrite(name) { return DEATHRITES.has(name); }

/** @param {import('./spellTypes').SpellState} state @returns {import('./spellTypes').SpellChoice[]} */
function deathriteChoices(state) {
  enterScope();
  try {
    const { occupies, scoreOperations } = require('./spells');
    const pending = state.pendingMagic;
    if (pending?.cpuEvent?.kind !== 'deathrite') return [];
    const {card,owner,at} = pending.spell, seat = owner === 1 ? 'p1' : 'p2', region = pending.cpuEvent.region;
    if (card.name === 'The Ninth Legion') {
      // The Deathrite resolves after the card reached its owner's cemetery, so it returns from there.
      const operations = [{kind:'recoverCard',seat,instanceId:card.instanceId,name:card.name}];
      return [{key:'deathrite/return',label:`Return ${card.name} to hand`,operations,target:null,caster:{kind:'avatar',seat},
        score:scoreOperations(state,seat,operations),autoResolve:true}];
    }
    if (card.name !== 'Sacred Scarabs') return [];
    const operations = [{kind:'damageEvent',hits:realmUnits(state).filter(u => occupies(u,at) && u.region === region).map(u => ({target:u.target,amount:3,sourceName:card.name}))}];
    return [{key:'deathrite/scarabs',label:`Deal 3 damage to each unit at ${at}`,operations,target:null,caster:{kind:'avatar',seat},score:scoreOperations(state,seat,operations),autoResolve:true}];
  } finally { leaveScope(); }
}
module.exports = { hasCpuGenesis,genesisChoices,hasCpuDeathrite,deathriteChoices };
