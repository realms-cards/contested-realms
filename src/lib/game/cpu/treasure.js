/* eslint-disable @typescript-eslint/no-require-imports -- Shared with the Node CPU client. */
/** @param {import('./spellTypes').SpellState} state
 * @returns {{target:import('./spellTypes').UnitTarget,card:import('../store/types').CardRef,at:string,carried:boolean,region:string,owner:1|2}[]} */
function treasures(state) {
  return Object.entries(state.permanents).flatMap(([at,items]) => items.flatMap((item,index) => {
    if (item.card.name !== 'Sunken Treasure') return [];
    const id = item.instanceId || item.card.instanceId;
    const attachment = item.attachedTo?.at === at ? item.attachedTo : null;
    const bearer = attachment && attachment.index>=0 ? items[attachment.index] : null;
    const avatar = attachment?.index === -1 ? state.avatars[item.owner === 1 ? 'p1' : 'p2'] : null;
    const carried = !!bearer || !!avatar && avatar.pos?.join(',') === at;
    const carrierId = bearer?.instanceId || bearer?.card.instanceId;
    const position = state.permanentPositions[carried && carrierId ? carrierId : id || ''];
    const region = carried && avatar ? 'surface' : position?.state === 'submerged' ? 'underwater' : position?.state === 'burrowed' ? 'underground' : state.board.sites[at]?.card ? 'surface' : 'void';
    return [{target:{kind:'permanent',at,index,instanceId:id},card:item.card,at,carried,region,owner:bearer?.owner || item.owner}];
  }));
}
/** @param {import('./spellTypes').SpellState} state
 * @returns {import('./spellTypes').SpellChoice[]} */
function treasureChoices(state) {
  const {isWater,sameTarget} = require('./spells');
  const pending = state.pendingMagic, event = pending?.cpuEvent;
  if (!pending || !event) return [];
  const seat = pending.spell.owner === 1 ? 'p1' : 'p2';
  const base = {caster:{kind:'avatar',seat},target:null,score:0};
  if (event.kind === 'drawChoice') return [0,1,2].map(spells => ({...base,key:`draw/${spells}`,label:`Draw ${spells} spell${spells === 1 ? '' : 's'} and ${2-spells} site${spells === 1 ? '' : 's'}`,operations:[{kind:'drawCards',seat,spells,sites:2-spells}],score:state.zones[seat].spellbook.length>=spells && state.zones[seat].atlas.length>=2-spells ? 2+spells : -1000}));
  if (event.kind !== 'treasurePlace' && event.kind !== 'treasureRecover') return [];
  const source = treasures(state).find(item => sameTarget(item.target,event.source));
  if (!source) return [{...base,key:'treasure/gone',label:'Treasure has left the realm',operations:[]}];
  if (event.kind === 'treasureRecover') return [{...base,key:'treasure/recover',label:'Sacrifice Sunken Treasure, then choose two cards to draw',operations:[{kind:'sacrificeTreasure',source:event.source},{kind:'offerDraw',seat}]}];
  const sites = Object.entries(state.board.sites).filter(([at,tile]) => tile.owner === event.castOwner && !tile.cpuNeutral && isWater(state,at));
  if (!sites.length) return [{...base,key:'treasure/no-site',label:'No allied water site remains; the conjuring fails',operations:[{kind:'sacrificeTreasure',source:event.source}]}];
  const caster = state.avatars[event.castOwner === 1 ? 'p1' : 'p2'].pos;
  return sites.map(([at]) => {
    const [x,y] = at.split(',').map(Number);
    return {...base,key:`treasure/place/${at}`,label:`Conjure Sunken Treasure underwater at ${at}`,operations:[{kind:'placeTreasure',source:event.source,at}],score:caster ? Math.abs(x-caster[0])+Math.abs(y-caster[1]) : 0,picks:[at]};
  });
}
module.exports = {treasures,treasureChoices};
