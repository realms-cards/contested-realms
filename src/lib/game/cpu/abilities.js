/* eslint-disable @typescript-eslint/no-require-imports -- Shared with the Node CPU client. */
const { enterScope, leaveScope, realmUnits, scopedTileLabel } = require('./evalScope');
const { handToken, unitToken } = require('./pickTokens');
const { bodyOfWater, cardText, directionPick, getRangedTargets, isDisabled, isWater, hasStealth, near, occupies, sameTarget, inRange, unitStats, scoreOperations } = require('./spells');

/** @param {Partial<import('./spellTypes').SpellState> & {phase?: string, cpuPendingTriggerCount?: number, cpuEffectContinuations?: unknown[]}} state
 * @param {import('../store/types').PlayerKey} seat
 * @returns {(import('./spellTypes').SpellChoice & {source: Pick<import('./spellTypes').LocatedUnit,'card'|'at'|'owner'>})[]} */
function abilityChoices(state, seat) {
  // One evaluation scope: every candidate reuses the same realm scan and unit facts.
  enterScope();
  try { return choicesFor(state, seat); } finally { leaveScope(); }
}

/** @param {Partial<import('./spellTypes').SpellState> & {phase?: string, cpuPendingTriggerCount?: number, cpuEffectContinuations?: unknown[]}} state
 * @param {import('../store/types').PlayerKey} seat
 * @returns {(import('./spellTypes').SpellChoice & {source: Pick<import('./spellTypes').LocatedUnit,'card'|'at'|'owner'>})[]} */
function choicesFor(state, seat) {
  if (state.phase !== 'Main' || state.currentPlayer !== (seat === 'p1' ? 1 : 2) || state.pendingMagic || state.pendingCombat || state.cpuPendingTriggerCount || state.cpuEffectContinuations?.length) return [];
  // Socket patches can announce Main before the board/zone snapshot arrives.
  // No ability can be selected yet; let the bot's normal setup/play path run.
  if (!state.board?.sites || !state.zones?.[seat] || !state.players) return [];
  // Empty collections may be omitted from the server's initial snapshot.
  state = {...state,permanents:state.permanents || {},permanentPositions:state.permanentPositions || {},avatars:state.avatars || {}};
  const units = realmUnits(state), choices = [];
  const entity = u => u.target.kind === 'avatar' ? state.avatars[u.owner] : state.permanents[u.at][u.target.index];
  const canTap = u => !entity(u).tapped && !entity(u).summonedThisTurn && !isDisabled(state,u);
  const add = (source,key,label,operations,picks,pickLabels) => choices.push({source,key,label,operations,caster:source.target,target:null,score:scoreOperations(state,seat,operations),...(picks ? {picks} : {}),...(pickLabels ? {pickLabels} : {})});
  const owner = seat === 'p1' ? 1 : 2;
  const sites = Object.entries(state.board.sites).filter(([,tile]) => tile.card && !tile.cpuNeutral);
  const threshold = element => sites.filter(([,tile]) => tile.owner === owner).reduce((sum,[,tile]) => sum+Number(tile.card.thresholds?.[element] || 0),0);
  const fire = threshold('fire'), turnKey = `${state.turn}:${state.currentPlayer}`;
  const mana = sites.filter(([,tile]) => tile.owner === owner).length+(state.players[seat]?.mana || 0);
  for (const [at,tile] of sites) {
    if (tile.owner !== owner || state.permanents[at]?.some(item => ['Silenced','Disabled'].includes(item.card.name) && !item.attachedTo)) continue;
    const source = {card:tile.card,at,owner:seat,target:{kind:'site',at}};
    const sacrifice = {kind:'destroySite',at,sacrifice:true,instanceId:tile.card.instanceId};
    if (tile.card.name === 'Sinkhole') for (const [to] of sites.filter(([to]) => inRange(at,to,'nearby'))) {
      add(source,`sinkhole/${tile.card.instanceId || at}/${to}`,`Sinkhole: destroy the site at ${to}, then sacrifice Sinkhole`,[{kind:'destroySite',at:to},sacrifice],[to]);
    }
    if (tile.card.name === 'Vesuvius' && fire>=3) {
      add(source,`vesuvius/${tile.card.instanceId || at}`,'Vesuvius: deal 3 to every unit occupying nearby sites, then sacrifice Vesuvius',[
        {kind:'damageEvent',hits:units.filter(unit => (unit.cells || [unit.at]).some(cell => state.board.sites[cell]?.card && inRange(at,cell,'nearby'))).map(unit => ({target:unit.target,amount:3}))},sacrifice,
      ]);
    }
    const siteId = tile.card.instanceId || at, [x,y] = at.split(',').map(Number), unused = tile.cpuAbilityTurn !== turnKey;
    // "Adjacent" includes the site's own square, which Floodplain (already water) never needs to flood.
    if (tile.card.name === 'Floodplain' && unused) for (const to of [at,`${x+1},${y}`,`${x-1},${y}`,`${x},${y+1}`,`${x},${y-1}`]) {
      if (!state.board.sites[to]?.card || state.board.sites[to].card.name === 'Bedrock' || isWater(state,to)) continue;
      add(source,`floodplain/${siteId}/${to}`,`Floodplain: flood ${to} this turn`,[{kind:'stampSite',at,turnKey},{kind:'flood',ats:[to],expiresTurn:turnKey}],[to]);
    }
    if (tile.card.name === 'Cloud City' && unused && threshold('air')>=3) for (const [dx,dy] of [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]]) {
      const to = `${x+dx},${y+dy}`;
      if (x+dx<0 || y+dy<0 || x+dx>=state.board.size.w || y+dy>=state.board.size.h || state.board.sites[to]?.card) continue;
      add(source,`cloudcity/${siteId}/${to}`,`Cloud City: fly to the void at ${to}`,[{kind:'moveSite',from:at,to},{kind:'stampSite',at:to,turnKey}],[to]);
    }
    if (tile.card.name === 'Island Leviathan' && threshold('water')>=8) {
      add(source,`leviathan/${siteId}`,'Island Leviathan: transform into a Monster atop flooded Rubble',[{kind:'transformLeviathan',at}]);
    }
  }
  for (const source of units.filter(u => u.owner === seat && !isDisabled(state,u))) {
    const id = source.target.kind === 'avatar' ? seat : source.target.instanceId;
    if (!id) continue;
    if (source.card.name === 'Sparkmage' && canTap(source)) {
      const history = state.avatars[seat].cpuAirCast;
      const amount = history?.turn === `${state.turn}:${state.currentPlayer}` ? history.air : 0;
      if (amount>0) for (const at of new Set(units.filter(unit => unit.region === source.region && !sameTarget(unit.target,source.target)).flatMap(unit => unit.cells || [unit.at]).filter(cell => inRange(source.at,cell,'nearby')))) {
        const targets = units.filter(unit => occupies(unit,at) && unit.region === source.region && !sameTarget(unit.target,source.target)).map(unit => unit.target);
        add(source,`sparkmage/${id}/${at}`,`Sparkmage: tap; deal ${amount} to another random unit at ${at}`,[
          {kind:'tapUnits',targets:[source.target]},{kind:'damage',targets,amount,random:true},
        ],[at]);
      }
    }
    // No tap symbol: Vril Revenant may do this as often as its controller can pay.
    if (source.card.name === 'Vril Revenant' && mana>=1) {
      add(source,`vril/${id}`,'Vril Revenant: pay 1 mana for +1 power this turn',[
        {kind:'spend',seat,amount:1},{kind:'buff',target:source.target,power:1,movement:0},
      ]);
    }
    if (source.card.name === 'Waveshaper' && canTap(source)) {
      const water = bodyOfWater(state,source.at);
      for (const [at,tile] of Object.entries(state.board.sites)) {
        if (!tile.card || !water.some(cell => inRange(cell,at,'nearby'))) continue;
        add(source,`waveshaper/${id}/${at}`,`Waveshaper: flood ${at}; tap minions without Submerge and skip their next untap`,[
          {kind:'tapUnits',targets:[source.target]}, {kind:'waveshaperFlood',seat,at}, {kind:'stunAt',at},
        ],[at]);
      }
    }
    // With several boulders here, the boulder's card is clicked before its direction.
    const boulders = canTap(source) ? (state.permanents[source.at] || []).filter(item => item.card.name === 'Rolling Boulder').length : 0;
    if (boulders) state.permanents[source.at].forEach((item,index) => {
      if (item.card.name !== 'Rolling Boulder') return;
      const artifactId = item.instanceId || item.card.instanceId;
      if (!artifactId) return;
      const position = state.permanentPositions[artifactId]?.state;
      const region = position === 'submerged' ? 'underwater' : position === 'burrowed' ? 'underground' : state.board.sites[source.at]?.card ? 'surface' : 'void';
      if (region !== source.region) return;
      const boulder = {kind:'permanent',at:source.at,index,instanceId:artifactId};
      for (const direction of ['N','E','S','W']) {
        const {picks,pickLabels} = directionPick(source.at,direction);
        add(source,`boulder/${id}/${artifactId}/${direction}`,`${source.card.name}: tap to push Rolling Boulder ${direction}`,[
          {kind:'tapUnits',targets:[source.target]},
          {kind:'rollBoulder',target:boulder,direction,region},
        // The board card's token comes from the item's own id (a slot without one), as PermanentStack draws it.
        ],boulders>1 ? [unitToken({kind:'permanent',at:source.at,index,instanceId:item.instanceId}),...picks] : picks,pickLabels);
      }
    });
    if (source.card.name === 'Geomancer' && canTap(source) && state.zones[seat].atlas.length) {
      for (const [at,tile] of Object.entries(state.board.sites)) {
        if (tile.card?.name !== 'Rubble' || at === source.at || !inRange(source.at,at,'adjacent')) continue;
        add(source,`geomancer/${id}/${at}`,`Geomancer: replace Rubble at ${at} with the top site of your atlas`,[
          {kind:'tapUnits',targets:[source.target]},{kind:'replaceRubble',seat,at},
        ],[at]);
      }
    }
    if (['Flamecaller','Pudge Butcher'].includes(source.card.name) && canTap(source)) {
      const pudge = source.card.name === 'Pudge Butcher';
      const amount = state.zones[seat].graveyard.filter(card => card.type === 'Minion').reduce((sum,card) => sum+Number(card.thresholds?.fire || 0),0);
      if (pudge || amount>0) for (const [direction,[dx,dy]] of Object.entries({N:[0,-1],E:[1,0],S:[0,1],W:[-1,0]})) {
        const [ox,oy] = source.at.split(',').map(Number);
        const path = [];
        for (let step=0;step<Math.max(state.board.size.w,state.board.size.h);step++) {
          const x=ox+dx*step,y=oy+dy*step,at=`${x},${y}`;
          if (x<0 || y<0 || x>=state.board.size.w || y>=state.board.size.h) break;
          if (source.region === 'void' ? !!state.board.sites[at]?.card : !state.board.sites[at]?.card) break;
          if (source.region === 'underwater' && !isWater(state,at) || source.region === 'underground' && isWater(state,at)) break;
          path.push(at);
          const hits = units.filter(unit => occupies(unit,at) && unit.region === source.region && !(step === 0 && unit.owner === seat) && !hasStealth(state,unit));
          if (!hits.length) continue;
          // A unit on the source's own location is hit from every direction: its card, then an arrow, tells those apart.
          const aim = step === 0 ? directionPick(source.at,direction) : null;
          for (const hit of hits) if (pudge) add(source,`pudge/${id}/${direction}/${hit.target.kind === 'avatar' ? hit.owner : hit.target.instanceId}`,`Pudge Butcher: shoot ${direction}, drag ${hit.card.name} here, then choose whether to fight`,[
            {kind:'tapUnits',targets:[source.target]},
            {kind:'dragUnit',target:hit.target,path:path.slice(0,-1).reverse(),region:source.region},
            {kind:'offerFight',source:source.target,target:hit.target},
          ],[unitToken(hit.target),...(aim ? aim.picks : [])],aim?.pickLabels);
          else add(source,`flamecaller/${id}/${direction}/${hit.target.kind === 'avatar' ? hit.owner : hit.target.instanceId}`,`Flamecaller: banish all dead fire minions; shoot ${direction}, dealing ${amount} to ${hit.card.name}`,[
            {kind:'tapUnits',targets:[source.target]},{kind:'banishDeadFire',seat},{kind:'damageEvent',hits:[{target:hit.target,amount,element:'fire'}]},
          ],[unitToken(hit.target),...(aim ? aim.picks : [])],aim?.pickLabels);
          break;
        }
      }
    }
    if (source.card.name === 'Nimbus Jinn') {
      const targets = units.filter(u => occupies(u,source.at) && u.region === source.region && !sameTarget(u.target,source.target)).map(u => u.target);
      if (!targets.length) continue;
      state.zones[seat].hand.forEach((card,index) => {
        if (card.type === 'Site' || card.type === 'Avatar') return;
        add(source,`jinn/${id}/${card.instanceId || index}`,`Nimbus Jinn: discard ${card.name}; deal 3 to another random unit here`,[
          {kind:'discard',seat,index,instanceId:card.instanceId,cardType:'spell'},
          {kind:'damage',targets,amount:3,random:true},
        ],[handToken(seat,card.instanceId || String(index))]);
      });
    }
    if (source.card.name === 'Diluvian Kraken' && source.region === 'underwater' && canTap(source)) {
      const power = unitStats(state,source).atk;
      add(source,`kraken/${id}`,'Diluvian Kraken: tap, surface, and strike each other unit nearby',[
        {kind:'tapUnits',targets:[source.target]}, {kind:'surface',target:source.target},
        {kind:'strikeNearby',source:source.target},
      ]);
      choices[choices.length-1].score = scoreOperations(state,seat,[{kind:'damageEvent',hits:units.filter(u => u.region === 'surface' && !sameTarget(u.target,source.target) && near(source,u,'nearby')).map(u => ({target:u.target,amount:power,sourcePower:power}))}]);
    }
    // Ranged strikes and layer changes are offered for the bot's own turns; the human uses the Combat controls and the
    // context menu, so abilityPicker filters these keys (ranged/, layer/) out of the ability buttons.
    if (canTap(source)) for (const {target} of getRangedTargets(state,source)) {
      const victim = units.find(u => target.kind === 'avatar' ? u.target.kind === 'avatar' && u.owner !== seat : u.target.kind === 'permanent' && u.at === target.at && u.target.index === target.index);
      if (!victim) continue;
      const victimId = victim.target.kind === 'avatar' ? victim.owner : victim.target.instanceId || `${victim.at}:${victim.target.index}`;
      add(source,`ranged/${id}/${victimId}`,`${source.card.name}: tap to shoot ${victim.card.name} at ${victim.at}`,[
        {kind:'tapUnits',targets:[source.target]},{kind:'strikeTarget',source:source.target,target:victim.target,ranged:true},
      ],[unitToken(victim.target)]);
    }
    // Diluvian Kraken surfaces through its own ability.
    if (canTap(source) && source.target.kind === 'permanent' && source.card.name !== 'Diluvian Kraken') {
      const text = cardText(source.card), water = isWater(state,source.at), stats = unitStats(state,source);
      // Enemy power that could reach this location next turn, against what the unit has left.
      const exposed = units.filter(u => u.owner !== seat && u.region === 'surface' && near(u,source,'nearby')).reduce((sum,u) => sum+unitStats(state,u).atk,0) >= Math.max(1,stats.def-source.damage);
      if (source.region === 'surface' && state.board.sites[source.at]?.card && (water ? /\bSubmerge\b/.test(text) : /\bBurrowing\b/.test(text))) {
        const layer = water ? 'submerged' : 'burrowed';
        add(source,`layer/${id}/${layer}`,`${source.card.name}: ${water ? 'submerge' : 'burrow'} out of reach`,[{kind:'tapUnits',targets:[source.target]},{kind:'subsurface',targets:[source.target],state:layer}]);
        choices[choices.length-1].score = exposed ? Number(source.card.cost || 2)+2 : -1;
      }
      if (source.region === 'underwater' || source.region === 'underground') {
        add(source,`layer/${id}/surface`,`${source.card.name}: surface`,[{kind:'tapUnits',targets:[source.target]},{kind:'surface',target:source.target}]);
        choices[choices.length-1].score = exposed ? -1 : 1;
      }
    }
    if (!canTap(source) || source.target.kind !== 'permanent') continue;
    const carried = state.permanents[source.at].filter(p => p.attachedTo?.at === source.at && p.attachedTo.index === source.target.index);
    const ballista = carried.some(p => p.card.name === 'Siege Ballista');
    const trebuchet = carried.some(p => p.card.name === 'Payload Trebuchet');
    if (!ballista && !trebuchet) continue;
    for (const ally of units.filter(u => u.owner === seat && occupies(u,source.at) && u.region === source.region && !sameTarget(u.target,source.target) && canTap(u))) {
      const allyId = ally.target.kind === 'avatar' ? ally.owner : ally.target.instanceId;
      if (trebuchet) {
        const [sx,sy] = source.at.split(',').map(Number);
        for (let x=0;x<state.board.size.w;x++) for (let y=0;y<state.board.size.h;y++) {
          const at = `${x},${y}`;
          if (Math.abs(x-sx)+Math.abs(y-sy)>3) continue;
          // A location target hits every unit there, including allies and Stealth.
          const targets = units.filter(u => occupies(u,at) && u.region === source.region);
          if (!targets.length) continue;
          state.zones[seat].hand.forEach((card,index) => {
            const amount = Number(card.cost || 0);
            add(source,`trebuchet/${id}/${allyId}/${card.instanceId || index}/${at}`,`Payload Trebuchet: tap ${source.card.name} and ${ally.card.name}, discard ${card.name}; deal ${amount} to each unit at ${at}`,[
              {kind:'tapUnits',targets:[source.target,ally.target]},
              {kind:'discard',seat,index,instanceId:card.instanceId,cardType:'any'},
              {kind:'damageEvent',hits:targets.map(u => ({target:u.target,amount}))},
            ],[at,unitToken(ally.target),handToken(seat,card.instanceId || String(index))]);
          });
        }
      }
      if (ballista) for (const target of units.filter(u => u.region === source.region && near(source,u,'two') && (u.owner === seat || !hasStealth(state,u)))) {
        const allyId = ally.target.kind === 'avatar' ? ally.owner : ally.target.instanceId;
        const targetId = target.target.kind === 'avatar' ? target.owner : target.target.instanceId;
        add(source,`ballista/${id}/${allyId}/${targetId}`,`Siege Ballista: tap ${source.card.name} and ${ally.card.name}; deal 3 to ${target.card.name} at ${target.at}`,[
          {kind:'tapUnits',targets:[source.target,ally.target]}, {kind:'damageEvent',hits:[{target:target.target,amount:3}]},
        ],[unitToken(ally.target),unitToken(target.target)]);
      }
    }
  }
  return choices.map(choice => ({...choice,label:scopedTileLabel(choice.label,state.board.size)}));
}
module.exports = { abilityChoices };
