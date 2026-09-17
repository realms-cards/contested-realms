import type { StateCreator } from "zustand";
import { applyDamageEvent, loseStealth } from "@/lib/game/cpu/damage";
import { luckyCharmCount } from "@/lib/game/cpu/luckyCharm";
import type { CpuEffectCompletion, SpellChoice, SpellOperation, UnitTarget } from "@/lib/game/cpu/spellTypes";
import { cardSubTypes, cardText, expandAreaOperation, hasKeyword, hasStealth, inRange, isDisabled, isProtected, isWater, near, occupies, projectileImpactChoices, sameTarget, shareLocation, stealthTokenIndex, unitsInRealm, unitStats } from "@/lib/game/cpu/spells";
import type { CardRef, GameState, PlayerKey } from "@/lib/game/store/types";
import { prepareCardForSeat, toTransformedSiteMinionCard } from "@/lib/game/store/utils/cardHelpers";
import { buildMoveDeltaPatch } from "@/lib/game/store/utils/patchHelpers";
import { movePermanentCore } from "@/lib/game/store/utils/permanentHelpers";
import { createZonesPatchFor } from "@/lib/game/store/utils/zoneHelpers";
import { newTokenInstanceId, stealthTokenFor, TOKEN_BY_NAME, tokenSlug } from "@/lib/game/tokens";

type StoreSet = Parameters<StateCreator<GameState>>[0];
type StoreGet = Parameters<StateCreator<GameState>>[1];

// All mutation happens through the game store, with normal patches and death
// triggers. Stable identities survive earlier kills in multi-target spells.
export function applySpellChoice(set: StoreSet, get: StoreGet, choice: SpellChoice, rng = Math.random, completion?: CpuEffectCompletion): boolean {
  const operations = [...(choice.resolutionOperations || choice.operations)];
  for (let index=0;index<operations.length;index++) {
    let op = operations[index];
    if (op.kind === "projectileStep") {
      const state = get(), choices = projectileImpactChoices(state,op);
      const canQueue = state.opponentPlayerId?.startsWith("cpu_") && state.actorKey && state.matchId && state.transport && state.phase !== "Setup";
      const preferred = op.preferred?.[0];
      const selected = choices.find(candidate => candidate.key === preferred) || [...choices].sort((a,b) => b.score-a.score)[0];
      const expanded: SpellOperation[] = choices.length>1 && canQueue ? [{kind:"offerProjectile",projectile:op}] : selected.operations;
      operations.splice(index,1,...expanded);
      index--;
      continue;
    }
    const expandedArea = expandAreaOperation(get(),op);
    if (expandedArea) {
      operations.splice(index,1,expandedArea);
      index--;
      continue;
    }
    if (op.kind === "damage" && op.random) {
      const units = unitsInRealm(get());
      op = {...op,targets:op.targets.filter(target => units.some(unit => sameTarget(unit.target,target)))};
      operations[index] = op;
    }
    if (op.kind === "damage" && op.random && op.targets.length) {
      const state = get();
      const caster = choice.caster;
      const source = caster.kind === "avatar" ? caster.seat : caster.kind === "permanent" ? unitsInRealm(state).find(unit => sameTarget(unit.target,caster))?.owner : undefined;
      const seat = completion ? completion.pending.spell.owner === 1 ? "p1" : "p2" : source;
      const charms = seat ? luckyCharmCount(state,seat) : 0;
      if (seat && charms) {
        const outcomes: SpellOperation[] = Array.from({length:charms+1},() => ({...op,random:false,targets:[op.targets[Math.min(op.targets.length-1,Math.floor(rng()*op.targets.length))]]}));
        operations.splice(index,1,{kind:"chooseRandom",seat,outcomes});
        index--;
        continue;
      }
    }
    if (op.kind === "dragUnit") {
      const unit = unitsInRealm(get()).find(unit => sameTarget(unit.target,op.target));
      const to = op.path[0], state = get();
      const expanded: SpellOperation[] = [];
      if (unit && to && unit.region === op.region && unit.at !== to && inRange(unit.at,to,"adjacent") &&
          (op.region === "void" ? !state.board.sites[to]?.card : !!state.board.sites[to]?.card) &&
          (op.region !== "underwater" || isWater(state,to)) && (op.region !== "underground" || !isWater(state,to))) {
        expanded.push({kind:"move",target:op.target,to,preserveRegion:true},{...op,path:op.path.slice(1)});
      }
      operations.splice(index,1,...expanded);
      index--;
      continue;
    }
    if (op.kind === "rollBoulder") {
      const found = locatePermanent(get(),op.target);
      const expanded: SpellOperation[] = [];
      if (found && found.unit.card.name === "Rolling Boulder" && (op.steps || 0)<20) {
        const [dx,dy] = {N:[0,-1],E:[1,0],S:[0,1],W:[-1,0]}[op.direction];
        const [x,y] = found.at.split(",").map(Number), to = `${x+dx},${y+dy}`;
        const state = get();
        const canRoll = x+dx>=0 && y+dy>=0 && x+dx<state.board.size.w && y+dy<state.board.size.h &&
          (op.region === "void" ? !state.board.sites[to]?.card : !!state.board.sites[to]?.card) &&
          (op.region !== "underwater" || isWater(state,to)) && (op.region !== "underground" || !isWater(state,to));
        if (canRoll) {
          if (!op.started) expanded.push({kind:"dropArtifact",target:op.target},{kind:"damageAtSource",source:op.target,region:op.region,amount:4});
          expanded.push({kind:"move",target:op.target,to,preserveRegion:true},
            {kind:"damageAtSource",source:op.target,region:op.region,amount:4},
            {...op,started:true,steps:(op.steps || 0)+1});
        }
      }
      operations.splice(index,1,...expanded);
      index--;
      continue;
    }
    const before = get().cpuPendingTriggerCount || 0;
    set({cpuResolvingEffect:true});
    try { if (applyOperations(set,get,{...choice,operations:[op]},rng) === false) return true; }
    finally { set({cpuResolvingEffect:false}); }
    if ((get().cpuPendingTriggerCount || 0)>before) {
      set({cpuEffectContinuations:[...(get().cpuEffectContinuations || []),{choice:{...choice,resolutionOperations:undefined,operations:operations.slice(index+1)},waitingFor:before,completion}]});
      return false;
    }
  }
  return true;
}

function locatePermanent(state: GameState, target: UnitTarget) {
  if (target.kind !== "permanent") return null;
  if (target.instanceId) {
    for (const [at,units] of Object.entries(state.permanents)) {
      const index = units.findIndex(unit => (unit.instanceId || unit.card.instanceId) === target.instanceId);
      if (index>=0) return {at,index,unit:units[index]};
    }
    return null;
  }
  const unit = state.permanents[target.at]?.[target.index];
  return unit ? {at:target.at,index:target.index,unit} : null;
}

function applyOperations(set: StoreSet, get: StoreGet, choice: SpellChoice, rng: () => number): void | false {
  const locate = (target: UnitTarget) => locatePermanent(get(),target);
  const buff = (target: UnitTarget, power: number, movement: number, blaze = false) => {
    const found = locate(target);
    const entity = target.kind === "avatar" ? get().avatars[target.seat] : found?.unit;
    if (!entity) return;
    if (found && isProtected(found.unit.card)) return; // The Doom of Dilmun cannot be modified.
    const turn = `${get().turn}:${get().currentPlayer}`;
    const previous = entity.cpuTurnEffect?.turn === turn ? entity.cpuTurnEffect : null;
    const cpuTurnEffect = { turn, power: power+(previous?.power || 0), movement: movement+(previous?.movement || 0),blaze:blaze || previous?.blaze || false,...(previous?.steps ? {steps:previous.steps} : {}) };
    if (target.kind === "avatar") {
      const avatars = { ...get().avatars, [target.seat]: { ...entity, cpuTurnEffect } } as GameState["avatars"];
      // Only that avatar's changed field: sending the other avatar (with its tapped flag) makes the server reject the patch.
      set({ avatars }); get().trySendPatch({ avatars: { [target.seat]: { cpuTurnEffect } } as GameState["avatars"] });
    } else if (found) {
      const items = [...get().permanents[found.at]];
      items[found.index] = { ...found.unit, cpuTurnEffect, version: (found.unit.version || 0)+1 };
      set({ permanents: { ...get().permanents, [found.at]: items } });
      get().trySendPatch({ permanents: { [found.at]: items } });
    }
  };
  const summon = (card: CardRef, seat: PlayerKey, at: string, region = "surface") => {
    const instanceId = `cpu_summon_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const unit = { card: { ...card,instanceId,owner:seat,originalOwnerSeat:card.originalOwnerSeat || card.owner || seat },
      owner: seat === "p1" ? 1 as const : 2 as const,instanceId,tapped:false,summonedThisTurn:true,version:1 };
    const items = [...(get().permanents[at] || []),unit];
    set({ permanents: { ...get().permanents,[at]:items } });
    get().trySendPatch({ permanents: { [at]:items } });
    const [x,z] = at.split(",").map(Number);
    get().setPermanentPosition(instanceId,{ permanentId:instanceId,state:region === "underwater" ? "submerged" : region === "underground" ? "burrowed" : "surface",position:{x,y:region === "surface" || region === "void" ? 0 : -0.15,z} });
    // Granted keywords count: a minion given Burrowing by Dwarven Digging Team survives underground.
    const located = unitsInRealm(get()).find(candidate => candidate.target.kind === "permanent" && candidate.target.instanceId === instanceId);
    const survives = (keyword: "Voidwalk" | "Submerge" | "Burrowing") =>
      located ? hasKeyword(get(),located,keyword) : new RegExp(`\\b${keyword}\\b`).test(cardText(card));
    if ((region === "void" && !survives("Voidwalk")) ||
        (region === "underwater" && !survives("Submerge")) ||
        (region === "underground" && !survives("Burrowing"))) {
      get().movePermanentToZone(at,items.length-1,"graveyard");
    }
  };
  for (const op of choice.operations) {
    if (op.kind === "projectileStep") continue; // Expanded at the next live impact above.
    if (op.kind === "offerProjectile") {
      const projectile = op.projectile, id = `cpu_projectile_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const [x,y] = projectile.origin.split(",").map(Number);
      const card: CardRef = {cardId:-1,name:projectile.name,type:"Magic"};
      set({cpuEffectRequests:[{id,tile:{x,y},spell:{at:projectile.origin,index:-1,owner:projectile.seat === "p1" ? 1 : 2,card,instanceId:id},
        cpuEvent:{kind:"projectileImpact",projectile},status:"choosingTarget",createdAt:Date.now()}]});
      continue;
    }
    if (op.kind === "damageGrid" || op.kind === "submergeWater") continue; // Expanded when their resumable step begins.
    if (op.kind === "fillRubble") {
      const state = get(), pos = state.avatars[op.seat]?.pos, [x,y] = op.at.split(",").map(Number);
      if (!pos || !Number.isInteger(x) || !Number.isInteger(y) || x<0 || y<0 || x>=state.board.size.w || y>=state.board.size.h || Math.abs(x-pos[0])+Math.abs(y-pos[1]) !== 1 || state.board.sites[op.at]?.card || state.permanents[op.at]?.some(item => item.card.name === "Rubble")) continue;
      const definition = TOKEN_BY_NAME.rubble;
      const board = {...state.board,sites:{...state.board.sites,[op.at]:{owner:op.seat === "p1" ? 1 as const : 2 as const,cpuNeutral:true,card:{cardId:newTokenInstanceId(definition),name:"Rubble",type:"Token",slug:tokenSlug(definition),thresholds:{}}}}};
      set({board}); get().trySendPatch({board});
      continue;
    }
    if (op.kind === "drawCards") {
      const state = get(), zones = state.zones[op.seat];
      const spells = state.canDrawCard(op.seat,op.spells).allowed ? op.spells : 0;
      const spellCards = zones.spellbook.slice(0,spells), sites = zones.atlas.slice(0,op.sites);
      const exhausted = zones.spellbook.length<spells || zones.atlas.length<op.sites;
      const players = exhausted ? {...state.players,[op.seat]:{...state.players[op.seat],lifeState:"dead" as const}} : state.players;
      set({zones:{...state.zones,[op.seat]:{...zones,spellbook:zones.spellbook.slice(spells),atlas:zones.atlas.slice(op.sites),hand:[...zones.hand,...spellCards,...sites]}},players});
      const patch = {...createZonesPatchFor(get().zones,op.seat),__allowZoneSeats:[op.seat],...(exhausted ? {players} : {})};
      get().trySendPatch(patch);
      if (spellCards.length) get().incrementCardsDrawn(op.seat,spellCards.length);
      get().checkMatchEnd();
      continue;
    }
    if (op.kind === "placeTreasure") {
      const found = locate(op.source);
      if (!found || !isWater(get(),op.at)) continue;
      const items = [...get().permanents[found.at]];
      items[found.index] = {...found.unit,attachedTo:null,isCarried:false,version:(found.unit.version || 0)+1};
      const previous = {...get().permanents,[found.at]:items};
      const moved = movePermanentCore(previous,found.at,found.index,op.at,null);
      const id = found.unit.instanceId || found.unit.card.instanceId;
      const [x,z] = op.at.split(",").map(Number);
      const permanentPositions = id ? {...get().permanentPositions,[id]:{permanentId:id,state:"submerged" as const,position:{x,y:-0.15,z}}} : get().permanentPositions;
      // Placement and its layer are one event: no transient carried surface state.
      set({permanents:moved.per,permanentPositions});
      get().trySendPatch({...buildMoveDeltaPatch(found.at,op.at,moved.removed,moved.updated,moved.added,moved.per,previous),permanentPositions});
      continue;
    }
    if (op.kind === "sacrificeTreasure") {
      const found = locate(op.source);
      if (!found || found.unit.card.name !== "Sunken Treasure") return false;
      get().movePermanentToZone(found.at,found.index,"graveyard");
      continue;
    }
    if (op.kind === "offerDraw") {
      const id = `cpu_draw_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const [x,y] = get().avatars[op.seat].pos || [0,0];
      set({cpuEffectRequests:[{id,tile:{x,y},spell:{at:`${x},${y}`,index:-1,owner:op.seat === "p1" ? 1 : 2,card:{cardId:0,name:"Sunken Treasure",type:"Artifact"}},cpuEvent:{kind:"drawChoice"},status:"choosingTarget",createdAt:Date.now()}]});
      continue;
    }
    if (op.kind === "chooseRandom") {
      const id = `cpu_random_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const [x,y] = get().avatars[op.seat].pos || [0,0];
      set({cpuEffectRequests:[{id,tile:{x,y},spell:{at:`${x},${y}`,index:-1,owner:op.seat === "p1" ? 1 : 2,card:{cardId:0,name:"Lucky Charm",type:"Artifact"}},cpuEvent:{kind:"randomChoice",outcomes:op.outcomes},status:"choosingTarget",createdAt:Date.now()}]});
      continue;
    }
    if (op.kind === "waveshaperFlood") {
      const state = get(), tile = state.board.sites[op.at];
      if (!tile?.card || tile.card.name === "Bedrock" || isWater(state,op.at)) continue;
      const prefix = `cpu_waveshaper_${op.seat}_`;
      // Remove only this Waveshaper's previous flood, preserving unrelated floods
      // and letting the normal removal action repair attachment indices.
      for (const [at,items] of Object.entries(state.permanents)) {
        for (let index=items.length-1;index>=0;index--) {
          if ((items[index].instanceId || items[index].card.instanceId || "").startsWith(prefix)) get().movePermanentToZone(at,index,"graveyard");
        }
      }
      const definition = TOKEN_BY_NAME.flooded, instanceId = `${prefix}${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const card: CardRef = {cardId:newTokenInstanceId(definition),name:definition.name,type:"Token",slug:tokenSlug(definition),instanceId,owner:op.seat};
      const items = [...(get().permanents[op.at] || []),{card,instanceId,owner:op.seat === "p1" ? 1 as const : 2 as const,version:1,tapped:false}];
      set({permanents:{...get().permanents,[op.at]:items}});
      get().trySendPatch({permanents:{[op.at]:items}});
      continue;
    }
    if (op.kind === "stunAt") {
      const state = get(), items = [...(state.permanents[op.at] || [])];
      for (const unit of unitsInRealm(state)) {
        if (!occupies(unit,op.at) || unit.target.kind !== "permanent" || (!isDisabled(state,unit) && /\bSubmerge\b/.test(cardText(unit.card)))) continue;
        const item = items[unit.target.index];
        items[unit.target.index] = {...item,tapped:true,skipNextUntap:true,tapVersion:(item.tapVersion || 0)+1,version:(item.version || 0)+1};
      }
      set({permanents:{...get().permanents,[op.at]:items}});
      get().trySendPatch({permanents:{[op.at]:items}});
      continue;
    }
    if (op.kind === "dragUnit") continue; // Expanded into interruptible movement above.
    if (op.kind === "offerFight" || op.kind === "fight" || op.kind === "strike") {
      const units = unitsInRealm(get()), source = units.find(unit => sameTarget(unit.target,op.source)), target = units.find(unit => sameTarget(unit.target,op.target));
      if (!source || !target || !shareLocation(source,target) || source.region !== target.region || isDisabled(get(),source)) continue;
      if (op.kind === "offerFight") {
        const id = `cpu_fight_${Date.now()}_${Math.random().toString(36).slice(2)}`, [x,y] = source.at.split(",").map(Number);
        set({cpuEffectRequests:[{id,tile:{x,y},spell:{at:source.at,index:-1,owner:source.owner === "p1" ? 1 : 2,card:source.card},cpuEvent:{kind:"fightChoice",source:source.target,target:target.target,strikeOnly:op.strikeOnly},status:"choosingTarget",createdAt:Date.now()}]});
      } else {
        applyDamageEvent(set,get,[
          {target:target.target,amount:unitStats(get(),source).atk,lethal:/\bLethal\b/.test(cardText(source.card)),sourcePower:unitStats(get(),source).atk,sourceName:source.card.name},
          {target:source.target,amount:op.kind === "strike" || isDisabled(get(),target) ? 0 : unitStats(get(),target).atk,lethal:!isDisabled(get(),target) && /\bLethal\b/.test(cardText(target.card)),sourcePower:unitStats(get(),target).atk,sourceName:target.card.name},
        ]);
      }
      continue;
    }
    if (op.kind === "rollBoulder") continue; // Expanded at each resumable step above.
    if (op.kind === "dropArtifact") {
      const found = locate(op.target);
      if (!found) continue;
      const items = [...get().permanents[found.at]];
      items[found.index] = {...found.unit,attachedTo:undefined,isCarried:false,version:(found.unit.version || 0)+1};
      set({permanents:{...get().permanents,[found.at]:items}});
      get().trySendPatch({permanents:{[found.at]:items}});
      continue;
    }
    if (op.kind === "damageAtSource") {
      const found = locate(op.source);
      if (found) applyDamageEvent(set,get,unitsInRealm(get()).filter(unit => occupies(unit,found.at) && unit.region === op.region).map(unit => ({target:unit.target,amount:op.amount})));
      continue;
    }
    if (op.kind === "banishDeadFire") {
      const zones = get().zones[op.seat];
      const banished = zones.graveyard.filter(card => card.type === "Minion" && Number(card.thresholds?.fire || 0)>0);
      set({zones:{...get().zones,[op.seat]:{...zones,graveyard:zones.graveyard.filter(card => !banished.includes(card)),banished:[...zones.banished,...banished]}}});
      const patch = {...createZonesPatchFor(get().zones,op.seat),__allowZoneSeats:[op.seat]};
      get().trySendPatch(patch);
      continue;
    }
    if (op.kind === "replaceRubble") {
      const state = get(), zones = state.zones[op.seat], card = zones.atlas[0];
      if (state.board.sites[op.at]?.card?.name !== "Rubble" || !card || card.type !== "Site") continue;
      const board = {...state.board,sites:{...state.board.sites,[op.at]:{owner:op.seat === "p1" ? 1 as const : 2 as const,card}}};
      set({board,zones:{...state.zones,[op.seat]:{...zones,atlas:zones.atlas.slice(1)}}});
      const patch = {board,...createZonesPatchFor(get().zones,op.seat),__allowZoneSeats:[op.seat]};
      get().trySendPatch(patch);
      continue;
    }
    if (op.kind === "strikeNearby") {
      const units = unitsInRealm(get()), source = units.find(unit => sameTarget(unit.target,op.source));
      if (!source || isDisabled(get(),source)) continue;
      const power = unitStats(get(),source).atk;
      applyDamageEvent(set,get,units.filter(unit => unit.region === source.region && near(source,unit,"nearby") && !sameTarget(unit.target,source.target)).map(unit => ({target:unit.target,amount:power,sourcePower:power,sourceName:source.card.name})));
      continue;
    }
    if (op.kind === "auraUpdate") {
      const found = locate(op.target);
      if (!found) continue;
      if (op.dispel) { get().movePermanentToZone(found.at,found.index,"graveyard"); continue; }
      const items = [...get().permanents[found.at]];
      items[found.index] = {...found.unit,...(op.ticks === undefined ? {} : {cpuAuraTicks:op.ticks}),
        ...(op.endKey ? {cpuAuraLastEnd:{...found.unit.cpuAuraLastEnd,[op.counter ? "counter" : "effect"]:op.endKey}} : {}),
        ...(op.visited ? {cpuAuraVisited:op.visited} : {}),version:(found.unit.version || 0)+1};
      set({permanents:{...get().permanents,[found.at]:items}});
      get().trySendPatch({permanents:{[found.at]:items}});
      if (op.to && op.to !== found.at) {
        const previous = get().permanents;
        const moved = movePermanentCore(previous,found.at,found.index,op.to,null);
        set({permanents:moved.per});
        get().trySendPatch(buildMoveDeltaPatch(found.at,op.to,moved.removed,moved.updated,moved.added,moved.per,previous));
      }
      continue;
    }
    if (op.kind === "tapUnits") {
      for (const target of op.targets) {
        if (target.kind === "avatar") {
          const avatars = {...get().avatars,[target.seat]:{...get().avatars[target.seat],tapped:true}};
          // Only the tapped avatar's field (the server lets the human client adjudicating a CPU match tap the CPU's avatar).
          set({avatars}); get().trySendPatch({avatars:{[target.seat]:{tapped:true}} as GameState["avatars"]});
        } else {
          const found = locate(target);
          if (!found) continue;
          const items = [...get().permanents[found.at]];
          items[found.index] = {...found.unit,tapped:true,version:(found.unit.version || 0)+1};
          set({permanents:{...get().permanents,[found.at]:items}});
          get().trySendPatch({permanents:{[found.at]:items}});
        }
      }
      continue;
    }
    if (op.kind === "surface") {
      const found = locate(op.target);
      const id = found?.unit.instanceId || found?.unit.card.instanceId;
      if (found && id) {
        const [x,z] = found.at.split(",").map(Number);
        get().setPermanentPosition(id,{permanentId:id,state:"surface",position:{x,y:0,z}});
      }
      continue;
    }
    if (op.kind === "gainMana") { get().addMana(op.seat,op.amount); continue; }
    if (op.kind === "retriggerGenesis") {
      set({cpuGenesisRequests:op.ats.map(at => ({at,id:`genesis_${at}_${Date.now()}_${Math.random()}`}))});
      continue;
    }
    if (op.kind === "sleep" || op.kind === "swallow") {
      const found = locate(op.target);
      const carrier = op.kind === "swallow" ? locate(op.carrier) : null;
      if (!found || isProtected(found.unit.card) || (op.kind === "swallow" && (!carrier || carrier.at !== found.at))) continue;
      const items = [...get().permanents[found.at]];
      items[found.index] = {...found.unit,version:(found.unit.version || 0)+1,...(carrier ? {
        cpuSwallowedBy:carrier.unit.instanceId || undefined,isCarried:true,attachedTo:{at:carrier.at,index:carrier.index},
      } : {cpuAsleep:true})};
      set({permanents:{...get().permanents,[found.at]:items}});
      get().trySendPatch({permanents:{[found.at]:items}});
      continue;
    }
    if (op.kind === "immobilizeSites") {
      const sites = {...get().board.sites};
      for (const at of op.ats) if (sites[at]) sites[at] = {...sites[at],cpuImmobileUntil:op.untilTurn};
      const board = {...get().board,sites}; set({board}); get().trySendPatch({board});
      continue;
    }
    if (op.kind === "reorder") {
      const before = get().zones[op.seat], n = op.order.length;
      if (n>before.spellbook.length || op.order.some((v,i) => !Number.isInteger(v) || v<0 || v>=n || op.order.indexOf(v)!==i)) continue;
      const ordered = op.order.map(i => before.spellbook[i]);
      const spellbook = op.bottom ? [...before.spellbook.slice(n),...ordered] : [...ordered,...before.spellbook.slice(n)];
      set({zones:{...get().zones,[op.seat]:{...before,spellbook}}});
      const patch = {...createZonesPatchFor(get().zones,op.seat),__allowZoneSeats:[op.seat]}; get().trySendPatch(patch);
      continue;
    }
    if (op.kind === "damageEvent") { applyDamageEvent(set,get,op.hits); continue; }
    if (op.kind === "summonTokens") {
      const definition = TOKEN_BY_NAME["foot soldier"];
      for (const at of op.ats) summon({cardId:newTokenInstanceId(definition),name:definition.name,type:"Token",slug:tokenSlug(definition),attack:1,defence:1,subTypes:"Mortal"},op.seat,at);
      continue;
    }
    if (op.kind === "raise") {
      if (!op.card || !op.to || !op.fromSeat) continue;
      const zones = get().zones[op.fromSeat];
      const index = op.card.instanceId ? zones.graveyard.findIndex(card => card.instanceId === op.card?.instanceId) : op.graveyardIndex ?? -1;
      if (index < 0 || zones.graveyard[index]?.cardId !== op.card.cardId) continue;
      const next = { ...zones,graveyard:zones.graveyard.filter((_,i) => i !== index) };
      set({zones:{...get().zones,[op.fromSeat]:next}});
      const zonePatch = {...createZonesPatchFor(get().zones,op.fromSeat),__allowZoneSeats:[op.fromSeat]};
      get().trySendPatch(zonePatch);
      summon({...op.card,originalOwnerSeat:op.card.originalOwnerSeat || op.fromSeat},op.seat,op.to,op.region);
      continue;
    }
    if (op.kind === "discard") {
      const zones = get().zones[op.seat];
      const index = op.instanceId ? zones.hand.findIndex(card => card.instanceId === op.instanceId) : op.index;
      const card = zones.hand[index];
      if (!card || (op.cardType === "any" ? false : op.cardType === "spell" ? card.type === "Site" || card.type === "Avatar" : card.type !== "Site")) return false;
      const next = {...zones,hand:zones.hand.filter((_,i) => i !== index),graveyard:[...zones.graveyard,card]};
      set({zones:{...get().zones,[op.seat]:next}});
      const zonePatch = {...createZonesPatchFor(get().zones,op.seat),__allowZoneSeats:[op.seat]};
      get().trySendPatch(zonePatch);
      continue;
    }
    if (op.kind === "spend") { get().addMana(op.seat,-op.amount); continue; }
    if (op.kind === "destroySite") {
      const tile = get().board.sites[op.at];
      if (!tile?.card || (!op.sacrifice && tile.card.name === "Bedrock") || tile.cpuNeutral || (op.instanceId && tile.card.instanceId !== op.instanceId)) continue;
      const seat: PlayerKey = tile.owner === 1 ? "p1" : "p2";
      const definition = TOKEN_BY_NAME.rubble;
      const zones = {...get().zones[seat],graveyard:[...get().zones[seat].graveyard,tile.card]};
      const rubble = {owner:tile.owner,cpuNeutral:true,card:{cardId:newTokenInstanceId(definition),name:"Rubble",type:"Token",slug:tokenSlug(definition),thresholds:{}}};
      const board = {...get().board,sites:{...get().board.sites,[op.at]:rubble}};
      set({board,zones:{...get().zones,[seat]:zones}});
      const destructionPatch = {board,...createZonesPatchFor(get().zones,seat),__allowZoneSeats:[seat]};
      get().trySendPatch(destructionPatch);
      continue;
    }
    if (op.kind === "flood") {
      const sites = {...get().board.sites};
      for (const at of op.ats) {
        const tile = sites[at];
        if (!tile?.card || tile.card.name === "Bedrock") continue;
        sites[at] = {...tile,cpuFloodedUntil:op.expiresTurn,cpuFloodOriginalThresholds:tile.card.thresholds || null,
          card:{...tile.card,thresholds:{...tile.card.thresholds,water:Math.max(1,tile.card.thresholds?.water || 0)}}};
      }
      const board = {...get().board,sites};
      set({board}); get().trySendPatch({board});
      continue;
    }
    if (op.kind === "strikeTarget") {
      const state = get(), units = unitsInRealm(state);
      const source = units.find(unit => sameTarget(unit.target,op.source)), target = units.find(unit => sameTarget(unit.target,op.target));
      if (!source || !target || isDisabled(state,source)) continue;
      const power = unitStats(state,source).atk;
      applyDamageEvent(set,get,[{target:target.target,amount:power,lethal:/\bLethal\b/.test(cardText(source.card)),sourcePower:power,sourceName:source.card.name,...(op.ranged ? {ranged:true} : {})}]);
      if (!op.ranged) continue;
      const shooter = unitsInRealm(get()).find(unit => sameTarget(unit.target,op.source)), found = locate(op.source);
      if (!shooter || !found) continue;
      // A strike interacts with the realm, which ends Stealth.
      if (hasStealth(get(),shooter)) loseStealth(set,get,op.source);
      if (found.unit.card.name === "Kite Archer") {
        const id = `cpu_kite_${Date.now()}_${Math.random().toString(36).slice(2)}`, [x,y] = found.at.split(",").map(Number);
        set({cpuEffectRequests:[{id,tile:{x,y},spell:{at:found.at,index:-1,owner:found.unit.owner,card:found.unit.card},
          cpuEvent:{kind:"cardTrigger",trigger:"kiteStep",source:{kind:"permanent",at:found.at,index:found.index,instanceId:found.unit.instanceId || found.unit.card.instanceId}},
          status:"choosingTarget",createdAt:Date.now()}]});
      }
      continue;
    }
    if (op.kind === "teleportRandom") {
      const state = get(), unit = unitsInRealm(state).find(candidate => sameTarget(candidate.target,op.target));
      if (!unit) continue;
      const cells: string[] = [];
      for (let y=0;y<state.board.size.h;y++) for (let x=0;x<state.board.size.w;x++) if (`${x},${y}` !== unit.at) cells.push(`${x},${y}`);
      if (!cells.length) continue;
      const to = cells[Math.min(cells.length-1,Math.floor(rng()*cells.length))];
      applyOperations(set,get,{...choice,operations:[{kind:"move",target:op.target,to}]},rng);
      continue;
    }
    if (op.kind === "moveSite") {
      const state = get(), [fx,fy] = op.from.split(",").map(Number), [tx,ty] = op.to.split(",").map(Number);
      if (!state.board.sites[op.from]?.card || state.board.sites[op.to]?.card) continue;
      // The site carries everything atop it (units, artifacts, avatars); auras and Rubble stay put.
      state.switchSitePosition(fx,fy,tx,ty,{bypassOwnerCheck:true});
      continue;
    }
    if (op.kind === "transformLeviathan") {
      const state = get(), tile = state.board.sites[op.at];
      if (tile?.card?.name !== "Island Leviathan") continue;
      const seat: PlayerKey = tile.owner === 1 ? "p1" : "p2";
      const definition = TOKEN_BY_NAME.rubble;
      // Flooded Rubble: a neutral Rubble site that is always water.
      const rubble = {owner:tile.owner,cpuNeutral:true,card:{cardId:newTokenInstanceId(definition),name:"Rubble",type:"Token",slug:tokenSlug(definition),thresholds:{water:1}}};
      const monster = toTransformedSiteMinionCard(prepareCardForSeat(tile.card,seat));
      const instanceId = monster.instanceId || `cpu_leviathan_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const items = [...(state.permanents[op.at] || []),{card:{...monster,instanceId},owner:tile.owner,instanceId,tapped:false,version:1}];
      const board = {...state.board,sites:{...state.board.sites,[op.at]:rubble}};
      set({board,permanents:{...state.permanents,[op.at]:items}});
      get().trySendPatch({board,permanents:{[op.at]:items}});
      continue;
    }
    if (op.kind === "stampSite") {
      const tile = get().board.sites[op.at];
      if (!tile) continue;
      const board = {...get().board,sites:{...get().board.sites,[op.at]:{...tile,cpuAbilityTurn:op.turnKey}}};
      set({board}); get().trySendPatch({board});
      continue;
    }
    if (op.kind === "stampTrigger") {
      const source = op.source;
      if (source.kind === "site") {
        const tile = get().board.sites[source.at];
        if (!tile) continue;
        const board = {...get().board,sites:{...get().board.sites,[source.at]:{...tile,cpuTriggerStamps:{...tile.cpuTriggerStamps,[op.timing]:op.turnKey}}}};
        set({board}); get().trySendPatch({board});
      } else if (source.kind === "permanent") {
        const found = locate(source);
        if (!found) continue;
        const items = [...get().permanents[found.at]];
        items[found.index] = {...found.unit,cpuTriggerStamps:{...found.unit.cpuTriggerStamps,[op.timing]:op.turnKey},version:(found.unit.version || 0)+1};
        set({permanents:{...get().permanents,[found.at]:items}});
        get().trySendPatch({permanents:{[found.at]:items}});
      }
      continue;
    }
    if (op.kind === "markCorner") {
      const found = locate(op.target);
      if (!found) continue;
      const items = [...get().permanents[found.at]];
      items[found.index] = {...found.unit,cpuCornersVisited:[...new Set([...(found.unit.cpuCornersVisited || []),op.corner])],version:(found.unit.version || 0)+1};
      set({permanents:{...get().permanents,[found.at]:items}});
      get().trySendPatch({permanents:{[found.at]:items}});
      continue;
    }
    if (op.kind === "howl") {
      const zones = get().zones[op.seat];
      const dealt = zones.spellbook.slice(0,op.count);
      if (!dealt.length) continue;
      // Kept: minions with Voidwalk, plus anything with the Monster typeline. The rest are banished.
      const keep = dealt.filter(card => (card.type === "Minion" && /\bVoidwalk\b/.test(cardText(card))) || /\bMonster\b/.test(cardSubTypes(card)));
      const banished = dealt.filter(card => !keep.includes(card));
      set({zones:{...get().zones,[op.seat]:{...zones,spellbook:zones.spellbook.slice(dealt.length),
        hand:[...zones.hand,...keep],banished:[...zones.banished,...banished]}}});
      get().trySendPatch({...createZonesPatchFor(get().zones,op.seat),__allowZoneSeats:[op.seat]});
      continue;
    }
    if (op.kind === "carryUnit") {
      const carrier = locate(op.carrier), found = locate(op.target);
      if (!carrier || !found || carrier.at !== found.at || isProtected(found.unit.card)) continue;
      // move.js carries everything attached to the mover, so the rider travels with its carrier.
      const items = [...get().permanents[found.at]];
      items[found.index] = {...found.unit,isCarried:true,attachedTo:{at:carrier.at,index:carrier.index},version:(found.unit.version || 0)+1};
      set({permanents:{...get().permanents,[found.at]:items}});
      get().trySendPatch({permanents:{[found.at]:items}});
      continue;
    }
    if (op.kind === "stampDragonFree") {
      const found = locate(op.target);
      if (!found) continue;
      const items = [...get().permanents[found.at]];
      items[found.index] = {...found.unit,cpuDragonFreeTurn:op.turnKey,version:(found.unit.version || 0)+1};
      set({permanents:{...get().permanents,[found.at]:items}});
      get().trySendPatch({permanents:{[found.at]:items}});
      continue;
    }
    if (op.kind === "evadeAttack") {
      applyOperations(set,get,{...choice,operations:[{kind:"move",target:op.target,to:op.to,preserveRegion:true}]},rng);
      get().cancelCombat();
      continue;
    }
    if (op.kind === "banishSite") {
      const state = get(), tile = state.board.sites[op.at];
      if (!tile?.card || tile.cpuNeutral || tile.card.name === "Bedrock") continue;
      const seat: PlayerKey = tile.owner === 1 ? "p1" : "p2";
      const zones = {...state.zones[seat],banished:[...state.zones[seat].banished,tile.card]};
      const sites = {...state.board.sites};
      delete sites[op.at];
      const board = {...state.board,sites};
      set({board,zones:{...state.zones,[seat]:zones}});
      // Deleting a tile needs an explicit null: the merge only updates keys the patch carries.
      get().trySendPatch({board:{...board,sites:{[op.at]:null}} as unknown as GameState["board"],
        ...createZonesPatchFor(get().zones,seat),__allowZoneSeats:[seat]});
      continue;
    }
    if (op.kind === "grantStealth") {
      const found = locate(op.target);
      if (!found || isProtected(found.unit.card) || stealthTokenIndex(get().permanents,found.at,found.index) >= 0) continue;
      const items = [...get().permanents[found.at],stealthTokenFor(found.at,found.index,found.unit.owner)];
      set({permanents:{...get().permanents,[found.at]:items}});
      get().trySendPatch({permanents:{[found.at]:items}});
      continue;
    }
    if (op.kind === "recoverCard") {
      const zones = get().zones[op.seat];
      const index = op.instanceId ? zones.graveyard.findIndex(card => card.instanceId === op.instanceId) : zones.graveyard.findIndex(card => card.name === op.name);
      if (index < 0) continue;
      const card = zones.graveyard[index];
      set({zones:{...get().zones,[op.seat]:{...zones,graveyard:zones.graveyard.filter((_,i) => i !== index),hand:[...zones.hand,card]}}});
      get().trySendPatch({...createZonesPatchFor(get().zones,op.seat),__allowZoneSeats:[op.seat]});
      continue;
    }
    if (op.kind === "returnToHand") {
      const found = locate(op.target);
      if (found && !isProtected(found.unit.card)) get().movePermanentToZone(found.at,found.index,"hand");
      continue;
    }
    if (op.kind === "buff") { buff(op.target, op.power, op.movement,op.blaze); continue; }
    if (op.kind === "moveSpent") {
      // Only a turn effect already in force keeps a step ledger; plain movement is not tracked.
      const found = locate(op.target), entity = op.target.kind === "avatar" ? get().avatars[op.target.seat] : found?.unit;
      const effect = entity?.cpuTurnEffect;
      if (!op.steps || !effect || effect.turn !== `${get().turn}:${get().currentPlayer}`) continue;
      const cpuTurnEffect = {...effect,steps:(effect.steps || 0)+op.steps};
      if (op.target.kind === "avatar") {
        const seat = op.target.seat;
        set({avatars:{...get().avatars,[seat]:{...get().avatars[seat],cpuTurnEffect}}});
        // Only the ledger: `tapped` on the opponent's avatar would make the server reject the whole trail action.
        get().trySendPatch({avatars:{[seat]:{cpuTurnEffect}} as GameState["avatars"]});
      } else if (found) {
        const items = [...get().permanents[found.at]];
        items[found.index] = {...found.unit,cpuTurnEffect,version:(found.unit.version || 0)+1};
        set({permanents:{...get().permanents,[found.at]:items}});
        get().trySendPatch({permanents:{[found.at]:items}});
      }
      continue;
    }
    if (op.kind === "mend") {
      if (op.target.kind === "avatar") get().addLife(op.target.seat, op.amount);
      else {
        const found = locate(op.target);
        if (!found) continue;
        const items = [...get().permanents[found.at]];
        items[found.index] = { ...found.unit, damage: Math.max(0, (found.unit.damage || 0)-op.amount), version: (found.unit.version || 0)+1 };
        set({ permanents: { ...get().permanents, [found.at]: items } });
        get().trySendPatch({ permanents: { [found.at]: items } });
      }
      continue;
    }
    if (op.kind === "heal") { get().addLife(op.seat, op.amount); continue; }
    if (op.kind === "draw") {
      const pile = op.pile || "spellbook";
      for (let i = 0; i < op.count; i++) {
        if (pile === "spellbook" && !get().canDrawCard(op.seat,1).allowed) break;
        if (!get().zones[op.seat][pile].length) {
          const players = { ...get().players, [op.seat]: { ...get().players[op.seat], lifeState: "dead" as const } };
          set({ players });
          get().trySendPatch({ players });
          get().checkMatchEnd();
          break;
        }
        // Effect draws can happen outside the owner's turn. The manual draw
        // action deliberately rejects those, so resolve the effect here.
        const zones = get().zones[op.seat], cards = zones[pile];
        const next = {...zones,[pile]:op.bottom ? cards.slice(0,-1) : cards.slice(1),hand:[...zones.hand,cards[op.bottom ? cards.length-1 : 0]]};
        set({zones:{...get().zones,[op.seat]:next}});
        const patch = {...createZonesPatchFor(get().zones,op.seat),__allowZoneSeats:[op.seat]}; get().trySendPatch(patch);
        if (pile === "spellbook") get().incrementCardsDrawn(op.seat,1);
      }
      continue;
    }
    if (op.kind === "move") {
      set({cpuForcedMovement:true});
      const [x, y] = op.to.split(",").map(Number);
      if (op.target.kind === "avatar") {
        const seat = op.target.seat;
        const avatars = { ...get().avatars, [seat]: { ...get().avatars[seat], pos: [x, y] as [number, number] } };
        set({ avatars });
        get().trySendPatch({ avatars: { [seat]: avatars[seat] } as GameState["avatars"] });
      } else {
        const found = locate(op.target);
        if (!found) { set({cpuForcedMovement:false}); continue; }
        const previous = get().permanents;
        const oldLayer = get().permanentPositions[found.unit.instanceId || found.unit.card.instanceId || ""]?.state || "surface";
        const moved = movePermanentCore(previous, found.at, found.index, op.to, null);
        set({ permanents: moved.per });
        get().trySendPatch(buildMoveDeltaPatch(found.at, op.to, moved.removed, moved.updated, moved.added, moved.per, previous));
        for (const unit of moved.added) {
          const id = unit.instanceId || unit.card.instanceId;
          if (!id) continue;
          get().setPermanentPosition(id, { permanentId: id, state: op.preserveRegion ? oldLayer : "surface", position: { x, y: op.preserveRegion && oldLayer !== "surface" ? -0.15 : 0, z: y } });
        }
      }
      set({cpuForcedMovement:false});
      continue;
    }
    const targets = op.kind === "damage" && op.random
      ? op.targets.slice(Math.min(op.targets.length - 1, Math.floor(rng() * op.targets.length))).slice(0, 1)
      : [...op.targets].sort((a, b) => a.kind === "permanent" && b.kind === "permanent" && a.at === b.at ? b.index - a.index : 0);
    if (op.kind === "damage") {
      const selected = op.splash === undefined ? targets : op.targets;
      applyDamageEvent(set,get,selected.map((target,index) => ({ target, amount: index > 0 ? op.splash ?? op.amount : op.amount, element: op.element })));
      continue;
    }
    for (const target of targets) {
      const found = locate(target);
      if (!found || isProtected(found.unit.card)) continue;
      {
        const id = found.unit.instanceId || found.unit.card.instanceId;
        if (!id) continue;
        const [x, z] = found.at.split(",").map(Number);
        get().setPermanentPosition(id, { permanentId: id, state: op.state, position: { x, y: -0.15, z } });
        // Artifacts are not units and never die down there; units need the keyword, printed or granted.
        const located = unitsInRealm(get()).find(unit => unit.target.kind === "permanent" && unit.at === found.at && unit.target.index === found.index);
        if (located && !hasKeyword(get(),located,op.state === "burrowed" ? "Burrowing" : "Submerge")) {
          get().movePermanentToZone(found.at, found.index, "graveyard");
        }
      }
    }
  }
  get().checkMatchEnd();
}
