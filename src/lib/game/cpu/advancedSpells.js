/* eslint-disable @typescript-eslint/no-require-imports -- Shared by the CommonJS bot and browser. */
const { bestByScore, cellOf, facts, realmUnits, snapshotOf } = require('./evalScope');

// Damage grids transcribed from data/beta/b_s/{cone_of_flame,major_explosion,craterize}_b_s.png.
const CRATER = [[1,2,4,2,1],[2,4,7,4,2],[4,7,10,7,4],[2,4,7,4,2],[1,2,4,2,1]];
const MAJOR = [[3,5,3],[5,7,5],[3,5,3]];

/**
 * @param {import('./spellTypes').SpellState} state
 * @param {import('../store/types').PlayerKey} seat
 * @param {string} name
 * @param {import('./spellTypes').LocatedUnit} origin
 * @param {(key: string, label: string, target: import('../store/types').MagicTarget | null, operations: import('./spellTypes').SpellOperation[], picks?: import('./spellTypes').SpellChoice['picks']) => import('./spellTypes').SpellChoice} add
 * @param {string} casterKey
 * @param {string} [selectionKey]
 */
function advancedSpellChoices(state, seat, name, origin, add, casterKey, selectionKey) {
  // Deferred import avoids executing the mutually shared helpers during module initialization.
  const { inRange, isWater, hasStealth, scoreOperations, projectileKey } = require('./spells');
  // Shared read-only realm units of the active evaluation scope.
  const units = realmUnits(state);
  const sites = Object.keys(state.board.sites).filter(at => state.board.sites[at]?.card);
  const owner = seat === 'p1' ? 1 : 2;
  const locations = [];
  for (let y=0;y<state.board.size.h;y++) for (let x=0;x<state.board.size.w;x++) locations.push(`${x},${y}`);
  const regionAt = at => state.board.sites[at]?.card ? origin.region === 'void' ? null : origin.region : origin.region === 'void' ? 'void' : null;
  if (name === 'Chain Lightning') {
    // Precons have one mana per controlled site, plus the shared spend/gain ledger.
    const mana = Math.max(0,sites.filter(at => state.board.sites[at].owner === owner && !state.board.sites[at].cpuNeutral).length + (state.players[seat]?.mana || 0));
    // An unselected chain depends on the realm snapshot, seat, mana and region but never on the
    // caster, so casters share the targetable list, each target's 2-damage score and the chains.
    const memos = facts(snapshotOf(state),'chainLightning'), memoKey = `${seat}|${mana}|${origin.region}`;
    let memo = memos.get(memoKey);
    if (!memo) memos.set(memoKey, memo = {
      targetable: units.filter(u => u.region === origin.region && (u.owner === seat || !hasStealth(state,u))),
      scores: new Map(), chains: new Map(),
    });
    const {targetable,scores,chains} = memo;
    const scoreOf = unit => {
      let score = scores.get(unit);
      if (score === undefined) scores.set(unit, score = scoreOperations(state,seat,[{kind:'damage',targets:[unit.target],amount:2}]));
      return score;
    };
    const id = unit => unit.target.kind === 'avatar' ? unit.owner : unit.target.instanceId || `${unit.at}:${unit.target.index}`;
    const plan = (first, requested) => {
      const chain = [first], selections = [], decisions = [];
      for (let step=0;step<Math.floor(mana/2);step++) {
        const previous = chain[chain.length-1];
        const eligible = targetable.filter(u => !chain.includes(u) && inRange(previous.at,u.at,'nearby'));
        if (!eligible.length) break;
        const best = bestByScore(eligible,scoreOf);
        const preferred = requested[step];
        const next = preferred === 'stop' ? null : eligible.find(u => id(u) === preferred) ||
          (scoreOf(best) > 2 ? best : null);
        // A tile click names an option only when no other eligible unit shares that tile; the rest are picked from the list.
        const onTile = new Map();
        for (const u of eligible) onTile.set(u.at,(onTile.get(u.at) || 0)+1);
        decisions.push({label:`After ${previous.card.name}: spend 2 additional mana or stop`,options:[{key:'stop',label:'Stop the chain'},...eligible.map(u => { const key = id(u), label = `${u.card.name} at ${u.at}`; return onTile.get(u.at) === 1 ? {key,label,at:u.at} : {key,label}; })]});
        selections.push(next ? id(next) : 'stop');
        if (!next) break;
        chain.push(next);
      }
      return {chain,selections,decisions};
    };
    for (const first of targetable.filter(u => inRange(origin.at,u.at,'nearby'))) {
      const suffix = `chain:${id(first)}`, baseKey = `${casterKey}/${suffix}`;
      let requested = [];
      if (selectionKey?.startsWith(`${baseKey}|`)) {
        try { const value = JSON.parse(decodeURIComponent(selectionKey.slice(baseKey.length+1))); if (Array.isArray(value) && value.length <= units.length && value.every(v => typeof v === 'string')) requested = value; } catch { continue; }
      }
      let planned = requested.length ? undefined : chains.get(first);
      if (!planned) {
        planned = plan(first,requested);
        if (!requested.length) chains.set(first,planned);
      }
      // Decisions are re-labelled into fresh objects by getSpellChoices; selections and operations stay per choice.
      const {chain,decisions} = planned, selections = [...planned.selections];
      const operations = [{kind:'spend',seat,amount:2*(chain.length-1)},{kind:'damageEvent',hits:chain.map(u => ({target:u.target,amount:2}))}];
      const choice = add(suffix,`Chain from ${first.card.name}: ${chain.length} units; ${2*(chain.length-1)} additional mana`,first.target,operations,[first.at]);
      choice.projectile = {baseKey,selections,decisions};
      if (requested.length) choice.key = projectileKey(baseKey,selections);
    }
    return true;
  }
  if (name === 'Cone of Flame') {
    const [ox,oy] = origin.at.split(',').map(Number);
    for (const [direction,dx,dy] of [['N',0,-1],['E',1,0],['S',0,1],['W',-1,0]]) {
      const hits = [], wedge = [];
      for (let step=1;step<=3;step++) for (let side=1-step;side<step;side++) {
        const x = ox+dx*step-dy*side, y = oy+dy*step+dx*side, at = `${x},${y}`;
        if (x>=0 && y>=0 && x<state.board.size.w && y<state.board.size.h) wedge.push(at);
        for (const unit of units.filter(u => u.at === at && u.region === origin.region)) hits.push({ target: unit.target,amount: 7-2*step,element: 'fire' });
      }
      add(direction,`Cone ${direction}: 5, 3, then 1 damage`,{ kind: 'projectile',direction },[{ kind: 'damageEvent',hits }],wedge.length ? [wedge] : []);
    }
    return true;
  }
  if (name === 'Major Explosion' || name === 'Craterize') {
    const crater = name === 'Craterize', grid = crater ? CRATER : MAJOR, radius = crater ? 2 : 1;
    const discards = state.zones[seat].hand.map((card,index) => ({card,index})).filter(({card}) => card.type === 'Site');
    for (const at of crater ? sites : locations) {
      if (!crater && (!inRange(origin.at,at,'two') || regionAt(at) !== origin.region)) continue;
      const [cx,cy] = at.split(',').map(Number), hits = [];
      for (const unit of units) {
        if (crater ? !state.board.sites[unit.at]?.card : unit.region !== origin.region) continue;
        const [ux,uy] = cellOf(unit.at);
        const amount = grid[uy-cy+radius]?.[ux-cx+radius];
        if (amount) hits.push({ target: unit.target,amount,...(!crater ? {element:'fire'} : {}) });
      }
      if (crater) {
        for (const {card,index} of discards) add(`${at}/${card.instanceId || index}`,`Discard ${card.name}; destroy ${at}; resolve impact`,{kind:'location',at},[
          {kind:'discard',seat,instanceId:card.instanceId,index}, {kind:'destroySite',at}, {kind:'damageGrid',at,grid:CRATER},
        ],[at]);
      } else add(at,`Explosion centered at ${at}: 7 / 5 / 3 damage`,{kind:'location',at},[{kind:'damageEvent',hits}],[at]);
    }
    return true;
  }
  if (name === 'Border Militia') {
    const ats = sites.filter(at => !state.board.sites[at].cpuNeutral && state.board.sites[at].owner === owner && sites.some(other => !state.board.sites[other].cpuNeutral && at !== other && inRange(at,other,'adjacent') && state.board.sites[other].owner === (owner === 1 ? 2 : 1)));
    add('militia',`Summon ${ats.length} Foot Soldier${ats.length === 1 ? '' : 's'} to border sites`,null,[{kind:'summonTokens',seat,ats}]);
    return true;
  }
  if (name === 'Wrath of the Sea') {
    // Snapshot the existing water before flooding: this expands by ONE ring, not recursively.
    const water = sites.filter(at => isWater(state,at));
    const ats = sites.filter(at => !isWater(state,at) && state.board.sites[at].card.name !== 'Bedrock' && water.some(w => inRange(w,at,'adjacent')));
    const affected = new Set([...water,...ats]);
    const targets = [];
    for (const at of affected) (state.permanents[at] || []).forEach((item,index) => {
      if (item.card.type !== 'Minion' && item.card.type !== 'Artifact' && item.card.name !== 'Foot Soldier') return;
      const position = state.permanentPositions[item.instanceId || item.card.instanceId]?.state || 'surface';
      if (position === 'surface') targets.push({kind:'permanent',at,index,instanceId:item.instanceId || item.card.instanceId});
    });
    const choice = add('flood',`Flood ${ats.length} sites this turn; submerge minions and artifacts on water`,null,[
      {kind:'flood',ats,expiresTurn:`${state.turn}:${state.currentPlayer}`}, {kind:'subsurface',targets,state:'submerged'},
    ]);
    // Keep the predicted score, but determine actual occupants after flooding
    // and any intervening events, not when the spell was announced.
    choice.operations[1] = {kind:'submergeWater'};
    return true;
  }
  if (name === 'Raise Dead') {
    const outcomes = state.pendingMagic?.cpuRandomMinionOptions;
    if (outcomes?.length) {
      outcomes.forEach((selected,index) => advancedSpellChoices({...state,pendingMagic:{...state.pendingMagic,cpuRandomMinion:selected,cpuRandomMinionOptions:undefined}},seat,name,origin,
        (key,label,target,operations,picks) => add(`outcome-${index}/${key}`,`Lucky Charm result ${index+1}: ${label}`,target,operations,picks),casterKey,selectionKey));
      return true;
    }
    const selected = state.pendingMagic?.spell.card.name === name ? state.pendingMagic.cpuRandomMinion : null;
    if (!selected) {
      const eligible = ['p1','p2'].some(seat => state.zones[seat].graveyard.some(card => card.type === 'Minion'));
      add('random','Randomly select a dead minion from either cemetery',null,eligible ? [{kind:'raise',seat}] : []);
    } else {
      for (const at of locations) {
        const site = state.board.sites[at]?.card;
        // The effect summons without casting: no ownership, mana, or threshold restrictions.
        for (const region of site ? ['surface',isWater(state,at) ? 'underwater' : 'underground'] : ['void']) {
          if (site?.name === 'Mountain Pass' && region === 'surface' && units.some(u => u.at === at && u.region === 'surface' && u.target.kind === 'permanent')) continue;
          add(`${at}/${region}`,`Summon ${selected.card.name} at ${at} (${region})`,{kind:'location',at},[{kind:'raise',seat,to:at,region,...selected}],[at]);
        }
      }
    }
    return true;
  }
  return false;
}

module.exports = { advancedSpellChoices };
