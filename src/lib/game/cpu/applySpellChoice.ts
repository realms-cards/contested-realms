import type { StateCreator } from "zustand";
import { applyDamageEvent } from "@/lib/game/cpu/damage";
import { luckyCharmCount } from "@/lib/game/cpu/luckyCharm";
import type { CpuEffectCompletion, SpellChoice, SpellOperation, UnitTarget } from "@/lib/game/cpu/spellTypes";
import { cardText, inRange, isDisabled, isWater, sameTarget, unitsInRealm, unitStats } from "@/lib/game/cpu/spells";
import type { CardRef, GameState, PlayerKey } from "@/lib/game/store/types";
import { buildMoveDeltaPatch } from "@/lib/game/store/utils/patchHelpers";
import { movePermanentCore } from "@/lib/game/store/utils/permanentHelpers";
import { createZonesPatchFor } from "@/lib/game/store/utils/zoneHelpers";
import { newTokenInstanceId, TOKEN_BY_NAME, tokenSlug } from "@/lib/game/tokens";

type StoreSet = Parameters<StateCreator<GameState>>[0];
type StoreGet = Parameters<StateCreator<GameState>>[1];

// All mutation happens through the game store, with normal patches and death
// triggers. Stable identities survive earlier kills in multi-target spells.
export function applySpellChoice(set: StoreSet, get: StoreGet, choice: SpellChoice, rng = Math.random, completion?: CpuEffectCompletion): boolean {
  const operations = [...choice.operations];
  for (let index=0;index<operations.length;index++) {
    let op = operations[index];
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
      set({cpuEffectContinuations:[...(get().cpuEffectContinuations || []),{choice:{...choice,operations:operations.slice(index+1)},waitingFor:before,completion}]});
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
    const turn = `${get().turn}:${get().currentPlayer}`;
    const previous = entity.cpuTurnEffect?.turn === turn ? entity.cpuTurnEffect : null;
    const cpuTurnEffect = { turn, power: power+(previous?.power || 0), movement: movement+(previous?.movement || 0),blaze:blaze || previous?.blaze || false };
    if (target.kind === "avatar") {
      const avatars = { ...get().avatars, [target.seat]: { ...entity, cpuTurnEffect } } as GameState["avatars"];
      set({ avatars }); get().trySendPatch({ avatars });
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
    if ((region === "void" && !/\bVoidwalk\b/.test(cardText(card))) ||
        (region === "underwater" && !/\bSubmerge\b/.test(cardText(card))) ||
        (region === "underground" && !/\bBurrowing\b/.test(cardText(card)))) {
      get().movePermanentToZone(at,items.length-1,"graveyard");
    }
  };
  for (const op of choice.operations) {
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
        if (unit.at !== op.at || unit.target.kind !== "permanent" || (!isDisabled(state,unit) && /\bSubmerge\b/.test(cardText(unit.card)))) continue;
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
      if (!source || !target || source.at !== target.at || source.region !== target.region || isDisabled(get(),source)) continue;
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
      if (found) applyDamageEvent(set,get,unitsInRealm(get()).filter(unit => unit.at === found.at && unit.region === op.region).map(unit => ({target:unit.target,amount:op.amount})));
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
      applyDamageEvent(set,get,units.filter(unit => unit.region === source.region && inRange(source.at,unit.at,"nearby") && !sameTarget(unit.target,source.target)).map(unit => ({target:unit.target,amount:power,sourcePower:power,sourceName:source.card.name})));
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
          set({avatars}); get().trySendPatch({avatars});
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
      if (!found || (op.kind === "swallow" && (!carrier || carrier.at !== found.at))) continue;
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
      const seat = tile.owner === 1 ? "p1" : "p2", definition = TOKEN_BY_NAME.rubble;
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
    if (op.kind === "buff") { buff(op.target, op.power, op.movement,op.blaze); continue; }
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
      if (!found) continue;
      {
        const id = found.unit.instanceId || found.unit.card.instanceId;
        if (!id) continue;
        const [x, z] = found.at.split(",").map(Number);
        get().setPermanentPosition(id, { permanentId: id, state: op.state, position: { x, y: -0.15, z } });
        const capability = op.state === "burrowed" ? /\bBurrowing\b/ : /\bSubmerge\b/;
        const isUnit = unitsInRealm(get()).some(unit => unit.target.kind === "permanent" && unit.at === found.at && unit.target.index === found.index);
        if (isUnit && !capability.test(cardText(found.unit.card))) {
          get().movePermanentToZone(found.at, found.index, "graveyard");
        }
      }
    }
  }
  get().checkMatchEnd();
}
